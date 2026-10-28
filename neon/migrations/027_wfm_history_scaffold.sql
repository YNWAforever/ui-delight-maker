-- WFM history is a staging source of truth, separate from commercial acceptance
-- and Xero evidence. UUIDs are source keys, never invoice/job numbers or emails.
alter table import_identity_keys drop constraint if exists import_identity_keys_resource_type_check;
alter table import_identity_keys add constraint import_identity_keys_resource_type_check
  check (resource_type in ('lead','client','account','account_contact','campaign_member',
    'quote','project','task','job_sheet','invoice','invoice_line_item','invoice_payment',
    'timesheet','timesheet_line','staff_map','purchase_order','setting','job_cost','job_note'));

create table if not exists wfm_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_namespace text not null check (source_namespace ~ '^workflowmax:.+'),
  mode text not null check (mode in ('full','incremental')),
  updated_since date,
  state text not null default 'running' check (state in ('running','completed','failed')),
  started_at timestamptz not null default now(), completed_at timestamptz,
  check ((mode = 'full' and updated_since is null) or (mode = 'incremental' and updated_since is not null)),
  unique(id,source_namespace)
);

create table if not exists wfm_raw_objects (
  id uuid primary key,
  source_namespace text not null check (source_namespace ~ '^workflowmax:.+'),
  resource_type text not null, external_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  pulled_at timestamptz not null default now(),
  unique(source_namespace,resource_type,external_key), unique(id,source_namespace)
);

create table if not exists wfm_staff_map (
  wfm_staff_id text primary key,
  id uuid not null unique,
  source_namespace text not null,
  profile_id text references profiles(id) on delete set null,
  email text, raw jsonb not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_namespace,wfm_staff_id),
  foreign key(id,source_namespace) references wfm_raw_objects(id,source_namespace)
);

create table if not exists wfm_invoices (
  id uuid primary key,
  source_namespace text not null, external_key text not null,
  account_id uuid references accounts(id), project_id uuid references projects(id),
  wfm_client_id text, number text, status text,
  invoice_date date, due_date date, paid_date date, currency text,
  subtotal numeric, total numeric, paid numeric,
  raw jsonb not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_namespace,external_key), unique(id,source_namespace),
  foreign key(project_id,account_id) references projects(id,account_id),
  foreign key(id,source_namespace) references wfm_raw_objects(id,source_namespace)
);
create index if not exists wfm_invoices_account_idx on wfm_invoices(account_id,invoice_date);
create index if not exists wfm_invoices_project_idx on wfm_invoices(project_id);

-- Multi-job invoice details remain lossless in raw. Children require real source
-- UUIDs; entries lacking UUIDs stay in raw until an approved identity rule exists.
create table if not exists wfm_invoice_line_items (
  id uuid primary key, source_namespace text not null, external_key text not null,
  invoice_id uuid not null, description text, quantity numeric, amount numeric,
  raw jsonb not null, metadata jsonb not null default '{}'::jsonb,
  unique(source_namespace,external_key),
  foreign key(invoice_id,source_namespace) references wfm_invoices(id,source_namespace),
  foreign key(id,source_namespace) references wfm_raw_objects(id,source_namespace)
);
create index if not exists wfm_invoice_line_items_parent_idx on wfm_invoice_line_items(invoice_id);

create table if not exists wfm_invoice_payments (
  id uuid primary key, source_namespace text not null, external_key text not null,
  invoice_id uuid not null, payment_date date, amount numeric, reference text,
  raw jsonb not null, metadata jsonb not null default '{}'::jsonb,
  unique(source_namespace,external_key),
  foreign key(invoice_id,source_namespace) references wfm_invoices(id,source_namespace),
  foreign key(id,source_namespace) references wfm_raw_objects(id,source_namespace)
);
create index if not exists wfm_invoice_payments_parent_idx on wfm_invoice_payments(invoice_id);

-- The V2 timesheet UUID identifies one time entry (not a weekly header).
-- Minutes are authoritative: hours are derived so 20 minutes never drifts to .33.
create table if not exists wfm_timesheets (
  id uuid primary key, source_namespace text not null, external_key text not null,
  wfm_staff_id text, wfm_job_id text, wfm_task_id text,
  project_id uuid references projects(id), work_date date,
  minutes numeric, hours numeric generated always as (minutes / 60) stored,
  cost_amount numeric, billable_amount numeric, currency text,
  raw jsonb not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_namespace,external_key), unique(id,source_namespace),
  foreign key(source_namespace,wfm_staff_id) references wfm_staff_map(source_namespace,wfm_staff_id),
  foreign key(id,source_namespace) references wfm_raw_objects(id,source_namespace)
);
create index if not exists wfm_timesheets_project_date_idx on wfm_timesheets(project_id,work_date);
create index if not exists wfm_timesheets_staff_date_idx on wfm_timesheets(source_namespace,wfm_staff_id,work_date);
create table if not exists wfm_timesheet_lines (
  id uuid primary key, source_namespace text not null, external_key text not null,
  timesheet_id uuid not null, wfm_staff_id text, project_id uuid references projects(id),
  work_date date, minutes numeric, hours numeric generated always as (minutes / 60) stored,
  amount numeric, raw jsonb not null,
  unique(source_namespace,external_key),
  foreign key(timesheet_id,source_namespace) references wfm_timesheets(id,source_namespace),
  foreign key(source_namespace,wfm_staff_id) references wfm_staff_map(source_namespace,wfm_staff_id),
  foreign key(id,source_namespace) references wfm_raw_objects(id,source_namespace)
);
create index if not exists wfm_timesheet_lines_parent_idx on wfm_timesheet_lines(timesheet_id);

create table if not exists wfm_import_receipts (
  run_id uuid not null, source_namespace text not null,
  resource_type text not null, external_key text not null,
  resource_id uuid, status text not null check (status in ('succeeded','failed')),
  action text not null check (action in ('created','updated','failed')),
  error_code text, processed_at timestamptz not null default now(),
  primary key(run_id,resource_type,external_key),
  foreign key(run_id,source_namespace) references wfm_import_runs(id,source_namespace)
);

-- Match migration 022: server/operator access only; no browser policies/grants.
do $$ declare t text; begin
  foreach t in array array['wfm_import_runs','wfm_raw_objects','wfm_staff_map',
    'wfm_invoices','wfm_invoice_line_items','wfm_invoice_payments','wfm_timesheets',
    'wfm_timesheet_lines','wfm_import_receipts'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on table %I from public',t);
  end loop;
end $$;

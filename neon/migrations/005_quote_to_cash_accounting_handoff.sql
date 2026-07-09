-- Quote Upgrade + Accounting Handoff

alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in (
    'draft',
    'pending_approval',
    'approved',
    'sent',
    'viewed',
    'accepted',
    'rejected',
    'expired',
    'revised'
  ));

create table if not exists quote_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  default_cover_text text,
  default_scope_sections jsonb not null default '[]'::jsonb,
  default_assumptions text,
  default_payment_terms text,
  default_validity_days integer not null default 30,
  starter_line_items jsonb not null default '[]'::jsonb,
  default_pdf_template_id uuid,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pdf_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text not null check (document_type in ('quote','job_sheet')),
  active boolean not null default true,
  brand_settings jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quote_templates_default_pdf_template_id_fkey'
  ) then
    alter table quote_templates
      add constraint quote_templates_default_pdf_template_id_fkey
      foreign key (default_pdf_template_id) references pdf_templates(id) on delete set null;
  end if;
end $$;

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  pricing_template_id uuid references pricing_templates(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  section_label text,
  service text not null,
  description text not null default '',
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) generated always as (qty * unit_price) stored,
  taxable boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  version_number integer not null,
  reason text not null check (reason in ('issued','revised','accepted','change_order')),
  snapshot jsonb not null,
  pdf_template_id uuid references pdf_templates(id) on delete set null,
  pdf_url text,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);

alter table quotes add column if not exists quote_template_id uuid references quote_templates(id) on delete set null;
alter table quotes add column if not exists accepted_version_id uuid references quote_versions(id) on delete set null;
alter table quotes add column if not exists issued_version_id uuid references quote_versions(id) on delete set null;
alter table quotes add column if not exists document_sections jsonb not null default '[]'::jsonb;
alter table quotes add column if not exists cover_text text;
alter table quotes add column if not exists assumptions text;
alter table quotes add column if not exists payment_terms text;
alter table quotes add column if not exists accepted_at timestamptz;
alter table quotes add column if not exists accepted_by text references profiles(id) on delete set null;
alter table quotes add column if not exists parent_quote_id uuid references quotes(id) on delete set null;
alter table quotes add column if not exists change_order_reason text;

create sequence if not exists job_sheet_number_seq;

create table if not exists job_sheets (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  quote_id uuid not null references quotes(id) on delete restrict,
  accepted_quote_version_id uuid not null references quote_versions(id) on delete restrict,
  account_id uuid references accounts(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  contact_id uuid references account_contacts(id) on delete set null,
  sales_owner text references profiles(id) on delete set null,
  accounting_owner text references profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','accounting_review','accepted','change_required','cancelled')),
  accepted_scope_summary text,
  po_number text,
  client_order_number text,
  xero_customer_reference text,
  accounting_notes text,
  special_billing_instructions text,
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'HKD',
  accepted_at timestamptz,
  accepted_by text references profiles(id) on delete set null,
  locked_at timestamptz,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, accepted_quote_version_id)
);

create table if not exists job_sheet_portions (
  id uuid primary key default gen_random_uuid(),
  job_sheet_id uuid not null references job_sheets(id) on delete cascade,
  name text not null,
  source_quote_line_item_ids uuid[] not null default '{}'::uuid[],
  description text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'HKD',
  target_invoice_date date,
  billing_type text not null default 'progress'
    check (billing_type in ('deposit','progress','milestone','monthly','final','other')),
  status text not null default 'planned'
    check (status in ('planned','entered_in_xero','cancelled')),
  xero_invoice_number text,
  xero_invoice_reference text,
  xero_invoice_date date,
  xero_notes text,
  internal_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_sheet_activity (
  id uuid primary key default gen_random_uuid(),
  job_sheet_id uuid not null references job_sheets(id) on delete cascade,
  actor_id text references profiles(id) on delete set null,
  action text not null,
  note text,
  diff_data jsonb,
  created_at timestamptz not null default now()
);

alter table activity_logs drop constraint if exists activity_logs_object_type_check;
alter table activity_logs add constraint activity_logs_object_type_check
  check (object_type in (
    'lead',
    'quote',
    'client',
    'task',
    'approval',
    'engagement',
    'account',
    'contact',
    'campaign',
    'campaign_member',
    'relationship_signal',
    'quote_version',
    'job_sheet',
    'job_sheet_portion'
  ));

drop trigger if exists quote_templates_updated_at on quote_templates;
create trigger quote_templates_updated_at before update on quote_templates
  for each row execute function set_updated_at();
drop trigger if exists pdf_templates_updated_at on pdf_templates;
create trigger pdf_templates_updated_at before update on pdf_templates
  for each row execute function set_updated_at();
drop trigger if exists quote_line_items_updated_at on quote_line_items;
create trigger quote_line_items_updated_at before update on quote_line_items
  for each row execute function set_updated_at();
drop trigger if exists job_sheets_updated_at on job_sheets;
create trigger job_sheets_updated_at before update on job_sheets
  for each row execute function set_updated_at();
drop trigger if exists job_sheet_portions_updated_at on job_sheet_portions;
create trigger job_sheet_portions_updated_at before update on job_sheet_portions
  for each row execute function set_updated_at();

create index if not exists quote_templates_active_idx on quote_templates(active, name);
create index if not exists pdf_templates_type_active_idx on pdf_templates(document_type, active);
create unique index if not exists pdf_templates_document_type_name_idx on pdf_templates(document_type, name);
create index if not exists quote_line_items_quote_id_idx on quote_line_items(quote_id, sort_order);
create index if not exists quote_versions_quote_id_idx on quote_versions(quote_id, version_number desc);
create index if not exists job_sheets_status_idx on job_sheets(status, created_at desc);
create index if not exists job_sheets_quote_id_idx on job_sheets(quote_id);
create index if not exists job_sheets_client_id_idx on job_sheets(client_id);
create index if not exists job_sheets_account_id_idx on job_sheets(account_id);
create index if not exists job_sheet_portions_job_sheet_id_idx on job_sheet_portions(job_sheet_id, sort_order);
create index if not exists job_sheet_portions_target_invoice_date_idx on job_sheet_portions(target_invoice_date);
create index if not exists job_sheet_activity_job_sheet_id_idx on job_sheet_activity(job_sheet_id, created_at desc);

insert into pdf_templates (name, document_type, brand_settings, sections)
values
  (
    'Fimmick Standard Quote',
    'quote',
    '{"logoText":"Fimmick","accentColor":"#2563EB"}'::jsonb,
    '[
      {"id":"cover","label":"Cover","enabled":true},
      {"id":"scope","label":"Scope","enabled":true},
      {"id":"line_items","label":"Commercials","enabled":true},
      {"id":"terms","label":"Terms","enabled":true}
    ]'::jsonb
  ),
  (
    'Fimmick Accounting Job Sheet',
    'job_sheet',
    '{"logoText":"Fimmick","accentColor":"#2563EB"}'::jsonb,
    '[
      {"id":"handoff","label":"Accounting Handoff","enabled":true},
      {"id":"scope","label":"Accepted Scope","enabled":true},
      {"id":"billing_portions","label":"Billing Portions","enabled":true},
      {"id":"xero","label":"Xero References","enabled":true}
    ]'::jsonb
  )
on conflict (document_type, name) do nothing;

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists profiles (
  id text primary key,
  email text unique,
  name text,
  role text not null default 'sales' check (role in ('admin','manager','sales','cs')),
  avatar_url text,
  assignment_labels text[] not null default '{}'::text[],
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid,
  account_id uuid,
  source_campaign_id uuid,
  campaign_member_id uuid,
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  source text check (source in ('website','whatsapp','email','linkedin','csv','event','manual')),
  status text not null default 'new' check (status in ('new','qualified','replied','quoted','approved','won','lost')),
  assigned_to text references profiles(id) on delete set null,
  lead_score integer not null default 0,
  qualification_data jsonb,
  enquiry_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,
  primary_contact_id uuid,
  company_name text not null,
  industry text,
  tier text check (tier in ('SME','mid-market','enterprise')),
  account_owner text references profiles(id) on delete set null,
  health_score integer not null default 50,
  onboarding_status text not null default 'not_started',
  renewal_date date,
  arr numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  number text,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  contact_id uuid,
  account_id uuid,
  deal_id uuid,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','viewed','accepted','rejected')),
  total_value numeric(12,2),
  currency text not null default 'HKD',
  valid_until date,
  line_items jsonb not null default '[]'::jsonb,
  pdf_url text,
  created_by text references profiles(id) on delete set null,
  approved_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_must_have_context check (lead_id is not null or client_id is not null)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to text references profiles(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  contact_id uuid,
  account_id uuid,
  deal_id uuid,
  project_id uuid,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','in_progress','done')),
  created_by_agent text,
  created_at timestamptz not null default now()
);

create table if not exists pricing_templates (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  description text,
  category text check (category in ('AI transformation','CRM','KOC','campaign','data','custom')),
  unit_price numeric(10,2),
  currency text not null default 'HKD',
  active boolean not null default true
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  workflow_type text not null check (workflow_type in ('qualify_lead','draft_reply','draft_quote')),
  trigger_type text check (trigger_type in ('manual','webhook','schedule','orchestrator')),
  subject_type text not null default 'lead' check (subject_type in ('lead','quote','client','task','approval')),
  subject_id uuid not null,
  input_data jsonb,
  output_data jsonb,
  output_summary text,
  status text not null check (status in ('running','completed','failed','waiting_approval')),
  duration_ms integer,
  tokens_used integer,
  model_used text not null default 'anthropic/claude-sonnet-4-6',
  confidence_score double precision,
  human_review_required boolean not null default false,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid references agent_runs(id) on delete cascade,
  tool_name text not null,
  input_params jsonb,
  output_result jsonb,
  success boolean,
  error_message text,
  called_at timestamptz not null default now()
);

create table if not exists human_approvals (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid references agent_runs(id) on delete set null,
  approval_type text check (approval_type in ('quote_send','message_send','discount','qualification_review','campaign_send','forecast_review','cs_risk_review')),
  requested_by text,
  assigned_to text references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','escalated')),
  context_data jsonb,
  context_summary text,
  reviewer_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text check (actor_type in ('agent','user')),
  actor_id text,
  actor_name text,
  action text not null,
  object_type text check (object_type in ('lead','quote','client','task','approval')),
  object_id uuid,
  diff_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();

drop trigger if exists clients_updated_at on clients;
create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

drop trigger if exists quotes_updated_at on quotes;
create trigger quotes_updated_at before update on quotes
  for each row execute function set_updated_at();

drop trigger if exists agent_runs_updated_at on agent_runs;
create trigger agent_runs_updated_at before update on agent_runs
  for each row execute function set_updated_at();

create index if not exists leads_status_idx on leads(status);
create index if not exists leads_assigned_to_idx on leads(assigned_to);
create index if not exists leads_updated_at_idx on leads(updated_at desc);
create index if not exists quotes_lead_id_idx on quotes(lead_id);
create index if not exists quotes_client_id_idx on quotes(client_id);
create index if not exists quotes_status_idx on quotes(status);
create index if not exists tasks_lead_id_idx on tasks(lead_id);
create index if not exists tasks_client_id_idx on tasks(client_id);
create index if not exists tasks_assigned_to_idx on tasks(assigned_to);
create index if not exists tasks_status_due_date_idx on tasks(status, due_date);
create index if not exists agent_runs_subject_idx on agent_runs(subject_type, subject_id);
create unique index if not exists agent_runs_active_idx on agent_runs(subject_type, subject_id, workflow_type)
  where status in ('running','waiting_approval');
create index if not exists agent_tool_calls_agent_run_id_idx on agent_tool_calls(agent_run_id);
create index if not exists human_approvals_agent_run_id_idx on human_approvals(agent_run_id);
create index if not exists human_approvals_assigned_to_idx on human_approvals(assigned_to);
create index if not exists human_approvals_status_idx on human_approvals(status);
create index if not exists activity_logs_object_idx on activity_logs(object_type, object_id, created_at desc);

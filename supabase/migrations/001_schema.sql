-- Enable pgvector (for Phase 3 agent memory — create now, use later)
create extension if not exists vector;

-- Profiles (extends auth.users — created automatically by Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text default 'sales' check (role in ('admin','manager','sales','cs')),
  avatar_url text,
  created_at timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Leads
create table leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  source text check (source in ('website','whatsapp','email','linkedin','csv','event')),
  status text default 'new' check (status in ('new','qualified','replied','quoted','approved','won','lost')),
  assigned_to uuid references profiles(id),
  lead_score integer default 0,
  qualification_data jsonb,
  enquiry_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clients (must come before quotes)
create table clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  industry text,
  tier text check (tier in ('SME','mid-market','enterprise')),
  account_owner uuid references profiles(id),
  health_score integer default 50,
  onboarding_status text default 'not_started',
  renewal_date date,
  arr numeric(12,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Quotes
create table quotes (
  id uuid primary key default gen_random_uuid(),
  number text,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  status text default 'draft' check (status in ('draft','pending_approval','approved','sent','viewed','accepted','rejected')),
  total_value numeric(12,2),
  currency text default 'HKD',
  valid_until date,
  line_items jsonb default '[]'::jsonb,
  pdf_url text,
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint quotes_must_have_context check (lead_id is not null or client_id is not null)
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references profiles(id),
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  due_date date,
  priority text default 'medium' check (priority in ('low','medium','high')),
  status text default 'open' check (status in ('open','in_progress','done')),
  created_by_agent text,
  created_at timestamptz default now()
);

-- Pricing templates (used by Quotation Agent)
create table pricing_templates (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  description text,
  category text check (category in ('AI transformation','CRM','KOC','campaign','data','custom')),
  unit_price numeric(10,2),
  currency text default 'HKD',
  active boolean default true
);

-- Agent runs (written by n8n)
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  trigger_type text check (trigger_type in ('manual','webhook','schedule','orchestrator')),
  input_data jsonb,
  output_data jsonb,
  output_summary text,
  status text check (status in ('running','completed','failed','waiting_approval')),
  duration_ms integer,
  tokens_used integer,
  model_used text default 'anthropic/claude-sonnet-4-6',
  confidence_score float,
  human_review_required boolean default false,
  created_at timestamptz default now()
);

-- Agent tool calls (written by n8n)
create table agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid references agent_runs(id),
  tool_name text not null,
  input_params jsonb,
  output_result jsonb,
  success boolean,
  error_message text,
  called_at timestamptz default now()
);

-- Human approvals (written by n8n when confidence < 0.7 or action needs sign-off)
create table human_approvals (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid references agent_runs(id),
  approval_type text check (approval_type in ('quote_send','message_send','discount','qualification_review')),
  requested_by text,
  assigned_to uuid references profiles(id),
  status text default 'pending' check (status in ('pending','approved','rejected','escalated')),
  context_data jsonb,
  context_summary text,
  reviewer_notes text,
  decided_at timestamptz,
  created_at timestamptz default now()
);

-- Activity logs
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text check (actor_type in ('agent','user')),
  actor_id text,
  actor_name text,
  action text not null,
  object_type text check (object_type in ('lead','quote','client','task','approval')),
  object_id uuid,
  diff_data jsonb,
  created_at timestamptz default now()
);

-- Auto-update updated_at on leads, quotes, clients
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger quotes_updated_at before update on quotes
  for each row execute function set_updated_at();
create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

-- Indexes on frequently-queried FK columns
create index leads_assigned_to_idx on leads(assigned_to);
create index quotes_lead_id_idx on quotes(lead_id);
create index quotes_client_id_idx on quotes(client_id);
create index tasks_lead_id_idx on tasks(lead_id);
create index tasks_client_id_idx on tasks(client_id);
create index tasks_assigned_to_idx on tasks(assigned_to);
create index agent_tool_calls_agent_run_id_idx on agent_tool_calls(agent_run_id);
create index human_approvals_agent_run_id_idx on human_approvals(agent_run_id);
create index human_approvals_assigned_to_idx on human_approvals(assigned_to);

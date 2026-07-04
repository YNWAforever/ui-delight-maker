-- neon/migrations/002_retention_client_360.sql

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text check (category in ('AI transformation','CRM','KOC','campaign','data','custom')),
  billing_type text not null check (billing_type in ('retainer','one_off','usage')),
  default_term_months integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists engagements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  owner text references profiles(id) on delete set null,
  value numeric(12,2),
  billing_period text not null check (billing_period in ('monthly','quarterly','annual','one_off')),
  start_date date not null default current_date,
  renewal_date date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  health_score integer not null default 50,
  renewal_risk text not null default 'low' check (renewal_risk in ('low','medium','high')),
  risk_reasoning text,
  next_action text,
  last_touch_at timestamptz,
  end_reason text,
  lead_id uuid references leads(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists touchpoints (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  engagement_id uuid references engagements(id) on delete set null,
  contact_id uuid references client_contacts(id) on delete set null,
  type text not null check (type in ('check_in','qbr','meeting','call','whatsapp','email','note')),
  sentiment text not null default 'neutral' check (sentiment in ('positive','neutral','negative')),
  notes text,
  occurred_at timestamptz not null default now(),
  logged_by text references profiles(id) on delete set null,
  created_by_agent text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  type text not null check (type in ('renewal_window','risk_change','stale_touchpoint','approval_pending')),
  title text not null,
  body text,
  object_type text,
  object_id uuid,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Existing-table changes (see docs/superpowers/specs/2026-07-04-retention-client-360-design.md section 4.2)

alter table pricing_templates add column if not exists product_id uuid references products(id) on delete set null;

alter table activity_logs drop constraint if exists activity_logs_object_type_check;
alter table activity_logs add constraint activity_logs_object_type_check
  check (object_type in ('lead','quote','client','task','approval','engagement'));

alter table agent_runs drop constraint if exists agent_runs_workflow_type_check;
alter table agent_runs add constraint agent_runs_workflow_type_check
  check (workflow_type in ('qualify_lead','draft_reply','draft_quote','score_renewal_risk'));

alter table agent_runs drop constraint if exists agent_runs_subject_type_check;
alter table agent_runs add constraint agent_runs_subject_type_check
  check (subject_type in ('lead','quote','client','task','approval','engagement'));

drop trigger if exists products_updated_at on products;
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists client_contacts_updated_at on client_contacts;
create trigger client_contacts_updated_at before update on client_contacts
  for each row execute function set_updated_at();

drop trigger if exists engagements_updated_at on engagements;
create trigger engagements_updated_at before update on engagements
  for each row execute function set_updated_at();

create index if not exists engagements_client_id_idx on engagements(client_id);
create index if not exists engagements_product_id_idx on engagements(product_id);
create index if not exists engagements_owner_idx on engagements(owner);
create index if not exists engagements_status_renewal_idx on engagements(status, renewal_date);
create index if not exists client_contacts_client_id_idx on client_contacts(client_id);
create index if not exists touchpoints_client_id_idx on touchpoints(client_id, occurred_at desc);
create index if not exists touchpoints_engagement_id_idx on touchpoints(engagement_id, occurred_at desc);
create index if not exists notifications_user_id_idx on notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on notifications(user_id) where read_at is null;
create unique index if not exists notifications_dedupe_idx on notifications(user_id, type, dedupe_key)
  where dedupe_key is not null;
create index if not exists agent_runs_subject_type_id_idx on agent_runs(subject_type, subject_id) include (workflow_type, status);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  domain text,
  industry text,
  region text,
  tier text check (tier in ('SME','mid-market','enterprise')),
  lifecycle_stage text not null default 'prospect'
    check (lifecycle_stage in ('prospect','active_client','at_risk','churned','partner','vendor')),
  account_owner text references profiles(id) on delete set null,
  cs_owner text references profiles(id) on delete set null,
  source text,
  tags text[] not null default '{}'::text[],
  notes text,
  relationship_health integer not null default 50 check (relationship_health between 0 and 100),
  last_activity_at timestamptz,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  title text,
  department text,
  email text,
  phone text,
  whatsapp text,
  linkedin_url text,
  preferred_channel text check (preferred_channel in ('email','phone','whatsapp','linkedin','event','unknown')),
  relationship_role text not null default 'other'
    check (relationship_role in ('decision_maker','buyer','champion','daily_user','influencer','finance_procurement','blocker','agency_partner','event_attendee','other')),
  influence_level text not null default 'medium' check (influence_level in ('low','medium','high')),
  sentiment text not null default 'unknown' check (sentiment in ('positive','neutral','negative','unknown')),
  relationship_strength text not null default 'developing' check (relationship_strength in ('weak','developing','strong')),
  is_primary boolean not null default false,
  active boolean not null default true,
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'campaign'
    check (type in ('campaign','webinar','workshop','activation','outbound','client_event')),
  status text not null default 'draft'
    check (status in ('draft','planned','active','completed','archived')),
  objective text,
  owner text references profiles(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  contact_id uuid references account_contacts(id) on delete set null,
  raw_company_name text,
  raw_contact_name text,
  raw_email text,
  raw_phone text,
  attendance_status text not null default 'invited'
    check (attendance_status in ('invited','registered','attended','no_show','cancelled')),
  interests text[] not null default '{}'::text[],
  follow_up_owner text references profiles(id) on delete set null,
  follow_up_status text not null default 'not_started'
    check (follow_up_status in ('not_started','task_created','in_progress','completed','dismissed')),
  conversion_outcome text not null default 'none'
    check (conversion_outcome in ('none','lead','quote','engagement','client_activity')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists relationship_signals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  signal_type text not null
    check (signal_type in ('missing_decision_maker','missing_champion','stale_touchpoint','post_event_follow_up_due','stale_quote','coverage_gap','high_risk_engagement','negative_sentiment','unowned_account','cross_sell_opportunity')),
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  title text not null,
  reason text not null,
  suggested_action text,
  source text not null default 'deterministic' check (source in ('deterministic','ai')),
  dedupe_key text not null,
  dismissed_at timestamptz,
  dismissed_by text references profiles(id) on delete set null,
  dismissal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clients add column if not exists account_id uuid references accounts(id) on delete set null;
alter table leads add column if not exists account_id uuid references accounts(id) on delete set null;
alter table quotes add column if not exists account_id uuid references accounts(id) on delete set null;
alter table tasks add column if not exists account_id uuid references accounts(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_account_id_fkey'
      and conrelid = 'clients'::regclass
  ) then
    alter table clients
      add constraint clients_account_id_fkey
      foreign key (account_id) references accounts(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_account_id_fkey'
      and conrelid = 'leads'::regclass
  ) then
    alter table leads
      add constraint leads_account_id_fkey
      foreign key (account_id) references accounts(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_account_id_fkey'
      and conrelid = 'quotes'::regclass
  ) then
    alter table quotes
      add constraint quotes_account_id_fkey
      foreign key (account_id) references accounts(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_account_id_fkey'
      and conrelid = 'tasks'::regclass
  ) then
    alter table tasks
      add constraint tasks_account_id_fkey
      foreign key (account_id) references accounts(id) on delete set null
      not valid;
  end if;
end $$;

alter table relationship_signals drop constraint if exists relationship_signals_dismissal_reason_check;
alter table relationship_signals add constraint relationship_signals_dismissal_reason_check
  check (dismissed_at is null or nullif(btrim(dismissal_reason), '') is not null);

alter table activity_logs drop constraint if exists activity_logs_object_type_check;
alter table activity_logs add constraint activity_logs_object_type_check
  check (object_type in ('lead','quote','client','task','approval','engagement','account','contact','campaign','campaign_member','relationship_signal'));

alter table agent_runs drop constraint if exists agent_runs_workflow_type_check;
alter table agent_runs add constraint agent_runs_workflow_type_check
  check (workflow_type in ('qualify_lead','draft_reply','draft_quote','score_renewal_risk','relationship_intelligence'));

alter table agent_runs drop constraint if exists agent_runs_subject_type_check;
alter table agent_runs add constraint agent_runs_subject_type_check
  check (subject_type in ('lead','quote','client','task','approval','engagement','account','campaign'));

drop trigger if exists accounts_updated_at on accounts;
create trigger accounts_updated_at before update on accounts
  for each row execute function set_updated_at();

drop trigger if exists account_contacts_updated_at on account_contacts;
create trigger account_contacts_updated_at before update on account_contacts
  for each row execute function set_updated_at();

drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

drop trigger if exists campaign_members_updated_at on campaign_members;
create trigger campaign_members_updated_at before update on campaign_members
  for each row execute function set_updated_at();

drop trigger if exists relationship_signals_updated_at on relationship_signals;
create trigger relationship_signals_updated_at before update on relationship_signals
  for each row execute function set_updated_at();

create unique index if not exists accounts_lower_name_unique_idx on accounts (lower(name));
create index if not exists accounts_owner_idx on accounts(account_owner);
create index if not exists accounts_cs_owner_idx on accounts(cs_owner);
create index if not exists accounts_lifecycle_stage_idx on accounts(lifecycle_stage);
create index if not exists accounts_last_activity_idx on accounts(last_activity_at desc nulls last);
create index if not exists account_contacts_account_id_idx on account_contacts(account_id);
create unique index if not exists account_contacts_account_email_unique_idx
  on account_contacts(account_id, lower(email)) where email is not null;
create unique index if not exists account_contacts_one_primary_per_account_idx
  on account_contacts(account_id) where is_primary;
create index if not exists account_contacts_role_idx on account_contacts(account_id, relationship_role);
create index if not exists campaigns_status_idx on campaigns(status);
create index if not exists campaigns_owner_idx on campaigns(owner);
create index if not exists campaign_members_campaign_id_idx on campaign_members(campaign_id);
create index if not exists campaign_members_account_id_idx on campaign_members(account_id);
create index if not exists campaign_members_contact_id_idx on campaign_members(contact_id);
create unique index if not exists relationship_signals_active_dedupe_idx
  on relationship_signals(account_id, signal_type, dedupe_key)
  where dismissed_at is null;
create index if not exists relationship_signals_account_idx on relationship_signals(account_id, created_at desc);
create index if not exists relationship_signals_open_idx on relationship_signals(created_at desc) where dismissed_at is null;

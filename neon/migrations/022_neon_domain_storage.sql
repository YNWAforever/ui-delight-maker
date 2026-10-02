-- Neon-only storage. No legacy import, remote read, seed, or provider dispatch.
-- Profile IDs are Neon Auth text IDs; contacts are canonical account_contacts.
create unique index if not exists account_contacts_id_account_unique on account_contacts(id, account_id);

create table if not exists automation_playbooks (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  trigger_type text not null check (trigger_type in ('manual','engagement_event','lead_created','deal_stage_changed','renewal_risk','schedule')),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  steps jsonb not null default '[]'::jsonb, created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists deals (
  id uuid primary key default gen_random_uuid(), account_id uuid references accounts(id) on delete set null,
  contact_id uuid references account_contacts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null, quote_id uuid references quotes(id) on delete set null,
  source_campaign_id uuid references campaigns(id) on delete set null, name text not null,
  stage text not null default 'new' check (stage in ('new','discovery','qualified','proposal','negotiation','won','lost')),
  status text not null default 'open' check (status in ('open','won','lost')),
  probability integer not null default 10 check (probability between 0 and 100),
  value numeric(12,2) not null default 0, currency text not null default 'HKD', expected_close_date date,
  owner text references profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,account_id), foreign key(contact_id,account_id) references account_contacts(id,account_id)
);
create table if not exists projects (
  id uuid primary key default gen_random_uuid(), account_id uuid references accounts(id) on delete set null,
  contact_id uuid references account_contacts(id) on delete set null,
  deal_id uuid references deals(id) on delete set null, quote_id uuid references quotes(id) on delete set null,
  name text not null, status text not null default 'not_started' check (status in ('not_started','onboarding','in_progress','blocked','completed','cancelled')),
  start_date date, target_end_date date, owner text references profiles(id) on delete set null,
  value numeric(12,2) not null default 0, currency text not null default 'HKD',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,account_id), foreign key(contact_id,account_id) references account_contacts(id,account_id),
  foreign key(deal_id,account_id) references deals(id,account_id)
);
alter table campaign_members add column if not exists last_event_at timestamptz;
create unique index if not exists campaign_members_id_account_unique on campaign_members(id,account_id);
create unique index if not exists campaign_members_id_contact_unique on campaign_members(id,contact_id);
create unique index if not exists campaign_members_id_campaign_unique on campaign_members(id,campaign_id);
create table if not exists engagement_events (
  id uuid primary key default gen_random_uuid(), contact_id uuid references account_contacts(id) on delete set null,
  account_id uuid references accounts(id) on delete set null, campaign_id uuid references campaigns(id) on delete set null,
  campaign_member_id uuid references campaign_members(id) on delete set null,
  deal_id uuid references deals(id) on delete set null, project_id uuid references projects(id) on delete set null,
  channel text not null check (channel in ('website','whatsapp','email','linkedin','csv','event','manual')),
  direction text not null default 'inbound' check (direction in ('inbound','outbound','internal')),
  event_type text not null, subject text, body_preview text, occurred_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null, created_by_agent text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  check (contact_id is not null or account_id is not null),
  foreign key(contact_id,account_id) references account_contacts(id,account_id),
  foreign key(deal_id,account_id) references deals(id,account_id),
  foreign key(project_id,account_id) references projects(id,account_id),
  foreign key(campaign_member_id,account_id) references campaign_members(id,account_id),
  foreign key(campaign_member_id,contact_id) references campaign_members(id,contact_id),
  foreign key(campaign_member_id,campaign_id) references campaign_members(id,campaign_id)
);
create table if not exists channel_identities (
  id uuid primary key default gen_random_uuid(), contact_id uuid references account_contacts(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  channel text not null check (channel in ('website','whatsapp','email','linkedin','csv','event','manual')),
  external_id text, handle text, is_primary boolean not null default false, last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  check (contact_id is not null or account_id is not null), unique(channel,external_id),
  foreign key(contact_id,account_id) references account_contacts(id,account_id)
);
create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(), playbook_id uuid references automation_playbooks(id) on delete set null,
  contact_id uuid references account_contacts(id) on delete set null, account_id uuid references accounts(id) on delete set null,
  deal_id uuid references deals(id) on delete set null, project_id uuid references projects(id) on delete set null,
  trigger_event_id uuid references engagement_events(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  context_data jsonb not null default '{}'::jsonb, output_data jsonb, error_message text,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now(),
  foreign key(contact_id,account_id) references account_contacts(id,account_id),
  foreign key(deal_id,account_id) references deals(id,account_id),
  foreign key(project_id,account_id) references projects(id,account_id)
);
create table if not exists customer_success_profiles (
  id uuid primary key default gen_random_uuid(), account_id uuid not null unique references accounts(id) on delete cascade,
  primary_contact_id uuid references account_contacts(id) on delete set null, project_id uuid references projects(id) on delete set null,
  cs_owner text references profiles(id) on delete set null,
  health_score integer not null default 50 check (health_score between 0 and 100),
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started','onboarding','live','stalled')),
  renewal_date date, renewal_risk text not null default 'medium' check (renewal_risk in ('low','medium','high')),
  next_best_action text, expansion_signal text, last_touch_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(primary_contact_id,account_id) references account_contacts(id,account_id),
  foreign key(project_id,account_id) references projects(id,account_id)
);
create table if not exists success_touchpoints (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references account_contacts(id) on delete set null, project_id uuid references projects(id) on delete set null,
  touchpoint_type text not null default 'check_in' check (touchpoint_type in ('onboarding','check_in','qbr','renewal','support','expansion','other')),
  sentiment text not null default 'neutral' check (sentiment in ('positive','neutral','negative')),
  notes text, occurred_at timestamptz not null default now(), created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(contact_id,account_id) references account_contacts(id,account_id),
  foreign key(project_id,account_id) references projects(id,account_id)
);

-- Existing task/quote deal/project IDs remain untouched; reconciling historical orphans is separate.
create index if not exists deals_account_created_idx on deals(account_id,created_at desc,id);
create index if not exists projects_account_created_idx on projects(account_id,created_at desc,id);
create index if not exists projects_deal_idx on projects(deal_id);
create index if not exists engagement_events_account_time_idx on engagement_events(account_id,occurred_at desc,id);
create index if not exists engagement_events_contact_time_idx on engagement_events(contact_id,occurred_at desc,id);
create index if not exists engagement_events_deal_time_idx on engagement_events(deal_id,occurred_at desc,id);
create index if not exists engagement_events_project_time_idx on engagement_events(project_id,occurred_at desc,id);
create index if not exists automation_runs_playbook_time_idx on automation_runs(playbook_id,created_at desc,id);
create index if not exists success_touchpoints_account_time_idx on success_touchpoints(account_id,occurred_at desc,id);
create index if not exists customer_success_renewal_idx on customer_success_profiles(renewal_date,id);
do $$ declare t text; begin
  foreach t in array array['deals','projects','engagement_events','channel_identities','automation_playbooks','automation_runs','customer_success_profiles','success_touchpoints'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on table %I from public',t);
  end loop;
end $$;

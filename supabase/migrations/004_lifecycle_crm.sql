-- Phase 3: ActiveCampaign-style lifecycle CRM foundation.
-- Adds canonical contacts/accounts, omnichannel engagement, deal forecast,
-- project delivery, and customer success records.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  industry text,
  tier text check (tier in ('SME','mid-market','enterprise')),
  account_owner uuid references profiles(id) on delete set null,
  lifecycle_stage text default 'prospect'
    check (lifecycle_stage in ('prospect','active_client','at_risk','churned')),
  health_score integer default 50 check (health_score between 0 and 100),
  renewal_date date,
  arr numeric(12,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  title text,
  owner uuid references profiles(id) on delete set null,
  lifecycle_stage text default 'lead'
    check (lifecycle_stage in ('subscriber','lead','marketing_qualified','sales_qualified','customer','evangelist','unsubscribed')),
  source text check (source in ('website','whatsapp','email','linkedin','csv','event','manual')),
  consent_status text default 'unknown'
    check (consent_status in ('unknown','opted_in','opted_out')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table channel_identities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  channel text not null check (channel in ('website','whatsapp','email','linkedin','csv','event','manual')),
  external_id text,
  handle text,
  is_primary boolean default false,
  last_seen_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint channel_identity_owner_check check (contact_id is not null or account_id is not null)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('website','whatsapp','email','linkedin','csv','event','manual','omnichannel')),
  status text default 'draft' check (status in ('draft','scheduled','active','paused','completed')),
  objective text,
  audience_filter jsonb default '{}'::jsonb,
  scheduled_at timestamptz,
  owner uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  status text default 'queued'
    check (status in ('queued','sent','opened','clicked','replied','converted','unsubscribed','failed')),
  joined_at timestamptz default now(),
  last_event_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  constraint campaign_member_target_check check (contact_id is not null or account_id is not null)
);

create table automation_playbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_type text not null
    check (trigger_type in ('manual','engagement_event','lead_created','deal_stage_changed','renewal_risk','schedule')),
  status text default 'draft' check (status in ('draft','active','paused','archived')),
  steps jsonb default '[]'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid references automation_playbooks(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  deal_id uuid,
  project_id uuid,
  trigger_event_id uuid,
  status text default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  context_data jsonb default '{}'::jsonb,
  output_data jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  source_campaign_id uuid references campaigns(id) on delete set null,
  name text not null,
  stage text default 'new'
    check (stage in ('new','discovery','qualified','proposal','negotiation','won','lost')),
  status text default 'open' check (status in ('open','won','lost')),
  probability integer default 10 check (probability between 0 and 100),
  value numeric(12,2),
  currency text default 'HKD',
  expected_close_date date,
  owner uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table automation_runs
  add constraint automation_runs_deal_id_fkey foreign key (deal_id) references deals(id) on delete set null;

create table projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  name text not null,
  status text default 'not_started'
    check (status in ('not_started','onboarding','in_progress','blocked','completed','cancelled')),
  start_date date,
  target_end_date date,
  owner uuid references profiles(id) on delete set null,
  value numeric(12,2),
  currency text default 'HKD',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table automation_runs
  add constraint automation_runs_project_id_fkey foreign key (project_id) references projects(id) on delete set null;

create table engagement_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  campaign_member_id uuid references campaign_members(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  channel text not null check (channel in ('website','whatsapp','email','linkedin','csv','event','manual')),
  direction text default 'inbound' check (direction in ('inbound','outbound','internal')),
  event_type text not null,
  subject text,
  body_preview text,
  occurred_at timestamptz default now(),
  created_by uuid references profiles(id) on delete set null,
  created_by_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint engagement_event_target_check check (contact_id is not null or account_id is not null)
);

alter table automation_runs
  add constraint automation_runs_trigger_event_id_fkey foreign key (trigger_event_id) references engagement_events(id) on delete set null;

create table customer_success_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  primary_contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  cs_owner uuid references profiles(id) on delete set null,
  health_score integer default 50 check (health_score between 0 and 100),
  onboarding_status text default 'not_started'
    check (onboarding_status in ('not_started','onboarding','live','stalled')),
  renewal_date date,
  renewal_risk text default 'medium' check (renewal_risk in ('low','medium','high')),
  next_best_action text,
  expansion_signal text,
  last_touch_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint customer_success_profiles_account_unique unique (account_id)
);

create table success_touchpoints (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  touchpoint_type text default 'check_in'
    check (touchpoint_type in ('onboarding','check_in','qbr','renewal','support','expansion','other')),
  sentiment text default 'neutral' check (sentiment in ('positive','neutral','negative')),
  notes text,
  occurred_at timestamptz default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

insert into automation_playbooks (name, description, trigger_type, status, steps)
values
  (
    'Inbound lead nurture',
    'Send a short educational follow-up sequence when a new lead is created but no discovery call is booked.',
    'lead_created',
    'draft',
    '[{"delay":"0 days","action":"send_intro_deck"},{"delay":"3 days","action":"send_case_study"},{"delay":"7 days","action":"create_sales_task"}]'::jsonb
  ),
  (
    'Stalled deal rescue',
    'Create a sales follow-up task and log a recommended next action when a deal stays in one stage too long.',
    'deal_stage_changed',
    'draft',
    '[{"delay":"0 days","action":"score_stall_risk"},{"delay":"1 day","action":"create_follow_up_task"}]'::jsonb
  ),
  (
    'Renewal risk check-in',
    'Create a CS touchpoint and escalation task when renewal risk becomes high.',
    'renewal_risk',
    'draft',
    '[{"delay":"0 days","action":"create_cs_touchpoint"},{"delay":"0 days","action":"create_manager_escalation"}]'::jsonb
  );

alter table leads
  add column if not exists contact_id uuid references contacts(id) on delete set null,
  add column if not exists account_id uuid references accounts(id) on delete set null,
  add column if not exists source_campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists campaign_member_id uuid references campaign_members(id) on delete set null;

alter table leads drop constraint if exists leads_source_check;
alter table leads add constraint leads_source_check
  check (source in ('website','whatsapp','email','linkedin','csv','event','manual'));

alter table clients
  add column if not exists account_id uuid references accounts(id) on delete set null,
  add column if not exists primary_contact_id uuid references contacts(id) on delete set null;

alter table quotes
  add column if not exists contact_id uuid references contacts(id) on delete set null,
  add column if not exists account_id uuid references accounts(id) on delete set null,
  add column if not exists deal_id uuid references deals(id) on delete set null;

alter table quotes drop constraint if exists quotes_must_have_context;
alter table quotes add constraint quotes_must_have_context
  check (
    lead_id is not null
    or client_id is not null
    or contact_id is not null
    or account_id is not null
    or deal_id is not null
  );

alter table tasks
  add column if not exists contact_id uuid references contacts(id) on delete set null,
  add column if not exists account_id uuid references accounts(id) on delete set null,
  add column if not exists deal_id uuid references deals(id) on delete set null,
  add column if not exists project_id uuid references projects(id) on delete set null;

alter table activity_logs drop constraint if exists activity_logs_object_type_check;
alter table activity_logs add constraint activity_logs_object_type_check
  check (object_type in (
    'lead','quote','client','task','approval','contact','account','campaign',
    'campaign_member','engagement_event','automation_playbook','automation_run',
    'deal','project','customer_success','success_touchpoint'
  ));

alter table human_approvals drop constraint if exists human_approvals_approval_type_check;
alter table human_approvals add constraint human_approvals_approval_type_check
  check (approval_type in (
    'quote_send','message_send','discount','qualification_review',
    'campaign_send','forecast_review','cs_risk_review'
  ));

create trigger accounts_updated_at before update on accounts
  for each row execute function set_updated_at();
create trigger contacts_updated_at before update on contacts
  for each row execute function set_updated_at();
create trigger campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();
create trigger automation_playbooks_updated_at before update on automation_playbooks
  for each row execute function set_updated_at();
create trigger deals_updated_at before update on deals
  for each row execute function set_updated_at();
create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger customer_success_profiles_updated_at before update on customer_success_profiles
  for each row execute function set_updated_at();

create index accounts_lower_name_idx on accounts (lower(name));
create index accounts_owner_idx on accounts(account_owner);
create index contacts_account_id_idx on contacts(account_id);
create unique index contacts_email_unique_idx on contacts (lower(email)) where email is not null;
create index contacts_phone_idx on contacts(phone) where phone is not null;
create index channel_identities_contact_id_idx on channel_identities(contact_id);
create unique index channel_identities_external_unique_idx
  on channel_identities(channel, external_id) where external_id is not null;
create index engagement_events_contact_id_idx on engagement_events(contact_id);
create index engagement_events_account_id_idx on engagement_events(account_id);
create index engagement_events_campaign_id_idx on engagement_events(campaign_id);
create index engagement_events_occurred_at_idx on engagement_events(occurred_at desc);
create index campaign_members_campaign_id_idx on campaign_members(campaign_id);
create unique index campaign_members_contact_unique_idx
  on campaign_members(campaign_id, contact_id) where contact_id is not null;
create index automation_runs_playbook_id_idx on automation_runs(playbook_id);
create index deals_account_id_idx on deals(account_id);
create index deals_contact_id_idx on deals(contact_id);
create index deals_owner_idx on deals(owner);
create index deals_expected_close_date_idx on deals(expected_close_date);
create index deals_source_campaign_id_idx on deals(source_campaign_id);
create index projects_account_id_idx on projects(account_id);
create index projects_deal_id_idx on projects(deal_id);
create index customer_success_profiles_account_id_idx on customer_success_profiles(account_id);
create index success_touchpoints_account_id_idx on success_touchpoints(account_id);
create index leads_contact_id_idx on leads(contact_id);
create index leads_account_id_idx on leads(account_id);
create index leads_source_campaign_id_idx on leads(source_campaign_id);
create index clients_account_id_idx on clients(account_id);
create index quotes_account_id_idx on quotes(account_id);
create index quotes_deal_id_idx on quotes(deal_id);
create index tasks_account_id_idx on tasks(account_id);
create index tasks_deal_id_idx on tasks(deal_id);
create index tasks_project_id_idx on tasks(project_id);

alter table accounts enable row level security;
alter table contacts enable row level security;
alter table channel_identities enable row level security;
alter table engagement_events enable row level security;
alter table campaigns enable row level security;
alter table campaign_members enable row level security;
alter table automation_playbooks enable row level security;
alter table automation_runs enable row level security;
alter table deals enable row level security;
alter table projects enable row level security;
alter table customer_success_profiles enable row level security;
alter table success_touchpoints enable row level security;

create policy "accounts_select" on accounts for select to authenticated using (true);
create policy "accounts_insert" on accounts for insert to authenticated with check (true);
create policy "accounts_update" on accounts for update to authenticated using (true) with check (true);

create policy "contacts_select" on contacts for select to authenticated using (true);
create policy "contacts_insert" on contacts for insert to authenticated with check (true);
create policy "contacts_update" on contacts for update to authenticated using (true) with check (true);

create policy "channel_identities_select" on channel_identities for select to authenticated using (true);
create policy "channel_identities_insert" on channel_identities for insert to authenticated with check (true);
create policy "channel_identities_update" on channel_identities for update to authenticated using (true) with check (true);

create policy "engagement_events_select" on engagement_events for select to authenticated using (true);
create policy "engagement_events_insert" on engagement_events for insert to authenticated with check (true);
create policy "engagement_events_update" on engagement_events for update to authenticated using (true) with check (true);

create policy "campaigns_select" on campaigns for select to authenticated using (true);
create policy "campaigns_insert" on campaigns for insert to authenticated with check (true);
create policy "campaigns_update" on campaigns for update to authenticated using (true) with check (true);

create policy "campaign_members_select" on campaign_members for select to authenticated using (true);
create policy "campaign_members_insert" on campaign_members for insert to authenticated with check (true);
create policy "campaign_members_update" on campaign_members for update to authenticated using (true) with check (true);

create policy "automation_playbooks_select" on automation_playbooks for select to authenticated using (true);
create policy "automation_playbooks_insert" on automation_playbooks for insert to authenticated with check (true);
create policy "automation_playbooks_update" on automation_playbooks for update to authenticated using (true) with check (true);

create policy "automation_runs_select" on automation_runs for select to authenticated using (true);
create policy "automation_runs_insert" on automation_runs for insert to authenticated with check (true);
create policy "automation_runs_update" on automation_runs for update to authenticated using (true) with check (true);

create policy "deals_select" on deals for select to authenticated using (true);
create policy "deals_insert" on deals for insert to authenticated with check (true);
create policy "deals_update" on deals for update to authenticated using (true) with check (true);

create policy "projects_select" on projects for select to authenticated using (true);
create policy "projects_insert" on projects for insert to authenticated with check (true);
create policy "projects_update" on projects for update to authenticated using (true) with check (true);

create policy "customer_success_profiles_select" on customer_success_profiles for select to authenticated using (true);
create policy "customer_success_profiles_insert" on customer_success_profiles for insert to authenticated with check (true);
create policy "customer_success_profiles_update" on customer_success_profiles for update to authenticated using (true) with check (true);

create policy "success_touchpoints_select" on success_touchpoints for select to authenticated using (true);
create policy "success_touchpoints_insert" on success_touchpoints for insert to authenticated with check (true);
create policy "success_touchpoints_update" on success_touchpoints for update to authenticated using (true) with check (true);

grant select, insert, update, delete on table
  accounts,
  contacts,
  channel_identities,
  engagement_events,
  campaigns,
  campaign_members,
  automation_playbooks,
  automation_runs,
  deals,
  projects,
  customer_success_profiles,
  success_touchpoints
to authenticated;

grant select, insert, update, delete on table
  accounts,
  contacts,
  channel_identities,
  engagement_events,
  campaigns,
  campaign_members,
  automation_playbooks,
  automation_runs,
  deals,
  projects,
  customer_success_profiles,
  success_touchpoints
to service_role;

-- Enable these in Supabase Realtime once the migration is applied:
-- alter publication supabase_realtime add table engagement_events;
-- alter publication supabase_realtime add table deals;
-- alter publication supabase_realtime add table campaign_members;
-- alter publication supabase_realtime add table customer_success_profiles;

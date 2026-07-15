alter table profiles drop constraint if exists profiles_role_check;
update profiles set role = 'client_success' where role = 'cs';
alter table profiles
  add constraint profiles_role_check check (
    role in ('super_admin','admin','manager','sales','client_success','accounting','read_only')
  );

alter table profiles add column if not exists status text not null default 'active';
alter table profiles add column if not exists job_title text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists locale text not null default 'en-HK';
alter table profiles add column if not exists timezone text not null default 'Asia/Hong_Kong';
alter table profiles add column if not exists last_active_at timestamptz;
alter table profiles add column if not exists session_invalid_before timestamptz;
alter table profiles add column if not exists suspended_at timestamptz;
alter table profiles add column if not exists suspended_by text references profiles(id) on delete set null;
alter table profiles add column if not exists suspension_reason text;
alter table profiles add column if not exists deactivated_at timestamptz;
alter table profiles add column if not exists deactivated_by text references profiles(id) on delete set null;
alter table profiles add column if not exists deactivation_reason text;
alter table profiles add column if not exists availability_status text not null default 'available';
alter table profiles add column if not exists leave_starts_at timestamptz;
alter table profiles add column if not exists leave_ends_at timestamptz;
alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in ('invited','active','suspended','deactivated'));
alter table profiles drop constraint if exists profiles_availability_status_check;
alter table profiles add constraint profiles_availability_status_check
  check (availability_status in ('available','limited','away'));

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  head_profile_id text references profiles(id) on delete set null,
  deputy_profile_id text references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_by text references profiles(id) on delete set null,
  updated_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists departments_active_name_uidx
  on departments(lower(name)) where status = 'active';

alter table profiles add column if not exists primary_department_id uuid references departments(id) on delete set null;
alter table profiles add column if not exists manager_profile_id text references profiles(id) on delete set null;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text,
  lead_profile_id text references profiles(id) on delete set null,
  deputy_profile_id text references profiles(id) on delete set null,
  default_owner_profile_id text references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_by text references profiles(id) on delete set null,
  updated_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_active_name_uidx
  on teams(lower(name)) where status = 'active';

create table if not exists team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  profile_id text not null references profiles(id) on delete restrict,
  membership_role text not null default 'member'
    check (membership_role in ('lead','deputy','member')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create unique index if not exists team_memberships_active_uidx
  on team_memberships(team_id, profile_id) where ends_at is null;

create table if not exists user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  intended_role text not null check (
    intended_role in ('super_admin','admin','manager','sales','client_success','accounting','read_only')
  ),
  primary_department_id uuid references departments(id) on delete set null,
  manager_profile_id text references profiles(id) on delete set null,
  initial_team_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  invited_by text not null references profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_profile_id text references profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists user_invitations_pending_email_uidx
  on user_invitations(lower(email)) where status = 'pending';

create table if not exists permission_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete restrict,
  capability text not null,
  effect text not null check (effect in ('allow','deny')),
  department_id uuid references departments(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  resource_type text,
  resource_id text,
  reason text not null check (length(trim(reason)) >= 8),
  granted_by text not null references profiles(id) on delete restrict,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id text not null references profiles(id) on delete restrict,
  request_type text not null check (request_type in ('capability','team')),
  capability text,
  team_id uuid references teams(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 8),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by text references profiles(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((request_type = 'capability' and capability is not null and team_id is null)
      or (request_type = 'team' and team_id is not null and capability is null))
);

create table if not exists work_delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_profile_id text not null references profiles(id) on delete restrict,
  delegate_profile_id text not null references profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  status text not null default 'active' check (status in ('active','cancelled','expired')),
  created_at timestamptz not null default now(),
  check (delegator_profile_id <> delegate_profile_id),
  check (ends_at > starts_at)
);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id text references profiles(id) on delete set null,
  target_type text not null,
  target_id text,
  action text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  reason text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  request_id text,
  session_id text,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists profiles_department_idx on profiles(primary_department_id);
create index if not exists profiles_manager_idx on profiles(manager_profile_id);
create index if not exists profiles_status_role_idx on profiles(status, role);
create index if not exists team_memberships_profile_idx on team_memberships(profile_id);
create index if not exists permission_overrides_profile_idx on permission_overrides(profile_id, capability);
create index if not exists access_requests_status_idx on access_requests(status, created_at desc);
create index if not exists admin_audit_target_idx on admin_audit_logs(target_type, target_id, created_at desc);
create index if not exists admin_audit_actor_idx on admin_audit_logs(actor_profile_id, created_at desc);

create or replace function prevent_admin_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_logs are append-only';
end;
$$;
drop trigger if exists admin_audit_logs_immutable on admin_audit_logs;
create trigger admin_audit_logs_immutable
before update or delete on admin_audit_logs
for each row execute function prevent_admin_audit_mutation();
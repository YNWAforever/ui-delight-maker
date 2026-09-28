alter table clients add column if not exists row_version integer not null default 0;
alter table accounts add column if not exists row_version integer not null default 0;
drop trigger if exists clients_import_row_version on clients;
create trigger clients_import_row_version before update on clients
  for each row execute function bump_bulk_row_version();
drop trigger if exists accounts_import_row_version on accounts;
create trigger accounts_import_row_version before update on accounts
  for each row execute function bump_bulk_row_version();

create table if not exists import_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id text not null references profiles(id),
  kind text not null check (kind in ('lead','client','event')),
  source_namespace text,
  campaign_id uuid,
  preview_hash text not null,
  idempotency_key text,
  state text not null default 'preview' check (state in ('preview','paused','running','completed','expired')),
  total integer not null check (total between 0 and 5000),
  preview_expires_at timestamptz not null,
  retain_until timestamptz not null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  completed_at timestamptz
);
create index if not exists import_sessions_actor_created_idx on import_sessions(actor_profile_id,created_at desc);
create index if not exists import_sessions_retention_idx on import_sessions(retain_until) where state <> 'expired';

create table if not exists import_session_rows (
  session_id uuid not null references import_sessions(id) on delete cascade,
  position integer not null check (position >= 0 and position < 5000),
  record_index integer not null check (record_index > 0),
  source_line integer not null check (source_line > 0),
  values_json jsonb not null,
  expected_version integer,
  action text not null,
  target_id uuid,
  status text check (status in ('succeeded','failed','forbidden','stale','invalid','skipped','ambiguous')),
  errors_json jsonb not null default '[]'::jsonb,
  result_id uuid,
  retryable boolean not null default false,
  lease_owner uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  processed_at timestamptz,
  primary key(session_id,position)
);
create index if not exists import_session_rows_work_idx on import_session_rows(session_id,position)
  where status is null or (status='failed' and retryable);

-- Only explicit, source-scoped external IDs may enter this table. Company names
-- and email addresses are candidate hints, never unique identity keys.
create table if not exists import_identity_keys (
  source_namespace text not null,
  resource_type text not null check (resource_type in ('lead','client','account','account_contact','campaign_member')),
  external_key text not null,
  resource_id uuid not null,
  created_by_session uuid references import_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(source_namespace,resource_type,external_key)
);
create index if not exists import_identity_keys_resource_idx
  on import_identity_keys(resource_type,resource_id);

create table if not exists bulk_operations (
  id uuid primary key default gen_random_uuid(),
  preview_token uuid not null unique default gen_random_uuid(),
  actor_profile_id text not null references profiles(id),
  action jsonb not null,
  payload_hash text not null,
  state text not null default 'preview' check (state in ('preview','paused','running','completed')),
  commit_key uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);
create unique index if not exists bulk_operations_actor_commit_key
  on bulk_operations(actor_profile_id,commit_key) where commit_key is not null;
create index if not exists bulk_operations_actor_recent
  on bulk_operations(actor_profile_id,created_at desc);

create table if not exists bulk_operation_items (
  operation_id uuid not null references bulk_operations(id) on delete cascade,
  position integer not null check (position >= 0 and position < 100),
  resource_id text not null,
  expected_version integer,
  summary text,
  status text check (status in ('succeeded','failed','forbidden','stale','not_found')),
  code text,
  message text,
  retryable boolean not null default false,
  resulting_version integer,
  attempt_count integer not null default 0,
  lease_owner uuid,
  lease_until timestamptz,
  processed_at timestamptz,
  primary key (operation_id,position),
  unique (operation_id,resource_id)
);
create index if not exists bulk_operation_items_claim
  on bulk_operation_items(operation_id,status,retryable,lease_until,position);

-- Additive durable job state. No historical commercial data or existing receipt changes.
create table if not exists retention_sweeps (
  id uuid primary key,
  today date not null,
  cursor uuid,
  upper_id uuid,
  complete boolean not null default false,
  lease_owner uuid,
  lease_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists retention_sweep_items (
  sweep_id uuid not null references retention_sweeps(id),
  engagement_id uuid not null,
  action text not null check(action in ('engagement','dispatch')),
  state text not null check(state in ('intent','acknowledged','failed','ambiguous','skipped')),
  run_id uuid references agent_runs(id) on delete set null,
  renewal_notified integer not null default 0 check(renewal_notified>=0),
  stale_notified integer not null default 0 check(stale_notified>=0),
  reason_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(sweep_id,engagement_id,action)
);
create index if not exists retention_sweep_pending_intents on retention_sweep_items(sweep_id,state) where state='intent';

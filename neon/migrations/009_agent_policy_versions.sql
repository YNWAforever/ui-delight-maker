-- Policy overrides for the code-defined agent catalogue.
--
-- Append-only: this table is the store, the version history and the audit log at once.
-- The current policy for a workflow is its newest row; a workflow with no row uses the code
-- default from AGENT_DEFINITIONS, so a fresh deploy behaves exactly as it did before this
-- table existed and there is nothing to seed.
--
-- `workflow_type` is deliberately not foreign-keyed: the catalogue lives in code, not in a
-- table. A row naming a workflow that no longer exists is ignored on read.
create table if not exists agent_policy_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_type text not null,
  status text not null check (status in ('active', 'inactive')),
  human_approval boolean not null,
  changed_by text not null references profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists agent_policy_versions_current_idx
  on agent_policy_versions (workflow_type, created_at desc);

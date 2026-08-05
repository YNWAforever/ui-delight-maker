-- Indexes for read paths that had none.
--
-- These are additive and idempotent: no table is rewritten and no column changes type, so a
-- re-run on a database that already has them is a no-op. `bun run build` applies every file in
-- CLIENTOPS_MIGRATION_PATHS on every deploy, so that property is load-bearing.

-- The account timeline reads activity_logs with
--   where object_id = $1 or (diff_data->>'account_id') = $1::text
-- The only index on the table was activity_logs(object_type, object_id, created_at desc), and an
-- OR across an indexed column and an unindexed JSONB expression cannot use it — Postgres falls
-- back to a sequential scan of an append-only log that only ever grows. The second branch needs
-- an expression index of its own before a BitmapOr can serve the query.
create index if not exists activity_logs_object_id_created_at_idx
  on activity_logs (object_id, created_at desc);

create index if not exists activity_logs_diff_account_id_idx
  on activity_logs ((diff_data ->> 'account_id'), created_at desc);

-- Same shape one query down: human_approvals is filtered by a JSONB field with no index.
create index if not exists human_approvals_context_account_id_idx
  on human_approvals ((context_data ->> 'account_id'), created_at desc);

-- Notification fan-out resolves approvers by role and status on every approval created.
create index if not exists profiles_role_status_idx
  on profiles (role, status);

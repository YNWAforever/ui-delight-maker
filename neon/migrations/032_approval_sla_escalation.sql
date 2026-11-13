-- Approval SLA escalation marker and notification type (roadmap B1).
--
-- The schedule writer only marks overdue *pending* approvals and notifies the approver roster.
-- It deliberately never changes `status`: `escalated` is the human "request changes" decision
-- result, and rewriting it here would overload that semantic and strand quote_send/agent_action
-- decisions. `sla_escalated_at` is the write-once idempotency marker, so a rerun is a no-op even
-- without a queue table.
--
-- Additive only: an existing pending approval keeps its status and row_version meaning; the
-- transition trigger from migration 010 bumps row_version on this update like any other
-- non-terminal update.
alter table human_approvals add column if not exists sla_escalated_at timestamptz;

-- The notifications type check is an inline column check from 002_retention_client_360.sql, so
-- its auto-generated name is deterministic (`notifications_type_check`). Drop and re-add with
-- the same name and every existing value plus the escalation type, mirroring the constrained-name
-- pattern used by migration 030.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'renewal_window',
    'risk_change',
    'stale_touchpoint',
    'approval_pending',
    'approval_escalated'
  ));

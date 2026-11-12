-- Governed agent actions (docs/ai/mcp-write-proposals.md).
--
-- An agent never writes directly: a write-scoped MCP token can only create a pending
-- human_approvals row of type 'agent_action', and a person with approvals.decide approves or
-- rejects it. Execution evidence lands in activity_logs and the target command's own state
-- because the trigger added in migration 010 makes terminal approval rows immutable.
--
-- Additive only. The approval_type check below keeps the existing values and adds one; the
-- column check has a stable name because the auto-generated one from 001 is deterministic
-- (`human_approvals_approval_type_check`), so the contract can assert it.
alter table human_approvals drop constraint if exists human_approvals_approval_type_check;
alter table human_approvals add constraint human_approvals_approval_type_check
  check (approval_type in (
    'quote_send',
    'message_send',
    'discount',
    'qualification_review',
    'campaign_send',
    'forecast_review',
    'cs_risk_review',
    'agent_action'
  ));

-- The trustworthy proposer identity, server-recorded from the token owner. `requested_by` keeps
-- its existing meaning for every other type and carries the same profile id here for display
-- continuity. The reference is nullable/set null so a deleted profile never deletes the audit
-- trail of what it proposed.
alter table human_approvals
  add column if not exists requested_by_profile_id text references profiles(id) on delete set null;

-- One open proposal per agent intent: the key is derived from the token id and the caller's
-- idempotency key. Decided rows fall outside the index, so the same intent can be proposed again
-- after a decision; an undecided duplicate collapses to the existing row instead of a second
-- reviewer task.
create unique index if not exists human_approvals_agent_action_open_key_uidx
  on human_approvals ((context_data->>'proposal_key'))
  where approval_type = 'agent_action'
    and status in ('pending', 'escalated');

-- The approvals queue filters by type and status and sorts newest first.
create index if not exists human_approvals_agent_action_queue_idx
  on human_approvals (approval_type, status, created_at desc)
  where approval_type = 'agent_action';

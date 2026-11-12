# Governed agent actions (MCP write proposals)

Status: Tranche B first slice, implemented on `feat/mcp-write-proposals` (PR pending).
Audience: engineering, security review, operations.

## Why

The MCP connector v1 is read-only. Agents should be able to *propose* an action a human already
has the authority to take, but never write directly. Every proposal is a normal human approval:
it lands in `/approvals`, a person with `approvals.decide` decides it, and only an approval
*executes* the action — inside the same database transaction as the decision.

This is deliberately not a generic "agent can call any write" switch. v1 exposes exactly one
action, mapped to an existing command:

| Proposal action | Existing command | Effect |
| --- | --- | --- |
| `record_manual_message_sent` | `recordManualMessageSentCommand` (`src/server/commands/message-handoff.server.ts`) | Records the send reference on an approved `message_send` handoff and completes the waiting agent run. No message is sent and no delivery is claimed by the platform. |

`tidy_touchpoint_note` was evaluated and rejected as a first action: the product's note tidy is
an AI text transform (`src/server-functions/ai-note-tidy.ts`) with no supervised target and no
note-update write path; presenting it as a governed write would be misleading. Candidate next
actions are listed at the end.

## Flow

```
MCP agent (write-scoped token)
  │ tools/call propose_manual_message_sent {approval_id, reference, idempotency_key}
  ▼
proposeAgentActionCommand  (receipt: agent.proposal)
  │ validates: token write scope, approvals.view on the target approval,
  │           target is approved message_send, handoff awaiting, reference bounds
  │ dedupe: receipt replay or open proposal_key
  ▼
human_approvals row: approval_type='agent_action', status='pending',
  requested_by_profile_id=<token owner>, context_data={action, target_approval_id, reference,
  proposal_key, proposed_by_token_id, token_name}, assigned_to=<owner's manager or null>
  ▼
/approvals → human with approvals.decide (not the proposer) decides
  ▼
decideApprovalCommand (one transaction)
  │ decideApprovalInTransaction (CAS row_version, capability, ownership, terminal transition)
  │ if approved and type='agent_action': applyAgentActionDecisionInTransaction
  │    re-check self-approval, target status/handoff, approver's capability, expected version
  │    call recordManualMessageSentCommand(approver context, db, derived idempotency key)
  │ activity_logs: decision + execution evidence
  ▼
tool result for the proposing agent is "pending approval" at creation; status visible via
list_my_proposals. A failure during execution rolls the whole decision transaction back, so the
proposal stays pending and the reviewer sees an error — an approval can never half-apply.
```

## Data model (migration 030)

Additive only:

- `human_approvals.approval_type` check gains `agent_action`.
- `human_approvals.requested_by_profile_id text references profiles(id) on delete set null` —
  the trustworthy proposer identity. `requested_by` stays for existing types; agent proposals
  also store the token owner there for display continuity.
- partial unique index `human_approvals_agent_action_open_key_uidx` on
  `(context_data->>'proposal_key')` where `approval_type='agent_action'` and
  `status in ('pending','escalated')` — one open proposal per agent intent.
- partial index for the queue: `(approval_type, status, created_at desc)` where agent_action.

No write/execution columns are added to `human_approvals`: the transition trigger makes terminal
rows immutable, so execution evidence is `activity_logs` + the target command's own receipt/state.

## Contracts

Shared (`src/lib/agent-actions.ts`):

```ts
export const AGENT_ACTION_TYPES = ["record_manual_message_sent"] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];
export type AgentActionProposalInput = {
  action: AgentActionType;
  targetApprovalId: string; // uuid of an approved message_send approval
  reference: string; // trimmed, 3..255
  idempotencyKey: string; // trimmed, 8..128, caller-stable for retries
};
export type AgentActionProposalResult = {
  status: "pending_approval";
  approvalId: string;
  targetApprovalId: string;
  requiresApproval: true;
  message: string;
};
```

MCP tools (added to the registry):

- `propose_manual_message_sent` — `requiredScope: "write"`; schema
  `{approval_id: uuid, reference: 3..255, idempotency_key: 8..128}`; returns the result above as
  text content; safe error contract unchanged (`MCP_TOOL_ERROR_MESSAGES`).
- `list_my_proposals` — `requiredScope: "read"`; `{status?: "pending"|"approved"|"rejected"|"escalated", limit?: 1..50}`;
  returns only proposals whose `requested_by_profile_id` equals the token's profile: id, action,
  target approval id, status, created/decided timestamps, reviewer notes.

Commands:

- `proposeAgentActionCommand(context, input)` — one transaction; `claimCommandReceipt` scope
  `agent.proposal` keyed `(actor profile, idempotencyKey)`; `requireCapability("approvals.view",
  {resourceType:"human_approval", resourceId: targetApprovalId})`; validates target
  (`message_send`, `approved`, handoff `awaiting_manual_send`); derives `proposal_key` from
  token id + idempotency key; inserts the approval via `createApproval` and activity log; returns
  the result; replays return the stored result.
- `applyAgentActionDecisionInTransaction(approval, decisionContext, db)` — only called for
  `approval_type='agent_action'` with decision `approved`; hard-deny
  `requested_by_profile_id === decisionContext.actor.profileId`; re-check action allowlist,
  target state and the approver's capability (`approvals.decide` + target row scope, enforced by
  the target command) then call `recordManualMessageSentCommand` with the decision transaction
  and a derived key (`agent_action:<proposal id>`); write activity log with ids/outcome only.

## Security controls

| Risk | Control |
| --- | --- |
| Silent write | Agents only create `pending` approvals; the tool result says `pending_approval`; no command path writes the target directly |
| Privilege escalation | Proposal creation requires `approvals.view` on the target; execution re-checks with the **approver's** context inside `decideApprovalCommand` (the same path humans use) |
| Self-approval | `requested_by_profile_id` is server-recorded; decision blocked when approver is the proposer (also hide the action in the UI); no override in v1 |
| Double apply | decision receipt (`approval.decision`) + target command receipt (`message.manual_send`) + CAS on handoff; execution in the decision transaction |
| Stale/false target | Both proposal creation and execution require the target to be `approved` with handoff `awaiting_manual_send`; any state change since proposal makes execution fail closed (reviewer sees the error, proposal stays pending) |
| Prompt-injected reference text | bounded string (3..255), rendered as data; never used to build SQL or HTML; stored in `context_data` only |
| PII | `context_data` contains the action, ids, token name and the human-visible reference only — no drafts, notes, contacts |
| Token scope | write tools require the token's `write` scope; tokens default read-only; UI offers "read-only" vs "read + propose writes"; protocol instructions updated |
| Stranded proposal | assigned to the proposer's manager when known; admins see all; managers can claim through the standard queue |
| Recovery/escalation | recovery only touches approvals with `agent_run_id` (proposals have none); executor runs only on `approved`, so rejected/escalated proposals never execute |

## UI

- `/approvals` gains the `agent_action` type/filter/label and a plain-language "Proposed action"
  description. Detail renders the proposal's ids/reference/proposer; the action button text stays
  "Approve"/"Reject" (approving executes the recorded action).
- Account → Agent connector: token creation gains scope choice; the one-time reveal and list show
  "Read-only" vs "Read + propose writes" and explain that writes are proposals requiring approval.

## Operations

- Apply migration 030 out-of-band before deploying (same gate as 029).
- Runbook queries: open proposals per token, proposals pending > SLA, execution failures
  (decision rolled back — reviewer retries after fixing the target), audit via `activity_logs`.
- Rollback: revoke write-scoped tokens (SQL in `mcp-connector.md`); proposals stop at creation
  because the MCP tool requires the write scope.

## Tests

- Unit: proposal validation/allowlist, self-approval denial, read-scope vs write-scope tool
  gating, `list_my_proposals` profile filtering, token scope issuance.
- DB-gated integration: propose → approval pending → non-proposer approves → execution recorded
  on target + activity log; replay returns same approval; proposer cannot approve own proposal;
  rejected proposal never executes; target changed after proposal → execution fails, decision
  rolled back; escalation/recovery does not execute.
- UI: approvals filter/detail/decision rendering for `agent_action`; token scope selector and
  reveal copy.
- Contract: migration 030 registered (migration paths, tables/columns/constraints/indexes) and
  schema contract tests updated.

## Known limitations (v1.5)

- **One action only.** `record_manual_message_sent` is the entire allowlist; a new action must map
  to an existing supervised command and be added to `AGENT_ACTION_TYPES` plus the executor
  allowlist. The proposal row is not a generic script runner and `context_data` is never executed.
- **Manager row scope.** A manager can propose or decide only where the normal
  `approvals.view`/`approvals.decide` row scope allows it; an unassigned target message draft may
  require an admin. There is deliberately no override in v1.
- **Assignment.** Proposals are assigned to the proposer's active manager when one exists,
  otherwise left unassigned (admins see them; managers rely on the standard claim flow). There is
  no proposal-specific escalation or SLA writer yet (roadmap B1).
- **Execution retries are manual.** A failed execution rolls the decision back, leaving the
  proposal pending; the reviewer retries after fixing the target. No retry queue or partial
  execution state exists.
- **Notifications.** The existing approver roster is notified, which can include the proposer;
  self-decision is blocked server-side and the UI hides the affordances.
- **Client polling.** `list_my_proposals` reports status; there is no webhook/streaming
  notification for the agent. `superseded` proposals are omitted from the tool by design.
- **Trace prerequisite.** MCP calls are audited in `mcp_tool_calls`; the roadmap's unified
  `agent_tool_calls` writer (B1) is still open, so n8n/agent runs are not yet joined to tool calls.

## Next actions (after this slice)

1. `propose_touchpoint_note` — insert a new touchpoint from a proposed/tidied note through the
   existing `createTouchpoint` repository (approver's `engagements.create`; insert-only).
2. `propose_agent_dispatch` — `agents.run` + policy/webhook re-check at execution.
3. `propose_approval_decision` — only with an explicit requester≠decider rule and a second
   approver class; never expose the existing decide command directly.

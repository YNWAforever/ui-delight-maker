import type { ApprovalType } from "@/lib/types";

/**
 * What an approval request is, and what deciding it actually does.
 *
 * Both maps are keyed on `ApprovalType`, which is the eight values
 * `human_approvals.approval_type` is constrained to after
 * `neon/migrations/030_governed_agent_actions.sql` (the original seven live in
 * `neon/migrations/001_clientops_runtime.sql`). A new approval type is therefore a compile
 * error here rather than an unlabelled row with an invented description.
 *
 * Both review surfaces use these shared labels and truthful effect descriptions.
 */
export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  quote_send: "Quote send",
  message_send: "Message send",
  discount: "Discount",
  qualification_review: "Qualification review",
  campaign_send: "Campaign send",
  forecast_review: "Forecast review",
  cs_risk_review: "Risk review",
  agent_action: "Agent action",
};

export function approvalTypeLabel(type: string | null | undefined): string {
  if (!type) return "Approval";
  const labels: Record<string, string | undefined> = APPROVAL_TYPE_LABELS;
  return labels[type] ?? type.replace(/_/g, " ");
}

/**
 * The sentence under "Proposed action" — what the product will do on approval, traced to the
 * code that does it. This is the one piece of copy on the review screen a reader is entitled
 * to trust literally, so each line was written against the write path rather than the label.
 *
 * - Quote-send approval closes the request and approves the quote; issuance is a separate
 *   privileged action.
 * - `cs_risk_review` → `applyRiskReviewDecisionInTransaction`
 *   (src/server/workflows/decide-risk-review.server.ts): writes the held health score, risk
 *   and next action onto the engagement.
 * - `message_send` → approval decision creates a manual handoff. The approved draft is
 *   readable in the Approvals workbench for copying and an operator may record a send
 *   reference. Neither action is a platform delivery receipt or an automatic send.
 * - `agent_action` → `applyAgentActionDecisionInTransaction`
 *   (src/server/commands/agent-action-execution.server.ts): records the proposed manual send
 *   reference on the target approved `message_send` draft through the same command a person
 *   uses. No message is sent and no delivery is claimed.
 * - The remaining types have no writeback that creates them today and no handler that acts on
 *   them, so they say exactly that.
 */
export const APPROVAL_PROPOSED_ACTION: Record<ApprovalType, string> = {
  quote_send:
    "Approving marks the quote approved and closes this request. Issuing an immutable version is a separate authorized action.",
  message_send:
    "Approving clears the draft and creates a manual handoff in Approvals. A person must send it and record a reference; ClientOps does not send or confirm delivery.",
  discount:
    "Approving records the decision and releases the agent run. No pricing change is applied automatically.",
  qualification_review:
    "Approving records that the agent's qualification is accepted and releases the agent run. The lead score was already written when the run completed.",
  campaign_send:
    "Approving records the decision and releases the agent run. No campaign is dispatched by ClientOps.",
  forecast_review:
    "Approving records the decision and releases the agent run. No forecast is rewritten automatically.",
  cs_risk_review:
    "Approving writes the health score, renewal risk and suggested next action onto the engagement, then closes this request.",
  agent_action:
    "Approving records the proposed manual send reference on the target approved draft and completes the handoff, then closes this proposal. ClientOps does not send the message and does not confirm delivery.",
};

export function approvalProposedAction(type: string | null | undefined): string {
  if (!type)
    return "Deciding records the outcome and releases the agent run that is waiting on it.";
  const actions: Record<string, string | undefined> = APPROVAL_PROPOSED_ACTION;
  return actions[type] ?? "Deciding records the outcome and releases the agent run waiting on it.";
}

/**
 * Rejecting is uniform apart from quote sends, which also mark the quote itself rejected
 * through `rejectQuote`.
 */
export function approvalRejectionEffect(type: string | null | undefined): string {
  if (type === "quote_send") {
    return "Rejecting marks the quote rejected and closes this request. Reopening it means revising the quote and requesting approval again.";
  }
  if (type === "agent_action") {
    return "Rejecting closes this proposal without executing it. The target draft still waits for a person to record the manual send.";
  }
  return "Rejecting closes this request and releases the agent run. There is no undo.";
}

import type { ApprovalType } from "@/lib/types";

/**
 * What an approval request is, and what deciding it actually does.
 *
 * Both maps are keyed on `ApprovalType`, which is the seven values
 * `human_approvals.approval_type` is constrained to in
 * `neon/migrations/001_clientops_runtime.sql`. A new approval type is therefore a compile
 * error here rather than an unlabelled row with an invented description.
 *
 * `/approvals` carries an identical label map inline; it predates this module and is left
 * alone in this change. When that file is next touched it should import from here so the two
 * screens cannot drift into two words for one state.
 */
export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  quote_send: "Quote send",
  message_send: "Message send",
  discount: "Discount",
  qualification_review: "Qualification review",
  campaign_send: "Campaign send",
  forecast_review: "Forecast review",
  cs_risk_review: "Risk review",
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
 * - `quote_send` → `approveAndIssueQuote` (src/server-functions/quotes.ts): approves the
 *   quote, issues a version, then closes the approval.
 * - `cs_risk_review` → `applyRiskReviewDecision`
 *   (src/server/workflows/decide-risk-review.server.ts): writes the held health score, risk
 *   and next action onto the engagement.
 * - `message_send` → `decideApproval` only. **Nothing sends the message.** The draft lives in
 *   `context_data.draft_message` and has no consumer anywhere in the repository — a grep for
 *   `draft_message` returns the writeback that stored it and nothing that reads it. Saying
 *   "the reply will be sent" would be the same class of lie this revision exists to remove.
 * - The remaining four have no writeback that creates them today and no handler that acts on
 *   them, so they say exactly that.
 */
export const APPROVAL_PROPOSED_ACTION: Record<ApprovalType, string> = {
  quote_send:
    "Approving marks the quote approved, issues a quote version immediately, and closes this request. There is no un-issue action.",
  message_send:
    "Approving records that the drafted reply is cleared and releases the agent run. ClientOps does not send the message — a person still sends it from the lead.",
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
  return "Rejecting closes this request and releases the agent run. There is no undo.";
}

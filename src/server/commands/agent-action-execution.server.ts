import { AdminError } from "@/lib/admin/errors";
import type { HumanApproval } from "@/lib/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { Queryable } from "@/server/db/neon.server";
import { createActivityLog } from "@/server/repositories/activity-logs";
import {
  loadMessageSendTargetForUpdate,
  parseAgentActionProposalPayload,
} from "@/server/repositories/agent-action-proposals";
import { recordManualMessageSentCommand } from "./message-handoff.server";

/**
 * Execute an approved agent action, inside the approval decision's own transaction.
 *
 * Called by `decideApprovalCommand` after `decideApprovalInTransaction` and only for an approved
 * `agent_action`. Everything here re-validates rather than trusting the proposal: the proposer is
 * re-read from the row, the action must be on the allowlist, and the target must still be an
 * approved `message_send` handoff awaiting a manual send. Any mismatch throws, which rolls the
 * whole decision back — the proposal stays pending and the reviewer sees the error, so an
 * approval can never half-apply.
 */
export async function applyAgentActionDecisionInTransaction(
  approval: HumanApproval,
  decisionContext: RequestAuthorization,
  db: Queryable,
): Promise<void> {
  if (approval.approval_type !== "agent_action" || approval.status !== "approved") return;

  const proposerProfileId = approval.requested_by_profile_id ?? null;
  if (!proposerProfileId) {
    throw new AdminError("CONFLICT", "The proposal has no recorded proposer");
  }
  // No override in v1: the person named as proposer can never execute their own proposal.
  if (proposerProfileId === decisionContext.actor.profileId) {
    throw new AdminError("FORBIDDEN", "A proposal cannot be approved by its proposer");
  }

  const payload = parseAgentActionProposalPayload(approval.context_data);
  if (!payload || payload.proposedByProfileId !== proposerProfileId) {
    throw new AdminError("CONFLICT", "The proposal payload is unavailable");
  }
  if (payload.action !== "record_manual_message_sent") {
    throw new AdminError("CONFLICT", "The proposed action is not supported");
  }

  // Fail closed on any target drift since the proposal was created: another decision, a renewed
  // approval, or an already recorded send all make the proposal stale.
  const target = await loadMessageSendTargetForUpdate(db, payload.targetApprovalId);
  if (
    !target ||
    target.approval.approval_type !== "message_send" ||
    target.approval.status !== "approved" ||
    !target.handoff ||
    target.handoff.handoff_status !== "awaiting_manual_send"
  ) {
    throw new AdminError("CONFLICT", "The proposal target changed before the decision");
  }

  // The existing supervised command, under the *approver's* authorization and in this same
  // transaction. It owns the receipt key, capability check, handoff CAS and its own audit row.
  await recordManualMessageSentCommand(
    decisionContext,
    {
      approvalId: payload.targetApprovalId,
      reference: payload.reference,
      idempotencyKey: `agent_action:${approval.id}`,
    },
    db,
  );

  // Execution evidence, ids and outcome only — the reference already lives in the target
  // command's activity log and a terminal approval row cannot be updated to carry it.
  await createActivityLog(
    {
      actor_type: "user",
      actor_id: decisionContext.actor.profileId,
      action: "applied proposed manual message send",
      object_type: "approval",
      object_id: approval.id,
      diff_data: {
        proposal_id: approval.id,
        target_approval_id: payload.targetApprovalId,
        action: payload.action,
        outcome: "manual_send_recorded",
      },
    },
    db,
  );
}

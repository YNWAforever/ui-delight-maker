import type { AgentActionProposalSummary, AgentActionType } from "@/lib/agent-actions";
import { isAgentActionType } from "@/lib/agent-actions";
import { AdminError } from "@/lib/admin/errors";
import type { ApprovalStatus, HumanApproval } from "@/lib/types";
import type { MessageHandoff } from "@/server/commands/message-handoff.server";
import { query, type Queryable } from "@/server/db/neon.server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROPOSAL_STATUSES: readonly ApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "escalated",
  "superseded",
];

export function isApprovalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * The persisted proposal payload. `context_data` is the only store for a proposal's action and
 * ids; it is read back at decision time and re-validated there (fail closed on any drift).
 * Keys are snake_case because `context_data` is exposed to the existing approval surfaces
 * untouched.
 */
export type AgentActionProposalPayload = {
  action: AgentActionType;
  targetApprovalId: string;
  reference: string;
  proposalKey: string;
  proposedByProfileId: string;
  proposedByTokenId: string;
  tokenName: string;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Strict reader: a malformed payload is an unavailable proposal, never a guessed action. */
export function parseAgentActionProposalPayload(value: unknown): AgentActionProposalPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const action = payload.action;
  const targetApprovalId = payload.target_approval_id;
  const reference = nonEmptyString(payload.reference);
  const proposalKey = nonEmptyString(payload.proposal_key);
  const proposedByProfileId = nonEmptyString(payload.proposed_by_profile_id);
  const proposedByTokenId = nonEmptyString(payload.proposed_by_token_id);
  const tokenName = nonEmptyString(payload.token_name);
  if (
    !isAgentActionType(action) ||
    !isApprovalUuid(targetApprovalId) ||
    !reference ||
    reference.length < 3 ||
    reference.length > 255 ||
    !proposalKey ||
    !proposedByProfileId ||
    !isApprovalUuid(proposedByTokenId) ||
    !tokenName
  ) {
    return null;
  }
  return {
    action,
    targetApprovalId,
    reference,
    proposalKey,
    proposedByProfileId,
    proposedByTokenId,
    tokenName,
  };
}

export function agentActionProposalSummary(
  approval: HumanApproval,
): AgentActionProposalSummary | null {
  const payload = parseAgentActionProposalPayload(approval.context_data);
  if (!payload) return null;
  return {
    id: approval.id,
    action: payload.action,
    targetApprovalId: payload.targetApprovalId,
    status: approval.status,
    createdAt: approval.created_at,
    decidedAt: approval.decided_at,
    reviewerNotes: approval.reviewer_notes,
    summary: approval.context_summary,
  };
}

/**
 * Proposals for the token owner only: the MCP `list_my_proposals` tool is personal, so the
 * profile id is the server-derived proposer id and never a tool argument. Rows whose payload
 * no longer parses are omitted rather than returned with an invented action.
 */
export async function listAgentActionProposalsForProfile(
  profileId: string,
  input: { status?: ApprovalStatus; limit?: number } = {},
): Promise<AgentActionProposalSummary[]> {
  if (!profileId) throw new AdminError("VALIDATION_FAILED", "A proposing profile is required");
  if (input.status !== undefined && !PROPOSAL_STATUSES.includes(input.status)) {
    throw new AdminError("VALIDATION_FAILED", "Invalid proposal status");
  }
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit ?? 20)));
  const rows = await query<HumanApproval>(
    `select * from human_approvals
     where requested_by_profile_id=$1
       and approval_type='agent_action'
       and ($2::text is null or status=$2)
     order by created_at desc, id desc
     limit $3`,
    [profileId, input.status ?? null, limit],
  );
  return rows.flatMap((row) => {
    const summary = agentActionProposalSummary(row);
    return summary ? [summary] : [];
  });
}

export type MessageSendTarget = {
  approval: HumanApproval;
  handoff: MessageHandoff | null;
};

/**
 * The supervised target of a proposal, locked for the rest of the transaction.
 *
 * A proposal is only meaningful while the target is an approved `message_send` approval whose
 * handoff is still `awaiting_manual_send`; callers must check that themselves so the failure
 * message can say which condition failed. Lock order (approval, then handoff) matches the
 * manual-send command so concurrent proposal/execution paths cannot deadlock.
 */
export async function loadMessageSendTargetForUpdate(
  db: Queryable,
  targetApprovalId: string,
): Promise<MessageSendTarget | null> {
  const approval = (
    await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
      targetApprovalId,
    ])
  ).rows[0];
  if (!approval) return null;
  const handoff = (
    await db.query<MessageHandoff>(
      "select * from approval_message_handoffs where approval_id=$1 for update",
      [targetApprovalId],
    )
  ).rows[0];
  return { approval, handoff: handoff ?? null };
}

/** The open proposal for one agent intent, used to collapse duplicate concurrent inserts. */
export async function findOpenAgentActionProposalByKey(
  db: Queryable,
  proposalKey: string,
): Promise<HumanApproval | null> {
  const row = (
    await db.query<HumanApproval>(
      `select * from human_approvals
       where approval_type='agent_action'
         and status in ('pending','escalated')
         and context_data->>'proposal_key'=$1
       for update`,
      [proposalKey],
    )
  ).rows[0];
  return row ?? null;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

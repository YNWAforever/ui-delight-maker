import {
  AGENT_ACTION_PENDING_MESSAGE,
  isAgentActionType,
  type AgentActionProposalInput,
  type AgentActionProposalResult,
} from "@/lib/agent-actions";
import { AdminError } from "@/lib/admin/errors";
import type { HumanApproval } from "@/lib/types";
import { requireCapability, type RequestAuthorization } from "@/server/auth/authorization.server";
import { transaction, type Queryable } from "@/server/db/neon.server";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { createApproval } from "@/server/repositories/approvals";
import {
  findOpenAgentActionProposalByKey,
  isApprovalUuid,
  isUniqueViolation,
  loadMessageSendTargetForUpdate,
} from "@/server/repositories/agent-action-proposals";
import { claimCommandReceipt, completeCommandReceipt } from "./receipts.server";

const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

type ValidatedProposal = {
  action: AgentActionProposalInput["action"];
  targetApprovalId: string;
  reference: string;
  idempotencyKey: string;
  tokenId: string;
  tokenName: string;
};

/**
 * Input validation is deliberately here, not only at the MCP schema: the command is the
 * authorization boundary and a future BFF caller must not be able to skip it. The token id and
 * name are evidence of the credential that proposed, never an identity claim — the proposer is
 * `context.actor.profileId`, derived from the resolved token.
 */
function validateProposalInput(input: AgentActionProposalInput): ValidatedProposal {
  if (!isAgentActionType(input.action)) {
    throw new AdminError("VALIDATION_FAILED", "Unsupported agent action");
  }
  const targetApprovalId = input.targetApprovalId.trim();
  if (!isApprovalUuid(targetApprovalId)) {
    throw new AdminError("VALIDATION_FAILED", "A valid target approval is required");
  }
  const reference = input.reference.trim();
  if (reference.length < 3 || reference.length > 255) {
    throw new AdminError("VALIDATION_FAILED", "A manual send reference is required");
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
    idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    throw new AdminError("VALIDATION_FAILED", "Invalid idempotency key");
  }
  const tokenId = input.tokenId.trim();
  if (!isApprovalUuid(tokenId)) {
    throw new AdminError("VALIDATION_FAILED", "The proposing token is unavailable");
  }
  const tokenName = input.tokenName.trim();
  if (tokenName.length < 1 || tokenName.length > 80) {
    throw new AdminError("VALIDATION_FAILED", "The proposing token name is unavailable");
  }
  return {
    action: input.action,
    targetApprovalId,
    reference,
    idempotencyKey,
    tokenId,
    tokenName,
  };
}

function proposalResult(
  approval: HumanApproval,
  targetApprovalId: string,
): AgentActionProposalResult {
  return {
    status: "pending_approval",
    approvalId: approval.id,
    targetApprovalId,
    requiresApproval: true,
    message: AGENT_ACTION_PENDING_MESSAGE,
  };
}

/** The proposer's manager, when that profile exists and is active; otherwise the queue pool. */
async function assignedManagerProfileId(db: Queryable, profileId: string): Promise<string | null> {
  const row = (
    await db.query<{ manager_profile_id: string }>(
      `select p.manager_profile_id
       from profiles p
       join profiles manager
         on manager.id=p.manager_profile_id and manager.status='active'
       where p.id=$1`,
      [profileId],
    )
  ).rows[0];
  return row?.manager_profile_id ?? null;
}

type InsertOutcome = { approval: HumanApproval; replayedOpenProposal: boolean };

/**
 * Insert the proposal, collapsing a concurrent duplicate to the existing open row.
 *
 * The unique index only covers open proposals, so a 23505 here means another transaction won
 * the same `proposal_key`. The transaction is already aborted at that point, hence the
 * savepoint: roll back to it and return the winner instead of surfacing a 500 to the agent.
 */
async function insertProposalOrReturnOpen(
  db: Queryable,
  input: {
    actorProfileId: string;
    contextData: Record<string, unknown>;
    contextSummary: string;
    proposalKey: string;
  },
): Promise<InsertOutcome> {
  const assignedTo = await assignedManagerProfileId(db, input.actorProfileId);
  await db.query("savepoint agent_action_proposal_insert");
  try {
    const approval = await createApproval(
      {
        approval_type: "agent_action",
        requested_by: input.actorProfileId,
        requested_by_profile_id: input.actorProfileId,
        assigned_to: assignedTo,
        context_data: input.contextData,
        context_summary: input.contextSummary,
      },
      db,
    );
    await db.query("release savepoint agent_action_proposal_insert");
    return { approval, replayedOpenProposal: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await db.query("rollback to savepoint agent_action_proposal_insert");
    const open = await findOpenAgentActionProposalByKey(db, input.proposalKey);
    if (!open) {
      throw new AdminError("CONFLICT", "The proposal conflicted with another request; retry");
    }
    return { approval: open, replayedOpenProposal: true };
  }
}

/**
 * Create a pending human approval for one supervised agent action (docs/ai/mcp-write-proposals.md).
 *
 * One transaction: receipt, capability re-check, target validation, approval insert, audit. The
 * agent never writes the target; only a person with `approvals.decide` can, through the normal
 * decision command, which executes the action inside its own transaction.
 */
export async function proposeAgentActionCommand(
  context: RequestAuthorization,
  input: AgentActionProposalInput,
): Promise<AgentActionProposalResult> {
  const validated = validateProposalInput(input);

  return transaction(async (db) => {
    const claim = await claimCommandReceipt<AgentActionProposalResult>(db, {
      scope: "agent.proposal",
      actorId: context.actor.profileId,
      idempotencyKey: validated.idempotencyKey,
      payload: {
        action: validated.action,
        targetApprovalId: validated.targetApprovalId,
        reference: validated.reference,
        tokenId: validated.tokenId,
      },
    });
    if (claim.kind === "replay") return claim.result;

    // The proposal is allowed only where the token owner may already see the target; deciding
    // still requires approvals.decide at the target row (the executor re-reads it as a human).
    await requireCapability(
      "approvals.view",
      { resourceType: "human_approval", resourceId: validated.targetApprovalId },
      context,
    );

    const target = await loadMessageSendTargetForUpdate(db, validated.targetApprovalId);
    if (
      !target ||
      target.approval.approval_type !== "message_send" ||
      target.approval.status !== "approved" ||
      !target.handoff ||
      target.handoff.handoff_status !== "awaiting_manual_send"
    ) {
      throw new AdminError("CONFLICT", "The target message handoff is not awaiting a manual send");
    }

    const proposalKey = `${validated.tokenId}:${validated.idempotencyKey}`;
    const insertion = await insertProposalOrReturnOpen(db, {
      actorProfileId: context.actor.profileId,
      proposalKey,
      contextData: {
        action: validated.action,
        target_approval_id: validated.targetApprovalId,
        reference: validated.reference,
        proposal_key: proposalKey,
        proposed_by_profile_id: context.actor.profileId,
        proposed_by_token_id: validated.tokenId,
        token_name: validated.tokenName,
      },
      contextSummary:
        `Record the manual send reference proposed by MCP token "${validated.tokenName}" ` +
        "for an approved message draft",
    });

    if (!insertion.replayedOpenProposal) {
      await createActivityLog(
        {
          actor_type: "agent",
          actor_id: validated.tokenId,
          actor_name: validated.tokenName,
          action: "propose manual message send",
          object_type: "approval",
          object_id: insertion.approval.id,
          diff_data: {
            approval_id: insertion.approval.id,
            target_approval_id: validated.targetApprovalId,
            action: validated.action,
            reference: validated.reference,
            proposal_key: proposalKey,
          },
        },
        db,
      );
    }

    const result = proposalResult(insertion.approval, validated.targetApprovalId);
    await completeCommandReceipt(db, claim.id, result);
    return result;
  });
}

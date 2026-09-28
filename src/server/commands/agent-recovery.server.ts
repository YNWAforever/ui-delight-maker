import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { AgentRun, HumanApproval } from "@/lib/types";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { type Queryable, transaction } from "@/server/db/neon.server";
import {
  NEON_OWNED_RESOURCE_TYPES,
  neonOwnershipQuery,
  type NeonOwnedResourceType,
} from "@/server/auth/resource-ownership";
import { syncQuoteApprovalDecisionInTransaction } from "./quote-lifecycle.server";
import { claimCommandReceipt, completeCommandReceipt } from "./receipts.server";

type RecoveryAction = "expire" | "cancel" | "retry";
type ClaimInput = { id: string; expectedVersion?: number; idempotencyKey: string };
type RecoveryInput = {
  runId: string;
  action: RecoveryAction;
  reason: string;
  idempotencyKey: string;
};

async function subjectOwner(
  db: Queryable,
  subjectType: string,
  subjectId: string,
): Promise<string> {
  if (!NEON_OWNED_RESOURCE_TYPES.includes(subjectType as NeonOwnedResourceType)) {
    throw new AdminError("OUTSIDE_SCOPE", "Agent subject ownership cannot be verified");
  }
  const rows = await db.query<{ owner_profile_id: string | null }>(
    neonOwnershipQuery(subjectType as NeonOwnedResourceType),
    [[subjectId]],
  );
  const owner = rows.rows[0]?.owner_profile_id;
  if (!owner) {
    throw new AdminError("OUTSIDE_SCOPE", "Agent subject ownership cannot be verified");
  }
  return owner;
}

function requireScopedCapability(
  context: RequestAuthorization,
  capability: "approvals.decide" | "agents.run",
  resourceType: string,
  resourceId: string,
  ownerProfileId: string,
): void {
  const result = evaluateAuthorization({
    actor: context.actor,
    capability,
    target: { resourceType, resourceId, ownerProfileId },
    overrides: context.overrides,
    now: new Date(),
  });
  if (!result.allowed) {
    throw new AdminError(
      result.reason === "outside_scope" ? "OUTSIDE_SCOPE" : "FORBIDDEN",
      "Recovery action is not authorized",
    );
  }
}

async function claimSubjectOwner(db: Queryable, approval: HumanApproval): Promise<string> {
  if (approval.agent_run_id) {
    const run = (
      await db.query<AgentRun>("select * from agent_runs where id=$1 for update", [
        approval.agent_run_id,
      ])
    ).rows[0];
    if (!run || run.status !== "waiting_approval") {
      throw new AdminError("CONFLICT", "Linked agent run is not waiting for review");
    }
    return subjectOwner(db, run.subject_type, run.subject_id);
  }
  if (approval.approval_type === "quote_send") {
    const context = approval.context_data as { quote_id?: unknown } | null;
    if (typeof context?.quote_id === "string") {
      return subjectOwner(db, "quote", context.quote_id);
    }
  }
  throw new AdminError("OUTSIDE_SCOPE", "Approval subject ownership cannot be verified");
}

export async function claimApprovalCommand(
  context: RequestAuthorization,
  input: ClaimInput,
): Promise<HumanApproval> {
  return transaction(async (db) => {
    const receipt = await claimCommandReceipt<HumanApproval>(db, {
      scope: "approval.claim",
      actorId: context.actor.profileId,
      idempotencyKey: input.idempotencyKey,
      payload: { id: input.id, expectedVersion: input.expectedVersion ?? null },
    });
    if (receipt.kind === "replay") return receipt.result;
    const current = (
      await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
        input.id,
      ])
    ).rows[0];
    if (!current || !["pending", "escalated"].includes(current.status)) {
      throw new AdminError("CONFLICT", "Approval is not open");
    }
    if (current.assigned_to) {
      throw new AdminError("CONFLICT", "Approval already has a reviewer");
    }
    if (input.expectedVersion !== undefined && current.row_version !== input.expectedVersion) {
      throw new AdminError("STALE_ADMIN_STATE", "Approval changed since it was opened");
    }
    const owner = await claimSubjectOwner(db, current);
    requireScopedCapability(context, "approvals.decide", "human_approval", current.id, owner);
    const updated = (
      await db.query<HumanApproval>(
        `update human_approvals set assigned_to=$2
         where id=$1 and assigned_to is null and row_version=$3 and status in ('pending','escalated')
         returning *`,
        [current.id, context.actor.profileId, current.row_version],
      )
    ).rows[0];
    if (!updated) throw new AdminError("STALE_ADMIN_STATE", "Approval changed during claim");
    await db.query(
      `insert into activity_logs (actor_type,actor_id,action,object_type,object_id)
       values ('user',$1,'claimed approval','approval',$2)`,
      [context.actor.profileId, updated.id],
    );
    await completeCommandReceipt(db, receipt.id, updated);
    return updated;
  });
}

/** The run and its open approval are terminalized in one transaction. */
export async function recoverAgentRunCommand(
  context: RequestAuthorization,
  input: RecoveryInput,
): Promise<AgentRun> {
  return transaction(async (db) => {
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 1000) {
      throw new AdminError("VALIDATION_FAILED", "Recovery reason must be 10 to 1000 characters");
    }
    const receipt = await claimCommandReceipt<AgentRun>(db, {
      scope: "agent.recovery",
      actorId: context.actor.profileId,
      idempotencyKey: input.idempotencyKey,
      payload: { runId: input.runId, action: input.action, reason },
    });
    if (receipt.kind === "replay") return receipt.result;
    const approvals = (
      await db.query<HumanApproval>(
        `select * from human_approvals
         where agent_run_id=$1 and status in ('pending','escalated')
         order by created_at,id for update`,
        [input.runId],
      )
    ).rows;
    if (approvals.length > 1) {
      throw new AdminError("CONFLICT", "Multiple open approvals need reconciliation");
    }
    const approval = approvals[0];
    if (input.action === "retry" && approval) {
      throw new AdminError(
        "CONFLICT",
        "Close the open approval before requesting a fresh agent attempt",
      );
    }
    const run = (
      await db.query<AgentRun>("select * from agent_runs where id=$1 for update", [input.runId])
    ).rows[0];
    if (!run || (run.status !== "running" && run.status !== "waiting_approval")) {
      throw new AdminError("CONFLICT", "Agent run is no longer active");
    }
    if (approval && run.status !== "waiting_approval") {
      throw new AdminError("CONFLICT", "Approval and agent run state disagree");
    }
    const age = Date.now() - new Date(run.created_at).getTime();
    if (input.action !== "cancel" && age < AGENT_RUN_STUCK_MINUTES * 60_000) {
      throw new AdminError("CONFLICT", "Agent run has not reached the recovery threshold");
    }
    const owner = await subjectOwner(db, run.subject_type, run.subject_id);
    requireScopedCapability(context, "agents.run", run.subject_type, run.subject_id, owner);
    if (approval) {
      requireScopedCapability(
        context,
        "approvals.decide",
        "human_approval",
        approval.id,
        approval.assigned_to ?? owner,
      );
    }
    const outcomeCode =
      input.action === "expire"
        ? "expired"
        : input.action === "cancel"
          ? "cancelled"
          : "retry_requested";
    const updated = (
      await db.query<AgentRun>(
        `update agent_runs set status='failed',human_review_required=false,
           outcome_code=$2,recovery_reason=$3,recovered_by=$4,recovered_at=now(),
           output_data=coalesce(output_data,'{}'::jsonb) ||
             jsonb_build_object('recovery_outcome',$2::text,'recovery_reason',$3::text)
         where id=$1 and status in ('running','waiting_approval')
         returning *`,
        [run.id, outcomeCode, reason, context.actor.profileId],
      )
    ).rows[0];
    if (!updated) throw new AdminError("CONFLICT", "Agent run changed during recovery");
    if (approval) {
      const closed = (
        await db.query<HumanApproval>(
          `update human_approvals set status='rejected',reviewer_notes=$2,
             recovery_outcome_code=$3,recovery_reason=$2,decided_at=now()
           where id=$1 and status in ('pending','escalated') returning *`,
          [approval.id, reason, outcomeCode],
        )
      ).rows[0];
      if (!closed) throw new AdminError("CONFLICT", "Approval changed during recovery");
      if (closed.approval_type === "quote_send") {
        await syncQuoteApprovalDecisionInTransaction(db, context, closed);
      }
      await db.query(
        `insert into activity_logs (actor_type,actor_id,action,object_type,object_id)
         values ('user',$1,$2,'approval',$3)`,
        [context.actor.profileId, `${input.action} approval after agent recovery`, closed.id],
      );
    }
    await db.query(
      `insert into activity_logs (actor_type,actor_id,action,object_type,object_id,diff_data)
       values ('user',$1,$2,'agent_run',$3,$4::jsonb)`,
      [
        context.actor.profileId,
        `${input.action} agent run`,
        run.id,
        JSON.stringify({ reason, prior_status: run.status }),
      ],
    );
    await completeCommandReceipt(db, receipt.id, updated);
    return updated;
  });
}

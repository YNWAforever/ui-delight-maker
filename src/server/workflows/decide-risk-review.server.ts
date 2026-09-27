import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { HumanApproval } from "@/lib/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { Queryable } from "@/server/db/neon.server";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { applyEngagementScore } from "@/server/repositories/engagements";

type HeldRiskPayload = {
  engagement_id: string;
  health_score: number;
  renewal_risk: "high";
  risk_reasoning: string;
  suggested_next_action: string;
};

function heldRiskPayload(value: unknown): HeldRiskPayload {
  if (!value || typeof value !== "object") {
    throw new AdminError("CONFLICT", "Risk review payload is unavailable");
  }
  const held = value as Record<string, unknown>;
  if (
    typeof held.engagement_id !== "string" ||
    typeof held.health_score !== "number" ||
    !Number.isFinite(held.health_score) ||
    held.health_score < 0 ||
    held.health_score > 100 ||
    held.renewal_risk !== "high" ||
    typeof held.risk_reasoning !== "string" ||
    typeof held.suggested_next_action !== "string"
  ) {
    throw new AdminError("CONFLICT", "Risk review payload is invalid");
  }
  return held as HeldRiskPayload;
}

async function loadAuthorizedRiskTarget(
  approval: HumanApproval,
  context: RequestAuthorization,
  db: Queryable,
  expectedRunStatus: "waiting_approval" | "completed",
): Promise<HeldRiskPayload> {
  const held = heldRiskPayload(approval.context_data);
  if (!approval.agent_run_id) {
    throw new AdminError("CONFLICT", "Risk review has no linked agent run");
  }
  const run = (
    await db.query<{
      subject_type: string;
      subject_id: string;
      workflow_type: string;
      status: string;
      output_data: { approval_id?: string } | null;
    }>(
      "select subject_type,subject_id,workflow_type,status,output_data from agent_runs where id=$1 for update",
      [approval.agent_run_id],
    )
  ).rows[0];
  if (
    !run ||
    run.subject_type !== "engagement" ||
    run.subject_id !== held.engagement_id ||
    run.workflow_type !== "score_renewal_risk" ||
    run.status !== expectedRunStatus ||
    (run.output_data?.approval_id && run.output_data.approval_id !== approval.id)
  ) {
    throw new AdminError("CONFLICT", "Risk review target does not match its agent run");
  }

  const engagement = (
    await db.query<{ id: string; owner: string | null }>(
      "select id,owner from engagements where id=$1 for update",
      [held.engagement_id],
    )
  ).rows[0];
  if (!engagement) {
    throw new AdminError("CONFLICT", "Risk review engagement is unavailable");
  }
  const permission = evaluateAuthorization({
    actor: context.actor,
    capability: "engagements.update",
    target: {
      resourceType: "engagement",
      resourceId: engagement.id,
      ...(engagement.owner ? { ownerProfileId: engagement.owner } : {}),
    },
    overrides: context.overrides,
    now: context.now,
  });
  if (!permission.allowed) {
    throw new AdminError(
      permission.reason === "outside_scope" ? "OUTSIDE_SCOPE" : "FORBIDDEN",
      "Risk review engagement is not authorized",
    );
  }
  return held;
}

/** Runs after approval authorization and before any approval or run mutation. */
export async function validateRiskReviewTargetInTransaction(
  approval: HumanApproval,
  context: RequestAuthorization,
  db: Queryable,
): Promise<void> {
  if (approval.approval_type !== "cs_risk_review") return;
  await loadAuthorizedRiskTarget(approval, context, db, "waiting_approval");
}

/** Called only by the approval command's outer transaction. */
export async function applyRiskReviewDecisionInTransaction(
  approval: HumanApproval,
  context: RequestAuthorization,
  db: Queryable,
): Promise<void> {
  if (
    approval.approval_type !== "cs_risk_review" ||
    (approval.status !== "approved" && approval.status !== "rejected")
  ) {
    return;
  }
  const held = await loadAuthorizedRiskTarget(approval, context, db, "completed");
  if (approval.status === "approved") {
    await applyEngagementScore(
      held.engagement_id,
      {
        health_score: held.health_score,
        renewal_risk: held.renewal_risk,
        risk_reasoning: held.risk_reasoning,
        next_action: held.suggested_next_action,
      },
      db,
    );
    await createActivityLog(
      {
        actor_type: "user",
        actor_id: context.actor.profileId,
        action: "approved high renewal risk score",
        object_type: "engagement",
        object_id: held.engagement_id,
        diff_data: { health_score: held.health_score, renewal_risk: held.renewal_risk },
      },
      db,
    );
  }

  await db.query(
    `update agent_runs
     set output_data=coalesce(output_data,'{}'::jsonb) ||
       jsonb_build_object('review_outcome',$2::text,'reviewed_approval_id',$3::uuid)
     where id=$1 and status='completed'`,
    [approval.agent_run_id, approval.status, approval.id],
  );
}

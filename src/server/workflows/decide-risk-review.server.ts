import { transaction, type Queryable } from "@/server/db/neon.server";
import { applyEngagementScore } from "@/server/repositories/engagements";
import { createActivityLog } from "@/server/repositories/activity-logs";
import type { HumanApproval } from "@/lib/types";

type HeldRiskPayload = {
  engagement_id: string;
  health_score: number;
  renewal_risk: "low" | "medium" | "high";
  risk_reasoning: string;
  suggested_next_action: string;
};

export async function applyRiskReviewDecisionInTransaction(
  approval: HumanApproval,
  actorId: string,
  db: Queryable,
) {
  if (approval.approval_type !== "cs_risk_review" || approval.status !== "approved") {
    return;
  }

  const held = approval.context_data as HeldRiskPayload;
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
      actor_id: actorId,
      action: "approved high renewal risk score",
      object_type: "engagement",
      object_id: held.engagement_id,
      diff_data: { health_score: held.health_score, renewal_risk: held.renewal_risk },
    },
    db,
  );
}

export async function applyRiskReviewDecision(approval: HumanApproval, actorId: string) {
  return transaction((db) => applyRiskReviewDecisionInTransaction(approval, actorId, db));
}

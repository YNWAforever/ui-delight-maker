import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  decideApproval as decideApprovalInNeon,
  listApprovals,
} from "@/server/repositories/approvals";
import { serializeHumanApproval } from "@/server-functions/serializers";
import { applyRiskReviewDecision } from "@/server/workflows/decide-risk-review.server";

export const getApprovals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { status?: string })
  .handler(async ({ data }) => {
    await requireCapability("approvals.view");
    await requireNeonAuthSession();
    const approvals = await listApprovals(data);
    return approvals.map(serializeHumanApproval);
  });

export const decideApproval = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { id: string; decision: "approved" | "rejected" | "escalated"; notes?: string },
  )
  .handler(async ({ data }) => {
    await requireCapability("approvals.decide", {
      resourceType: "human_approval",
      resourceId: data.id,
    });
    const session = await requireNeonAuthSession();
    const approval = await decideApprovalInNeon({ ...data, actorId: session.user.id });

    await applyRiskReviewDecision(approval, session.user.id);

    return serializeHumanApproval(approval);
  });

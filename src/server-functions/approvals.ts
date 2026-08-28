import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  assignApproval,
  decideApproval as decideApprovalInNeon,
  listApprovals,
} from "@/server/repositories/approvals";
import { serializeHumanApproval } from "@/lib/serializable";
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
    const approval = await decideApprovalInNeon({ ...data, actorId: session.profile.id });

    await applyRiskReviewDecision(approval, session.profile.id);

    return serializeHumanApproval(approval);
  });

export const assignApprovalFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; assignedTo: string | null })
  .handler(async ({ data }) => {
    // `approvals.decide`, not a new `approvals.assign`. Routing an approval is strictly weaker
    // than deciding it, and every role holding `decide` is already trusted with the outcome.
    // Adding a capability would be an authorization change needing sign-off, to express a
    // permission already implied.
    await requireCapability("approvals.decide", {
      resourceType: "human_approval",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    const approval = await assignApproval(data);
    return serializeHumanApproval(approval);
  });

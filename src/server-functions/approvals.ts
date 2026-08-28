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
import { listApproverProfiles } from "@/server/repositories/notifications";

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

/**
 * Who an approval can be routed to.
 *
 * Sourced from the approver roster in the notifications repository — the roles holding
 * `approvals.decide`, derived from `ROLE_GRANTS` — so the picker cannot offer someone who
 * would be unable to act on what they were given. It is gated on `approvals.decide` for the
 * same reason the write is, and exposes strictly less than `getAdminUsersFn` already exposes
 * to the same roles: every role holding `approvals.decide` also holds `users.view`.
 */
export const getAssignableApproversFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("approvals.decide");
  await requireNeonAuthSession();
  return listApproverProfiles();
});

import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  decideApproval as decideApprovalInNeon,
  listApprovals,
} from "@/server/repositories/approvals";
import { serializeHumanApproval } from "@/server-functions/serializers";

export const getApprovals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { status?: string })
  .handler(async ({ data }) => {
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
    const session = await requireNeonAuthSession();
    return serializeHumanApproval(
      await decideApprovalInNeon({ ...data, actorId: session.user.id }),
    );
  });

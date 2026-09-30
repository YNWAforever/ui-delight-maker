import { randomUUID } from "node:crypto";
import {
  withApprovalActionFlags,
  approvalDecisionPermission,
} from "@/server/read-models/approval-actions.server";
import { parseOperationInput } from "@/lib/operations/errors";
import { loadRequestAuthorization, requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  assignApproval,
  listApprovalQueuePage,
  getLatestDecidedApprovalAt,
} from "@/server/repositories/approvals";
import { serializeHumanApproval } from "@/lib/serializable";
import { decideApprovalCommand } from "@/server/commands/approval-decision.server";
import { claimApprovalCommand, canClaimApproval } from "@/server/commands/agent-recovery.server";
import {
  recordManualMessageSentCommand,
  type MessageHandoff,
} from "@/server/commands/message-handoff.server";
import { AdminError } from "@/lib/admin/errors";
import { getApproval } from "@/server/repositories/approvals";
import { queryOne } from "@/server/db/neon.server";
import { listApproverProfiles } from "@/server/repositories/notifications";
import {
  ApprovalAssignmentSchema,
  ApprovalQueuePageSchema,
  ApprovalClaimSchema,
  ApprovalDecisionSchema,
  IdSchema,
  ManualMessageHandoffSchema,
} from "@/lib/operations/input-schemas";

/** Bounded list responses omit context_data; the selected detail is a separate authorized read. */
export const getApprovalsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(ApprovalQueuePageSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("approvals.view", {}, context);
    const page = await listApprovalQueuePage(data, context);
    return {
      ...page,
      items: (await withApprovalActionFlags(context, page.items)).map((item) => ({
        ...item,
        created_at: new Date(item.created_at).toISOString(),
        decided_at: item.decided_at ? new Date(item.decided_at).toISOString() : null,
      })),
    };
  });

export const getLastReviewedAtFn = createServerFn({ method: "GET" }).handler(async () => {
  const context = await loadRequestAuthorization();
  await requireCapability("approvals.view", {}, context);
  return getLatestDecidedApprovalAt(context);
});

export const getApprovalDetailFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(IdSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "approvals.view",
      {
        resourceType: "human_approval",
        resourceId: data.id,
      },
      context,
    );
    const approval = await getApproval(data.id);
    const [actions] = await withApprovalActionFlags(context, [serializeHumanApproval(approval)]);
    return { ...actions, can_claim: await canClaimApproval(context, approval) };
  });

export const decideApproval = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ApprovalDecisionSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "approvals.decide",
      {
        resourceType: "human_approval",
        resourceId: data.id,
      },
      context,
    );
    const approval = await decideApprovalCommand(context, {
      ...data,
      idempotencyKey: data.idempotencyKey ?? randomUUID(),
    });
    return serializeHumanApproval(approval);
  });

export const assignApprovalFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ApprovalAssignmentSchema, data))
  .handler(async ({ data }) => {
    // `approvals.decide`, not a new `approvals.assign`. Routing an approval is strictly weaker
    // than deciding it, and every role holding `decide` is already trusted with the outcome.
    // Adding a capability would be an authorization change needing sign-off, to express a
    // permission already implied.
    const context = await loadRequestAuthorization();
    await requireCapability(
      "approvals.decide",
      {
        resourceType: "human_approval",
        resourceId: data.id,
      },
      context,
    );
    const approval = await assignApproval(data, context);
    const [actions] = await withApprovalActionFlags(context, [serializeHumanApproval(approval)]);
    return { ...actions, can_claim: await canClaimApproval(context, approval) };
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

/** Claim is scoped to the persisted linked subject inside one locked command. */
export const claimApprovalFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ApprovalClaimSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    const approval = await claimApprovalCommand(context, {
      ...data,
      idempotencyKey: data.idempotencyKey ?? randomUUID(),
    });
    const [actions] = await withApprovalActionFlags(context, [serializeHumanApproval(approval)]);
    return { ...actions, can_claim: false };
  });

/** Draft text is fetched only for the selected, authorized approved message request. */
export const getMessageHandoffFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(IdSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "approvals.view",
      {
        resourceType: "human_approval",
        resourceId: data.id,
      },
      context,
    );
    const approval = await getApproval(data.id);
    if (approval.approval_type !== "message_send" || approval.status !== "approved") {
      throw new AdminError("CONFLICT", "Approved message draft is unavailable");
    }
    const handoff = await queryOne<MessageHandoff>(
      "select * from approval_message_handoffs where approval_id=$1",
      [approval.id],
    );
    if (!handoff) throw new AdminError("CONFLICT", "Manual handoff is unavailable");
    const payload = approval.context_data as { draft_message?: unknown } | null;
    return {
      approvalId: approval.id,
      can_record_manual_send:
        handoff.handoff_status === "awaiting_manual_send" &&
        approvalDecisionPermission(context, approval),
      draftMessage: typeof payload?.draft_message === "string" ? payload.draft_message : null,
      handoff,
    };
  });

export const recordManualMessageSentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(ManualMessageHandoffSchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    return recordManualMessageSentCommand(context, {
      ...data,
      idempotencyKey: data.idempotencyKey ?? randomUUID(),
    });
  });

import { evaluateAuthorization } from "@/lib/admin/policy";
import type { HumanApproval } from "@/lib/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { neonOwnershipQuery } from "@/server/auth/resource-ownership";
import { query } from "@/server/db/neon.server";
type ApprovalTarget = Pick<HumanApproval, "id" | "assigned_to" | "status" | "approval_type"> & {
  context_data?: unknown;
  quote_id?: string | null;
};
export function approvalDecisionPermission(
  context: RequestAuthorization,
  approval: ApprovalTarget,
) {
  return evaluateAuthorization({
    actor: context.actor,
    capability: "approvals.decide",
    target: {
      resourceType: "human_approval",
      resourceId: approval.id,
      ...(approval.assigned_to ? { ownerProfileId: approval.assigned_to } : {}),
    },
    overrides: context.overrides,
    now: context.now,
  }).allowed;
}
function quoteId(approval: ApprovalTarget): string | null {
  if (approval.approval_type !== "quote_send") return null;
  const payload = approval.context_data as { quote_id?: unknown } | null;
  return approval.quote_id ?? (typeof payload?.quote_id === "string" ? payload.quote_id : null);
}
function riskEngagementId(approval: ApprovalTarget): string | null {
  if (approval.approval_type !== "cs_risk_review") return null;
  const payload = approval.context_data as { engagement_id?: unknown } | null;
  const id = payload?.engagement_id;
  return typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase()
    : null;
}
/** Existing policy evaluated per persisted row; no browser role inference or new grant. */
export async function withApprovalActionFlags<T extends ApprovalTarget>(
  context: RequestAuthorization,
  approvals: readonly T[],
) {
  const quoteIds = [
    ...new Set(
      approvals.flatMap((approval) => {
        const id = quoteId(approval);
        return id ? [id] : [];
      }),
    ),
  ];
  // One bounded ownership read for quote-send rows, never one query per queue item.
  const quoteOwners = quoteIds.length
    ? new Map(
        (
          await query<{ id: string; owner_profile_id: string | null }>(
            neonOwnershipQuery("quote"),
            [quoteIds],
          )
        ).map((row) => [row.id, row.owner_profile_id]),
      )
    : new Map<string, string | null>();
  const engagementIds = [
    ...new Set(
      approvals.flatMap((approval) => {
        const id = riskEngagementId(approval);
        return id ? [id] : [];
      }),
    ),
  ];
  // Risk decisions also require the linked engagement's current grant. Routing retains
  // its separate approval permission; ownership columns remain server-local.
  const engagementOwners = engagementIds.length
    ? new Map(
        (
          await query<{ id: string; owner_profile_id: string | null }>(
            neonOwnershipQuery("engagement"),
            [engagementIds],
          )
        ).map((row) => [row.id, row.owner_profile_id]),
      )
    : new Map<string, string | null>();
  return approvals.map((approval) => {
    const allowed = approvalDecisionPermission(context, approval),
      id = quoteId(approval),
      owner = id ? quoteOwners.get(id) : null;
    const quoteAllowed =
      approval.approval_type !== "quote_send" ||
      Boolean(
        id &&
        quoteOwners.has(id) &&
        evaluateAuthorization({
          actor: context.actor,
          capability: "quotes.approve",
          target: {
            resourceType: "quote",
            resourceId: id,
            ...(owner ? { ownerProfileId: owner } : {}),
          },
          overrides: context.overrides,
          now: context.now,
        }).allowed,
      );
    const engagementId = riskEngagementId(approval),
      engagementOwner = engagementId ? engagementOwners.get(engagementId) : null;
    const riskAllowed =
      approval.approval_type !== "cs_risk_review" ||
      Boolean(
        engagementId &&
        engagementOwners.has(engagementId) &&
        evaluateAuthorization({
          actor: context.actor,
          capability: "engagements.update",
          target: {
            resourceType: "engagement",
            resourceId: engagementId,
            ...(engagementOwner ? { ownerProfileId: engagementOwner } : {}),
          },
          overrides: context.overrides,
          now: context.now,
        }).allowed,
      );
    const open = approval.status === "pending" || approval.status === "escalated";
    return {
      ...approval,
      can_assign: open && allowed,
      can_decide:
        allowed &&
        quoteAllowed &&
        riskAllowed &&
        (approval.status === "pending" ||
          (approval.status === "escalated" && approval.approval_type !== "quote_send")),
      can_request_changes: approval.status === "pending" && allowed,
    };
  });
}

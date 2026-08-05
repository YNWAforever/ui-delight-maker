import { createServerFn } from "@tanstack/react-start";
import { AdminError } from "@/lib/admin/errors";
import { z } from "zod";
import {
  accessRequestSchema,
  capabilitySchema,
  delegationSchema,
  nonEmptyReasonSchema,
  permissionOverrideSchema,
  NON_REQUESTABLE_CAPABILITIES,
} from "@/lib/admin/schemas";
import type { Capability } from "@/lib/admin/types";
import { requireCapability } from "@/server/auth/authorization.server";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getProfileRole } from "@/server/repositories/admin-users";
import {
  cancelWorkDelegation,
  createAccessRequest,
  createPermissionOverride,
  createWorkDelegation,
  decideAccessRequest,
  getAccessRequest,
  listAccessRequests,
  listActiveOverrides,
  listAdminAuditLogs,
  listPermissionOverrideHistory,
  revokePermissionOverride,
} from "@/server/repositories/admin-access";

const idSchema = z.string().trim().min(1);
const profileSchema = z.object({
  profileId: idSchema,
  includeHistory: z.boolean().optional(),
});
const decisionSchema = z.object({
  id: idSchema,
  decision: z.enum(["approved", "rejected"]),
  reason: nonEmptyReasonSchema,
  accessExpiresAt: z.iso.datetime().nullable().optional(),
});
const accessRequestListSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).optional(),
});
const auditSchema = z.object({
  actorProfileId: idSchema.optional(),
  targetType: z.string().trim().min(1).optional(),
  targetId: idSchema.optional(),
  action: z.string().trim().min(1).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

function actorId(session: Awaited<ReturnType<typeof requireCapability>>) {
  return session.profile.id;
}

export const getAdminOverridesFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => profileSchema.parse(data))
  .handler(async ({ data }) => {
    const input = profileSchema.parse(data);
    await requireCapability("permissions.view", { profileId: input.profileId });
    return input.includeHistory
      ? listPermissionOverrideHistory(input.profileId)
      : listActiveOverrides(input.profileId);
  });

export const getAdminAccessRequestsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => accessRequestListSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const input = accessRequestListSchema.parse(data ?? {});
    await requireCapability("access_requests.decide");
    return listAccessRequests(input.status ?? "pending");
  });

export const createAdminPermissionOverrideFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => permissionOverrideSchema.parse(data))
  .handler(async ({ data }) => {
    const input = permissionOverrideSchema.parse(data);
    const session = await requireCapability("permissions.override", {
      profileId: input.profileId,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.teamId ? { teamId: input.teamId } : {}),
    });
    return createPermissionOverride(input, actorId(session));
  });

export const revokeAdminPermissionOverrideFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: idSchema }).parse(data))
  .handler(async ({ data }) => {
    const input = z.object({ id: idSchema }).parse(data);
    const session = await requireCapability("permissions.override");
    return revokePermissionOverride(input.id, actorId(session));
  });

export const createAdminAccessRequestFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => accessRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const input = accessRequestSchema.parse(data);
    const session = await requireNeonAuthSession();
    return createAccessRequest(input, session.profile.id);
  });

/**
 * Approving a capability request writes an unscoped `allow` override, and the policy consults
 * overrides before ROLE_GRANTS — so the decision is a grant, and it has to be held to the same
 * bar as one. Without this the decider could hand out capabilities they do not hold themselves.
 */
async function assertDeciderCanGrant(capability: Capability) {
  try {
    await requireCapability(capability);
  } catch {
    throw new AdminError(
      "FORBIDDEN",
      `You cannot approve ${capability} because you do not hold it yourself`,
    );
  }
}

export const decideAdminAccessRequestFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data }) => {
    const input = decisionSchema.parse(data);
    const request = await getAccessRequest(input.id);
    if (!request) throw new AdminError("CONFLICT", "Access request not found");
    const session = await requireCapability(
      "access_requests.decide",
      request.requestType === "team" && request.teamId ? { teamId: request.teamId } : {},
    );
    if (session.profile.role === "manager" && request.requestType === "capability") {
      throw new AdminError("FORBIDDEN", "Managers can only decide team access requests");
    }
    // Segregation of duties: the requester is never the decider, in either direction. Without
    // this an admin could request a capability and approve it in the next call.
    if (request.requesterProfileId === session.profile.id) {
      throw new AdminError("FORBIDDEN", "You cannot decide your own access request");
    }
    if (input.decision === "approved" && request.requestType === "capability") {
      if (!request.capability) {
        throw new AdminError("VALIDATION_FAILED", "Capability request has no capability");
      }
      if (NON_REQUESTABLE_CAPABILITIES.includes(request.capability)) {
        throw new AdminError(
          "FORBIDDEN",
          `${request.capability} cannot be granted through an access request`,
        );
      }
      await assertDeciderCanGrant(request.capability);
    }
    return decideAccessRequest(input, actorId(session));
  });

export const createAdminWorkDelegationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => delegationSchema.parse(data))
  .handler(async ({ data }) => {
    const input = delegationSchema.parse(data);
    const session = await requireCapability("users.manage", {
      profileId: input.delegatorProfileId,
      role: await getProfileRole(input.delegatorProfileId),
    });
    return createWorkDelegation(input, actorId(session));
  });

export const cancelAdminWorkDelegationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: idSchema }).parse(data))
  .handler(async ({ data }) => {
    const input = z.object({ id: idSchema }).parse(data);
    const session = await requireCapability("users.manage");
    return cancelWorkDelegation(input.id, actorId(session));
  });

export const getAdminAuditLogsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => auditSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const input = auditSchema.parse(data ?? {});
    await requireCapability("audit.view");
    return listAdminAuditLogs(input);
  });

export const getAdminAuditSummaryFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => auditSchema.pick({ limit: true }).parse(data ?? {}))
  .handler(async ({ data }) => {
    try {
      await requireCapability("audit.view");
      return (await listAdminAuditLogs({ limit: data.limit ?? 5 })).items;
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return [];
      }
      throw error;
    }
  });
export const exportAdminAuditLogsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => auditSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const input = auditSchema.parse(data ?? {});
    await requireCapability("audit.export");
    return listAdminAuditLogs(input);
  });

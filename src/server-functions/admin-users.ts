import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nonEmptyReasonSchema, profileStatusSchema, userRoleSchema } from "@/lib/admin/schemas";
import { AdminError } from "@/lib/admin/errors";
import type { AdminNavigationItem, Capability, UserRole } from "@/lib/admin/types";
import type {
  ReassignmentBucketKey,
  ReassignmentInventory,
} from "@/server/admin/reassignment.server";
import { requireAnyCapability, requireCapability } from "@/server/auth/authorization.server";
import {
  changeUserRole,
  getAdminOverview,
  getAdminUser,
  getProfileRole,
  listAdminUsers,
  setSessionInvalidBefore,
  setUserStatus,
  updateAdminProfile,
} from "@/server/repositories/admin-users";
import {
  deactivateUserWithReassignment,
  getReassignmentInventory,
  REASSIGNMENT_BUCKETS,
} from "@/server/admin/reassignment.server";

const profileIdSchema = z.string().trim().min(1);
const adminNavigationCapabilities = [
  "users.view",
  "teams.view",
  "permissions.view",
  "audit.view",
] as const satisfies readonly Capability[];

const listUsersSchema = z.object({
  search: z.string().trim().optional(),
  role: userRoleSchema.optional(),
  status: profileStatusSchema.optional(),
  departmentId: profileIdSchema.optional(),
  teamId: profileIdSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const profileChangesSchema = z.object({
  name: z.string().trim().min(1).nullable().optional(),
  jobTitle: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  locale: z.string().trim().min(1).optional(),
  timezone: z.string().trim().min(1).optional(),
  primaryDepartmentId: profileIdSchema.nullable().optional(),
  managerProfileId: profileIdSchema.nullable().optional(),
});
const targetSchema = z.object({ profileId: profileIdSchema });
const roleChangeSchema = z.object({
  profileId: profileIdSchema,
  role: userRoleSchema,
  reason: nonEmptyReasonSchema,
});
const profileUpdateSchema = z.object({
  profileId: profileIdSchema,
  changes: profileChangesSchema,
});
const lifecycleSchema = z.object({
  profileId: profileIdSchema,
  reason: nonEmptyReasonSchema,
});

const reassignmentBucketKeySchema = z.enum(
  REASSIGNMENT_BUCKETS.map((bucket) => bucket.key) as [
    ReassignmentBucketKey,
    ...ReassignmentBucketKey[],
  ],
);
const reassignmentInventorySchema = z
  .object({
    profileId: profileIdSchema,
    buckets: z.array(
      z.object({
        key: reassignmentBucketKeySchema,
        table: z.string().min(1),
        column: z.string().min(1),
        label: z.string().min(1),
        count: z.coerce.number().int().nonnegative(),
      }),
    ),
    totalCount: z.coerce.number().int().nonnegative(),
  })
  .transform((inventory): ReassignmentInventory => inventory as ReassignmentInventory);
const reassignmentLifecycleSchema = z.object({
  profileId: profileIdSchema,
  reason: nonEmptyReasonSchema,
  reviewedInventory: reassignmentInventorySchema,
  successors: z.record(z.string(), profileIdSchema),
});

const operationalRoles = new Set<UserRole>(["sales", "client_success", "accounting", "read_only"]);

function assertCanAssignRole(actorRole: UserRole, role: UserRole) {
  if (role === "super_admin" && actorRole !== "super_admin") {
    throw new AdminError("FORBIDDEN", "Only a Super Admin may assign the Super Admin role");
  }
  if (actorRole === "manager" && !operationalRoles.has(role)) {
    throw new AdminError("FORBIDDEN", "Managers may assign operational roles only");
  }
}

function idOf(session: Awaited<ReturnType<typeof requireCapability>>) {
  return session.profile.id;
}

const adminNavigationItems = [
  { key: "overview", label: "Overview", capability: "users.view", href: "/admin" },
  { key: "people", label: "People", capability: "users.view", href: "/admin/people" },
  { key: "teams", label: "Teams", capability: "teams.view", href: "/admin/teams" },
  { key: "access", label: "Access", capability: "permissions.view", href: "/admin/access" },
  { key: "audit", label: "Audit", capability: "audit.view", href: "/admin/audit" },
] as const satisfies readonly AdminNavigationItem[];

export const getAdminNavigationFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAnyCapability(adminNavigationCapabilities);
  const visibleItems = await Promise.all(
    adminNavigationItems.map(async (item) => {
      try {
        await requireCapability(item.capability);
        return item;
      } catch (error) {
        if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
          return null;
        }
        throw error;
      }
    }),
  );
  return visibleItems.filter(
    (item): item is (typeof adminNavigationItems)[number] => item !== null,
  );
});

export const getAdminOverviewFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAnyCapability(adminNavigationCapabilities);
  return getAdminOverview();
});

export const getAdminUsersFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => listUsersSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const input = listUsersSchema.parse(data ?? {});
    await requireCapability("users.view");
    return listAdminUsers(input);
  });

export const getAdminUserFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => targetSchema.parse(data))
  .handler(async ({ data }) => {
    const input = targetSchema.parse(data);
    await requireCapability("users.view", { profileId: input.profileId });
    return getAdminUser(input.profileId);
  });

/**
 * Builds the authorization target for an action against another user's profile.
 *
 * The target's *current* role is load-bearing, not decoration. `evaluateAuthorization` denies a
 * manager checking `users.manage` against a target that has a profileId but no role
 * (`invalid_target`), and separately refuses any manager acting on an `admin` or `super_admin`
 * target (`protected_role`). Every call site here used to pass the profileId alone, so the
 * first rule fired every time and the manager half of user management was unreachable — the
 * manager branch of `assertCanAssignRole` was dead code, and the user saw a misleading "you do
 * not have this capability".
 */
async function profileTarget(profileId: string) {
  return { profileId, role: await getProfileRole(profileId) };
}

export const updateAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => profileUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const input = profileUpdateSchema.parse(data);
    const session = await requireCapability("users.manage", await profileTarget(input.profileId));
    return updateAdminProfile(input.profileId, input.changes, idOf(session));
  });

export const changeAdminUserRoleFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => roleChangeSchema.parse(data))
  .handler(async ({ data }) => {
    const input = roleChangeSchema.parse(data);
    // The target carries the role the user has NOW, so `protected_role` can stop a manager
    // re-roling an existing admin; `assertCanAssignRole` separately vets the role they want.
    const session = await requireCapability("users.manage", await profileTarget(input.profileId));
    assertCanAssignRole(session.profile.role, input.role);
    return changeUserRole(input.profileId, input.role, input.reason, idOf(session));
  });

async function setLifecycle(
  data: unknown,
  action: "suspend" | "reactivate",
  capability: "users.suspend" | "users.manage",
) {
  const input = lifecycleSchema.parse(data);
  const session = await requireCapability(capability, await profileTarget(input.profileId));
  return setUserStatus(input.profileId, action, input.reason, idOf(session));
}

export const suspendAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => lifecycleSchema.parse(data))
  .handler(({ data }) => setLifecycle(data, "suspend", "users.suspend"));

export const reactivateAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => lifecycleSchema.parse(data))
  .handler(({ data }) => setLifecycle(data, "reactivate", "users.manage"));

export const getAdminReassignmentInventoryFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => targetSchema.parse(data))
  .handler(async ({ data }) => {
    const input = targetSchema.parse(data);
    await requireCapability("users.deactivate", { profileId: input.profileId });
    return getReassignmentInventory(input.profileId);
  });

export const deactivateAdminUserWithReassignmentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => reassignmentLifecycleSchema.parse(data))
  .handler(async ({ data }) => {
    const input = reassignmentLifecycleSchema.parse(data);
    const session = await requireCapability("users.deactivate", { profileId: input.profileId });
    return deactivateUserWithReassignment(input, idOf(session));
  });

export const revokeAdminUserSessionsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => targetSchema.parse(data))
  .handler(async ({ data }) => {
    const input = targetSchema.parse(data);
    const session = await requireCapability("sessions.revoke", { profileId: input.profileId });
    await setSessionInvalidBefore(input.profileId, idOf(session));
    return { ok: true as const };
  });

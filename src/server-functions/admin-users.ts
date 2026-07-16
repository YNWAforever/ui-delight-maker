import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nonEmptyReasonSchema, profileStatusSchema, userRoleSchema } from "@/lib/admin/schemas";
import { AdminError } from "@/lib/admin/errors";
import type { Capability, UserRole } from "@/lib/admin/types";
import { requireAnyCapability, requireCapability } from "@/server/auth/authorization.server";
import {
  changeUserRole,
  getAdminOverview,
  getAdminUser,
  listAdminUsers,
  setSessionInvalidBefore,
  setUserStatus,
  updateAdminProfile,
} from "@/server/repositories/admin-users";

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

export const getAdminNavigationFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAnyCapability(adminNavigationCapabilities);
  return [
    { key: "overview", label: "Overview", capability: "users.view" as const },
    { key: "people", label: "People", capability: "users.view" as const },
    { key: "teams", label: "Teams", capability: "teams.view" as const },
    { key: "access", label: "Access", capability: "permissions.view" as const },
    { key: "audit", label: "Audit", capability: "audit.view" as const },
  ];
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

export const updateAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => profileUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const input = profileUpdateSchema.parse(data);
    const session = await requireCapability("users.manage", { profileId: input.profileId });
    return updateAdminProfile(input.profileId, input.changes, idOf(session));
  });

export const changeAdminUserRoleFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => roleChangeSchema.parse(data))
  .handler(async ({ data }) => {
    const input = roleChangeSchema.parse(data);
    const session = await requireCapability("users.manage", { profileId: input.profileId });
    assertCanAssignRole(session.profile.role, input.role);
    return changeUserRole(input.profileId, input.role, input.reason, idOf(session));
  });

async function setLifecycle(
  data: unknown,
  action: "suspend" | "reactivate" | "deactivate",
  capability: "users.suspend" | "users.manage" | "users.deactivate",
) {
  const input = lifecycleSchema.parse(data);
  const session = await requireCapability(capability, { profileId: input.profileId });
  return setUserStatus(input.profileId, action, input.reason, idOf(session));
}

export const suspendAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => lifecycleSchema.parse(data))
  .handler(({ data }) => setLifecycle(data, "suspend", "users.suspend"));

export const reactivateAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => lifecycleSchema.parse(data))
  .handler(({ data }) => setLifecycle(data, "reactivate", "users.manage"));

export const deactivateAdminUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => lifecycleSchema.parse(data))
  .handler(({ data }) => setLifecycle(data, "deactivate", "users.deactivate"));

export const revokeAdminUserSessionsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => targetSchema.parse(data))
  .handler(async ({ data }) => {
    const input = targetSchema.parse(data);
    const session = await requireCapability("sessions.revoke", { profileId: input.profileId });
    await setSessionInvalidBefore(input.profileId, idOf(session));
    return { ok: true as const };
  });

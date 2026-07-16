import { z } from "zod";
import { CAPABILITIES, PROFILE_STATUSES, USER_ROLES } from "./types";

export const userRoleSchema = z.enum(USER_ROLES);
export const profileStatusSchema = z.enum(PROFILE_STATUSES);
export const capabilitySchema = z.enum(CAPABILITIES);
export const nonEmptyReasonSchema = z.string().trim().min(8);

const profileIdSchema = z.string().trim().min(1);
const optionalIdSchema = z.string().trim().min(1).optional();

export const adminPeopleSearchSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  status: profileStatusSchema.optional().catch(undefined),
  role: userRoleSchema.optional().catch(undefined),
  department: optionalIdSchema.catch(undefined),
  team: optionalIdSchema.catch(undefined),
  manager: optionalIdSchema.catch(undefined),
  activity: z.enum(["active", "stale", "never"]).optional().catch(undefined),
  user: profileIdSchema.optional().catch(undefined),
  sort: z.enum(["name", "last_active_at", "role", "status"]).optional().catch(undefined),
  page: z.coerce.number().int().positive().default(1).catch(1),
});

export type AdminPeopleSearch = z.infer<typeof adminPeopleSearchSchema>;

export const ADMIN_USER_DETAIL_TABS = [
  "profile",
  "access",
  "teams",
  "work",
  "security",
  "activity",
] as const;

export const adminUserDetailSearchSchema = z
  .object({ tab: z.enum(ADMIN_USER_DETAIL_TABS).optional().catch(undefined) })
  .passthrough();

export const invitationInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: userRoleSchema,
  primaryDepartmentId: optionalIdSchema,
  managerProfileId: optionalIdSchema,
  initialTeamIds: z.array(z.uuid()).default([]),
});

export const roleChangeSchema = z.object({
  profileId: profileIdSchema,
  role: userRoleSchema,
  reason: nonEmptyReasonSchema,
});

export const lifecycleActionSchema = z.object({
  profileId: profileIdSchema,
  action: z.enum(["suspend", "deactivate", "reactivate"]),
  reason: nonEmptyReasonSchema,
});

export const teamMembershipSchema = z
  .object({
    teamId: z.uuid(),
    profileId: profileIdSchema,
    membershipRole: z.enum(["lead", "deputy", "member"]).default("member"),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
  })
  .refine(
    (value) =>
      !value.startsAt ||
      !value.endsAt ||
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );

export const permissionOverrideSchema = z.object({
  profileId: profileIdSchema,
  capability: capabilitySchema,
  effect: z.enum(["allow", "deny"]),
  departmentId: optionalIdSchema,
  teamId: optionalIdSchema,
  resourceType: optionalIdSchema,
  resourceId: optionalIdSchema,
  reason: nonEmptyReasonSchema,
  expiresAt: z.iso.datetime().optional(),
});

export const accessRequestSchema = z
  .object({
    requestType: z.enum(["capability", "team"]),
    capability: capabilitySchema.optional(),
    teamId: z.uuid().optional(),
    reason: nonEmptyReasonSchema,
  })
  .superRefine((value, context) => {
    const validCapability = value.requestType === "capability" && value.capability && !value.teamId;
    const validTeam = value.requestType === "team" && value.teamId && !value.capability;
    if (!validCapability && !validTeam) {
      context.addIssue({
        code: "custom",
        message: "Request must target exactly one capability or team",
        path: [value.requestType === "team" ? "teamId" : "capability"],
      });
    }
  });

export const delegationSchema = z
  .object({
    delegatorProfileId: profileIdSchema,
    delegateProfileId: profileIdSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: nonEmptyReasonSchema,
  })
  .superRefine((value, context) => {
    if (value.delegatorProfileId === value.delegateProfileId) {
      context.addIssue({
        code: "custom",
        message: "Delegate must be a different profile",
        path: ["delegateProfileId"],
      });
    }
    if (new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
      context.addIssue({
        code: "custom",
        message: "endsAt must be after startsAt",
        path: ["endsAt"],
      });
    }
  });

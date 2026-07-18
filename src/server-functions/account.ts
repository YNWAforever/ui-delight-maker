import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AdminError } from "@/lib/admin/errors";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { capabilitySchema, nonEmptyReasonSchema } from "@/lib/admin/schemas";
import { createAccessRequest, createWorkDelegation } from "@/server/repositories/admin-access";
import {
  cancelMyDelegation as cancelMyDelegationRecord,
  listMyAccessRequests,
  listMyDelegations,
  updateMyAvailability as updateMyAvailabilityRecord,
  updateMyProfile as updateMyProfileRecord,
} from "@/server/repositories/account";
import {
  getAdminUser,
  getUserWorkload,
  setSessionInvalidBefore,
} from "@/server/repositories/admin-users";

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid timezone" },
  );

const profileUpdateSchema = z
  .object({
    name: z.string().trim().max(200).nullable().optional(),
    job_title: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(80).nullable().optional(),
    avatar_url: z.string().url().max(2048).nullable().optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict();

const availabilitySchema = z
  .object({
    availability_status: z.enum(["available", "limited", "away"]),
    leave_starts_at: z.iso.datetime().nullable().optional(),
    leave_ends_at: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasStart = value.leave_starts_at !== undefined && value.leave_starts_at !== null;
    const hasEnd = value.leave_ends_at !== undefined && value.leave_ends_at !== null;
    if (hasStart !== hasEnd) {
      context.addIssue({
        code: "custom",
        message: "Leave start and end must be provided together",
        path: ["leave_ends_at"],
      });
    }
    if (hasStart && hasEnd && value.leave_ends_at! <= value.leave_starts_at!) {
      context.addIssue({
        code: "custom",
        message: "leave_ends_at must be after leave_starts_at",
        path: ["leave_ends_at"],
      });
    }
  });

const delegationSchema = z
  .object({
    delegateProfileId: z.string().trim().min(1),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: nonEmptyReasonSchema,
  })
  .strict()
  .refine((value) => value.endsAt > value.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

const cancelDelegationSchema = z.object({ id: z.string().trim().min(1) }).strict();
const revokeSessionsSchema = z.object({}).strict();

const accessRequestSchema = z
  .object({
    requestType: z.enum(["capability", "team"]),
    capability: capabilitySchema.optional(),
    teamId: z.string().trim().min(1).optional(),
    reason: nonEmptyReasonSchema,
  })
  .strict()
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

export const getMyAccount = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireNeonAuthSession();
  const profileId = session.profile.id;
  const [account, delegations, accessRequests] = await Promise.all([
    getAdminUser(profileId),
    listMyDelegations(profileId),
    listMyAccessRequests(profileId),
  ]);
  if (!account) throw new AdminError("CONFLICT", "User profile not found");
  return {
    ...account,
    profile: {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      status: account.status,
      avatar_url: account.avatarUrl,
      job_title: account.jobTitle,
      phone: account.phone,
      locale: account.locale,
      timezone: account.timezone,
      primary_department_id: account.primaryDepartmentId,
      manager_profile_id: account.managerProfileId,
      last_active_at: account.lastActiveAt,
      session_invalid_before: account.sessionInvalidBefore,
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
      deactivated_at: null,
      deactivated_by: null,
      deactivation_reason: null,
      availability_status: account.availabilityStatus as "available" | "limited" | "away",
      leave_starts_at: account.leaveStartsAt ?? null,
      leave_ends_at: account.leaveEndsAt ?? null,
      created_at: account.createdAt,
    },
    delegations,
    accessRequests,
  };
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => profileUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const input = profileUpdateSchema.parse(data);
    const session = await requireNeonAuthSession();
    await updateMyProfileRecord(
      session.profile.id,
      {
        name: input.name,
        jobTitle: input.job_title,
        phone: input.phone,
        avatarUrl: input.avatar_url,
        locale: input.locale,
        timezone: input.timezone,
      },
      session.profile.id,
    );
    return { ok: true as const };
  });

export const updateMyAvailability = createServerFn({ method: "POST" })
  .validator((data: unknown) => availabilitySchema.parse(data))
  .handler(async ({ data }) => {
    const input = availabilitySchema.parse(data);
    const session = await requireNeonAuthSession();
    await updateMyAvailabilityRecord(
      session.profile.id,
      {
        availabilityStatus: input.availability_status,
        leaveStartsAt: input.leave_starts_at,
        leaveEndsAt: input.leave_ends_at,
      },
      session.profile.id,
    );
    return { ok: true as const };
  });

export const revokeMyAppSessions = createServerFn({ method: "POST" })
  .validator((data: unknown) => revokeSessionsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    revokeSessionsSchema.parse(data ?? {});
    const session = await requireNeonAuthSession();
    await setSessionInvalidBefore(session.profile.id, session.profile.id);
    return { ok: true as const };
  });

export const createMyDelegation = createServerFn({ method: "POST" })
  .validator((data: unknown) => delegationSchema.parse(data))
  .handler(async ({ data }) => {
    const input = delegationSchema.parse(data);
    const session = await requireNeonAuthSession();
    if (input.delegateProfileId === session.profile.id) {
      throw new AdminError("VALIDATION_FAILED", "Delegate must be a different profile");
    }
    const delegate = await getAdminUser(input.delegateProfileId);
    if (!delegate || delegate.status !== "active") {
      throw new AdminError("VALIDATION_FAILED", "Delegation target must be active");
    }
    return createWorkDelegation(
      {
        delegatorProfileId: session.profile.id,
        delegateProfileId: input.delegateProfileId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
      },
      session.profile.id,
    );
  });

export const cancelMyDelegation = createServerFn({ method: "POST" })
  .validator((data: unknown) => cancelDelegationSchema.parse(data))
  .handler(async ({ data }) => {
    const input = cancelDelegationSchema.parse(data);
    const session = await requireNeonAuthSession();
    await cancelMyDelegationRecord(input.id, session.profile.id, session.profile.id);
    return { ok: true as const };
  });

export const createMyAccessRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => accessRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const input = accessRequestSchema.parse(data);
    const session = await requireNeonAuthSession();
    return createAccessRequest(input, session.profile.id);
  });

export const getMyWorkload = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireNeonAuthSession();
  return getUserWorkload(session.profile.id);
});

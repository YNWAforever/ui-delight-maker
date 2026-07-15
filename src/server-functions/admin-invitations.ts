import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AdminError } from "@/lib/admin/errors";
import { invitationInputSchema } from "@/lib/admin/schemas";
import type { UserRole } from "@/lib/admin/types";
import { requireNeonAuthIdentity } from "@/lib/auth/neon-auth.server";
import { dispatchInvitationEmail } from "@/server/admin/invitation-email.server";
import { requireCapability } from "@/server/auth/authorization.server";
import {
  acceptInvitation,
  createInvitation,
  getInvitationById,
  getInvitationPreview as getInvitationPreviewFromRepository,
  resendInvitation,
  revokeInvitation,
  type UserInvitation,
} from "@/server/repositories/admin-invitations";

const inviteBatchSchema = z.object({
  invitations: z.array(invitationInputSchema).min(1).max(100),
});
const tokenSchema = z.object({ token: z.string().trim().min(16).max(512) });
const invitationIdSchema = z.object({ invitationId: z.string().trim().min(1) });

const MANAGER_INVITABLE_ROLES = new Set<UserRole>([
  "sales",
  "client_success",
  "accounting",
  "read_only",
]);

function inviteBaseUrl() {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  return "http://localhost:5173";
}

function invitationUrl(rawToken: string) {
  return `${inviteBaseUrl()}/invite/${encodeURIComponent(rawToken)}`;
}

function assertCanAssignRole(actorRole: UserRole, intendedRole: UserRole) {
  if (intendedRole === "super_admin" && actorRole !== "super_admin") {
    throw new AdminError("FORBIDDEN", "Only a Super Admin may invite another Super Admin");
  }
  if (actorRole === "manager" && !MANAGER_INVITABLE_ROLES.has(intendedRole)) {
    throw new AdminError("FORBIDDEN", "Managers may invite operational roles only");
  }
}

type InvitationAuthorizationFields = Pick<
  UserInvitation,
  "intended_role" | "primary_department_id" | "manager_profile_id" | "initial_team_ids"
>;

function authorizationTargets(invitation: InvitationAuthorizationFields) {
  const baseTarget = {
    role: invitation.intended_role,
    departmentId: invitation.primary_department_id ?? undefined,
    ownerProfileId: invitation.manager_profile_id ?? undefined,
  };
  if (invitation.initial_team_ids.length === 0) {
    return [baseTarget];
  }
  return invitation.initial_team_ids.map((teamId) => ({ ...baseTarget, teamId }));
}

async function requireInvitationTargets(invitation: InvitationAuthorizationFields) {
  for (const target of authorizationTargets(invitation)) {
    await requireCapability("users.invite", target);
  }
}

function inviterName(session: Awaited<ReturnType<typeof requireCapability>>) {
  return session.profile.name ?? session.profile.email ?? "Fimmick ClientOps";
}

async function deliverInvitation(
  invitation: Pick<UserInvitation, "email" | "expires_at">,
  rawToken: string,
  name: string,
) {
  const inviteUrl = invitationUrl(rawToken);
  const delivery = await dispatchInvitationEmail({
    email: invitation.email,
    inviteUrl,
    expiresAt: invitation.expires_at,
    inviterName: name,
  });
  return { inviteUrl, delivery };
}

export const inviteUsers = createServerFn({ method: "POST" })
  .validator((data: unknown) => inviteBatchSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await requireCapability("users.invite");
    const results = [];

    for (const input of data.invitations) {
      assertCanAssignRole(session.profile.role, input.role);
      const managerProfileId =
        input.managerProfileId ?? (session.profile.role === "manager" ? session.profile.id : null);
      if (session.profile.role === "manager") {
        await requireInvitationTargets({
          intended_role: input.role,
          primary_department_id: input.primaryDepartmentId ?? null,
          manager_profile_id: managerProfileId,
          initial_team_ids: input.initialTeamIds,
        });
      }

      const created = await createInvitation(
        {
          email: input.email.trim().toLowerCase(),
          intendedRole: input.role,
          primaryDepartmentId: input.primaryDepartmentId ?? null,
          managerProfileId,
          initialTeamIds: input.initialTeamIds,
        },
        session.profile.id,
      );
      const delivery = await deliverInvitation(
        created.invitation,
        created.rawToken,
        inviterName(session),
      );
      results.push({ invitation: created.invitation, ...delivery });
    }

    return results;
  });

export const getInvitationPreview = createServerFn({ method: "GET" })
  .validator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }) => getInvitationPreviewFromRepository(data.token));

export const acceptUserInvitation = createServerFn({ method: "POST" })
  .validator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }) => {
    const identity = await requireNeonAuthIdentity();
    return acceptInvitation(data.token, {
      id: identity.user.id,
      email: identity.user.email,
      name: identity.user.name,
      ...(identity.user.image ? { image: identity.user.image } : {}),
    });
  });

async function authorizeStoredInvitation(invitationId: string) {
  const session = await requireCapability("users.invite");
  const invitation = await getInvitationById(invitationId);
  if (!invitation) {
    throw new AdminError("CONFLICT", "Invitation not found");
  }

  assertCanAssignRole(session.profile.role, invitation.intended_role);
  if (
    session.profile.role === "manager" &&
    !invitation.primary_department_id &&
    !invitation.manager_profile_id &&
    invitation.initial_team_ids.length === 0
  ) {
    throw new AdminError("OUTSIDE_SCOPE", "Invitation is outside your management scope");
  }
  await requireInvitationTargets(invitation);
  return { session, invitation };
}

export const resendUserInvitation = createServerFn({ method: "POST" })
  .validator((data: unknown) => invitationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { session } = await authorizeStoredInvitation(data.invitationId);
    const resent = await resendInvitation(data.invitationId, session.profile.id);
    const delivery = await deliverInvitation(
      resent.invitation,
      resent.rawToken,
      inviterName(session),
    );
    return { invitation: resent.invitation, ...delivery };
  });

export const revokeUserInvitation = createServerFn({ method: "POST" })
  .validator((data: unknown) => invitationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { session } = await authorizeStoredInvitation(data.invitationId);
    return revokeInvitation(data.invitationId, session.profile.id);
  });

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

function authorizationTarget(
  invitation: Pick<
    UserInvitation,
    "intended_role" | "primary_department_id" | "manager_profile_id" | "initial_team_ids"
  >,
  actorId: string,
) {
  return {
    role: invitation.intended_role,
    departmentId: invitation.primary_department_id,
    teamId: invitation.initial_team_ids[0],
    ownerProfileId: invitation.manager_profile_id ?? actorId,
  };
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
      const target = {
        role: input.role,
        departmentId: input.primaryDepartmentId ?? null,
        teamId: input.initialTeamIds[0],
        ownerProfileId: input.managerProfileId ?? session.profile.id,
      };
      if (session.profile.role === "manager") {
        await requireCapability("users.invite", target);
      }

      const created = await createInvitation(
        {
          email: input.email.trim().toLowerCase(),
          intendedRole: input.role,
          primaryDepartmentId: input.primaryDepartmentId ?? null,
          managerProfileId: input.managerProfileId ?? null,
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
  await requireCapability("users.invite", authorizationTarget(invitation, session.profile.id));
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

import { createHash, randomBytes } from "node:crypto";
import type { Profile, UserRole } from "@/lib/types";
import { transaction as runTransaction, type Queryable } from "@/server/db/neon.server";

const PROFILE_COLUMNS = `
  id, email, name, role, status, avatar_url, job_title, phone, locale, timezone,
  primary_department_id, manager_profile_id, last_active_at, session_invalid_before,
  suspended_at, suspended_by, suspension_reason, deactivated_at, deactivated_by,
  deactivation_reason, availability_status, leave_starts_at, leave_ends_at, created_at
`;

export type UserInvitation = {
  id: string;
  email: string;
  token_hash: string;
  intended_role: UserRole;
  primary_department_id: string | null;
  manager_profile_id: string | null;
  initial_team_ids: string[];
  status: "pending" | "accepted" | "expired" | "revoked";
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_profile_id: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateInvitationInput = {
  email: string;
  intendedRole: UserRole;
  primaryDepartmentId?: string | null;
  managerProfileId?: string | null;
  initialTeamIds?: readonly string[];
  expiresAt?: Date | string;
};

export type InvitationIdentity = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type InvitationPreview = {
  email: string;
  intendedRole: UserRole;
  expiresAt: string;
  status: UserInvitation["status"];
};

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>;

type InvitationRepositoryDependencies = {
  transaction?: Transaction;
  randomToken?: () => string;
  now?: () => Date;
};

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashInvitationToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function fallbackIdentityName(identity: InvitationIdentity) {
  if (identity.name?.trim()) return identity.name.trim();
  const email = normalizeInvitationEmail(identity.email ?? "");
  return email.split("@")[0] || "Fimmick user";
}

function invitationExpiry(input: CreateInvitationInput, now: Date) {
  if (input.expiresAt) {
    const expiry = new Date(input.expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= now) {
      throw new Error("Invitation expiry must be in the future");
    }
    return expiry.toISOString();
  }
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function assertInvitationAvailable(
  invitation: Pick<UserInvitation, "status" | "expires_at">,
  now: Date,
) {
  if (invitation.status !== "pending") {
    throw new Error("Invitation is no longer available");
  }
  const expiresAt = Date.parse(invitation.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new Error("Invitation has expired");
  }
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

export function createInvitationRepository(dependencies: InvitationRepositoryDependencies = {}) {
  const transaction = dependencies.transaction ?? runTransaction;
  const generateToken = dependencies.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const now = dependencies.now ?? (() => new Date());

  async function createInvitation(input: CreateInvitationInput, actorId: string) {
    const email = normalizeInvitationEmail(input.email);
    if (!email || !email.includes("@")) {
      throw new Error("A valid invitation email is required");
    }

    const createdAt = now();
    const expiresAt = invitationExpiry(input, createdAt);
    const rawToken = generateToken();
    const tokenHash = hashInvitationToken(rawToken);
    const initialTeamIds = [...new Set(input.initialTeamIds ?? [])];

    try {
      const invitation = await transaction(async (db) => {
        await db.query(
          `
            update user_invitations
            set status = 'expired', updated_at = $2
            where lower(email) = $1 and status = 'pending' and expires_at <= $2
          `,
          [email, createdAt.toISOString()],
        );

        const existing = await db.query<{ id: string }>(
          `
            select id from user_invitations
            where lower(email) = $1 and status = 'pending'
            limit 1 for update
          `,
          [email],
        );
        if (existing.rows[0]) {
          throw new Error("A pending invitation already exists for this email");
        }

        const inserted = await db.query<UserInvitation>(
          `
            insert into user_invitations (
              email, token_hash, intended_role, primary_department_id,
              manager_profile_id, initial_team_ids, invited_by, expires_at
            )
            values ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)
            returning *
          `,
          [
            email,
            tokenHash,
            input.intendedRole,
            input.primaryDepartmentId ?? null,
            input.managerProfileId ?? null,
            initialTeamIds,
            actorId,
            expiresAt,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Failed to create invitation");
        return row;
      });

      return { invitation, rawToken };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error("A pending invitation already exists for this email");
      }
      throw error;
    }
  }

  async function getInvitationById(invitationId: string) {
    return transaction(async (db) => {
      const result = await db.query<UserInvitation>(
        `
          select * from user_invitations
          where id = $1
          limit 1
        `,
        [invitationId],
      );
      return result.rows[0] ?? null;
    });
  }

  async function getInvitationPreview(rawToken: string): Promise<InvitationPreview> {
    const tokenHash = hashInvitationToken(rawToken);
    return transaction(async (db) => {
      const result = await db.query<
        Pick<UserInvitation, "email" | "intended_role" | "expires_at" | "status">
      >(
        `
          select email, intended_role, expires_at, status
          from user_invitations
          where token_hash = $1
          limit 1
        `,
        [tokenHash],
      );
      const invitation = result.rows[0];
      if (!invitation) throw new Error("Invitation not found");
      assertInvitationAvailable(invitation, now());
      return {
        email: invitation.email,
        intendedRole: invitation.intended_role,
        expiresAt: invitation.expires_at,
        status: invitation.status,
      };
    });
  }

  async function acceptInvitation(
    rawToken: string,
    identity: InvitationIdentity,
  ): Promise<Profile> {
    const tokenHash = hashInvitationToken(rawToken);
    const identityEmail = normalizeInvitationEmail(identity.email ?? "");

    return transaction(async (db) => {
      const invitationResult = await db.query<UserInvitation>(
        `
          select * from user_invitations
          where token_hash = $1
          limit 1 for update
        `,
        [tokenHash],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) throw new Error("Invitation not found");
      assertInvitationAvailable(invitation, now());

      if (!identityEmail || identityEmail !== normalizeInvitationEmail(invitation.email)) {
        throw new Error("Invitation email does not match the signed-in account");
      }

      const profileResult = await db.query<Profile>(
        `
          insert into profiles (
            id, email, name, avatar_url, role, status,
            primary_department_id, manager_profile_id
          )
          values ($1, $2, $3, $4, $5, 'active', $6, $7)
          on conflict (id) do update set
            email = excluded.email,
            name = coalesce(excluded.name, profiles.name),
            avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
            role = excluded.role,
            status = 'active',
            primary_department_id = excluded.primary_department_id,
            manager_profile_id = excluded.manager_profile_id,
            suspended_at = null,
            suspended_by = null,
            suspension_reason = null,
            deactivated_at = null,
            deactivated_by = null,
            deactivation_reason = null
          returning ${PROFILE_COLUMNS}
        `,
        [
          identity.id,
          identityEmail,
          fallbackIdentityName(identity),
          identity.image ?? null,
          invitation.intended_role,
          invitation.primary_department_id,
          invitation.manager_profile_id,
        ],
      );
      const profile = profileResult.rows[0];
      if (!profile) throw new Error("Failed to activate invited profile");

      if (invitation.initial_team_ids.length > 0) {
        await db.query(
          `
            insert into team_memberships (team_id, profile_id, starts_at, created_by)
            select team_id, $2, $3, $4
            from unnest($1::uuid[]) as team_id
            on conflict (team_id, profile_id) where ends_at is null do nothing
          `,
          [invitation.initial_team_ids, profile.id, now().toISOString(), invitation.invited_by],
        );
      }

      const accepted = await db.query<UserInvitation>(
        `
          update user_invitations
          set status = 'accepted',
              accepted_at = $2,
              accepted_profile_id = $3,
              updated_at = $2
          where id = $1 and status = 'pending'
          returning *
        `,
        [invitation.id, now().toISOString(), profile.id],
      );
      if (!accepted.rows[0]) throw new Error("Invitation is no longer available");

      await db.query(
        `
          insert into admin_audit_logs (
            actor_profile_id, target_type, target_id, action, severity, after_snapshot
          )
          values ($1, 'user_invitation', $2, 'invitation.accepted', 'info', $3::jsonb)
        `,
        [
          profile.id,
          invitation.id,
          JSON.stringify({
            invitationId: invitation.id,
            profileId: profile.id,
            role: profile.role,
            teamIds: invitation.initial_team_ids,
          }),
        ],
      );

      return profile;
    });
  }

  async function resendInvitation(invitationId: string, actorId: string) {
    const rawToken = generateToken();
    const tokenHash = hashInvitationToken(rawToken);
    const sentAt = now();
    const expiresAt = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const invitation = await transaction(async (db) => {
      const originalResult = await db.query<UserInvitation>(
        `
          select * from user_invitations
          where id = $1
          limit 1 for update
        `,
        [invitationId],
      );
      const original = originalResult.rows[0];
      if (!original || original.status !== "pending") {
        throw new Error("Invitation is no longer available");
      }

      const revoked = await db.query<UserInvitation>(
        `
          update user_invitations
          set status = 'revoked', revoked_at = $2, revoked_by = $3, updated_at = $2
          where id = $1 and status = 'pending'
          returning *
        `,
        [invitationId, sentAt.toISOString(), actorId],
      );
      if (!revoked.rows[0]) throw new Error("Invitation is no longer available");

      const replacement = await db.query<UserInvitation>(
        `
          insert into user_invitations (
            email, token_hash, intended_role, primary_department_id,
            manager_profile_id, initial_team_ids, invited_by, expires_at
          )
          values ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)
          returning *
        `,
        [
          original.email,
          tokenHash,
          original.intended_role,
          original.primary_department_id,
          original.manager_profile_id,
          original.initial_team_ids,
          actorId,
          expiresAt,
        ],
      );
      const row = replacement.rows[0];
      if (!row) throw new Error("Failed to resend invitation");
      return row;
    });

    return { invitation, rawToken };
  }

  async function revokeInvitation(invitationId: string, actorId: string) {
    return transaction(async (db) => {
      const result = await db.query<UserInvitation>(
        `
          update user_invitations
          set status = 'revoked', revoked_at = now(), revoked_by = $2, updated_at = now()
          where id = $1 and status = 'pending'
          returning *
        `,
        [invitationId, actorId],
      );
      const invitation = result.rows[0];
      if (!invitation) throw new Error("Invitation is no longer available");
      return invitation;
    });
  }

  return {
    createInvitation,
    getInvitationById,
    getInvitationPreview,
    acceptInvitation,
    resendInvitation,
    revokeInvitation,
  };
}

const invitationRepository = createInvitationRepository();

export const createInvitation = invitationRepository.createInvitation;
export const getInvitationById = invitationRepository.getInvitationById;
export const getInvitationPreview = invitationRepository.getInvitationPreview;
export const acceptInvitation = invitationRepository.acceptInvitation;
export const resendInvitation = invitationRepository.resendInvitation;
export const revokeInvitation = invitationRepository.revokeInvitation;

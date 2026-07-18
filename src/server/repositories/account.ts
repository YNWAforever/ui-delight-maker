import { AdminError } from "@/lib/admin/errors";
import type { Capability } from "@/lib/admin/types";
import type { AccessRequest, WorkDelegation } from "@/server/repositories/admin-access";
import {
  query as runQuery,
  transaction as runTransaction,
  type Queryable,
} from "@/server/db/neon.server";
import { redactAuditValue } from "@/server/repositories/admin-access";

type QueryFunction = (text: string, values?: readonly unknown[]) => Promise<unknown[]>;
type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>;

type Dependencies = {
  query?: QueryFunction;
  transaction?: Transaction;
};

export type MyProfileChanges = {
  name?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  locale?: string;
  timezone?: string;
};

export type MyAvailabilityChanges = {
  availabilityStatus: "available" | "limited" | "away";
  leaveStartsAt?: string | null;
  leaveEndsAt?: string | null;
};

function nullableString(value: unknown) {
  return value == null ? null : String(value);
}

function stringValue(value: unknown) {
  return String(value ?? "");
}

function requestFromRow(row: Record<string, unknown>): AccessRequest {
  return {
    id: stringValue(row.id),
    requesterProfileId: stringValue(row.requester_profile_id),
    requestType: row.request_type as AccessRequest["requestType"],
    capability: (row.capability as Capability | null) ?? null,
    teamId: nullableString(row.team_id),
    reason: stringValue(row.reason),
    status: row.status as AccessRequest["status"],
    decidedBy: nullableString(row.decided_by),
    decisionReason: nullableString(row.decision_reason),
    decidedAt: nullableString(row.decided_at),
    accessExpiresAt: nullableString(row.access_expires_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function delegationFromRow(row: Record<string, unknown>): WorkDelegation {
  return {
    id: stringValue(row.id),
    delegatorProfileId: stringValue(row.delegator_profile_id),
    delegateProfileId: stringValue(row.delegate_profile_id),
    startsAt: stringValue(row.starts_at),
    endsAt: stringValue(row.ends_at),
    reason: stringValue(row.reason),
    status: row.status as WorkDelegation["status"],
    createdAt: stringValue(row.created_at),
  };
}

async function appendAudit(
  db: Queryable,
  actor: string,
  targetId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await db.query(
    "insert into admin_audit_logs (actor_profile_id, target_type, target_id, action, before_snapshot, after_snapshot) values ($1, 'profile', $2, $3, $4::jsonb, $5::jsonb)",
    [
      actor,
      targetId,
      action,
      JSON.stringify(redactAuditValue(before ?? null)),
      JSON.stringify(redactAuditValue(after ?? null)),
    ],
  );
}

export function createAccountRepository(dependencies: Dependencies = {}) {
  const query = dependencies.query ?? ((text, values) => runQuery(text, values));
  const transaction = dependencies.transaction ?? runTransaction;

  async function updateMyProfile(profileId: string, changes: MyProfileChanges, actor: string) {
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from profiles where id = $1 for update",
        [profileId],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "User profile not found");

      const name = changes.name === undefined ? before.name : changes.name?.trim() || null;
      const jobTitle =
        changes.jobTitle === undefined ? before.job_title : changes.jobTitle?.trim() || null;
      const phone = changes.phone === undefined ? before.phone : changes.phone?.trim() || null;
      const avatarUrl =
        changes.avatarUrl === undefined ? before.avatar_url : changes.avatarUrl?.trim() || null;
      const locale = changes.locale === undefined ? stringValue(before.locale) : changes.locale;
      const timezone =
        changes.timezone === undefined ? stringValue(before.timezone) : changes.timezone;

      const updated = await db.query<Record<string, unknown>>(
        "update profiles set name = $2, avatar_url = $3, job_title = $4, phone = $5, locale = $6, timezone = $7, updated_at = now() where id = $1 returning *",
        [profileId, name, avatarUrl, jobTitle, phone, locale, timezone],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to update user profile");
      await appendAudit(db, actor, profileId, "profile.self_updated", before, after);
      return after;
    });
  }

  async function updateMyAvailability(
    profileId: string,
    changes: MyAvailabilityChanges,
    actor: string,
  ) {
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from profiles where id = $1 for update",
        [profileId],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "User profile not found");

      const leaveStartsAt =
        changes.leaveStartsAt === undefined ? before.leave_starts_at : changes.leaveStartsAt;
      const leaveEndsAt =
        changes.leaveEndsAt === undefined ? before.leave_ends_at : changes.leaveEndsAt;

      const updated = await db.query<Record<string, unknown>>(
        "update profiles set availability_status = $2, leave_starts_at = $3, leave_ends_at = $4, updated_at = now() where id = $1 returning *",
        [profileId, changes.availabilityStatus, leaveStartsAt ?? null, leaveEndsAt ?? null],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to update availability");
      await appendAudit(db, actor, profileId, "profile.availability_updated", before, after);
      return after;
    });
  }

  async function listMyDelegations(profileId: string): Promise<WorkDelegation[]> {
    const rows = (await query(
      "select * from work_delegations where delegator_profile_id = $1 or delegate_profile_id = $1 order by starts_at desc, id desc",
      [profileId],
    )) as Record<string, unknown>[];
    return rows.map(delegationFromRow);
  }

  async function cancelMyDelegation(id: string, profileId: string, actor: string) {
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from work_delegations where id = $1 for update",
        [id],
      );
      const before = locked.rows[0];
      if (!before || before.status !== "active") {
        throw new AdminError("CONFLICT", "Delegation is no longer active");
      }
      if (before.delegator_profile_id !== profileId) {
        throw new AdminError("FORBIDDEN", "You can only cancel your own delegations");
      }

      const result = await db.query<Record<string, unknown>>(
        "update work_delegations set status = 'cancelled' where id = $1 and delegator_profile_id = $2 and status = 'active' returning *",
        [id, profileId],
      );
      const after = result.rows[0];
      if (!after) throw new AdminError("CONFLICT", "Delegation is no longer active");
      await appendAudit(db, actor, id, "work_delegation.self_cancelled", before, after);
    });
  }

  async function listMyAccessRequests(profileId: string): Promise<AccessRequest[]> {
    const rows = (await query(
      "select * from access_requests where requester_profile_id = $1 order by created_at desc, id desc",
      [profileId],
    )) as Record<string, unknown>[];
    return rows.map(requestFromRow);
  }

  return {
    updateMyProfile,
    updateMyAvailability,
    listMyDelegations,
    cancelMyDelegation,
    listMyAccessRequests,
  };
}

const repository = createAccountRepository();

export const updateMyProfile = repository.updateMyProfile;
export const updateMyAvailability = repository.updateMyAvailability;
export const listMyDelegations = repository.listMyDelegations;
export const cancelMyDelegation = repository.cancelMyDelegation;
export const listMyAccessRequests = repository.listMyAccessRequests;

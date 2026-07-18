import { randomUUID } from "node:crypto";
import { AdminError } from "@/lib/admin/errors";
import { redactAuditValue } from "@/server/repositories/admin-access";
import {
  query as runQuery,
  transaction as runTransaction,
  type Queryable,
} from "@/server/db/neon.server";

export const REASSIGNMENT_BUCKETS = [
  { key: "leads.assigned_to", table: "leads", column: "assigned_to", label: "Leads" },
  { key: "tasks.assigned_to", table: "tasks", column: "assigned_to", label: "Tasks" },
  {
    key: "human_approvals.assigned_to",
    table: "human_approvals",
    column: "assigned_to",
    label: "Approval queue",
  },
  {
    key: "clients.account_owner",
    table: "clients",
    column: "account_owner",
    label: "Client accounts",
  },
  {
    key: "accounts.account_owner",
    table: "accounts",
    column: "account_owner",
    label: "Accounts - commercial owner",
  },
  {
    key: "accounts.cs_owner",
    table: "accounts",
    column: "cs_owner",
    label: "Accounts - client success owner",
  },
  {
    key: "engagements.owner",
    table: "engagements",
    column: "owner",
    label: "Retention engagements",
  },
  { key: "campaigns.owner", table: "campaigns", column: "owner", label: "Campaigns" },
  {
    key: "job_sheets.sales_owner",
    table: "job_sheets",
    column: "sales_owner",
    label: "Job sheets - sales",
  },
  {
    key: "job_sheets.accounting_owner",
    table: "job_sheets",
    column: "accounting_owner",
    label: "Job sheets - accounting",
  },
] as const;

export type ReassignmentBucketKey = (typeof REASSIGNMENT_BUCKETS)[number]["key"];

export type ReassignmentInventoryBucket = (typeof REASSIGNMENT_BUCKETS)[number] & {
  count: number;
};

export type ReassignmentInventory = {
  profileId: string;
  buckets: ReassignmentInventoryBucket[];
  totalCount: number;
};

export type DeactivateUserWithReassignmentInput = {
  profileId: string;
  reason: string;
  reviewedInventory: ReassignmentInventory;
  successors: Partial<Record<ReassignmentBucketKey, string>>;
  requestId?: string;
};

type QueryFunction = <T = unknown>(
  text: string,
  values?: readonly unknown[],
  db?: Queryable,
) => Promise<T[]>;
type TransactionFunction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>;

export type ReassignmentDependencies = {
  query?: QueryFunction;
  transaction?: TransactionFunction;
};

type ProfileRow = {
  id: string;
  role: string;
  status: string;
  email?: string | null;
  name?: string | null;
};

function countValue(value: unknown) {
  return Number(value ?? 0);
}

async function readInventory(
  profileId: string,
  query: QueryFunction,
  db?: Queryable,
): Promise<ReassignmentInventory> {
  const buckets = await Promise.all(
    REASSIGNMENT_BUCKETS.map(async (bucket) => {
      const rows = await query<{ count: number | string }>(
        "select count(*)::int as count from " + bucket.table + " where " + bucket.column + " = $1",
        [profileId],
        db,
      );
      return { ...bucket, count: countValue(rows[0]?.count) };
    }),
  );
  return {
    profileId,
    buckets,
    totalCount: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  };
}

function assertInventoryMatches(reviewed: ReassignmentInventory, current: ReassignmentInventory) {
  if (reviewed.profileId !== current.profileId) {
    throw new AdminError("STALE_ADMIN_STATE", "The reassignment review belongs to another user");
  }

  const reviewedCounts = new Map(reviewed.buckets.map((bucket) => [bucket.key, bucket.count]));
  const changed = current.buckets.some(
    (bucket) => Number(reviewedCounts.get(bucket.key) ?? -1) !== bucket.count,
  );
  if (changed || reviewed.totalCount !== current.totalCount) {
    throw new AdminError(
      "STALE_ADMIN_STATE",
      "Ownership changed after the reassignment review. Refresh the inventory and try again.",
    );
  }
}

function requiredSuccessors(
  inventory: ReassignmentInventory,
  successors: Partial<Record<ReassignmentBucketKey, string>>,
) {
  const missing = inventory.buckets
    .filter((bucket) => bucket.count > 0)
    .filter((bucket) => !successors[bucket.key]?.trim())
    .map((bucket) => bucket.label);

  if (missing.length > 0) {
    throw new AdminError(
      "OPEN_WORK_REMAINS",
      "Choose an active successor for: " + missing.join(", "),
    );
  }

  return inventory.buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      bucket,
      successorId: successors[bucket.key]!.trim(),
    }));
}

async function validateSuccessors(
  db: Queryable,
  assignments: Array<{ successorId: string }>,
  profileId: string,
) {
  const ids = [...new Set(assignments.map((assignment) => assignment.successorId))];
  if (ids.includes(profileId)) {
    throw new AdminError("VALIDATION_FAILED", "A user cannot be assigned their own work");
  }

  if (ids.length === 0) return;

  const result = await db.query<{ id: string; status: string }>(
    "select id, status from profiles where id = any($1::text[]) for update",
    [ids],
  );
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  const missing = ids.find((id) => !byId.has(id));
  if (missing) {
    throw new AdminError("VALIDATION_FAILED", "Successor profile " + missing + " was not found");
  }

  const inactive = ids.find((id) => byId.get(id)?.status !== "active");
  if (inactive) {
    throw new AdminError("VALIDATION_FAILED", "All successors must be active users");
  }
}

function auditSnapshot(profile: ProfileRow, inventory: ReassignmentInventory, status: string) {
  return redactAuditValue({
    id: profile.id,
    email: profile.email ?? null,
    name: profile.name ?? null,
    role: profile.role,
    status,
    reassignment: inventory.buckets.map((bucket) => ({
      key: bucket.key,
      count: bucket.count,
    })),
  });
}

export function createReassignmentService(dependencies: ReassignmentDependencies = {}) {
  const query = dependencies.query ?? runQuery;
  const transaction = dependencies.transaction ?? runTransaction;

  async function getReassignmentInventory(profileId: string) {
    return readInventory(profileId, query);
  }

  async function deactivateUserWithReassignment(
    input: DeactivateUserWithReassignmentInput,
    actorId: string,
  ) {
    const requestId = input.requestId ?? randomUUID();
    return transaction(async (db) => {
      const lockedTarget = await db.query<ProfileRow>(
        "select id, role, status, email, name from profiles where id = $1 for update",
        [input.profileId],
      );
      const target = lockedTarget.rows[0];
      if (!target) throw new AdminError("CONFLICT", "User profile not found");
      if (target.status === "deactivated") {
        throw new AdminError("CONFLICT", "User is already deactivated");
      }

      if (target.role === "super_admin" && target.status === "active") {
        const activeSuperAdmins = await db.query<{ id: string }>(
          "select id from profiles where role = 'super_admin' and status = 'active' order by id for update",
        );
        if (activeSuperAdmins.rows.length <= 1) {
          throw new AdminError("LAST_SUPER_ADMIN", "Cannot deactivate the last active Super Admin");
        }
      }

      const currentInventory = await readInventory(input.profileId, query, db);
      assertInventoryMatches(input.reviewedInventory, currentInventory);
      const assignments = requiredSuccessors(currentInventory, input.successors);
      await validateSuccessors(db, assignments, input.profileId);

      for (const { bucket, successorId } of assignments) {
        await db.query(
          "update " +
            bucket.table +
            " set " +
            bucket.column +
            " = $2 where " +
            bucket.column +
            " = $1",
          [input.profileId, successorId],
        );
      }

      const deactivated = await db.query<ProfileRow>(
        "update profiles set status = 'deactivated', " +
          "session_invalid_before = now(), deactivated_at = now(), " +
          "deactivated_by = $2, deactivation_reason = $3, " +
          "suspended_at = null, suspended_by = null, suspension_reason = null, " +
          "updated_at = now() where id = $1 " +
          "returning id, role, status, email, name",
        [input.profileId, actorId, input.reason.trim()],
      );
      const after = deactivated.rows[0];
      if (!after) throw new Error("Failed to deactivate user");

      await db.query(
        "insert into admin_audit_logs (" +
          "actor_profile_id, target_type, target_id, action, severity, reason, " +
          "before_snapshot, after_snapshot, request_id" +
          ") values ($1, 'profile', $2, 'profile.deactivated_with_reassignment', 'critical', " +
          "$3, $4::jsonb, $5::jsonb, $6)",
        [
          actorId,
          input.profileId,
          input.reason.trim(),
          JSON.stringify(auditSnapshot(target, currentInventory, target.status)),
          JSON.stringify(auditSnapshot(after, currentInventory, "deactivated")),
          requestId,
        ],
      );

      return {
        profileId: input.profileId,
        status: "deactivated" as const,
        requestId,
        reassigned: assignments.map(({ bucket, successorId }) => ({
          key: bucket.key,
          successorId,
          count: bucket.count,
        })),
      };
    });
  }

  return { getReassignmentInventory, deactivateUserWithReassignment };
}

const service = createReassignmentService();

export const getReassignmentInventory = service.getReassignmentInventory;
export const deactivateUserWithReassignment = service.deactivateUserWithReassignment;

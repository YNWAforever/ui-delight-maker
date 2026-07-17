import { AdminError } from "@/lib/admin/errors";
import { CAPABILITIES, type Capability, type PermissionOverride } from "@/lib/admin/types";
import {
  query as runQuery,
  transaction as runTransaction,
  type Queryable,
} from "@/server/db/neon.server";

type QueryFunction = (text: string, values?: readonly unknown[]) => Promise<unknown[]>;
type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>;

type Dependencies = {
  query?: QueryFunction;
  transaction?: Transaction;
};

export type PermissionOverrideRecord = PermissionOverride & {
  id: string;
  reason: string;
  grantedBy: string;
  createdAt: string;
};

export type AccessRequest = {
  id: string;
  requesterProfileId: string;
  requestType: "capability" | "team";
  capability: Capability | null;
  teamId: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decidedBy: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  accessExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkDelegation = {
  id: string;
  delegatorProfileId: string;
  delegateProfileId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: "active" | "cancelled" | "expired";
  createdAt: string;
};

export type JsonSafeValue =
  | null
  | boolean
  | number
  | string
  | JsonSafeValue[]
  | { [key: string]: JsonSafeValue };

export type AdminAuditLog = {
  id: string;
  actor_profile_id: string | null;
  target_type: string;
  target_id: string | null;
  action: string;
  severity: "info" | "warning" | "critical";
  reason?: string | null;
  before_snapshot: JsonSafeValue;
  after_snapshot: JsonSafeValue;
  created_at: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

type CreateOverrideInput = {
  profileId: string;
  capability: Capability;
  effect: "allow" | "deny";
  departmentId?: string | null;
  teamId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  reason: string;
  expiresAt?: string | null;
};

type CreateAccessRequestInput = {
  requestType: "capability" | "team";
  capability?: Capability | null;
  teamId?: string | null;
  reason: string;
};

type DecideAccessRequestInput = {
  id: string;
  decision: "approved" | "rejected";
  reason: string;
  accessExpiresAt?: string | null;
};

type CreateDelegationInput = {
  delegatorProfileId: string;
  delegateProfileId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};

type AuditFilters = {
  actorProfileId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  severity?: AdminAuditLog["severity"];
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

const SENSITIVE_KEY =
  /password|passcode|token|secret|cookie|session|authorization|api[_-]?key|credential/i;

export function redactAuditValue(value: unknown): JsonSafeValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (typeof value !== "object") return String(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? entry && typeof entry === "object"
          ? redactAuditValue(entry)
          : "[REDACTED]"
        : redactAuditValue(entry),
    ]),
  ) as { [key: string]: JsonSafeValue };
}

function requireReason(reason: string) {
  if (reason.trim().length < 8) {
    throw new AdminError("VALIDATION_FAILED", "A meaningful reason is required");
  }
  return reason.trim();
}

function parseDate(value: string, field: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new AdminError("VALIDATION_FAILED", `${field} must be a valid date`);
  }
  return timestamp;
}

function overrideFromRow(row: Record<string, unknown>): PermissionOverride {
  return {
    profileId: String(row.profile_id),
    capability: row.capability as Capability,
    effect: row.effect as "allow" | "deny",
    departmentId: (row.department_id as string | null) ?? null,
    teamId: (row.team_id as string | null) ?? null,
    resourceType: (row.resource_type as string | null) ?? null,
    resourceId: (row.resource_id as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

function permissionOverrideRecordFromRow(row: Record<string, unknown>): PermissionOverrideRecord {
  return {
    ...overrideFromRow(row),
    id: String(row.id),
    reason: String(row.reason ?? ""),
    grantedBy: String(row.granted_by ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function accessRequestFromRow(row: Record<string, unknown>): AccessRequest {
  return {
    id: String(row.id),
    requesterProfileId: String(row.requester_profile_id),
    requestType: row.request_type as AccessRequest["requestType"],
    capability: (row.capability as Capability | null) ?? null,
    teamId: (row.team_id as string | null) ?? null,
    reason: String(row.reason),
    status: row.status as AccessRequest["status"],
    decidedBy: (row.decided_by as string | null) ?? null,
    decisionReason: (row.decision_reason as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    accessExpiresAt: (row.access_expires_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function delegationFromRow(row: Record<string, unknown>): WorkDelegation {
  return {
    id: String(row.id),
    delegatorProfileId: String(row.delegator_profile_id),
    delegateProfileId: String(row.delegate_profile_id),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    reason: String(row.reason),
    status: row.status as WorkDelegation["status"],
    createdAt: String(row.created_at),
  };
}

async function appendAudit(
  db: Queryable,
  input: {
    actorId: string;
    targetType: string;
    targetId?: string | null;
    action: string;
    severity?: AdminAuditLog["severity"];
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await db.query(
    `
      insert into admin_audit_logs (
        actor_profile_id, target_type, target_id, action, severity,
        reason, before_snapshot, after_snapshot
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    `,
    [
      input.actorId,
      input.targetType,
      input.targetId ?? null,
      input.action,
      input.severity ?? "info",
      input.reason ?? null,
      JSON.stringify(redactAuditValue(input.before ?? null)),
      JSON.stringify(redactAuditValue(input.after ?? null)),
    ],
  );
}

export function createAdminAccessRepository(dependencies: Dependencies = {}) {
  const query = dependencies.query ?? ((text, values) => runQuery(text, values));
  const transaction = dependencies.transaction ?? runTransaction;

  async function listActiveOverrides(profileId: string): Promise<PermissionOverride[]> {
    const rows = (await query(
      `
        select *
        from permission_overrides
        where profile_id = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
        order by created_at desc, id
      `,
      [profileId],
    )) as Record<string, unknown>[];
    return rows.map(overrideFromRow);
  }
  async function listPermissionOverrideHistory(
    profileId: string,
  ): Promise<PermissionOverrideRecord[]> {
    const rows = (await query(
      "select * from permission_overrides where profile_id = $1 order by created_at desc, id",
      [profileId],
    )) as Record<string, unknown>[];
    return rows.map(permissionOverrideRecordFromRow);
  }

  async function listAccessRequests(
    status: AccessRequest["status"] | "all" = "pending",
  ): Promise<AccessRequest[]> {
    const where = status === "all" ? "" : "where status = $1";
    const rows = (await query(
      "select * from access_requests " + where + " order by created_at desc, id",
      status === "all" ? [] : [status],
    )) as Record<string, unknown>[];
    return rows.map(accessRequestFromRow);
  }

  async function getAccessRequest(id: string): Promise<AccessRequest | null> {
    const rows = (await query("select * from access_requests where id = $1", [id])) as Record<
      string,
      unknown
    >[];
    return rows[0] ? accessRequestFromRow(rows[0]) : null;
  }

  async function createPermissionOverride(input: CreateOverrideInput, actor: string) {
    if (!CAPABILITIES.includes(input.capability)) {
      throw new AdminError("VALIDATION_FAILED", "Unknown capability");
    }
    const reason = requireReason(input.reason);

    return transaction(async (db) => {
      const result = await db.query<Record<string, unknown>>(
        `
          insert into permission_overrides (
            profile_id, capability, effect, department_id, team_id,
            resource_type, resource_id, reason, granted_by, expires_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          returning *
        `,
        [
          input.profileId,
          input.capability,
          input.effect,
          input.departmentId ?? null,
          input.teamId ?? null,
          input.resourceType ?? null,
          input.resourceId ?? null,
          reason,
          actor,
          input.expiresAt ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Failed to create permission override");
      await appendAudit(db, {
        actorId: actor,
        targetType: "permission_override",
        targetId: String(row.id),
        action: "permission_override.created",
        reason,
        after: row,
      });
      return overrideFromRow(row);
    });
  }

  async function revokePermissionOverride(id: string, actor: string) {
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from permission_overrides where id = $1 for update",
        [id],
      );
      const before = locked.rows[0];
      if (!before || before.revoked_at) {
        throw new AdminError("CONFLICT", "Permission override is no longer active");
      }
      const result = await db.query<Record<string, unknown>>(
        `
          update permission_overrides
          set revoked_at = now(), revoked_by = $2
          where id = $1 and revoked_at is null
          returning *
        `,
        [id, actor],
      );
      const after = result.rows[0];
      if (!after) throw new AdminError("CONFLICT", "Permission override is no longer active");
      await appendAudit(db, {
        actorId: actor,
        targetType: "permission_override",
        targetId: id,
        action: "permission_override.revoked",
        before,
        after,
      });
    });
  }

  async function createAccessRequest(input: CreateAccessRequestInput, requester: string) {
    const reason = requireReason(input.reason);
    if (input.capability && !CAPABILITIES.includes(input.capability)) {
      throw new AdminError("VALIDATION_FAILED", "Unknown capability");
    }
    const targetsCapability =
      input.requestType === "capability" && input.capability && !input.teamId;
    const targetsTeam = input.requestType === "team" && input.teamId && !input.capability;
    if (!targetsCapability && !targetsTeam) {
      throw new AdminError(
        "VALIDATION_FAILED",
        "Request must target exactly one capability or team",
      );
    }

    return transaction(async (db) => {
      const result = await db.query<Record<string, unknown>>(
        `
          insert into access_requests (
            requester_profile_id, request_type, capability, team_id, reason
          )
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [requester, input.requestType, input.capability ?? null, input.teamId ?? null, reason],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Failed to create access request");
      await appendAudit(db, {
        actorId: requester,
        targetType: "access_request",
        targetId: String(row.id),
        action: "access_request.created",
        reason,
        after: row,
      });
      return accessRequestFromRow(row);
    });
  }

  async function decideAccessRequest(input: DecideAccessRequestInput, actor: string) {
    const reason = requireReason(input.reason);
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from access_requests where id = $1 for update",
        [input.id],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "Access request not found");
      if (before.status !== "pending") {
        throw new AdminError("CONFLICT", "Access request has already been decided");
      }

      const result = await db.query<Record<string, unknown>>(
        `
          update access_requests
          set status = $2, decided_by = $3, decision_reason = $4,
              decided_at = now(), access_expires_at = $5, updated_at = now()
          where id = $1 and status = 'pending'
          returning *
        `,
        [input.id, input.decision, actor, reason, input.accessExpiresAt ?? null],
      );
      const after = result.rows[0];
      if (!after) throw new AdminError("CONFLICT", "Access request has already been decided");

      if (input.decision === "approved" && before.request_type === "capability") {
        await db.query(
          "insert into permission_overrides (profile_id, capability, effect, reason, granted_by, expires_at) " +
            "values ($1, $2, 'allow', $3, $4, $5)",
          [
            before.requester_profile_id,
            before.capability,
            reason,
            actor,
            input.accessExpiresAt ?? null,
          ],
        );
      } else if (input.decision === "approved" && before.request_type === "team") {
        const teamLock = await db.query<{ id: string }>(
          "select id from teams where id = $1 for update",
          [before.team_id],
        );
        if (!teamLock.rows[0]) throw new AdminError("CONFLICT", "Team not found");
        const memberships = await db.query<{ id: string }>(
          "select id from team_memberships " +
            "where team_id = $1 and profile_id = $2 " +
            "and (starts_at is null or starts_at <= now()) " +
            "and (ends_at is null or ends_at > now()) for update",
          [before.team_id, before.requester_profile_id],
        );
        if (memberships.rows[0]) {
          throw new AdminError("CONFLICT", "Requester already belongs to this team");
        }
        await db.query(
          "insert into team_memberships " +
            "(team_id, profile_id, membership_role, starts_at, ends_at, created_by) " +
            "values ($1, $2, 'member', now(), $3, $4)",
          [before.team_id, before.requester_profile_id, input.accessExpiresAt ?? null, actor],
        );
      }

      await appendAudit(db, {
        actorId: actor,
        targetType: "access_request",
        targetId: input.id,
        action: `access_request.${input.decision}`,
        reason,
        before,
        after,
      });
      return accessRequestFromRow(after);
    });
  }

  async function createWorkDelegation(input: CreateDelegationInput, actor: string) {
    const reason = requireReason(input.reason);
    if (input.delegatorProfileId === input.delegateProfileId) {
      throw new AdminError("VALIDATION_FAILED", "Delegate must be a different profile");
    }
    const startsAt = parseDate(input.startsAt, "startsAt");
    const endsAt = parseDate(input.endsAt, "endsAt");
    if (endsAt <= startsAt) {
      throw new AdminError("VALIDATION_FAILED", "endsAt must be after startsAt");
    }

    return transaction(async (db) => {
      const delegatorLock = await db.query<{ id: string }>(
        "select id from profiles where id = $1 for update",
        [input.delegatorProfileId],
      );
      if (!delegatorLock.rows[0]) throw new AdminError("CONFLICT", "Delegator profile not found");

      const overlaps = await db.query<{ id: string }>(
        `
          select id
          from work_delegations
          where delegator_profile_id = $1
            and status = 'active'
            and starts_at < $3
            and ends_at > $2
          for update
        `,
        [input.delegatorProfileId, input.startsAt, input.endsAt],
      );
      if (overlaps.rows[0]) {
        throw new AdminError("CONFLICT", "Delegation overlaps an active delegation");
      }

      const result = await db.query<Record<string, unknown>>(
        `
          insert into work_delegations (
            delegator_profile_id, delegate_profile_id, starts_at, ends_at, reason
          )
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [input.delegatorProfileId, input.delegateProfileId, input.startsAt, input.endsAt, reason],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Failed to create work delegation");
      await appendAudit(db, {
        actorId: actor,
        targetType: "work_delegation",
        targetId: String(row.id),
        action: "work_delegation.created",
        reason,
        after: row,
      });
      return delegationFromRow(row);
    });
  }

  async function cancelWorkDelegation(id: string, actor: string) {
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from work_delegations where id = $1 for update",
        [id],
      );
      const before = locked.rows[0];
      if (!before || before.status !== "active") {
        throw new AdminError("CONFLICT", "Delegation is no longer active");
      }
      const result = await db.query<Record<string, unknown>>(
        `
          update work_delegations
          set status = 'cancelled'
          where id = $1 and status = 'active'
          returning *
        `,
        [id],
      );
      const after = result.rows[0];
      if (!after) throw new AdminError("CONFLICT", "Delegation is no longer active");
      await appendAudit(db, {
        actorId: actor,
        targetType: "work_delegation",
        targetId: id,
        action: "work_delegation.cancelled",
        before,
        after,
      });
    });
  }

  async function listAdminAuditLogs(filters: AuditFilters = {}): Promise<Paginated<AdminAuditLog>> {
    const page = Math.max(1, Math.trunc(filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 50)));
    const conditions: string[] = [];
    const values: unknown[] = [];

    const add = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace("?", `$${values.length}`));
    };
    if (filters.actorProfileId) add("actor_profile_id = ?", filters.actorProfileId);
    if (filters.targetType) add("target_type = ?", filters.targetType);
    if (filters.targetId) add("target_id = ?", filters.targetId);
    if (filters.action) add("action = ?", filters.action);
    if (filters.severity) add("severity = ?", filters.severity);
    if (filters.from) add("created_at >= ?", filters.from);
    if (filters.to) add("created_at <= ?", filters.to);

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const totalRows = (await query(
      `select count(*)::int as total from admin_audit_logs ${where}`,
      values,
    )) as Array<{ total: number | string }>;
    const offset = (page - 1) * limit;
    const rows = (await query(
      `
        select *
        from admin_audit_logs
        ${where}
        order by created_at desc, id desc
        limit $${values.length + 1} offset $${values.length + 2}
      `,
      [...values, limit, offset],
    )) as Array<Record<string, unknown>>;

    return {
      items: rows.map((row) => ({
        ...(row as AdminAuditLog),
        before_snapshot: redactAuditValue(row.before_snapshot),
        after_snapshot: redactAuditValue(row.after_snapshot),
      })),
      total: Number(totalRows[0]?.total ?? 0),
      page,
      limit,
    };
  }

  return {
    listActiveOverrides,
    listPermissionOverrideHistory,
    listAccessRequests,
    getAccessRequest,
    createPermissionOverride,
    revokePermissionOverride,
    createAccessRequest,
    decideAccessRequest,
    createWorkDelegation,
    cancelWorkDelegation,
    listAdminAuditLogs,
  };
}

const repository = createAdminAccessRepository();

export const listActiveOverrides = repository.listActiveOverrides;
export const listPermissionOverrideHistory = repository.listPermissionOverrideHistory;
export const listAccessRequests = repository.listAccessRequests;
export const getAccessRequest = repository.getAccessRequest;
export const createPermissionOverride = repository.createPermissionOverride;
export const revokePermissionOverride = repository.revokePermissionOverride;
export const createAccessRequest = repository.createAccessRequest;
export const decideAccessRequest = repository.decideAccessRequest;
export const createWorkDelegation = repository.createWorkDelegation;
export const cancelWorkDelegation = repository.cancelWorkDelegation;
export const listAdminAuditLogs = repository.listAdminAuditLogs;

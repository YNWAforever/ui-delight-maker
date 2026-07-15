import { USER_ROLES, type ProfileStatus, type UserRole } from "@/lib/admin/types";
import { AdminError } from "@/lib/admin/errors";
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

export type AdminUserFilters = {
  search?: string;
  role?: UserRole;
  status?: ProfileStatus;
  departmentId?: string;
  teamId?: string;
  page?: number;
  limit?: number;
};

export type AdminUserSummary = {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: ProfileStatus;
  avatarUrl: string | null;
  jobTitle: string | null;
  phone: string | null;
  locale: string;
  timezone: string;
  primaryDepartmentId: string | null;
  managerProfileId: string | null;
  lastActiveAt: string | null;
  sessionInvalidBefore: string | null;
  availabilityStatus: string;
  createdAt: string;
  departmentName: string | null;
  managerName: string | null;
  teamCount: number;
  openTaskCount: number;
};

export type AdminUserDetail = AdminUserSummary & {
  teams?: Array<{
    teamId: string;
    teamName: string;
    membershipRole: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  workload?: UserWorkloadSummary;
};

export type UserWorkloadSummary = {
  openTasks: number;
  assignedLeads: number;
  ownedAccounts: number;
  ownedClients: number;
  ownedQuotes: number;
  ownedJobSheets: number;
};

export type AdminOverview = {
  activeUsers: number;
  invitedUsers: number;
  suspendedUsers: number;
  deactivatedUsers: number;
  pendingInvitations: number;
  managerlessTeams: number;
  expiringOverrides: number;
  pendingAccessRequests: number;
};

export type AdminProfileChanges = {
  name?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  locale?: string;
  timezone?: string;
  primaryDepartmentId?: string | null;
  managerProfileId?: string | null;
};

export type UserStatusAction = "suspend" | "deactivate" | "reactivate";

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

function nullableString(value: unknown) {
  return value == null ? null : String(value);
}

function requiredString(value: unknown) {
  return String(value ?? "");
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function mapUser(row: Record<string, unknown>): AdminUserSummary {
  return {
    id: requiredString(row.id),
    email: nullableString(row.email),
    name: nullableString(row.name),
    role: row.role as UserRole,
    status: row.status as ProfileStatus,
    avatarUrl: nullableString(row.avatar_url),
    jobTitle: nullableString(row.job_title),
    phone: nullableString(row.phone),
    locale: requiredString(row.locale),
    timezone: requiredString(row.timezone),
    primaryDepartmentId: nullableString(row.primary_department_id),
    managerProfileId: nullableString(row.manager_profile_id),
    lastActiveAt: nullableString(row.last_active_at),
    sessionInvalidBefore: nullableString(row.session_invalid_before),
    availabilityStatus: requiredString(row.availability_status),
    createdAt: requiredString(row.created_at),
    departmentName: nullableString(row.department_name),
    managerName: nullableString(row.manager_name),
    teamCount: numberValue(row.team_count),
    openTaskCount: numberValue(row.open_task_count),
  };
}

function requireReason(reason: string) {
  const value = reason.trim();
  if (value.length < 8) {
    throw new AdminError("VALIDATION_FAILED", "A meaningful reason is required");
  }
  return value;
}

function audit(
  db: Queryable,
  actor: string,
  targetId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  return db.query(
    `
      insert into admin_audit_logs (
        actor_profile_id, target_type, target_id, action, before_snapshot, after_snapshot
      )
      values ($1, 'profile', $2, $3, $4::jsonb, $5::jsonb)
    `,
    [actor, targetId, action, JSON.stringify(before ?? null), JSON.stringify(after ?? null)],
  );
}

function buildUserWhere(filters: AdminUserFilters) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    conditions.push(clause.replace("?", "$" + values.length));
  };

  if (filters.search?.trim()) {
    values.push("%" + filters.search.trim() + "%");
    const placeholder = "$" + values.length;
    conditions.push(
      "(p.name ilike " +
        placeholder +
        " or p.email ilike " +
        placeholder +
        " or p.id ilike " +
        placeholder +
        ")",
    );
  }
  if (filters.role) add("p.role = ?", filters.role);
  if (filters.status) add("p.status = ?", filters.status);
  if (filters.departmentId) add("p.primary_department_id = ?", filters.departmentId);
  if (filters.teamId) {
    add(
      "exists (select 1 from team_memberships tm_filter where tm_filter.team_id = ? and tm_filter.profile_id = p.id and (tm_filter.starts_at is null or tm_filter.starts_at <= now()) and (tm_filter.ends_at is null or tm_filter.ends_at > now()))",
      filters.teamId,
    );
  }

  return {
    where: conditions.length ? "where " + conditions.join(" and ") : "",
    values,
  };
}

export function createAdminUsersRepository(dependencies: Dependencies = {}) {
  const query = dependencies.query ?? ((text, values) => runQuery(text, values));
  const transaction = dependencies.transaction ?? runTransaction;

  async function listAdminUsers(
    filters: AdminUserFilters = {},
  ): Promise<Paginated<AdminUserSummary>> {
    const page = Math.max(1, Math.trunc(filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 50)));
    const { where, values } = buildUserWhere(filters);

    const totals = (await query(
      `select count(*)::int as total from profiles p ` + where,
      values,
    )) as Array<{ total: number | string }>;
    const offset = (page - 1) * limit;
    const limitParam = values.length + 1;
    const offsetParam = values.length + 2;
    const rows = (await query(
      `
        select
          p.*,
          d.name as department_name,
          manager.name as manager_name,
          (
            select count(*)::int
            from team_memberships tm
            where tm.profile_id = p.id
              and (tm.starts_at is null or tm.starts_at <= now())
              and (tm.ends_at is null or tm.ends_at > now())
          ) as team_count,
          (
            select count(*)::int
            from tasks t
            where t.assigned_to = p.id and t.status <> 'done'
          ) as open_task_count
        from profiles p
        left join departments d on d.id = p.primary_department_id
        left join profiles manager on manager.id = p.manager_profile_id
      ` +
        (where ? where : "") +
        `
        order by lower(coalesce(p.name, p.email, p.id)), p.id
        limit $` +
        limitParam +
        ` offset $` +
        offsetParam +
        `
      `,
      [...values, limit, offset],
    )) as Record<string, unknown>[];

    return {
      items: rows.map(mapUser),
      total: numberValue(totals[0]?.total),
      page,
      limit,
    };
  }

  async function getAdminOverview(): Promise<AdminOverview> {
    const rows = (await query(
      `
        select
          count(*) filter (where status = 'active')::int as active_users,
          count(*) filter (where status = 'invited')::int as invited_users,
          count(*) filter (where status = 'suspended')::int as suspended_users,
          count(*) filter (where status = 'deactivated')::int as deactivated_users,
          (select count(*)::int from user_invitations where status = 'pending') as pending_invitations,
          (select count(*)::int from teams where status = 'active' and lead_profile_id is null) as managerless_teams,
          (
            select count(*)::int
            from permission_overrides
            where revoked_at is null
              and expires_at > now()
              and expires_at <= now() + interval '30 days'
          ) as expiring_overrides,
          (select count(*)::int from access_requests where status = 'pending') as pending_access_requests
        from profiles
      `,
    )) as Array<Record<string, unknown>>;
    const row = rows[0] ?? {};
    return {
      activeUsers: numberValue(row.active_users),
      invitedUsers: numberValue(row.invited_users),
      suspendedUsers: numberValue(row.suspended_users),
      deactivatedUsers: numberValue(row.deactivated_users),
      pendingInvitations: numberValue(row.pending_invitations),
      managerlessTeams: numberValue(row.managerless_teams),
      expiringOverrides: numberValue(row.expiring_overrides),
      pendingAccessRequests: numberValue(row.pending_access_requests),
    };
  }

  async function getAdminUser(profileId: string): Promise<AdminUserDetail | null> {
    const rows = (await query(
      `
        select
          p.*,
          d.name as department_name,
          manager.name as manager_name,
          (
            select count(*)::int
            from team_memberships tm
            where tm.profile_id = p.id
              and (tm.starts_at is null or tm.starts_at <= now())
              and (tm.ends_at is null or tm.ends_at > now())
          ) as team_count,
          (
            select count(*)::int
            from tasks t
            where t.assigned_to = p.id and t.status <> 'done'
          ) as open_task_count
        from profiles p
        left join departments d on d.id = p.primary_department_id
        left join profiles manager on manager.id = p.manager_profile_id
        where p.id = $1
      `,
      [profileId],
    )) as Record<string, unknown>[];
    const row = rows[0];
    if (!row) return null;

    const teams = (await query(
      `
        select tm.team_id, t.name as team_name, tm.membership_role, tm.starts_at, tm.ends_at
        from team_memberships tm
        join teams t on t.id = tm.team_id
        where tm.profile_id = $1
          and (tm.starts_at is null or tm.starts_at <= now())
          and (tm.ends_at is null or tm.ends_at > now())
        order by lower(t.name), t.id
      `,
      [profileId],
    )) as Record<string, unknown>[];

    const workload = await getUserWorkload(profileId);
    return {
      ...mapUser(row),
      teams: teams.map((team) => ({
        teamId: requiredString(team.team_id),
        teamName: requiredString(team.team_name),
        membershipRole: requiredString(team.membership_role),
        startsAt: nullableString(team.starts_at),
        endsAt: nullableString(team.ends_at),
      })),
      workload,
    };
  }

  async function updateAdminProfile(
    profileId: string,
    changes: AdminProfileChanges,
    actor: string,
  ): Promise<AdminUserDetail> {
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
      const locale = changes.locale ?? requiredString(before.locale);
      const timezone = changes.timezone ?? requiredString(before.timezone);
      const departmentId =
        changes.primaryDepartmentId === undefined
          ? before.primary_department_id
          : changes.primaryDepartmentId;
      const managerId =
        changes.managerProfileId === undefined
          ? before.manager_profile_id
          : changes.managerProfileId;

      const updated = await db.query<Record<string, unknown>>(
        `
          update profiles
          set name = $2, job_title = $3, phone = $4, locale = $5, timezone = $6,
              primary_department_id = $7, manager_profile_id = $8, updated_at = now()
          where id = $1
          returning *
        `,
        [profileId, name, jobTitle, phone, locale, timezone, departmentId, managerId],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to update user profile");
      await audit(db, actor, profileId, "profile.updated", before, after);
      return mapUser(after);
    });
  }

  async function changeUserRole(
    profileId: string,
    role: UserRole,
    reasonInput: string,
    actor: string,
  ): Promise<AdminUserDetail> {
    if (!USER_ROLES.includes(role)) {
      throw new AdminError("VALIDATION_FAILED", "Unknown user role");
    }
    const reason = requireReason(reasonInput);
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from profiles where id = $1 for update",
        [profileId],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "User profile not found");

      if (before.role === "super_admin" && before.status === "active" && role !== "super_admin") {
        const count = await db.query<{ count: number | string }>(
          "select count(*)::int as count from profiles where role = 'super_admin' and status = 'active'",
        );
        if (numberValue(count.rows[0]?.count) <= 1) {
          throw new AdminError("LAST_SUPER_ADMIN", "Cannot remove the last active Super Admin");
        }
      }

      const updated = await db.query<Record<string, unknown>>(
        `
          update profiles
          set role = $2, updated_at = now()
          where id = $1
          returning *
        `,
        [profileId, role],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to change user role");
      await audit(db, actor, profileId, "profile.role_changed", before, after);
      return mapUser(after);
    });
  }

  async function setUserStatus(
    profileId: string,
    action: UserStatusAction,
    reasonInput: string,
    actor: string,
  ): Promise<AdminUserDetail> {
    const reason = requireReason(reasonInput);
    const targetStatus: ProfileStatus =
      action === "reactivate" ? "active" : action === "suspend" ? "suspended" : "deactivated";
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from profiles where id = $1 for update",
        [profileId],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "User profile not found");

      if (
        (action === "suspend" || action === "deactivate") &&
        before.role === "super_admin" &&
        before.status === "active"
      ) {
        const count = await db.query<{ count: number | string }>(
          "select count(*)::int as count from profiles where role = 'super_admin' and status = 'active'",
        );
        if (numberValue(count.rows[0]?.count) <= 1) {
          throw new AdminError("LAST_SUPER_ADMIN", "Cannot deactivate the last active Super Admin");
        }
      }

      const updated = await db.query<Record<string, unknown>>(
        `
          update profiles
          set status = $2,
              session_invalid_before = case when $2 in ('suspended', 'deactivated') then now() else session_invalid_before end,
              suspended_at = case when $2 = 'suspended' then now() else null end,
              suspended_by = case when $2 = 'suspended' then $3 else null end,
              suspension_reason = case when $2 = 'suspended' then $4 else null end,
              deactivated_at = case when $2 = 'deactivated' then now() else null end,
              deactivated_by = case when $2 = 'deactivated' then $3 else null end,
              deactivation_reason = case when $2 = 'deactivated' then $4 else null end,
              updated_at = now()
          where id = $1
          returning *
        `,
        [profileId, targetStatus, actor, reason],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to change user status");
      await audit(db, actor, profileId, "profile.status_" + action, before, after);
      return mapUser(after);
    });
  }

  async function setSessionInvalidBefore(profileId: string, actor: string): Promise<void> {
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from profiles where id = $1 for update",
        [profileId],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "User profile not found");
      const updated = await db.query<Record<string, unknown>>(
        `
          update profiles
          set session_invalid_before = now(), updated_at = now()
          where id = $1
          returning *
        `,
        [profileId],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to invalidate user sessions");
      await audit(db, actor, profileId, "profile.sessions_invalidated", before, after);
    });
  }

  async function getUserWorkload(profileId: string): Promise<UserWorkloadSummary> {
    const rows = (await query(
      `
        select
          (select count(*)::int from tasks where assigned_to = $1 and status <> 'done') as open_tasks,
          (select count(*)::int from leads where assigned_to = $1) as assigned_leads,
          (select count(*)::int from accounts where account_owner = $1 or cs_owner = $1) as owned_accounts,
          (select count(*)::int from clients where account_owner = $1) as owned_clients,
          (select count(*)::int from quotes where created_by = $1) as owned_quotes,
          (select count(*)::int from job_sheets where sales_owner = $1 or accounting_owner = $1) as owned_job_sheets
      `,
      [profileId],
    )) as Array<Record<string, unknown>>;
    const row = rows[0] ?? {};
    return {
      openTasks: numberValue(row.open_tasks),
      assignedLeads: numberValue(row.assigned_leads),
      ownedAccounts: numberValue(row.owned_accounts),
      ownedClients: numberValue(row.owned_clients),
      ownedQuotes: numberValue(row.owned_quotes),
      ownedJobSheets: numberValue(row.owned_job_sheets),
    };
  }

  return {
    listAdminUsers,
    getAdminOverview,
    getAdminUser,
    updateAdminProfile,
    changeUserRole,
    setUserStatus,
    setSessionInvalidBefore,
    getUserWorkload,
  };
}

const repository = createAdminUsersRepository();

export const listAdminUsers = repository.listAdminUsers;
export const getAdminOverview = repository.getAdminOverview;
export const getAdminUser = repository.getAdminUser;
export const updateAdminProfile = repository.updateAdminProfile;
export const changeUserRole = repository.changeUserRole;
export const setUserStatus = repository.setUserStatus;
export const setSessionInvalidBefore = repository.setSessionInvalidBefore;
export const getUserWorkload = repository.getUserWorkload;

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

type UnitStatus = "active" | "archived";
type MembershipRole = "lead" | "deputy" | "member";

export type Department = {
  id: string;
  name: string;
  description: string | null;
  headProfileId: string | null;
  deputyProfileId: string | null;
  status: UnitStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Team = {
  id: string;
  name: string;
  purpose: string | null;
  leadProfileId: string | null;
  deputyProfileId: string | null;
  defaultOwnerProfileId: string | null;
  status: UnitStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamMembership = {
  id: string;
  teamId: string;
  profileId: string;
  membershipRole: MembershipRole;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationDirectory = {
  departments: Department[];
  teams: Team[];
  memberships: TeamMembership[];
};

export type OrganizationUnitDetail =
  | { kind: "department"; unit: Department; memberships: TeamMembership[] }
  | { kind: "team"; unit: Team; memberships: TeamMembership[] };

export type DepartmentInput = {
  name: string;
  description?: string | null;
  headProfileId?: string | null;
  deputyProfileId?: string | null;
  status?: UnitStatus;
};

export type TeamInput = {
  name: string;
  purpose?: string | null;
  leadProfileId?: string | null;
  deputyProfileId?: string | null;
  defaultOwnerProfileId?: string | null;
  status?: UnitStatus;
};

export type TeamMembershipInput = {
  teamId: string;
  profileId: string;
  membershipRole: MembershipRole;
  startsAt?: string | null;
  endsAt?: string | null;
};

function nullableString(value: unknown) {
  return value == null ? null : String(value);
}

function requiredString(value: unknown) {
  return String(value ?? "");
}

function mapDepartment(row: Record<string, unknown>): Department {
  return {
    id: requiredString(row.id),
    name: requiredString(row.name),
    description: nullableString(row.description),
    headProfileId: nullableString(row.head_profile_id),
    deputyProfileId: nullableString(row.deputy_profile_id),
    status: row.status as UnitStatus,
    createdBy: nullableString(row.created_by),
    updatedBy: nullableString(row.updated_by),
    createdAt: requiredString(row.created_at),
    updatedAt: requiredString(row.updated_at),
  };
}

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: requiredString(row.id),
    name: requiredString(row.name),
    purpose: nullableString(row.purpose),
    leadProfileId: nullableString(row.lead_profile_id),
    deputyProfileId: nullableString(row.deputy_profile_id),
    defaultOwnerProfileId: nullableString(row.default_owner_profile_id),
    status: row.status as UnitStatus,
    createdBy: nullableString(row.created_by),
    updatedBy: nullableString(row.updated_by),
    createdAt: requiredString(row.created_at),
    updatedAt: requiredString(row.updated_at),
  };
}

function mapMembership(row: Record<string, unknown>): TeamMembership {
  return {
    id: requiredString(row.id),
    teamId: requiredString(row.team_id),
    profileId: requiredString(row.profile_id),
    membershipRole: row.membership_role as MembershipRole,
    startsAt: nullableString(row.starts_at),
    endsAt: nullableString(row.ends_at),
    createdBy: nullableString(row.created_by),
    createdAt: requiredString(row.created_at),
    updatedAt: requiredString(row.updated_at),
  };
}

function requireName(name: string) {
  const value = name.trim();
  if (!value) throw new AdminError("VALIDATION_FAILED", "Organization unit name is required");
  return value;
}

function validateMembershipWindow(startsAt: string | null, endsAt: string | null) {
  if (!startsAt || !endsAt) return;
  const starts = Date.parse(startsAt);
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
    throw new AdminError("VALIDATION_FAILED", "Membership end must be after its start");
  }
}

async function appendAudit(
  db: Queryable,
  input: {
    actorId: string;
    targetType: string;
    targetId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await db.query(
    `
      insert into admin_audit_logs (
        actor_profile_id, target_type, target_id, action, before_snapshot, after_snapshot
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [
      input.actorId,
      input.targetType,
      input.targetId,
      input.action,
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null),
    ],
  );
}

export function createAdminTeamsRepository(dependencies: Dependencies = {}) {
  const query = dependencies.query ?? ((text, values) => runQuery(text, values));
  const transaction = dependencies.transaction ?? runTransaction;

  async function listDepartmentsAndTeams(): Promise<OrganizationDirectory> {
    const departments = (await query(
      `
        select *
        from departments
        order by case when status = 'active' then 0 else 1 end, lower(name), id
      `,
    )) as Record<string, unknown>[];
    const teams = (await query(
      `
        select *
        from teams
        order by case when status = 'active' then 0 else 1 end, lower(name), id
      `,
    )) as Record<string, unknown>[];
    const memberships = (await query(
      `
        select *
        from team_memberships
        where (starts_at is null or starts_at <= now())
          and (ends_at is null or ends_at > now())
        order by team_id, profile_id, id
      `,
    )) as Record<string, unknown>[];

    return {
      departments: departments.map(mapDepartment),
      teams: teams.map(mapTeam),
      memberships: memberships.map(mapMembership),
    };
  }

  async function getOrganizationUnit(
    kind: "department" | "team",
    id: string,
  ): Promise<OrganizationUnitDetail | null> {
    if (kind === "department") {
      const rows = (await query("select * from departments where id = $1", [id])) as Record<
        string,
        unknown
      >[];
      const row = rows[0];
      return row ? { kind, unit: mapDepartment(row), memberships: [] } : null;
    }

    const rows = (await query("select * from teams where id = $1", [id])) as Record<
      string,
      unknown
    >[];
    const row = rows[0];
    if (!row) return null;
    const memberships = (await query(
      `
        select *
        from team_memberships
        where team_id = $1
          and (starts_at is null or starts_at <= now())
          and (ends_at is null or ends_at > now())
        order by profile_id, id
      `,
      [id],
    )) as Record<string, unknown>[];
    return { kind, unit: mapTeam(row), memberships: memberships.map(mapMembership) };
  }

  async function createDepartment(input: DepartmentInput, actor: string) {
    const name = requireName(input.name);
    return transaction(async (db) => {
      const inserted = await db.query<Record<string, unknown>>(
        `
          insert into departments (
            name, description, head_profile_id, deputy_profile_id, status, created_by, updated_by
          )
          values ($1, $2, $3, $4, $5, $6, $6)
          returning *
        `,
        [
          name,
          input.description?.trim() || null,
          input.headProfileId ?? null,
          input.deputyProfileId ?? null,
          input.status ?? "active",
          actor,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Failed to create department");
      await appendAudit(db, {
        actorId: actor,
        targetType: "department",
        targetId: requiredString(row.id),
        action: "department.created",
        after: row,
      });
      return mapDepartment(row);
    });
  }

  async function updateDepartment(id: string, input: DepartmentInput, actor: string) {
    const name = requireName(input.name);
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from departments where id = $1 for update",
        [id],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("NOT_FOUND", "Department not found");

      const updated = await db.query<Record<string, unknown>>(
        `
          update departments
          set name = $2, description = $3, head_profile_id = $4,
              deputy_profile_id = $5, status = $6, updated_by = $7, updated_at = now()
          where id = $1
          returning *
        `,
        [
          id,
          name,
          input.description?.trim() || null,
          input.headProfileId ?? null,
          input.deputyProfileId ?? null,
          input.status ?? before.status,
          actor,
        ],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to update department");
      await appendAudit(db, {
        actorId: actor,
        targetType: "department",
        targetId: id,
        action: "department.updated",
        before,
        after,
      });
      return mapDepartment(after);
    });
  }

  async function createTeam(input: TeamInput, actor: string) {
    const name = requireName(input.name);
    return transaction(async (db) => {
      const inserted = await db.query<Record<string, unknown>>(
        `
          insert into teams (
            name, purpose, lead_profile_id, deputy_profile_id,
            default_owner_profile_id, status, created_by, updated_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $7)
          returning *
        `,
        [
          name,
          input.purpose?.trim() || null,
          input.leadProfileId ?? null,
          input.deputyProfileId ?? null,
          input.defaultOwnerProfileId ?? null,
          input.status ?? "active",
          actor,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Failed to create team");
      await appendAudit(db, {
        actorId: actor,
        targetType: "team",
        targetId: requiredString(row.id),
        action: "team.created",
        after: row,
      });
      return mapTeam(row);
    });
  }

  async function updateTeam(id: string, input: TeamInput, actor: string) {
    const name = requireName(input.name);
    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        "select * from teams where id = $1 for update",
        [id],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("NOT_FOUND", "Team not found");

      const updated = await db.query<Record<string, unknown>>(
        `
          update teams
          set name = $2, purpose = $3, lead_profile_id = $4,
              deputy_profile_id = $5, default_owner_profile_id = $6,
              status = $7, updated_by = $8, updated_at = now()
          where id = $1
          returning *
        `,
        [
          id,
          name,
          input.purpose?.trim() || null,
          input.leadProfileId ?? null,
          input.deputyProfileId ?? null,
          input.defaultOwnerProfileId ?? null,
          input.status ?? before.status,
          actor,
        ],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Failed to update team");
      await appendAudit(db, {
        actorId: actor,
        targetType: "team",
        targetId: id,
        action: "team.updated",
        before,
        after,
      });
      return mapTeam(after);
    });
  }

  async function upsertTeamMembership(input: TeamMembershipInput, actor: string) {
    const startsAt = input.startsAt ?? null;
    const endsAt = input.endsAt ?? null;
    validateMembershipWindow(startsAt, endsAt);

    return transaction(async (db) => {
      const overlaps = await db.query<Record<string, unknown>>(
        `
          select *
          from team_memberships
          where team_id = $1
            and profile_id = $2
            and (starts_at is null or $4::timestamptz is null or starts_at < $4::timestamptz)
            and (ends_at is null or $3::timestamptz is null or ends_at > $3::timestamptz)
          for update
        `,
        [input.teamId, input.profileId, startsAt, endsAt],
      );
      const existing = overlaps.rows[0];
      if (existing && existing.ends_at !== null) {
        throw new AdminError("CONFLICT", "Team membership overlaps an existing membership");
      }

      const result = existing
        ? await db.query<Record<string, unknown>>(
            `
              update team_memberships
              set membership_role = $2, starts_at = $3, ends_at = $4, updated_at = now()
              where id = $1
              returning *
            `,
            [existing.id, input.membershipRole, startsAt, endsAt],
          )
        : await db.query<Record<string, unknown>>(
            `
              insert into team_memberships (
                team_id, profile_id, membership_role, starts_at, ends_at, created_by
              )
              values ($1, $2, $3, $4, $5, $6)
              returning *
            `,
            [input.teamId, input.profileId, input.membershipRole, startsAt, endsAt, actor],
          );
      const after = result.rows[0];
      if (!after) throw new Error("Failed to save team membership");
      await appendAudit(db, {
        actorId: actor,
        targetType: "team_membership",
        targetId: requiredString(after.id),
        action: existing ? "team_membership.updated" : "team_membership.created",
        before: existing,
        after,
      });
      return mapMembership(after);
    });
  }

  async function endTeamMembership(
    teamId: string,
    profileId: string,
    endedAt: string,
    actor: string,
  ) {
    const endedTimestamp = Date.parse(endedAt);
    if (!Number.isFinite(endedTimestamp)) {
      throw new AdminError("VALIDATION_FAILED", "Membership end must be a valid date");
    }

    return transaction(async (db) => {
      const locked = await db.query<Record<string, unknown>>(
        `
          select *
          from team_memberships
          where team_id = $1 and profile_id = $2 and ends_at is null
          for update
        `,
        [teamId, profileId],
      );
      const before = locked.rows[0];
      if (!before) throw new AdminError("CONFLICT", "Team membership is already ended");

      const updated = await db.query<Record<string, unknown>>(
        `
          update team_memberships
          set ends_at = $3, updated_at = now()
          where team_id = $1 and profile_id = $2 and ends_at is null
          returning *
        `,
        [teamId, profileId, endedAt],
      );
      const after = updated.rows[0];
      if (!after) throw new AdminError("CONFLICT", "Team membership is already ended");
      await appendAudit(db, {
        actorId: actor,
        targetType: "team_membership",
        targetId: requiredString(after.id),
        action: "team_membership.ended",
        before,
        after,
      });
    });
  }

  return {
    listDepartmentsAndTeams,
    getOrganizationUnit,
    createDepartment,
    updateDepartment,
    createTeam,
    updateTeam,
    upsertTeamMembership,
    endTeamMembership,
  };
}

const repository = createAdminTeamsRepository();

export const listDepartmentsAndTeams = repository.listDepartmentsAndTeams;
export const getOrganizationUnit = repository.getOrganizationUnit;
export const createDepartment = repository.createDepartment;
export const updateDepartment = repository.updateDepartment;
export const createTeam = repository.createTeam;
export const updateTeam = repository.updateTeam;
export const upsertTeamMembership = repository.upsertTeamMembership;
export const endTeamMembership = repository.endTeamMembership;

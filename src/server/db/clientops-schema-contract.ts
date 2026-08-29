import type { Queryable } from "./neon.server";

export type DatabaseMismatchCategory =
  | "missing_relation"
  | "missing_column"
  | "incompatible_type"
  | "invalid_nullability"
  | "missing_default"
  | "missing_constraint"
  | "missing_index"
  | "missing_trigger"
  | "migration_order_error";

export type DatabaseContractMismatch = {
  category: DatabaseMismatchCategory;
  object: string;
  expected?: string;
  actual?: string;
};

export type DatabaseReadinessResult =
  | { ready: true; checkedAt: string; contractVersion: "2026-07-15" }
  | {
      ready: false;
      checkedAt: string;
      contractVersion: "2026-07-15";
      mismatches: DatabaseContractMismatch[];
    };

const ADMIN_SCHEMA_COLUMNS = {
  "departments.id": { type: "uuid", nullable: false },
  "departments.name": { type: "text", nullable: false },
  "departments.description": { type: "text", nullable: true },
  "departments.head_profile_id": { type: "text", nullable: true },
  "departments.deputy_profile_id": { type: "text", nullable: true },
  "departments.status": { type: "text", nullable: false },
  "departments.created_by": { type: "text", nullable: true },
  "departments.updated_by": { type: "text", nullable: true },
  "departments.created_at": { type: "timestamp with time zone", nullable: false },
  "departments.updated_at": { type: "timestamp with time zone", nullable: false },
  "teams.id": { type: "uuid", nullable: false },
  "teams.name": { type: "text", nullable: false },
  "teams.purpose": { type: "text", nullable: true },
  "teams.lead_profile_id": { type: "text", nullable: true },
  "teams.deputy_profile_id": { type: "text", nullable: true },
  "teams.default_owner_profile_id": { type: "text", nullable: true },
  "teams.status": { type: "text", nullable: false },
  "teams.created_by": { type: "text", nullable: true },
  "teams.updated_by": { type: "text", nullable: true },
  "teams.created_at": { type: "timestamp with time zone", nullable: false },
  "teams.updated_at": { type: "timestamp with time zone", nullable: false },
  "team_memberships.id": { type: "uuid", nullable: false },
  "team_memberships.team_id": { type: "uuid", nullable: false },
  "team_memberships.profile_id": { type: "text", nullable: false },
  "team_memberships.membership_role": { type: "text", nullable: false },
  "team_memberships.starts_at": { type: "timestamp with time zone", nullable: true },
  "team_memberships.ends_at": { type: "timestamp with time zone", nullable: true },
  "team_memberships.created_by": { type: "text", nullable: true },
  "team_memberships.created_at": { type: "timestamp with time zone", nullable: false },
  "team_memberships.updated_at": { type: "timestamp with time zone", nullable: false },
  "user_invitations.id": { type: "uuid", nullable: false },
  "user_invitations.email": { type: "text", nullable: false },
  "user_invitations.token_hash": { type: "text", nullable: false },
  "user_invitations.intended_role": { type: "text", nullable: false },
  "user_invitations.primary_department_id": { type: "uuid", nullable: true },
  "user_invitations.manager_profile_id": { type: "text", nullable: true },
  "user_invitations.initial_team_ids": { type: "ARRAY", nullable: false },
  "user_invitations.status": { type: "text", nullable: false },
  "user_invitations.invited_by": { type: "text", nullable: false },
  "user_invitations.expires_at": { type: "timestamp with time zone", nullable: false },
  "user_invitations.accepted_at": { type: "timestamp with time zone", nullable: true },
  "user_invitations.accepted_profile_id": { type: "text", nullable: true },
  "user_invitations.revoked_at": { type: "timestamp with time zone", nullable: true },
  "user_invitations.revoked_by": { type: "text", nullable: true },
  "user_invitations.created_at": { type: "timestamp with time zone", nullable: false },
  "user_invitations.updated_at": { type: "timestamp with time zone", nullable: false },
  "permission_overrides.id": { type: "uuid", nullable: false },
  "permission_overrides.profile_id": { type: "text", nullable: false },
  "permission_overrides.capability": { type: "text", nullable: false },
  "permission_overrides.effect": { type: "text", nullable: false },
  "permission_overrides.department_id": { type: "uuid", nullable: true },
  "permission_overrides.team_id": { type: "uuid", nullable: true },
  "permission_overrides.resource_type": { type: "text", nullable: true },
  "permission_overrides.resource_id": { type: "text", nullable: true },
  "permission_overrides.reason": { type: "text", nullable: false },
  "permission_overrides.granted_by": { type: "text", nullable: false },
  "permission_overrides.expires_at": { type: "timestamp with time zone", nullable: true },
  "permission_overrides.revoked_at": { type: "timestamp with time zone", nullable: true },
  "permission_overrides.revoked_by": { type: "text", nullable: true },
  "permission_overrides.created_at": { type: "timestamp with time zone", nullable: false },
  "access_requests.id": { type: "uuid", nullable: false },
  "access_requests.requester_profile_id": { type: "text", nullable: false },
  "access_requests.request_type": { type: "text", nullable: false },
  "access_requests.capability": { type: "text", nullable: true },
  "access_requests.team_id": { type: "uuid", nullable: true },
  "access_requests.reason": { type: "text", nullable: false },
  "access_requests.status": { type: "text", nullable: false },
  "access_requests.decided_by": { type: "text", nullable: true },
  "access_requests.decision_reason": { type: "text", nullable: true },
  "access_requests.decided_at": { type: "timestamp with time zone", nullable: true },
  "access_requests.access_expires_at": { type: "timestamp with time zone", nullable: true },
  "access_requests.created_at": { type: "timestamp with time zone", nullable: false },
  "access_requests.updated_at": { type: "timestamp with time zone", nullable: false },
  "work_delegations.id": { type: "uuid", nullable: false },
  "work_delegations.delegator_profile_id": { type: "text", nullable: false },
  "work_delegations.delegate_profile_id": { type: "text", nullable: false },
  "work_delegations.starts_at": { type: "timestamp with time zone", nullable: false },
  "work_delegations.ends_at": { type: "timestamp with time zone", nullable: false },
  "work_delegations.reason": { type: "text", nullable: false },
  "work_delegations.status": { type: "text", nullable: false },
  "work_delegations.created_at": { type: "timestamp with time zone", nullable: false },
  "admin_audit_logs.id": { type: "uuid", nullable: false },
  "admin_audit_logs.actor_profile_id": { type: "text", nullable: true },
  "admin_audit_logs.target_type": { type: "text", nullable: false },
  "admin_audit_logs.target_id": { type: "text", nullable: true },
  "admin_audit_logs.action": { type: "text", nullable: false },
  "admin_audit_logs.severity": { type: "text", nullable: false },
  "admin_audit_logs.reason": { type: "text", nullable: true },
  "admin_audit_logs.before_snapshot": { type: "jsonb", nullable: true },
  "admin_audit_logs.after_snapshot": { type: "jsonb", nullable: true },
  "admin_audit_logs.request_id": { type: "text", nullable: true },
  "admin_audit_logs.session_id": { type: "text", nullable: true },
  "admin_audit_logs.ip_address": { type: "inet", nullable: true },
  "admin_audit_logs.created_at": { type: "timestamp with time zone", nullable: false },
} as const;
export const CLIENTOPS_SCHEMA_CONTRACT = {
  relations: [
    "accounts",
    "account_contacts",
    "clients",
    "leads",
    "quotes",
    "tasks",
    "activity_logs",
    "human_approvals",
    "agent_runs",
    "campaign_members",
    "relationship_signals",
    "engagements",
    "touchpoints",
    "job_sheets",
    "departments",
    "teams",
    "team_memberships",
    "user_invitations",
    "permission_overrides",
    "access_requests",
    "work_delegations",
    "admin_audit_logs",
    "agent_policy_versions",
  ] as const,
  columns: {
    "accounts.id": { type: "uuid", nullable: false },
    "account_contacts.account_id": { type: "uuid", nullable: false },
    "clients.account_id": { type: "uuid", nullable: true },
    "leads.account_id": { type: "uuid", nullable: true },
    "quotes.account_id": { type: "uuid", nullable: true },
    "tasks.account_id": { type: "uuid", nullable: true },
    "activity_logs.object_id": { type: "uuid", nullable: true },
    "activity_logs.diff_data": { type: "jsonb", nullable: true },
    "human_approvals.context_data": { type: "jsonb", nullable: true },
    "job_sheets.account_id": { type: "uuid", nullable: true },
    "profiles.status": { type: "text", nullable: false },
    "profiles.primary_department_id": { type: "uuid", nullable: true },
    "profiles.manager_profile_id": { type: "text", nullable: true },
    "profiles.session_invalid_before": {
      type: "timestamp with time zone",
      nullable: true,
    },
    "agent_policy_versions.id": { type: "uuid", nullable: false },
    "agent_policy_versions.workflow_type": { type: "text", nullable: false },
    "agent_policy_versions.status": { type: "text", nullable: false },
    "agent_policy_versions.human_approval": { type: "boolean", nullable: false },
    "agent_policy_versions.changed_by": { type: "text", nullable: false },
    "agent_policy_versions.reason": { type: "text", nullable: true },
    "agent_policy_versions.created_at": {
      type: "timestamp with time zone",
      nullable: false,
    },
    "agent_policy_versions.version_seq": { type: "bigint", nullable: false },
    ...ADMIN_SCHEMA_COLUMNS,
  },
  constraints: [
    "account_contacts_account_id_fkey",
    "relationship_signals_account_id_fkey",
    "profiles_role_check",
    "profiles_status_check",
    "profiles_availability_status_check",
    "departments_status_check",
    "teams_status_check",
    "team_memberships_membership_role_check",
    "user_invitations_intended_role_check",
    "user_invitations_status_check",
    "permission_overrides_effect_check",
    "permission_overrides_reason_check",
    "access_requests_request_type_check",
    "access_requests_reason_check",
    "access_requests_status_check",
    "work_delegations_status_check",
    "admin_audit_logs_severity_check",
    "profiles_suspended_by_fkey",
    "profiles_deactivated_by_fkey",
    "profiles_primary_department_id_fkey",
    "profiles_manager_profile_id_fkey",
    "departments_head_profile_id_fkey",
    "departments_deputy_profile_id_fkey",
    "departments_created_by_fkey",
    "departments_updated_by_fkey",
    "teams_lead_profile_id_fkey",
    "teams_deputy_profile_id_fkey",
    "teams_default_owner_profile_id_fkey",
    "teams_created_by_fkey",
    "teams_updated_by_fkey",
    "team_memberships_team_id_fkey",
    "team_memberships_profile_id_fkey",
    "team_memberships_created_by_fkey",
    "team_memberships_check",
    "user_invitations_primary_department_id_fkey",
    "user_invitations_manager_profile_id_fkey",
    "user_invitations_invited_by_fkey",
    "user_invitations_accepted_profile_id_fkey",
    "user_invitations_revoked_by_fkey",
    "permission_overrides_profile_id_fkey",
    "permission_overrides_department_id_fkey",
    "permission_overrides_team_id_fkey",
    "permission_overrides_granted_by_fkey",
    "permission_overrides_revoked_by_fkey",
    "access_requests_requester_profile_id_fkey",
    "access_requests_team_id_fkey",
    "access_requests_decided_by_fkey",
    "access_requests_check",
    "work_delegations_delegator_profile_id_fkey",
    "work_delegations_delegate_profile_id_fkey",
    "work_delegations_check",
    "work_delegations_check1",
    "admin_audit_logs_actor_profile_id_fkey",
    "agent_policy_versions_status_check",
    "agent_policy_versions_changed_by_fkey",
  ] as const,
  indexes: [
    "accounts_last_activity_idx",
    "account_contacts_account_id_idx",
    "clients_account_id_idx",
    "leads_account_id_idx",
    "quotes_account_id_idx",
    "tasks_account_id_idx",
    "activity_logs_object_idx",
    "relationship_signals_account_idx",
    "job_sheets_account_id_idx",
    "profiles_department_idx",
    "profiles_manager_idx",
    "profiles_status_role_idx",
    "team_memberships_profile_idx",
    "permission_overrides_profile_idx",
    "access_requests_status_idx",
    "admin_audit_target_idx",
    "admin_audit_actor_idx",
    "departments_active_name_uidx",
    "teams_active_name_uidx",
    "team_memberships_active_uidx",
    "user_invitations_pending_email_uidx",
    "agent_policy_versions_current_idx",
  ] as const,
  triggers: {
    admin_audit_logs_immutable: ["DELETE", "UPDATE"],
    agent_policy_versions_immutable: ["DELETE", "UPDATE"],
  } as const,
} as const;

type SchemaContract = typeof CLIENTOPS_SCHEMA_CONTRACT;

async function inspectContract(
  db: Queryable,
  contract: SchemaContract,
): Promise<DatabaseContractMismatch[]> {
  const [relations, columns, constraints, indexes, triggers] = await Promise.all([
    db.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
      `,
      [contract.relations],
    ),
    db.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `
        select table_name, column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and (table_name || '.' || column_name) = any($1::text[])
      `,
      [Object.keys(contract.columns)],
    ),
    db.query<{ constraint_name: string }>(
      `
        select con.conname as constraint_name
        from pg_catalog.pg_constraint con
        join pg_catalog.pg_namespace namespace on namespace.oid = con.connamespace
        where namespace.nspname = 'public'
          and con.conname = any($1::text[])
      `,
      [contract.constraints],
    ),
    db.query<{ indexname: string }>(
      `
        select indexname
        from pg_catalog.pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
      `,
      [contract.indexes],
    ),
    db.query<{ trigger_name: string; event_manipulation: string }>(
      "select trigger_name, event_manipulation from information_schema.triggers where trigger_schema = 'public' and trigger_name = any($1::text[])",
      [Object.keys(contract.triggers)],
    ),
  ]);

  const mismatches: DatabaseContractMismatch[] = [];
  const existingRelations = new Set(relations.rows.map((row) => row.table_name));
  for (const relation of contract.relations) {
    if (!existingRelations.has(relation)) {
      mismatches.push({ category: "missing_relation", object: `public.${relation}` });
    }
  }

  const existingColumns = new Map(
    columns.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
  );
  for (const [column, expected] of Object.entries(contract.columns)) {
    const actual = existingColumns.get(column);
    const object = `public.${column}`;

    if (!actual) {
      mismatches.push({ category: "missing_column", object });
      continue;
    }

    if (actual.data_type !== expected.type) {
      mismatches.push({
        category: "incompatible_type",
        object,
        expected: expected.type,
        actual: actual.data_type,
      });
    }

    const nullable = actual.is_nullable === "YES";
    if (nullable !== expected.nullable) {
      mismatches.push({
        category: "invalid_nullability",
        object,
        expected: expected.nullable ? "nullable" : "not null",
        actual: nullable ? "nullable" : "not null",
      });
    }
  }

  const existingConstraints = new Set(constraints.rows.map((row) => row.constraint_name));
  for (const constraint of contract.constraints) {
    if (!existingConstraints.has(constraint)) {
      mismatches.push({ category: "missing_constraint", object: constraint });
    }
  }

  const existingIndexes = new Set(indexes.rows.map((row) => row.indexname));
  for (const index of contract.indexes) {
    if (!existingIndexes.has(index)) {
      mismatches.push({ category: "missing_index", object: index });
    }
  }

  const existingTriggerEvents = new Map<string, Set<string>>();
  for (const row of triggers.rows) {
    const events = existingTriggerEvents.get(row.trigger_name) ?? new Set<string>();
    events.add(row.event_manipulation);
    existingTriggerEvents.set(row.trigger_name, events);
  }
  for (const [trigger, expectedEvents] of Object.entries(contract.triggers)) {
    const actualEvents = existingTriggerEvents.get(trigger) ?? new Set<string>();
    for (const event of expectedEvents) {
      if (!actualEvents.has(event)) {
        mismatches.push({
          category: "missing_trigger",
          object: trigger,
          expected: event,
        });
      }
    }
  }

  return mismatches;
}

export async function verifyClientOpsDatabase(db: Queryable): Promise<DatabaseReadinessResult> {
  const checkedAt = new Date().toISOString();
  const mismatches = await inspectContract(db, CLIENTOPS_SCHEMA_CONTRACT);

  return mismatches.length === 0
    ? { ready: true, checkedAt, contractVersion: "2026-07-15" }
    : { ready: false, checkedAt, contractVersion: "2026-07-15", mismatches };
}

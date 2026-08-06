type Env = Record<string, string | undefined>;

type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export const CLIENTOPS_MIGRATION_PATHS = [
  "neon/migrations/001_clientops_runtime.sql",
  "neon/migrations/002_retention_client_360.sql",
  "neon/migrations/003_client_relationship_360.sql",
  "neon/migrations/004_clientops_schema_hardening.sql",
  "neon/migrations/005_quote_to_cash_accounting_handoff.sql",
  "neon/migrations/006_unified_crm_workspace_foundation.sql",
  "neon/migrations/007_admin_team_user_management.sql",
  "neon/migrations/008_read_path_indexes.sql",
] as const;

export const CLIENTOPS_REQUIRED_TABLES = [
  "profiles",
  "leads",
  "clients",
  "quotes",
  "quote_templates",
  "pdf_templates",
  "quote_line_items",
  "quote_versions",
  "job_sheets",
  "job_sheet_portions",
  "job_sheet_activity",
  "tasks",
  "pricing_templates",
  "agent_runs",
  "agent_tool_calls",
  "human_approvals",
  "activity_logs",
  "products",
  "client_contacts",
  "engagements",
  "touchpoints",
  "notifications",
  "accounts",
  "account_contacts",
  "campaigns",
  "campaign_members",
  "relationship_signals",
  "workspace_views",
  "workspace_favorites",
  "departments",
  "teams",
  "team_memberships",
  "user_invitations",
  "permission_overrides",
  "access_requests",
  "work_delegations",
  "admin_audit_logs",
] as const;

export const CLIENTOPS_REQUIRED_COLUMNS = [
  "profiles.status",
  "profiles.primary_department_id",
  "profiles.manager_profile_id",
  "profiles.session_invalid_before",
  "leads.contact_id",
  "leads.account_id",
  "leads.source_campaign_id",
  "leads.campaign_member_id",
  "clients.account_id",
  "clients.primary_contact_id",
  "quotes.contact_id",
  "quotes.account_id",
  "quotes.deal_id",
  "quotes.quote_template_id",
  "quotes.accepted_version_id",
  "quotes.issued_version_id",
  "quotes.document_sections",
  "quotes.cover_text",
  "quotes.assumptions",
  "quotes.payment_terms",
  "quotes.accepted_at",
  "quotes.accepted_by",
  "quotes.parent_quote_id",
  "quotes.change_order_reason",
  "quote_line_items.quote_id",
  "quote_versions.quote_id",
  "job_sheets.quote_id",
  "job_sheets.accepted_quote_version_id",
  "job_sheet_portions.job_sheet_id",
  "job_sheet_activity.job_sheet_id",
  "tasks.contact_id",
  "tasks.account_id",
  "tasks.deal_id",
  "tasks.project_id",
  "engagements.lead_id",
  "engagements.quote_id",
  "touchpoints.contact_id",
] as const;

export type RelationshipSchemaMigrationDecision =
  | {
      shouldApply: false;
      reason: string;
    }
  | {
      shouldApply: true;
      databaseUrl: string;
      migrationPaths: readonly string[];
    };

export function getClientOpsSchemaMigrationDecision(env: Env): RelationshipSchemaMigrationDecision {
  if (!env.DATABASE_URL) {
    return {
      shouldApply: false,
      reason: "DATABASE_URL is not set",
    };
  }

  return {
    shouldApply: true,
    databaseUrl: env.DATABASE_URL,
    migrationPaths: CLIENTOPS_MIGRATION_PATHS,
  };
}

export async function applyClientOpsSchemaMigrations(input: {
  db: Queryable;
  migrationSqls: string[];
}) {
  if (input.migrationSqls.length !== CLIENTOPS_MIGRATION_PATHS.length) {
    throw new Error(
      `ClientOps schema migration expected ${CLIENTOPS_MIGRATION_PATHS.length} SQL files, received ${input.migrationSqls.length}`,
    );
  }

  for (const migrationSql of input.migrationSqls) {
    if (migrationSql.trim()) {
      await input.db.query(migrationSql);
    }
  }

  const tableResult = await input.db.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [CLIENTOPS_REQUIRED_TABLES],
  );
  const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = CLIENTOPS_REQUIRED_TABLES.filter((table) => !existingTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(
      `ClientOps schema migration missing required tables: ${missingTables.join(", ")}`,
    );
  }

  const columnResult = await input.db.query<{ table_name: string; column_name: string }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and (table_name || '.' || column_name) = any($1::text[])
    `,
    [CLIENTOPS_REQUIRED_COLUMNS],
  );
  const existingColumns = new Set(
    columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const missingColumns = CLIENTOPS_REQUIRED_COLUMNS.filter(
    (column) => !existingColumns.has(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `ClientOps schema migration missing required columns: ${missingColumns.join(", ")}`,
    );
  }
}

export const getRelationshipSchemaMigrationDecision = getClientOpsSchemaMigrationDecision;
export const applyRelationshipSchemaMigration = applyClientOpsSchemaMigrations;

export {
  CLIENTOPS_SCHEMA_CONTRACT,
  verifyClientOpsDatabase,
  type DatabaseContractMismatch,
  type DatabaseReadinessResult,
} from "@/server/db/clientops-schema-contract";

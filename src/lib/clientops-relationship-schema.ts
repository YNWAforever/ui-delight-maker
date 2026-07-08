type Env = Record<string, string | undefined>;

type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export const CLIENTOPS_MIGRATION_PATHS = [
  "neon/migrations/001_clientops_runtime.sql",
  "neon/migrations/002_retention_client_360.sql",
  "neon/migrations/003_client_relationship_360.sql",
  "neon/migrations/004_clientops_schema_hardening.sql",
] as const;

export const CLIENTOPS_REQUIRED_TABLES = [
  "profiles",
  "leads",
  "clients",
  "quotes",
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
] as const;

export const CLIENTOPS_REQUIRED_COLUMNS = [
  "leads.contact_id",
  "leads.account_id",
  "leads.source_campaign_id",
  "leads.campaign_member_id",
  "clients.account_id",
  "clients.primary_contact_id",
  "quotes.contact_id",
  "quotes.account_id",
  "quotes.deal_id",
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

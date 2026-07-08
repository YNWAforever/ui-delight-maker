type Env = Record<string, string | undefined>;

type Queryable = {
  query<T = unknown>(text: string): Promise<{ rows: T[] }>;
};

export const CLIENT_RELATIONSHIP_MIGRATION_PATH =
  "neon/migrations/003_client_relationship_360.sql";

export type RelationshipSchemaMigrationDecision =
  | {
      shouldApply: false;
      reason: string;
    }
  | {
      shouldApply: true;
      databaseUrl: string;
      migrationPath: string;
    };

export function getRelationshipSchemaMigrationDecision(
  env: Env,
): RelationshipSchemaMigrationDecision {
  if (!env.DATABASE_URL) {
    return {
      shouldApply: false,
      reason: "DATABASE_URL is not set",
    };
  }

  return {
    shouldApply: true,
    databaseUrl: env.DATABASE_URL,
    migrationPath: CLIENT_RELATIONSHIP_MIGRATION_PATH,
  };
}

export async function applyRelationshipSchemaMigration(input: {
  db: Queryable;
  migrationSql: string;
}) {
  await input.db.query(input.migrationSql);

  const result = await input.db.query<{ accounts_table: string | null }>(
    "select to_regclass('public.accounts')::text as accounts_table",
  );

  if (!result.rows[0]?.accounts_table) {
    throw new Error("Relationship schema migration did not create public.accounts");
  }
}

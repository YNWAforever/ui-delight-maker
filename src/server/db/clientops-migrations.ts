import type { Queryable } from "./neon.server";

const CLIENTOPS_MIGRATION_LOCK = 246813579;

export type ClientOpsMigration = {
  path: string;
  sql: string;
};

export type MigrationRunResult = {
  applied: string[];
  skipped: string[];
};

function assertOrderedUniquePaths(migrations: ClientOpsMigration[]) {
  const paths = migrations.map((migration) => migration.path);
  const sorted = [...paths].sort();
  if (new Set(paths).size !== paths.length || paths.some((path, index) => path !== sorted[index])) {
    throw new Error("Migration paths must be unique and sorted");
  }
}

export async function runClientOpsMigrations(
  db: Queryable,
  migrations: ClientOpsMigration[],
): Promise<MigrationRunResult> {
  assertOrderedUniquePaths(migrations);
  await db.query("select pg_advisory_lock($1)", [CLIENTOPS_MIGRATION_LOCK]);

  try {
    await db.query(
      "create table if not exists clientops_schema_migrations (path text primary key, applied_at timestamptz not null default now())",
    );
    const appliedRows = await db.query<{ path: string }>(
      "select path from clientops_schema_migrations order by path",
    );
    const applied = new Set(appliedRows.rows.map((row) => row.path));
    const result: MigrationRunResult = { applied: [], skipped: [] };

    for (const migration of migrations) {
      if (applied.has(migration.path)) {
        result.skipped.push(migration.path);
        continue;
      }

      await db.query("begin");
      try {
        await db.query(migration.sql);
        await db.query(
          "insert into clientops_schema_migrations(path) values ($1)",
          [migration.path],
        );
        await db.query("commit");
        result.applied.push(migration.path);
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
    }

    return result;
  } finally {
    await db.query("select pg_advisory_unlock($1)", [CLIENTOPS_MIGRATION_LOCK]);
  }
}

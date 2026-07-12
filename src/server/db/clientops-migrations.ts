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

type MigrationClient = Queryable & { release(): void };
type MigrationDatabase = Queryable & {
  connect?: () => Promise<MigrationClient>;
};

function assertOrderedUniquePaths(migrations: ClientOpsMigration[]) {
  const paths = migrations.map((migration) => migration.path);
  const sorted = [...paths].sort();
  if (new Set(paths).size !== paths.length || paths.some((path, index) => path !== sorted[index])) {
    throw new Error("Migration paths must be unique and sorted");
  }
}

export async function runClientOpsMigrations(
  db: MigrationDatabase,
  migrations: ClientOpsMigration[],
): Promise<MigrationRunResult> {
  assertOrderedUniquePaths(migrations);
  const client = db.connect ? await db.connect() : null;
  const connection = client ?? db;
  await connection.query("select pg_advisory_lock($1)", [CLIENTOPS_MIGRATION_LOCK]);

  try {
    await connection.query(
      "create table if not exists clientops_schema_migrations (path text primary key, applied_at timestamptz not null default now())",
    );
    const appliedRows = await connection.query<{ path: string }>(
      "select path from clientops_schema_migrations order by path",
    );
    const applied = new Set(appliedRows.rows.map((row) => row.path));
    const result: MigrationRunResult = { applied: [], skipped: [] };

    for (const migration of migrations) {
      if (applied.has(migration.path)) {
        result.skipped.push(migration.path);
        continue;
      }

      await connection.query("begin");
      try {
        await connection.query(migration.sql);
        await connection.query(
          "insert into clientops_schema_migrations(path) values ($1)",
          [migration.path],
        );
        await connection.query("commit");
        result.applied.push(migration.path);
      } catch (error) {
        await connection.query("rollback");
        throw error;
      }
    }

    return result;
  } finally {
    await connection.query("select pg_advisory_unlock($1)", [CLIENTOPS_MIGRATION_LOCK]);
    client?.release();
  }
}

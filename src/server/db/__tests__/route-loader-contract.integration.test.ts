import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
}));

// Read models import query() from this module. Redirecting it at the pg driver lets the
// gate run against the CI Postgres service without touching production code, and without
// depending on @neondatabase/serverless reaching a plain container. The SQL text is
// identical either way, which is what this gate checks.
vi.mock("@/server/db/neon.server", () => {
  const getPool = () => {
    if (!holder.pool) throw new Error("test pool not initialised");
    return holder.pool;
  };
  const query = async (text: string, values: readonly unknown[] = []) => {
    const result = await getPool().query(text, values as unknown[]);
    return result.rows;
  };
  const queryOne = async (text: string, values: readonly unknown[] = []) => {
    const rows = await query(text, values);
    return rows[0] ?? null;
  };
  const transaction = async (work: (db: unknown) => Promise<unknown>) => {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async (text: string, values?: readonly unknown[]) =>
          client.query(text, values as unknown[]),
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  return { query, queryOne, transaction, getDatabaseUrl: () => "test" };
});

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "../clientops-migrations";
import { isPostgresError } from "../postgres-error";
import { ROUTE_LOADER_CONTRACT } from "../route-loader-contract";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

describe("route loader contract", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  for (const entry of ROUTE_LOADER_CONTRACT) {
    it.runIf(hasDatabase)(`${entry.route} executes against the migrated schema`, async () => {
      // An empty database means detail routes legitimately find nothing, so only a
      // Postgres-level failure counts. Both outage bugs were exactly that: 42703
      // (undefined_column) and 42P18 (indeterminate_datatype).
      try {
        await entry.run();
      } catch (error) {
        if (isPostgresError(error)) {
          throw new Error(
            `Route "${entry.route}" issued SQL the migrated schema rejects: ` +
              `[${error.code}] ${error.message}`,
          );
        }
      }
      expect(true).toBe(true);
    });
  }
});

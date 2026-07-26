import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
  count: 0,
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
    holder.count += 1;
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
        query: async (text: string, values?: readonly unknown[]) => {
          holder.count += 1;
          return client.query(text, values as unknown[]);
        },
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
import { seedRouteLoaderFixture } from "./route-loader-fixture";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

describe("route loader contract", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await seedRouteLoaderFixture(holder.pool);
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  /**
   * Walks a resolved read for `{ status: "error" }` states nested anywhere inside it.
   * Recursive because they sit at varying depths — `read.overview`, and one per entry of
   * `read.sections`.
   */
  function findErrorStates(value: unknown, path = "read", found: string[] = []): string[] {
    if (Array.isArray(value)) {
      value.forEach((item, index) => findErrorStates(item, `${path}[${index}]`, found));
      return found;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (record.status === "error") {
        found.push(`${path} -> ${JSON.stringify(record.error)}`);
      }
      for (const [key, item] of Object.entries(record)) {
        findErrorStates(item, `${path}.${key}`, found);
      }
    }
    return found;
  }

  for (const entry of ROUTE_LOADER_CONTRACT) {
    it.runIf(hasDatabase)(`${entry.route} executes against the migrated schema`, async () => {
      // An empty result is fine — detail routes legitimately find nothing — so only a
      // Postgres-level failure counts. Both outage bugs were exactly that: 42703
      // (undefined_column) and 42P18 (indeterminate_datatype).
      holder.count = 0;
      let result: unknown;
      try {
        result = await entry.run();
      } catch (error) {
        if (isPostgresError(error)) {
          throw new Error(
            `Route "${entry.route}" issued SQL the migrated schema rejects: ` +
              `[${error.code}] ${error.message}`,
          );
        }
      }
      // Rejecting is not the only way a read can fail. The Company Workspace overview and
      // section reads wrap their queries and map Postgres errors — including the
      // schema-mismatch SQLSTATEs 42P01/42703/42883 — onto a returned
      // `{ status: "error" }` (src/server/company-workspace/errors.ts), and the Client
      // Workspace sections do the same with a bare catch. That degradation is deliberate
      // for a user, but it made those sub-paths invisible to the check above: the read
      // resolves, so the gate stayed green while the query was broken.
      //
      // Against a schema built from the migrations and seeded with real rows, no read has
      // any business returning an error state. Any that does is a bug, not a user-facing
      // condition, so surface it here rather than letting it render as a panel in prod.
      const embedded = findErrorStates(result);
      expect(
        embedded,
        `Route "${entry.route}" resolved successfully but returned ${embedded.length} embedded ` +
          `error state(s) against a healthy seeded database:\n  ${embedded.join("\n  ")}`,
      ).toEqual([]);
      // The fixture puts three rows in every driving table, so a per-row query shows up
      // here as a count well above the budget rather than as a passing single query.
      expect(
        holder.count,
        `Route "${entry.route}" issued ${holder.count} queries against a budget of ` +
          `${entry.maxQueries}. If this is a deliberate new query, raise maxQueries in ` +
          `route-loader-contract.ts. If the count jumped by a multiple, it is probably N+1.`,
      ).toBeLessThanOrEqual(entry.maxQueries);
    });
  }
});

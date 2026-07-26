import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
}));

// listRelationshipIndexPage (exercised below) imports query()/queryOne() from this module.
// Redirecting it at the pg driver, the same way route-loader-contract.integration.test.ts
// does, lets the third test call the real repository function against the seeded Postgres
// container instead of production's @neondatabase/serverless client.
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
import { listRelationshipIndexPage } from "@/server/repositories/relationship-signals";
import { runClientOpsMigrations } from "../clientops-migrations";
import { FIXTURE } from "../route-loader-contract";
import { seedRouteLoaderFixture } from "./route-loader-fixture";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let pool: Pool | null = null;

describe("route loader fixture", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    holder.pool = pool;
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(pool, migrations);
    await seedRouteLoaderFixture(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
    holder.pool = null;
  });

  it.runIf(hasDatabase)("inserts three rows in every driving table", async () => {
    // Three is load-bearing: with one row a per-row query is indistinguishable from a
    // single query, so the budget in route-loader-contract.ts would not catch N+1.
    for (const table of ["accounts", "clients", "leads", "quotes", "engagements", "tasks"]) {
      const result = await pool!.query(`select count(*)::int as total from ${table}`);
      expect(result.rows[0].total, table).toBeGreaterThanOrEqual(3);
    }
  });

  it.runIf(hasDatabase)("every FIXTURE id resolves to a real row", async () => {
    // Guards the one drift this design allows: the SQL uses literal ids, so a change to
    // FIXTURE without a matching change to the statements would otherwise go unnoticed
    // until a detail route silently went back to measuring its not-found path.
    const checks: Array<[string, string]> = [
      ["profiles", FIXTURE.profileId],
      ["products", FIXTURE.productId],
      ["accounts", FIXTURE.accountId],
      ["clients", FIXTURE.clientId],
      ["leads", FIXTURE.leadId],
      ["campaigns", FIXTURE.campaignId],
      ["quotes", FIXTURE.quoteId],
      ["engagements", FIXTURE.engagementId],
    ];
    for (const [table, id] of checks) {
      const result = await pool!.query(`select id from ${table} where id = $1`, [id]);
      expect(result.rowCount, `${table} has no row for FIXTURE id ${id}`).toBe(1);
    }
  });

  // Replaces the one assertion lost when relationship-index-columns.test.ts was deleted.
  // That file's negative checks ("the select references no column that does not exist on
  // accounts") are superseded by the schema gate's execution-based check. Its positive
  // check -- "the select still includes a.relationship_health" -- is not: dropping a valid
  // column from a select raises no Postgres error, so the gate stays green while the field
  // silently disappears from every result. Nothing else in the suite covers that, so this
  // asserts it behaviourally against a real seeded row instead of grepping source text.
  it.runIf(hasDatabase)("relationship index rows carry relationship_health", async () => {
    const result = await listRelationshipIndexPage({ page: 1, limit: 50 });
    expect(result.items.length).toBeGreaterThan(0);
    const [first] = result.items;
    expect(first.account).toHaveProperty("relationship_health");
    expect(first.account.relationship_health).toEqual(expect.any(Number));
  });
});

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Renewal and Expansion report, Task 3: the only place the annualisation arithmetic behind
 * `/reports` and `/clients` runs against a real database.
 *
 * Every other test that touches `listClients`, `listClientsPage`, `getClient` or
 * `loadReportDataset` mocks `@/server/db/neon.server`, so none of them execute the SQL - the
 * mock's canned rows decide the result whatever the multipliers say. `operations.test.ts`
 * asserts on the query *text* of `reportQueries.renewal_expansion`, which cannot tell a `* 12`
 * from a `* 13`. This file executes both copies of the billing-period case block:
 * `CLIENT_ENGAGEMENT_ROLLUP` (via `getClient`) and the report's own copy (via
 * `loadReportDataset`).
 *
 * Only the session/driver boundary is mocked, exactly as
 * `human-review-workload.integration.test.ts` does it: `@/server/db/neon.server` is redirected
 * at a real `pg.Pool` built from `DATABASE_TEST_URL`, so the repositories and read-models run
 * for real against the migrated schema instead of against `getDatabaseUrl()`'s `DATABASE_URL`.
 */
const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
}));

// Redirecting this module at the pg driver is what lets the real repositories run against the
// CI Postgres service without touching production code. The SQL text is identical either way.
vi.mock("@/server/db/neon.server", () => {
  type Runner = { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> };
  const getPool = (): Runner => {
    if (!holder.pool) throw new Error("test pool not initialised");
    return holder.pool as unknown as Runner;
  };
  const query = async (text: string, values: readonly unknown[] = [], db?: Runner) => {
    const result = await (db ?? getPool()).query(text, values as unknown[]);
    return result.rows;
  };
  const queryOne = async (text: string, values: readonly unknown[] = [], db?: Runner) => {
    const rows = await query(text, values, db);
    return rows[0] ?? null;
  };
  const transaction = async (work: (db: Runner) => Promise<unknown>) => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: (text: string, values?: unknown[]) => client.query(text, values),
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
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadReportDataset } from "@/server/read-models/operations";
import { getClient } from "@/server/repositories/clients";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

/** The range every case runs at. `RANGE_DAYS` is the 30 the query receives as `$1`. */
const RANGE = "30d" as const;
const RANGE_DAYS = 30;

function db() {
  if (!holder.pool) throw new Error("test pool not initialised");
  return holder.pool;
}

type Row = {
  client: string;
  renewing_value: number;
  renewal_risk: string;
  active_engagements: number;
  added_recently: number;
};

type BillingPeriod = "monthly" | "quarterly" | "annual" | "one_off";
type EngagementStatus = "active" | "paused" | "ended";
type RenewalRiskLevel = "low" | "medium" | "high";

/**
 * The database behind `DATABASE_TEST_URL` is shared and already populated -
 * `route-loader-fixture.ts` inserts three clients and three engagements permanently, and other
 * suites seed their own. So every client here gets a randomised name suffix, every assertion
 * filters to that name, and nothing asserts on the whole result set or on a total row count.
 */
let seededEngagementIds: string[] = [];
let seededClientIds: string[] = [];

/** One product for the file: `engagements.product_id` is `not null ... on delete restrict`. */
let productId = "";

async function seedClient(label: string) {
  const id = randomUUID();
  const name = `${label} ${id.slice(0, 8)}`;
  const result = await db().query<{ company_name: string }>(
    `insert into clients (id, company_name, tier)
     values ($1, $2, 'SME')
     returning company_name`,
    [id, name],
  );
  const stored = result.rows[0]?.company_name;
  if (!stored) throw new Error(`client ${id} was not inserted`);
  seededClientIds.push(id);
  return { id, name: stored };
}

/**
 * Offsets are integers in days handed to Postgres, not JS dates: `renewal_date` and
 * `start_date` are `date` columns compared against `current_date` inside the query, and a date
 * computed in the test process could land a day either side of the database's.
 */
async function seedEngagement(input: {
  clientId: string;
  billingPeriod: BillingPeriod;
  value: number;
  renewalOffsetDays: number | null;
  startOffsetDays?: number;
  status?: EngagementStatus;
  renewalRisk?: RenewalRiskLevel;
}) {
  const id = randomUUID();
  await db().query(
    `insert into engagements
       (id, client_id, product_id, value, billing_period, start_date, renewal_date,
        status, renewal_risk)
     values
       ($1, $2, $3, $4, $5,
        (current_date + ($6::integer * interval '1 day'))::date,
        case when $7::integer is null then null
             else (current_date + ($7::integer * interval '1 day'))::date end,
        $8, $9)`,
    [
      id,
      input.clientId,
      productId,
      input.value,
      input.billingPeriod,
      input.startOffsetDays ?? 0,
      input.renewalOffsetDays,
      input.status ?? "active",
      input.renewalRisk ?? "low",
    ],
  );
  seededEngagementIds.push(id);
  return id;
}

async function loadRows() {
  const { data } = await loadReportDataset({ report: "renewal_expansion", range: RANGE });
  return data as unknown as Row[];
}

function findRow(rows: Row[], client: string) {
  return rows.find((row) => row.client === client);
}

/**
 * Throws rather than returning `undefined`. Filtering to this file's own rows must not let a
 * query that returned nothing at all reach an assertion as `undefined` - `expect(undefined)`
 * against a number does fail, but the message would blame the value rather than the empty
 * result, and an `undefined`-tolerant matcher added later would pass silently.
 */
function requireRow(rows: Row[], client: string): Row {
  const row = findRow(rows, client);
  if (!row) {
    throw new Error(
      `renewal_expansion returned no row for "${client}" (${rows.length} rows in total)`,
    );
  }
  return row;
}

describe("renewal_expansion, proven against a real database", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    productId = randomUUID();
    await db().query(
      `insert into products (id, name, billing_type, category)
       values ($1, $2, 'retainer', 'CRM')`,
      [productId, `Renewal Report Fixture ${productId.slice(0, 8)}`],
    );
  }, 60_000);

  afterAll(async () => {
    // After the last afterEach, so no engagement still references it (`on delete restrict`).
    if (hasDatabase && productId) {
      await db().query("delete from products where id = $1", [productId]);
    }
    await holder.pool?.end();
    holder.pool = null;
  });

  beforeEach(() => {
    seededEngagementIds = [];
    seededClientIds = [];
  });

  afterEach(async () => {
    if (!hasDatabase) return;
    // Exactly the ids this test created. Never an unqualified `delete from clients` - other
    // suites' rows live in this same database and must survive.
    if (seededEngagementIds.length > 0) {
      await db().query("delete from engagements where id = any($1)", [seededEngagementIds]);
    }
    if (seededClientIds.length > 0) {
      await db().query("delete from clients where id = any($1)", [seededClientIds]);
    }
  });

  it.runIf(hasDatabase)("annualises each billing period by its own multiplier", async () => {
    const client = await seedClient("Annualisation");
    // Four distinct values, so mutating any one branch changes the total and no other
    // combination of the four lands on the same sum.
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "monthly",
      value: 100,
      renewalOffsetDays: 5,
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "quarterly",
      value: 200,
      renewalOffsetDays: 6,
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "annual",
      value: 300,
      renewalOffsetDays: 7,
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "one_off",
      value: 400,
      renewalOffsetDays: 8,
    });

    const row = requireRow(await loadRows(), client.name);

    // 100 * 12 + 200 * 4 + 300 * 1 + 400 * 0. `one_off` is deliberately worth nothing: a
    // one-off engagement carries no annual recurring value.
    expect(row.renewing_value).toBe(100 * 12 + 200 * 4 + 300 * 1 + 400 * 0);
    expect(row.active_engagements).toBe(4);
  });

  it.runIf(hasDatabase)("agrees with the ARR the client detail page shows", async () => {
    // Every engagement renews inside the window, which is the one condition under which the
    // report's arithmetic and `CLIENT_ENGAGEMENT_ROLLUP`'s must produce the same number: the
    // rollup annualises every active engagement, the report only those renewing ahead.
    const client = await seedClient("Rollup Agreement");
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "monthly",
      value: 150,
      renewalOffsetDays: 3,
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "quarterly",
      value: 250,
      renewalOffsetDays: 9,
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "annual",
      value: 350,
      renewalOffsetDays: 20,
    });

    const row = requireRow(await loadRows(), client.name);
    const detail = await getClient(client.id);

    // Pinned to the literal as well as to each other: two zeroes would agree just as happily.
    const expected = 150 * 12 + 250 * 4 + 350 * 1;
    expect(row.renewing_value).toBe(expected);
    expect(detail.arr).toBe(expected);
    expect(row.renewing_value).toBe(detail.arr);
  });

  it.runIf(hasDatabase)("reports the worst renewal risk across a client", async () => {
    const client = await seedClient("Worst Risk");
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "monthly",
      value: 10,
      renewalOffsetDays: 4,
      renewalRisk: "low",
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "monthly",
      value: 10,
      renewalOffsetDays: 5,
      renewalRisk: "high",
    });
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "monthly",
      value: 10,
      renewalOffsetDays: 6,
      renewalRisk: "low",
    });

    const row = requireRow(await loadRows(), client.name);

    // Capitalised: the query wraps the aggregate in `initcap`.
    expect(row.renewal_risk).toBe("High");
    expect(row.active_engagements).toBe(3);
  });

  it.runIf(hasDatabase)("counts nothing for a renewal that has already passed", async () => {
    const client = await seedClient("Past Renewal");
    // Renewed ten days ago, started two days ago. The expansion arm of the `having` still puts
    // the client in the result, so this asserts a present row worth zero rather than an absent
    // one - the difference a one-sided `>= current_date - ...` window would erase.
    await seedEngagement({
      clientId: client.id,
      billingPeriod: "monthly",
      value: 500,
      renewalOffsetDays: -10,
      startOffsetDays: -2,
    });

    const row = requireRow(await loadRows(), client.name);

    expect(row.renewing_value).toBe(0);
    expect(row.added_recently).toBe(1);
    expect(row.active_engagements).toBe(1);
  });

  it.runIf(hasDatabase)(
    "leaves an engagement started before the range out of added_recently",
    async () => {
      const client = await seedClient("Added Recently");
      // Started 60 days ago, well outside the 30-day range. It renews inside the window, so it
      // keeps the client in the result without being counted as recently added.
      await seedEngagement({
        clientId: client.id,
        billingPeriod: "monthly",
        value: 20,
        renewalOffsetDays: 5,
        startOffsetDays: -(RANGE_DAYS * 2),
      });
      await seedEngagement({
        clientId: client.id,
        billingPeriod: "monthly",
        value: 20,
        renewalOffsetDays: null,
        startOffsetDays: -5,
      });

      const row = requireRow(await loadRows(), client.name);

      expect(row.added_recently).toBe(1);
      expect(row.active_engagements).toBe(2);
    },
  );

  it.runIf(hasDatabase)("omits a client whose only engagement has ended", async () => {
    const ended = await seedClient("Ended Only");
    await seedEngagement({
      clientId: ended.id,
      billingPeriod: "monthly",
      value: 999,
      renewalOffsetDays: 5,
      startOffsetDays: -1,
      status: "ended",
    });
    // A control seeded the same way but left active. Without it, "the ended client is absent"
    // would also hold if the query returned nothing whatsoever.
    const active = await seedClient("Ended Only Control");
    await seedEngagement({
      clientId: active.id,
      billingPeriod: "monthly",
      value: 999,
      renewalOffsetDays: 5,
      startOffsetDays: -1,
    });

    const rows = await loadRows();

    expect(requireRow(rows, active.name).renewing_value).toBe(999 * 12);
    // Absent, not present with zeros: the query inner-joins on `e.status = 'active'`.
    expect(findRow(rows, ended.name)).toBeUndefined();
  });
});

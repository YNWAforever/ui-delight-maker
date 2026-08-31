import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Human-Review Workload report, Task 3: the one place `reportQueries.human_review_workload`
 * is proven against a real database.
 *
 * Every other test on this query asserts SQL text only (see `operations.test.ts`, "keeps
 * pending unwindowed while windowing decided"). A unit test with `query` mocked cannot prove
 * the `case`-in-`order-by` median, the unwindowed `pending` filter, or the `coalesce(p.name,
 * 'Unassigned')` grouping actually work against Postgres - fixture data decides the result
 * regardless of what the SQL says. This file closes that gap by running the real query.
 *
 * Only the session/driver boundary is mocked, the same way `agent-policy.integration.test.ts`
 * and `agent-run-duration.integration.test.ts` do it: `@/server/db/neon.server` is redirected
 * at a real `pg.Pool` built from `DATABASE_TEST_URL`, so `loadReportDataset` and
 * `reportQueries.human_review_workload` run for real against the migrated schema instead of
 * against `getDatabaseUrl()`'s `DATABASE_URL` (which CI does not set for this job).
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

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

function db() {
  if (!holder.pool) throw new Error("test pool not initialised");
  return holder.pool;
}

type Row = {
  reviewer: string;
  pending: number;
  decided: number;
  median_minutes: number | null;
  oldest_pending_days: number | null;
};

/** Every profile/approval id created by a test, so cleanup never touches another test's rows. */
let seededProfileIds: string[] = [];
let seededApprovalIds: string[] = [];

async function seedProfile(name: string) {
  const id = randomUUID();
  await db().query(
    `insert into profiles (id, email, name, role)
     values ($1, $2, $3, 'manager')`,
    [id, `${id}@fixture.test`, name],
  );
  seededProfileIds.push(id);
  return id;
}

async function seedApproval(input: {
  assignedTo: string | null;
  status: "pending" | "approved" | "rejected" | "escalated";
  createdAt: string;
  decidedAt?: string | null;
  approvalType?: string;
}) {
  const id = randomUUID();
  await db().query(
    `insert into human_approvals
       (id, approval_type, requested_by, assigned_to, status, decided_at, created_at)
     values ($1, $2, 'seed', $3, $4, $5, $6)`,
    [
      id,
      input.approvalType ?? "quote_send",
      input.assignedTo,
      input.status,
      input.decidedAt ?? null,
      input.createdAt,
    ],
  );
  seededApprovalIds.push(id);
  return id;
}

/** now() minus an offset, formatted for a timestamptz literal parameter. */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function loadRows() {
  const { data } = await loadReportDataset({ report: "human_review_workload", range: "7d" });
  return data as unknown as Row[];
}

function rowFor(rows: Row[], reviewer: string) {
  return rows.find((row) => row.reviewer === reviewer);
}

/** Reads back the `name` stored for a profile id, so assertions target the exact stored value. */
async function profileName(id: string) {
  const result = await db().query<{ name: string }>("select name from profiles where id = $1", [
    id,
  ]);
  const name = result.rows[0]?.name;
  if (!name) throw new Error(`profile ${id} not found`);
  return name;
}

describe("human_review_workload, proven against a real database", () => {
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

  beforeEach(() => {
    seededProfileIds = [];
    seededApprovalIds = [];
  });

  afterEach(async () => {
    if (!hasDatabase) return;
    // No append-only trigger on `human_approvals` (unlike `agent_policy_versions`), so a
    // straight delete of exactly what this test seeded is enough to keep suites isolated.
    if (seededApprovalIds.length > 0) {
      await db().query("delete from human_approvals where id = any($1)", [seededApprovalIds]);
    }
    if (seededProfileIds.length > 0) {
      await db().query("delete from profiles where id = any($1)", [seededProfileIds]);
    }
  });

  it.runIf(hasDatabase)("a pending approval never contributes to the median", async () => {
    const reviewer = await seedProfile(`Median Guard ${randomUUID().slice(0, 8)}`);
    // Decided in exactly 30 minutes - the only value the median may reflect.
    await seedApproval({
      assignedTo: reviewer,
      status: "approved",
      createdAt: minutesAgo(60),
      decidedAt: minutesAgo(30),
    });
    // Pending, and far older than the decided row. If this contributed to the median (e.g. via
    // `now() - created_at` instead of a case that yields null for pending rows), the median
    // would jump to a multi-day figure instead of staying at 30.
    await seedApproval({
      assignedTo: reviewer,
      status: "pending",
      createdAt: daysAgo(20),
    });

    const rows = await loadRows();
    const name = await profileName(reviewer);
    const row = rowFor(rows, name);

    expect(row, "the seeded reviewer must appear in the dataset").toBeDefined();
    expect(row?.median_minutes).toBe(30);
  });

  it.runIf(hasDatabase)(
    "an approval older than the window still appears in Pending now",
    async () => {
      const reviewer = await seedProfile(`Old Pending ${randomUUID().slice(0, 8)}`);
      // 45 days old, run with a 7-day range - the range must not hide it from `pending`.
      await seedApproval({
        assignedTo: reviewer,
        status: "pending",
        createdAt: daysAgo(45),
      });

      const rows = await loadRows();
      const name = await profileName(reviewer);
      const row = rowFor(rows, name);

      expect(row, "the seeded reviewer must appear in the dataset").toBeDefined();
      expect(row?.pending).toBe(1);
    },
  );

  it.runIf(hasDatabase)(
    "a reviewer with only pending work has a null median, not zero",
    async () => {
      const reviewer = await seedProfile(`Pending Only ${randomUUID().slice(0, 8)}`);
      await seedApproval({
        assignedTo: reviewer,
        status: "pending",
        createdAt: daysAgo(1),
      });

      const rows = await loadRows();
      const name = await profileName(reviewer);
      const row = rowFor(rows, name);

      expect(row, "the seeded reviewer must appear in the dataset").toBeDefined();
      expect(row?.median_minutes).toBeNull();
    },
  );

  it.runIf(hasDatabase)("rows with no assigned_to aggregate into one Unassigned row", async () => {
    // A distinct approval_type per row and no shared reviewer name, so what is under test is
    // purely "null assigned_to groups together" - not an artifact of these three rows
    // accidentally sharing anything else.
    await seedApproval({
      assignedTo: null,
      status: "pending",
      createdAt: daysAgo(1),
      approvalType: "quote_send",
    });
    await seedApproval({
      assignedTo: null,
      status: "pending",
      createdAt: daysAgo(2),
      approvalType: "discount",
    });
    await seedApproval({
      assignedTo: null,
      status: "pending",
      createdAt: daysAgo(3),
      approvalType: "message_send",
    });

    const rows = await loadRows();
    const unassignedRows = rows.filter((row) => row.reviewer === "Unassigned");

    // Isolation: other suites running against this shared database may also leave `Unassigned`
    // pending rows behind, so this asserts there is exactly one `Unassigned` GROUP (never
    // fragmented into more than one row) and that its pending count is at least the three
    // seeded here, rather than asserting the whole result set or an exact global count - a
    // stray row from elsewhere must not fail this case, and must not make it pass either.
    expect(unassignedRows.length).toBe(1);
    expect(unassignedRows[0]?.pending).toBeGreaterThanOrEqual(3);
  });

  it.runIf(hasDatabase)(
    "oldest_pending_days reports the longest wait, not the mean or newest",
    async () => {
      const reviewer = await seedProfile(`Longest Wait ${randomUUID().slice(0, 8)}`);
      await seedApproval({ assignedTo: reviewer, status: "pending", createdAt: daysAgo(2) });
      await seedApproval({ assignedTo: reviewer, status: "pending", createdAt: daysAgo(9) });
      await seedApproval({ assignedTo: reviewer, status: "pending", createdAt: daysAgo(40) });

      const rows = await loadRows();
      const name = await profileName(reviewer);
      const row = rowFor(rows, name);

      expect(row, "the seeded reviewer must appear in the dataset").toBeDefined();
      expect(row?.oldest_pending_days).toBe(40);
    },
  );
});

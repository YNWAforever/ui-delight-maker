import { readFile } from "node:fs/promises";
import { Pool, types as pgTypes } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The defect BD-6 and BD-10 both describe, proven against a real Postgres.
 *
 * `requestQuoteApproval` used to call `updateQuoteLifecycle` and nothing else: a quote sent for
 * approval flipped its own status and never became a `human_approvals` row, so /approvals never
 * showed it and there was no approval for a reviewer to be assigned to. Reading the code path
 * cannot prove that is fixed — only a row in the table can.
 *
 * Only the session boundary is mocked. `requireCapability`, `createApproval`,
 * `findPendingApprovalForQuote` and `assignApproval` all run for real against the migrated
 * schema, because each of them is part of what is being asserted.
 */
const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
  session: {
    profile: {
      id: "approval-actor",
      role: "admin",
      status: "active",
      primary_department_id: null,
    },
  } as unknown,
}));

// Redirecting this module at the pg driver is what lets the real repositories run against the
// CI Postgres service without touching production code. The SQL text is identical either way,
// and `db` is honoured so a caller's transaction really is one transaction here too.
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

const { createServerFnChain } = vi.hoisted(() => {
  const chain = {
    validator() {
      return chain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return { createServerFnChain: chain };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => holder.session,
  getNeonAuthSession: async () => holder.session,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { assignApprovalFn } from "@/server-functions/approvals";
import { requestQuoteApproval } from "@/server-functions/quotes";
import { decideApproval } from "@/server/repositories/approvals";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

const ACTOR = "approval-actor";
const REVIEWER = "approval-reviewer";
const LEAD_ID = "00000000-0000-4000-8000-0000000b0001";
const QUOTE_ID = "00000000-0000-4000-8000-0000000b0002";

/**
 * `numeric` reaches the driver as a string. `src/server/db/neon.server.ts` overrides OID 1700
 * to `Number` in production, so mirroring it here is what makes the `total_value` this test
 * asserts on the same value the real code path records.
 */
const NUMERIC_OID = 1700;
const NUMERIC_TYPE_PARSER = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === NUMERIC_OID
      ? Number
      : pgTypes.getTypeParser(oid, format)) as typeof pgTypes.getTypeParser,
};

function db() {
  if (!holder.pool) throw new Error("test pool not initialised");
  return holder.pool;
}

/** The handlers are `createServerFn` chains flattened by the stub above, so they take `{ data }`. */
type Handler<In, Out> = (input: { data: In }) => Promise<Out>;
const request = requestQuoteApproval as unknown as Handler<
  { id: string; assignedTo?: string | null },
  { id: string; assigned_to: string | null; context_data: unknown }
>;
const assign = assignApprovalFn as unknown as Handler<
  { id: string; assignedTo: string | null },
  { id: string; assigned_to: string | null }
>;

async function quoteStatus(id = QUOTE_ID) {
  const { rows } = await db().query<{ status: string }>("select status from quotes where id = $1", [
    id,
  ]);
  return rows[0]?.status ?? null;
}

async function storedAssignee(approvalId: string) {
  const { rows } = await db().query<{ assigned_to: string | null }>(
    "select assigned_to from human_approvals where id = $1",
    [approvalId],
  );
  return rows[0]?.assigned_to ?? null;
}

async function pendingApprovalsForQuote(quoteId = QUOTE_ID) {
  const { rows } = await db().query<{ count: string }>(
    `select count(*) as count from human_approvals
      where status = 'pending' and context_data->>'quote_id' = $1`,
    [quoteId],
  );
  return Number(rows[0]?.count ?? "0");
}

describe("requesting approval on a quote", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({
      connectionString: process.env.DATABASE_TEST_URL,
      types: NUMERIC_TYPE_PARSER,
    });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await holder.pool.query(
      `insert into profiles (id, email, name, role, status) values
         ($1,'actor@fixture.test','Approval Actor','admin','active'),
         ($2,'reviewer@fixture.test','Approval Reviewer','manager','active')
       on conflict (id) do update set role = excluded.role, status = excluded.status`,
      [ACTOR, REVIEWER],
    );
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  beforeEach(async () => {
    if (!hasDatabase) return;
    await db().query("delete from notifications");
    await db().query("delete from human_approvals");
    await db().query("delete from quotes where id = $1", [QUOTE_ID]);
    await db().query(
      `insert into leads (id, company_name, status, source)
       values ($1,'Approval Fixture Co','new','website')
       on conflict (id) do nothing`,
      [LEAD_ID],
    );
    await db().query(
      `insert into quotes (id, number, lead_id, status, total_value, currency, created_by)
       values ($1,'FIM-Q-BD6',$2,'draft',125000.00,'HKD',$3)`,
      [QUOTE_ID, LEAD_ID, ACTOR],
    );
  });

  it.runIf(hasDatabase)("puts the quote in the approvals queue and flips its status", async () => {
    const approval = await request({ data: { id: QUOTE_ID } });

    const { rows } = await db().query<{
      id: string;
      approval_type: string;
      status: string;
      requested_by: string | null;
      context_data: Record<string, unknown>;
    }>("select * from human_approvals where context_data->>'quote_id' = $1", [QUOTE_ID]);

    expect(rows, "requesting approval must create exactly one approval row").toHaveLength(1);
    expect(rows[0].id).toBe(approval.id);
    expect(rows[0].approval_type).toBe("quote_send");
    expect(rows[0].status).toBe("pending");
    expect(rows[0].requested_by).toBe(ACTOR);
    // The facts a reviewer needs, recorded as submitted. No discount: `quotes` has no discount
    // column, and the composer bakes the percentage into the line-item prices before saving.
    expect(rows[0].context_data).toMatchObject({
      quote_id: QUOTE_ID,
      quote_number: "FIM-Q-BD6",
      total_value: 125000,
      currency: "HKD",
    });
    expect(rows[0].context_data).not.toHaveProperty("discount_percent");

    expect(await quoteStatus(), "the quote must also reach pending_approval").toBe(
      "pending_approval",
    );
  });

  it.runIf(hasDatabase)("queues once when approval is requested twice", async () => {
    const first = await request({ data: { id: QUOTE_ID } });
    const second = await request({ data: { id: QUOTE_ID } });

    expect(second.id, "the second request must return the approval already queued").toBe(first.id);
    expect(
      await pendingApprovalsForQuote(),
      "a second request must not put a second row in the queue for one quote",
    ).toBe(1);
  });

  it.runIf(hasDatabase)("leaves the quote untouched when the approval insert fails", async () => {
    // A genuine failure of `createApproval` inside the transaction, forced without mocking it:
    // `human_approvals.assigned_to` is FK-constrained to `profiles`, so an unresolvable id makes
    // the insert throw where it really runs.
    await expect(
      request({ data: { id: QUOTE_ID, assignedTo: "no-such-profile" } }),
    ).rejects.toThrow();

    expect(
      await quoteStatus(),
      "a quote must never reach pending_approval with nothing in the queue",
    ).toBe("draft");
    expect(await pendingApprovalsForQuote()).toBe(0);
  });

  it.runIf(hasDatabase)("assigns, unassigns, and refuses to reassign once decided", async () => {
    const approval = await request({ data: { id: QUOTE_ID } });

    const assigned = await assign({ data: { id: approval.id, assignedTo: REVIEWER } });
    expect(assigned.assigned_to).toBe(REVIEWER);
    expect(await storedAssignee(approval.id)).toBe(REVIEWER);

    const unassigned = await assign({ data: { id: approval.id, assignedTo: null } });
    expect(unassigned.assigned_to).toBeNull();
    expect(await storedAssignee(approval.id), "unassigning must reach the database").toBeNull();

    await decideApproval({ id: approval.id, decision: "approved", actorId: ACTOR });

    await expect(assign({ data: { id: approval.id, assignedTo: REVIEWER } })).rejects.toThrow(
      "A decided approval cannot be reassigned",
    );
  });
});

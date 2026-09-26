import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";

const holder = vi.hoisted(() => ({ client: null as PoolClient | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (text: string, values: readonly unknown[] = []) => {
    if (!holder.client) throw new Error("PostgreSQL test client unavailable");
    return (await holder.client.query(text, [...values])).rows;
  },
  queryOne: async (text: string, values: readonly unknown[] = []) => {
    if (!holder.client) throw new Error("PostgreSQL test client unavailable");
    return (await holder.client.query(text, [...values])).rows[0] ?? null;
  },
  transaction: vi.fn(),
}));

import { listJobSheets, listJobSheetsPage } from "@/server/repositories/job-sheets";
import { listApprovals } from "@/server/repositories/approvals";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const context: RequestAuthorization = {
  session: { profile: { id: "actor-1" } } as AppSession,
  actor: {
    profileId: "actor-1", role: "manager", status: "active",
    managedDepartmentIds: [], managedTeamIds: [], directReportIds: [],
  },
  overrides: [{
    profileId: "actor-1", capability: "job_sheets.view", effect: "deny",
    resourceType: "job_sheet", resourceId: "sheet-denied",
  }, {
    profileId: "actor-1", capability: "approvals.view", effect: "deny",
    resourceType: "human_approval", resourceId: "approval-denied",
  }],
  now: new Date("2026-09-27T04:00:00.000Z"),
};

let pool: Pool;
describe("job-sheet queue SQL visibility", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    holder.client = await pool.connect();
    await holder.client.query("begin");
    await holder.client.query(`create temp table human_approvals (
      id text, agent_run_id text, approval_type text, requested_by text,
      assigned_to text, status text, context_data jsonb, context_summary text,
      reviewer_notes text, decided_at timestamptz, created_at timestamptz
    ) on commit drop`);
    await holder.client.query(`insert into human_approvals
      (id, approval_type, assigned_to, status, context_data, context_summary, created_at)
      values
      ('approval-allowed','quote_send','actor-1','pending','{"quote_id":"quote-1","secret":"sensitive"}','Allowed',now()),
      ('approval-denied','quote_send','actor-1','pending','{"quote_id":"quote-2","secret":"denied"}','Denied',now()),
      ('approval-other','quote_send','other-1','pending','{"quote_id":"quote-3","secret":"other"}','Other',now())`);
    await holder.client.query(`create temp table job_sheets (
      id text, number text, quote_id text, status text, po_number text,
      client_order_number text, created_at timestamptz, total_amount numeric,
      currency text, sales_owner text, accounting_owner text,
      account_id text, client_id text, accounting_notes text, xero_customer_reference text
    ) on commit drop`);
    await holder.client.query(`insert into job_sheets values
      ('sheet-allowed','JS-1','quote-1','ready',null,null,now(),100.25,'HKD','actor-1',null,null,null,'allowed private note',null),
      ('sheet-denied','JS-2','quote-2','ready',null,null,now(),200.50,'HKD','actor-1',null,null,null,'denied private note',null),
      ('sheet-other','JS-3','quote-3','ready',null,null,now(),300.75,'HKD','other-1',null,null,null,'other private note',null)`);
  });
  afterAll(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      holder.client.release();
      holder.client = null;
    }
    await pool?.end();
  });

  it.runIf(hasDatabase)("scopes page items and total before pagination", async () => {
    const page = await listJobSheetsPage({ page: 1, limit: 10 }, context);
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.id)).toEqual(["sheet-allowed"]);
    expect(page.items[0]).not.toHaveProperty("accounting_notes");
  });

  it.runIf(hasDatabase)("scopes approvals and redacts raw context before response", async () => {
    const approvals = await listApprovals({ status: "pending" }, context);
    expect(approvals.map((approval) => approval.id)).toEqual(["approval-allowed"]);
    expect(JSON.stringify(approvals[0]?.context_data)).not.toContain("sensitive");
    expect(approvals[0]?.context_data).toMatchObject({ quote_id: "quote-1" });
  });

  it.runIf(hasDatabase)("scopes the unpaginated queue and omits private detail fields", async () => {
    const items = await listJobSheets({}, context);
    expect(items.map((item) => item.id)).toEqual(["sheet-allowed"]);
    expect(items[0]).not.toHaveProperty("accounting_notes");
  });
});
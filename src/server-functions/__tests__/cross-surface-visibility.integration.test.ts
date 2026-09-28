import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({ client: null as PoolClient | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (text: string, values: readonly unknown[] = []) => {
    if (!holder.client) throw new Error("PostgreSQL test client unavailable");
    return (await holder.client.query(text, [...values])).rows;
  },
}));

import { searchWorkspace } from "@/server/repositories/workspace-search";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const now = new Date("2026-09-27T04:00:00.000Z");
const actor = (role: "accounting" | "sales", denyTask = false): RequestAuthorization => ({
  session: { profile: { id: "actor-1" } } as AppSession,
  actor: {
    profileId: "actor-1",
    role,
    status: "active",
    managedDepartmentIds: [],
    managedTeamIds: [],
    directReportIds: [],
  },
  overrides: denyTask
    ? [
        {
          profileId: "actor-1",
          capability: "tasks.view",
          effect: "deny",
          resourceType: "task",
          resourceId: "task-denied",
        },
      ]
    : [],
  now,
});

let pool: Pool;
describe("cross-surface search visibility on real PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    holder.client = await pool.connect();
    await holder.client.query("begin");
    await holder.client.query(
      "create temp table accounts (id text, name text, lifecycle_stage text, domain text, account_owner text) on commit drop",
    );
    await holder.client.query(
      "create temp table account_contacts (id text, name text, title text, email text, account_id text) on commit drop",
    );
    await holder.client.query(
      "create temp table leads (id text, company_name text, contact_name text, status text, contact_email text, assigned_to text) on commit drop",
    );
    await holder.client.query(
      "create temp table quotes (id text, number text, status text, currency text, account_id text, created_by text) on commit drop",
    );
    await holder.client.query(
      "create temp table clients (id text, company_name text, industry text, tier text, account_owner text) on commit drop",
    );
    await holder.client.query(
      "create temp table tasks (id text, title text, status text, priority text, description text, assigned_to text) on commit drop",
    );
    await holder.client.query(
      "insert into accounts values ('account-1','Acme','active',null,'actor-1')",
    );
    await holder.client.query(
      "insert into leads values ('lead-1','SecretCorp','Pat','new','sealed-lead@example.com','other-1')",
    );
    await holder.client.query(
      "insert into quotes values ('quote-1','Q-2026-001','sent','HKD','account-1','actor-1')",
    );
    await holder.client.query(
      "insert into tasks values ('task-denied','sealed-task','open','high','sealed-task-description','actor-1')",
    );
    await holder.client.query(
      "insert into tasks values ('task-allowed','Visible followup','open','medium','visible-marker','actor-1')",
    );
  });
  afterAll(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      holder.client.release();
      holder.client = null;
    }
    await pool?.end();
  });

  it.runIf(hasDatabase)("does not match lead-only sensitive text for accounting", async () => {
    expect(await searchWorkspace("sealed-lead", 20, actor("accounting"))).toEqual([]);
  });

  it.runIf(hasDatabase)("does not match a denied task's title or description", async () => {
    expect(await searchWorkspace("sealed-task", 20, actor("sales", true))).toEqual([]);
  });

  it.runIf(hasDatabase)(
    "still finds a visible quote without lead.view and an allowed task",
    async () => {
      const quotes = await searchWorkspace("Q-2026-001", 20, actor("accounting"));
      expect(quotes.map((item) => item.type)).toEqual(["Quote"]);
      const tasks = await searchWorkspace("visible-marker", 20, actor("sales", true));
      expect(tasks.map((item) => item.title)).toEqual(["Visible followup"]);
    },
  );
});

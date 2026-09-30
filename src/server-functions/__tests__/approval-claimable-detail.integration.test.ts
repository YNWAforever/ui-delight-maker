import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import type { HumanApproval } from "@/lib/types";

const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  context: null as RequestAuthorization | null,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const chain = {
      validator(next: (input: unknown) => unknown) {
        validate = next;
        return chain;
      },
      handler<T extends (input: { data: never }) => unknown>(handler: T) {
        return ({ data }: { data: unknown }) => handler({ data: validate(data) as never });
      },
    };
    return chain;
  },
}));
vi.mock("@/server/auth/authorization.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/authorization.server")>()),
  loadRequestAuthorization: async () => holder.context!,
}));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows[0] ?? null,
  transaction: async <T>(work: (db: Queryable) => Promise<T>) => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async <R>(sql: string, values: readonly unknown[] = []) => ({
          rows: (await client.query(sql, [...values])).rows as R[],
        }),
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
}));
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { getApprovalDetailFn } from "../approvals";
import { canClaimApproval, claimApprovalCommand } from "@/server/commands/agent-recovery.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const manager = "detail-manager-" + randomUUID(),
  owner = "detail-owner-" + randomUUID();
const outsider = "detail-outsider-" + randomUUID();
const fixtures: Array<{ quoteId: string; approvalId: string; leadId: string }> = [];
const context = (): RequestAuthorization => ({
  session: { profile: { id: manager, role: "manager", status: "active" } } as AppSession,
  actor: {
    profileId: manager,
    role: "manager",
    status: "active",
    managedTeamIds: [],
    managedDepartmentIds: [],
    directReportIds: [owner],
  },
  overrides: [],
  now: new Date(),
});
const read = getApprovalDetailFn as unknown as (input: {
  data: { id: string };
}) => Promise<HumanApproval & { can_claim: boolean }>;
async function fixture() {
  const f = { quoteId: randomUUID(), approvalId: randomUUID(), leadId: randomUUID() };
  fixtures.push(f);
  await holder.pool!.query(
    "insert into leads(id,company_name,assigned_to) values($1,'Synthetic detail lead',$2)",
    [f.leadId, owner],
  );
  await holder.pool!.query(
    "insert into quotes(id,created_by,lead_id,status,currency,total_value,line_items) values($1,$2,$3,'pending_approval','HKD',100.25,'[]')",
    [f.quoteId, owner, f.leadId],
  );
  await holder.pool!.query(
    "insert into human_approvals(id,approval_type,status,requested_by,context_summary,context_data) values($1,'quote_send','pending',$2,'Synthetic detail regression',$3::jsonb)",
    [
      f.approvalId,
      owner,
      JSON.stringify({ quote_id: f.quoteId, private_marker: "Scoped payload" }),
    ],
  );
  return f;
}
async function stored(id: string) {
  return (
    await holder.pool!.query<HumanApproval>("select * from human_approvals where id=$1", [id])
  ).rows[0];
}
async function snapshot(f: { approvalId: string }) {
  return {
    approval: await stored(f.approvalId),
    receipts: (
      await holder.pool!.query("select * from command_receipts where actor_id=$1 order by id", [
        manager,
      ])
    ).rows,
    audit: (
      await holder.pool!.query(
        "select * from activity_logs where object_type='approval' and object_id=$1 order by id",
        [f.approvalId],
      )
    ).rows,
  };
}
describe("claimable approval detail on migrated isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    for (const id of [manager, owner, outsider])
      await holder.pool.query(
        "insert into profiles(id,email,name,role,status) values($1,$2,'Synthetic detail actor',$3,'active')",
        [id, id + "@audit.test", id === manager ? "manager" : "sales"],
      );
  }, 60_000);
  beforeEach(() => {
    holder.context = context();
  });
  afterAll(async () => {
    if (!holder.pool) return;
    for (const f of fixtures) {
      await holder.pool.query("delete from command_receipts where actor_id=$1", [manager]);
      await holder.pool.query(
        "delete from activity_logs where object_type='approval' and object_id=$1",
        [f.approvalId],
      );
      await holder.pool.query("delete from human_approvals where id=$1", [f.approvalId]);
      await holder.pool.query("delete from quotes where id=$1", [f.quoteId]);
      await holder.pool.query("delete from leads where id=$1", [f.leadId]);
    }
    await holder.pool.query("delete from profiles where id=any($1::text[])", [
      [manager, owner, outsider],
    ]);
    await holder.pool.end();
  });
  it.runIf(hasDatabase)(
    "lets the in-scope manager read an unassigned linked quote before claiming",
    async () => {
      const f = await fixture(),
        before = await stored(f.approvalId);
      const result = await read({ data: { id: f.approvalId } });
      expect(result.can_claim).toBe(true);
      expect(result.context_data).toEqual({
        quote_id: f.quoteId,
        private_marker: "Scoped payload",
      });
      expect(await stored(f.approvalId)).toEqual(before);
    },
  );
  it.runIf(hasDatabase)(
    "preserves a normal assigned-record read without offering a second claim",
    async () => {
      const f = await fixture();
      await holder.pool!.query("update human_approvals set assigned_to=$2 where id=$1", [
        f.approvalId,
        manager,
      ]);
      expect((await read({ data: { id: f.approvalId } })).can_claim).toBe(false);
    },
  );
  it.runIf(hasDatabase).each(["approvals.view", "approvals.decide"] as const)(
    "denies %s override without a read leak, claim write, audit or receipt",
    async (capability) => {
      const f = await fixture();
      holder.context!.overrides.push({
        profileId: manager,
        capability,
        effect: "deny",
        resourceType: "human_approval",
        resourceId: f.approvalId,
      });
      const before = await snapshot(f);
      expect(await canClaimApproval(holder.context!, await stored(f.approvalId))).toBe(false);
      await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
        code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
      });
      await expect(
        claimApprovalCommand(holder.context!, {
          id: f.approvalId,
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/) });
      expect(await snapshot(f)).toEqual(before);
    },
  );
  it.runIf(hasDatabase)(
    "rolls back a claim and its receipt when linked-scope view is explicitly denied",
    async () => {
      const f = await fixture();
      holder.context!.overrides.push({
        profileId: manager,
        capability: "approvals.view",
        effect: "deny",
        resourceType: "human_approval",
        resourceId: f.approvalId,
      });
      const before = await snapshot(f);
      await expect(
        claimApprovalCommand(holder.context!, {
          id: f.approvalId,
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await snapshot(f)).toEqual(before);
    },
  );
  it.runIf(hasDatabase)("rechecks the actual linked owner after queue load", async () => {
    const f = await fixture();
    expect(await canClaimApproval(holder.context!, await stored(f.approvalId))).toBe(true);
    await holder.pool!.query("update quotes set created_by=$2 where id=$1", [f.quoteId, outsider]);
    expect(await canClaimApproval(holder.context!, await stored(f.approvalId))).toBe(false);
    await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
      code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
    });
  });
  it.runIf(hasDatabase)("does not accept expired grants for an unrelated owner", async () => {
    const f = await fixture();
    holder.context!.actor.directReportIds = [];
    for (const capability of ["approvals.view", "approvals.decide"] as const) {
      holder.context!.overrides.push({
        profileId: manager,
        capability,
        effect: "allow",
        resourceType: "human_approval",
        resourceId: f.approvalId,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
    }
    await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
      code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
    });
    expect(await canClaimApproval(holder.context!, await stored(f.approvalId))).toBe(false);
  });
  it.runIf(hasDatabase).each(["approved", "rejected"] as const)(
    "does not use claim scope to read an unassigned %s approval",
    async (status) => {
      const f = await fixture();
      await holder.pool!.query("update human_approvals set status=$2 where id=$1", [
        f.approvalId,
        status,
      ]);
      await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
        code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
      });
    },
  );
  it.runIf(hasDatabase)(
    "does not use another reviewer's assignment as a claimable read",
    async () => {
      const f = await fixture();
      await holder.pool!.query("update human_approvals set assigned_to=$2 where id=$1", [
        f.approvalId,
        outsider,
      ]);
      await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
        code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
      });
    },
  );
  it.runIf(hasDatabase)("fails closed when the linked quote has no owner", async () => {
    const f = await fixture();
    await holder.pool!.query("update quotes set created_by=null where id=$1", [f.quoteId]);
    await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
      code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
    });
  });
  it.runIf(hasDatabase)("denies an inactive requester", async () => {
    const f = await fixture();
    holder.context!.actor.status = "suspended";
    await expect(read({ data: { id: f.approvalId } })).rejects.toMatchObject({
      code: expect.stringMatching(/^(FORBIDDEN|OUTSIDE_SCOPE)$/),
    });
  });
});

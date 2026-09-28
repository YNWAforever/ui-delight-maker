import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  transaction: async <T>(work: (db: Queryable) => Promise<T>): Promise<T> => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: async <R>(sql: string, values: readonly unknown[] = []) => {
          const response = await client.query(sql, [...values]);
          return { rows: response.rows as R[] };
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
  },
  query: async (sql: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { decideApprovalCommand } from "@/server/commands/approval-decision.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = "audit-risk-reviewer";
const fixtures: Array<{
  approvalId: string;
  runId: string;
  engagementIds: string[];
  clientId: string;
  productId: string;
}> = [];
const db = () => holder.pool!;
function context(): RequestAuthorization {
  return {
    session: { profile: { id: actorId, role: "manager", status: "active" } } as AppSession,
    actor: {
      profileId: actorId,
      role: "manager",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date(),
  };
}
async function fixture(options: { healthScore?: number; wrongTarget?: boolean } = {}) {
  const clientId = randomUUID(),
    productId = randomUUID(),
    engagementId = randomUUID();
  const wrongId = options.wrongTarget ? randomUUID() : null;
  const runId = randomUUID(),
    approvalId = randomUUID();
  fixtures.push({
    approvalId,
    runId,
    engagementIds: [engagementId, ...(wrongId ? [wrongId] : [])],
    clientId,
    productId,
  });
  await db().query("insert into clients (id,company_name) values ($1,'Audit Risk Client')", [
    clientId,
  ]);
  await db().query(
    "insert into products (id,name,billing_type) values ($1,'Audit Risk Product','retainer')",
    [productId],
  );
  for (const id of [engagementId, ...(wrongId ? [wrongId] : [])]) {
    await db().query(
      "insert into engagements (id,client_id,product_id,owner,billing_period) values ($1,$2,$3,$4,'monthly')",
      [id, clientId, productId, actorId],
    );
  }
  await db().query(
    `insert into agent_runs (id,agent_name,workflow_type,subject_type,subject_id,status,human_review_required,output_data)
     values ($1,'Renewal Risk Agent','score_renewal_risk','engagement',$2,'waiting_approval',true,'{}'::jsonb)`,
    [runId, engagementId],
  );
  await db().query(
    `insert into human_approvals (id,agent_run_id,approval_type,status,assigned_to,context_data)
     values ($1,$2,'cs_risk_review','pending',$4,$3::jsonb)`,
    [
      approvalId,
      runId,
      JSON.stringify({
        engagement_id: wrongId ?? engagementId,
        health_score: options.healthScore ?? 13,
        renewal_risk: "high",
        risk_reasoning: "Audited risk",
        suggested_next_action: "Schedule review",
      }),
      actorId,
    ],
  );
  return { approvalId, runId, engagementId, wrongId };
}
async function state(
  ids: { approvalId: string; runId: string; engagementId: string },
  key: string,
) {
  const [approval, run, engagement, logs, receipts] = await Promise.all([
    db().query("select status,row_version,decided_at from human_approvals where id=$1", [
      ids.approvalId,
    ]),
    db().query("select status,human_review_required,output_data from agent_runs where id=$1", [
      ids.runId,
    ]),
    db().query("select health_score,renewal_risk from engagements where id=$1", [ids.engagementId]),
    db().query(
      "select object_type,action from activity_logs where (object_type='approval' and object_id=$1) or (object_type='engagement' and object_id=$2)",
      [ids.approvalId, ids.engagementId],
    ),
    db().query("select id from command_receipts where idempotency_key=$1", [key]),
  ]);
  return {
    approval: approval.rows[0],
    run: run.rows[0],
    engagement: engagement.rows[0],
    logs: logs.rows,
    receipts: receipts.rows,
  };
}

describe("risk review decision on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(db(), migrations);
    await db().query(
      "insert into profiles (id,email,name,role,status) values ($1,$2,'Risk Reviewer','manager','active') on conflict (id) do update set role='manager',status='active'",
      [actorId, actorId + "@audit-risk.test"],
    );
  }, 60_000);
  afterAll(async () => {
    if (!holder.pool) return;
    for (const f of fixtures) {
      await db().query("delete from command_receipts where result->>'id'=$1", [f.approvalId]);
      await db().query(
        "delete from activity_logs where (object_type='approval' and object_id=$1) or (object_type='engagement' and object_id=any($2::uuid[]))",
        [f.approvalId, f.engagementIds],
      );
      await db().query("delete from human_approvals where id=$1", [f.approvalId]);
      await db().query("delete from agent_runs where id=$1", [f.runId]);
      await db().query("delete from engagements where id=any($1::uuid[])", [f.engagementIds]);
      await db().query("delete from products where id=$1", [f.productId]);
      await db().query("delete from clients where id=$1", [f.clientId]);
    }
    await db().query("delete from profiles where id=$1", [actorId]);
    await holder.pool.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "rolls back approval, run, audit and receipt when the engagement write fails",
    async () => {
      const ids = await fixture({ healthScore: 13 });
      const key = randomUUID();
      await db()
        .query(`create or replace function audit_risk_review_fail_13() returns trigger language plpgsql as $$
      begin if new.health_score = 13 then raise exception 'audit injected engagement failure'; end if; return new; end $$`);
      await db().query(
        "create trigger audit_risk_review_fail_13 before update on engagements for each row execute function audit_risk_review_fail_13()",
      );
      try {
        await expect(
          decideApprovalCommand(context(), {
            id: ids.approvalId,
            decision: "approved",
            expectedVersion: 0,
            idempotencyKey: key,
          }),
        ).rejects.toThrow("audit injected engagement failure");
      } finally {
        await db().query("drop trigger audit_risk_review_fail_13 on engagements");
        await db().query("drop function audit_risk_review_fail_13()");
      }
      const after = await state(ids, key);
      expect(after.approval).toMatchObject({ status: "pending", row_version: 0, decided_at: null });
      expect(after.run).toMatchObject({ status: "waiting_approval", human_review_required: true });
      expect(after.engagement).toMatchObject({ health_score: 50, renewal_risk: "low" });
      expect(after.logs).toHaveLength(0);
      expect(after.receipts).toHaveLength(0);
      const retry = await decideApprovalCommand(context(), {
        id: ids.approvalId,
        decision: "approved",
        expectedVersion: 0,
        idempotencyKey: key,
      });
      expect(retry.status).toBe("approved");
    },
  );

  it.runIf(hasDatabase)(
    "applies once and replays the same key without duplicate audit",
    async () => {
      const ids = await fixture();
      const key = randomUUID();
      const input = {
        id: ids.approvalId,
        decision: "approved" as const,
        expectedVersion: 0,
        idempotencyKey: key,
      };
      const first = await decideApprovalCommand(context(), input);
      const replay = await decideApprovalCommand(context(), input);
      expect(replay.row_version).toBe(first.row_version);
      const after = await state(ids, key);
      expect(after.approval.status).toBe("approved");
      expect(after.run).toMatchObject({
        status: "completed",
        human_review_required: false,
        output_data: { review_outcome: "approved", reviewed_approval_id: ids.approvalId },
      });
      expect(after.engagement).toMatchObject({ health_score: 13, renewal_risk: "high" });
      expect(
        after.logs.filter((row: { object_type: string }) => row.object_type === "approval"),
      ).toHaveLength(1);
      expect(
        after.logs.filter((row: { object_type: string }) => row.object_type === "engagement"),
      ).toHaveLength(1);
      expect(after.receipts).toHaveLength(1);
    },
  );

  it.runIf(hasDatabase)("rejects a held payload pointing to another engagement", async () => {
    const ids = await fixture({ wrongTarget: true });
    const key = randomUUID();
    await expect(
      decideApprovalCommand(context(), {
        id: ids.approvalId,
        decision: "approved",
        expectedVersion: 0,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await state(ids, key);
    expect(after.approval).toMatchObject({ status: "pending", row_version: 0 });
    expect(after.run).toMatchObject({ status: "waiting_approval", human_review_required: true });
    expect(after.logs).toHaveLength(0);
    expect(after.receipts).toHaveLength(0);
    expect(
      (
        await db().query("select health_score,renewal_risk from engagements where id=$1", [
          ids.wrongId,
        ])
      ).rows[0],
    ).toMatchObject({ health_score: 50, renewal_risk: "low" });
  });

  it.runIf(hasDatabase)(
    "rolls back when the assigned manager is denied engagement update",
    async () => {
      const ids = await fixture();
      const key = randomUUID();
      const denied = context();
      denied.overrides = [
        {
          profileId: actorId,
          capability: "engagements.update",
          effect: "deny",
          resourceType: "engagement",
          resourceId: ids.engagementId,
        },
      ];
      await expect(
        decideApprovalCommand(denied, {
          id: ids.approvalId,
          decision: "approved",
          expectedVersion: 0,
          idempotencyKey: key,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const after = await state(ids, key);
      expect(after.approval).toMatchObject({ status: "pending", row_version: 0 });
      expect(after.run).toMatchObject({ status: "waiting_approval", human_review_required: true });
      expect(after.engagement).toMatchObject({ health_score: 50, renewal_risk: "low" });
      expect(after.logs).toHaveLength(0);
      expect(after.receipts).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase)("refuses a decision when its linked run already left review", async () => {
    const ids = await fixture();
    const key = randomUUID();
    await db().query(
      "update agent_runs set status='completed',human_review_required=false where id=$1",
      [ids.runId],
    );
    await expect(
      decideApprovalCommand(context(), {
        id: ids.approvalId,
        decision: "approved",
        expectedVersion: 0,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await state(ids, key);
    expect(after.approval).toMatchObject({ status: "pending", row_version: 0 });
    expect(after.run).toMatchObject({ status: "completed", human_review_required: false });
    expect(after.engagement).toMatchObject({ health_score: 50, renewal_risk: "low" });
    expect(after.logs).toHaveLength(0);
    expect(after.receipts).toHaveLength(0);
  });

  it.runIf(hasDatabase)(
    "records a rejected review outcome without applying the score",
    async () => {
      const ids = await fixture();
      const key = randomUUID();
      await decideApprovalCommand(context(), {
        id: ids.approvalId,
        decision: "rejected",
        expectedVersion: 0,
        idempotencyKey: key,
      });
      const after = await state(ids, key);
      expect(after.approval.status).toBe("rejected");
      expect(after.run).toMatchObject({
        status: "completed",
        human_review_required: false,
        output_data: { review_outcome: "rejected" },
      });
      expect(after.engagement).toMatchObject({ health_score: 50, renewal_risk: "low" });
      expect(
        after.logs.filter((row: { object_type: string }) => row.object_type === "approval"),
      ).toHaveLength(1);
      expect(
        after.logs.filter((row: { object_type: string }) => row.object_type === "engagement"),
      ).toHaveLength(0);
    },
  );
});

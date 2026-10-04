import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { loadRequestAuthorization } from "@/server/auth/authorization.server";
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, v: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...v])).rows,
  queryOne: async (sql: string, v: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...v])).rows[0] ?? null,
  transaction: async <T>(work: (db: Queryable) => Promise<T>) => {
    const c = await holder.pool!.connect();
    try {
      await c.query("begin");
      const r = await work({
        query: async <R>(sql: string, v: readonly unknown[] = []) => ({
          rows: (await c.query(sql, [...v])).rows as R[],
        }),
      });
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  },
}));
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
const enabled = Boolean(process.env.DATABASE_TEST_URL),
  databaseName = "clientops_ai_bulk_" + randomUUID().replaceAll("-", "");
const manager = "bulk-manager",
  otherManager = "bulk-other-manager",
  owner = "bulk-owner",
  outsider = "bulk-outsider";
let admin: Pool;
function context(actorId = manager): RequestAuthorization {
  return {
    session: { profile: { id: actorId, role: "manager", status: "active" } },
    actor: {
      profileId: actorId,
      role: "manager",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [owner],
    },
    overrides: [],
    now: new Date(),
  } as unknown as RequestAuthorization;
}
async function api() {
  return import("../agent-bulk-recovery.server");
}
async function fixture(
  options: {
    owner?: string;
    status?: string;
    source?: string;
    age?: number;
    linked?: boolean;
    note?: boolean;
  } = {},
) {
  const leadId = randomUUID(),
    runId = randomUUID();
  await holder.pool!.query(
    "insert into leads(id,company_name,assigned_to) values($1,'Synthetic bulk',$2)",
    [leadId, options.owner ?? owner],
  );
  await holder.pool!.query(
    "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,created_by,status,created_at,execution_metadata) values($1,'Synthetic workflow',$2,$3,$4,$5,$6,clock_timestamp()-$7::interval,$8::jsonb)",
    [
      runId,
      options.note ? "note_tidy" : "draft_reply",
      options.note ? "note" : "lead",
      leadId,
      owner,
      options.status ?? "running",
      (options.age ?? 120) + " minutes",
      JSON.stringify({ source: options.source ?? "deterministic_fallback" }),
    ],
  );
  if (options.linked)
    await holder.pool!.query(
      "insert into human_approvals(agent_run_id,approval_type,status,assigned_to) values($1,'message_send','pending',$2)",
      [runId, owner],
    );
  return { runId, leadId };
}
const reason = "Close synthetic local records after review";
async function preview(ids: string[], action = "expire", ctx = context()) {
  return (await api()).previewAgentRecovery(ctx, { runIds: ids, action });
}
async function execute(
  p: { previewId: string },
  key = randomUUID(),
  ctx = context(),
  extra: { reason?: string; processLimit?: number } = {},
) {
  return (await api()).executeAgentRecovery(
    ctx,
    { previewId: p.previewId, idempotencyKey: key, reason, ...extra },
    { processLimit: extra.processLimit },
  );
}
describe("durable agent bulk maintenance on physical PostgreSQL", () => {
  it.runIf(enabled)(
    "persisted read-only actor cannot commit even with an existing owned preview",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      await holder.pool!.query("update profiles set role='read_only' where id=$1", [manager]);
      try {
        const readOnly = await loadRequestAuthorization({
          ...context().session,
          profile: { ...context().session.profile, role: "read_only" },
        });
        await expect(execute(p, randomUUID(), readOnly)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        expect(
          (await holder.pool!.query("select status from agent_runs where id=$1", [f.runId])).rows[0]
            .status,
        ).toBe("running");
        expect(
          (
            await holder.pool!.query(
              "select count(*)::int n from command_receipts where idempotency_key=$1",
              [p.previewId + ":" + f.runId],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await holder.pool!.query("update profiles set role='manager' where id=$1", [manager]);
      }
    },
  );
  it.runIf(enabled)(
    "two persisted authorized actors racing separate previews produce one side effect",
    async () => {
      const f = await fixture();
      const first = await preview([f.runId]);
      await holder.pool!.query("update profiles set role='admin' where id=$1", [otherManager]);
      try {
        const secondContext = await loadRequestAuthorization({
          ...context(otherManager).session,
          profile: { ...context(otherManager).session.profile, role: "admin" },
        });
        const second = await preview([f.runId], "expire", secondContext);
        const results = await Promise.all([
          execute(first),
          execute(second, randomUUID(), secondContext),
        ]);
        expect(
          results.flatMap((r) => r.items).filter((i) => i.status === "succeeded"),
        ).toHaveLength(1);
        expect(
          (
            await holder.pool!.query(
              "select count(*)::int n from activity_logs where object_id=$1 and action='expire agent run'",
              [f.runId],
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        await holder.pool!.query("update profiles set role='manager' where id=$1", [otherManager]);
      }
    },
  );
  it.runIf(enabled)(
    "failed item rolls back run, activity and command receipt together",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      await holder.pool!.query(
        `create function test_bulk_activity_failure() returns trigger language plpgsql as $$ begin if new.object_id='${f.runId}'::uuid then raise exception 'Synthetic rollback fault'; end if; return new; end $$`,
      );
      await holder.pool!.query(
        "create trigger test_bulk_activity_failure before insert on activity_logs for each row execute function test_bulk_activity_failure()",
      );
      try {
        const r = await execute(p);
        expect(r.items[0]).toMatchObject({ status: "failed", reasonCode: "ITEM_FAILED" });
        expect(
          (await holder.pool!.query("select status from agent_runs where id=$1", [f.runId])).rows[0]
            .status,
        ).toBe("running");
        expect(
          (
            await holder.pool!.query(
              "select count(*)::int n from command_receipts where idempotency_key=$1",
              [p.previewId + ":" + f.runId],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await holder.pool!.query("drop trigger test_bulk_activity_failure on activity_logs");
        await holder.pool!.query("drop function test_bulk_activity_failure()");
      }
    },
  );
  it.runIf(enabled)(
    "expired item lease resumes while completed receipts stay immutable",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      const key = randomUUID();
      await execute(p, key, context(), { processLimit: 0 });
      await holder.pool!.query(
        "update bulk_operation_items set lease_owner=$2,lease_until=clock_timestamp()-interval '1 second' where operation_id=$1",
        [p.previewId, randomUUID()],
      );
      const r = await (await api()).resumeAgentRecovery(context(), { operationId: p.previewId });
      expect(r.items[0].status).toBe("succeeded");
      const replay = await execute(p, key);
      expect(replay).toEqual(r);
    },
  );
  beforeAll(async () => {
    if (!enabled) return;
    const u = new URL(process.env.DATABASE_TEST_URL!);
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    if (u.hostname !== "127.0.0.1") throw Error("Disposable loopback DB required");
    admin = new Pool({ connectionString: u.toString() });
    await admin.query(`create database "${databaseName}"`);
    u.pathname = "/" + databaseName;
    holder.pool = new Pool({ connectionString: u.toString() });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    for (const [id, role] of [
      [manager, "manager"],
      [otherManager, "manager"],
      [owner, "sales"],
      [outsider, "sales"],
    ])
      await holder.pool.query(
        "insert into profiles(id,email,name,role,status,manager_profile_id) values($1,$2,'Synthetic',$3,'active',$4)",
        [id, id + "@fixture.invalid", role, id === owner ? manager : null],
      );
  }, 60000);
  afterAll(async () => {
    await holder.pool?.end();
    if (admin) {
      if (!/^clientops_ai_bulk_[a-f0-9]{32}$/.test(databaseName)) throw Error("Owned DB required");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });
  it.runIf(enabled)("rejects_101_ids and unsupported provider actions", async () => {
    const ids = Array.from({ length: 101 }, () => randomUUID());
    await expect(preview(ids)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    for (const action of ["retry", "approve", "send", "issue"])
      await expect(preview(ids.slice(0, 1), action)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
  });
  it.runIf(enabled)(
    "mixed100 records eligible, young, terminal, forbidden, linked, ambiguous and auxiliary results",
    async () => {
      const ids: string[] = [];
      const patterns = [
        {},
        { age: 10 },
        { status: "completed" },
        { owner: outsider },
        { linked: true, status: "waiting_approval" },
        { source: "unknown" },
        { note: true },
      ];
      for (let i = 0; i < 100; i++) ids.push((await fixture(patterns[i % patterns.length])).runId);
      const p = await preview(ids);
      expect(p.items).toHaveLength(100);
      expect(p.eligibleCount).toBe(15);
      expect(p.blockedCount).toBe(85);
      const r = await execute(p);
      let receipt = r;
      while (receipt.status !== "completed")
        receipt = await (
          await api()
        ).resumeAgentRecovery(context(), { operationId: r.operationId });
      expect(receipt.items).toHaveLength(100);
      expect(receipt.items.filter((v) => v.status === "succeeded")).toHaveLength(15);
      expect(new Set(receipt.items.map((v) => v.reasonCode))).toEqual(
        new Set([
          "SUCCEEDED",
          "TOO_YOUNG",
          "TERMINAL",
          "FORBIDDEN",
          "LINKED_APPROVAL",
          "PROVIDER_OUTCOME_UNKNOWN",
          "UNSUPPORTED_OWNERSHIP",
        ]),
      );
    },
  );
  it.runIf(enabled)(
    "does_not_close_linked_approvals_in_bulk including linkage after preview",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      await holder.pool!.query(
        "insert into human_approvals(agent_run_id,approval_type,status,assigned_to) values($1,'message_send','pending',$2)",
        [f.runId, owner],
      );
      const r = await execute(p);
      expect(r.items[0]).toMatchObject({ status: "skipped", reasonCode: "LINKED_APPROVAL" });
      expect(
        (
          await holder.pool!.query("select status from human_approvals where agent_run_id=$1", [
            f.runId,
          ])
        ).rows[0].status,
      ).toBe("pending");
      expect(
        (await holder.pool!.query("select status from agent_runs where id=$1", [f.runId])).rows[0]
          .status,
      ).toBe("running");
    },
  );
  it.runIf(enabled)(
    "rejects_expired_or_other_actor_preview and foreign receipt reads",
    async () => {
      const p = await preview([(await fixture()).runId]);
      await expect(execute(p, randomUUID(), context(otherManager))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        (await api()).getAgentRecoveryOperation(context(otherManager), {
          operationId: p.previewId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await holder.pool!.query(
        "update bulk_operations set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [p.previewId],
      );
      await expect(execute(p)).rejects.toMatchObject({ code: "CONFLICT" });
    },
  );
  it.runIf(enabled)(
    "replays_after_lost_response and rejects same key with a changed reason or preview",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      const key = randomUUID();
      const first = await execute(p, key);
      const second = await execute(p, key);
      expect(second).toEqual(first);
      expect(first.items[0].commandReceiptId).toBeTruthy();
      expect(
        (
          await holder.pool!.query(
            "select count(*)::int n from activity_logs where object_id=$1 and action='expire agent run'",
            [f.runId],
          )
        ).rows[0].n,
      ).toBe(1);
      await expect(
        execute(p, key, context(), { reason: "Changed reviewed recovery reason" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const other = await preview([(await fixture()).runId]);
      await expect(execute(other, key)).rejects.toMatchObject({ code: "CONFLICT" });
    },
  );
  it.runIf(enabled)(
    "full locked snapshot detects callback/output change even without row version",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      await holder.pool!.query(
        "update agent_runs set output_summary='Changed by actual writer' where id=$1",
        [f.runId],
      );
      const r = await execute(p);
      expect(r.items[0]).toMatchObject({ status: "stale", reasonCode: "STALE_SNAPSHOT" });
      expect(
        (await holder.pool!.query("select status from agent_runs where id=$1", [f.runId])).rows[0]
          .status,
      ).toBe("running");
    },
  );
  it.runIf(enabled)(
    "reauthorizes_each_item after a persisted owner permission revocation",
    async () => {
      const f = await fixture();
      const p = await preview([f.runId]);
      await holder.pool!.query("update profiles set manager_profile_id=null where id=$1", [owner]);
      try {
        const r = await execute(p);
        expect(r.items[0]).toMatchObject({ status: "forbidden", reasonCode: "FORBIDDEN" });
      } finally {
        await holder.pool!.query("update profiles set manager_profile_id=$1 where id=$2", [
          manager,
          owner,
        ]);
      }
    },
  );
  it.runIf(enabled)("two concurrent operators cannot apply a second side effect", async () => {
    const f = await fixture();
    const p = await preview([f.runId]);
    const key = randomUUID();
    await Promise.all([execute(p, key), execute(p, key)]);
    expect(
      (
        await holder.pool!.query(
          "select count(*)::int n from activity_logs where object_id=$1 and action='expire agent run'",
          [f.runId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it.runIf(enabled)(
    "resumes_after_item_37 on the same operation without replaying completed items",
    async () => {
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) ids.push((await fixture()).runId);
      const p = await preview(ids);
      const key = randomUUID();
      let r = await execute(p, key, context(), { processLimit: 20 });
      r = await (
        await api()
      ).resumeAgentRecovery(context(), { operationId: r.operationId }, { processLimit: 17 });
      expect(r.completedCount).toBe(37);
      const operationId = r.operationId;
      while (r.status !== "completed")
        r = await (await api()).resumeAgentRecovery(context(), { operationId });
      expect(r.completedCount).toBe(100);
      expect(r.items.every((v) => v.status === "succeeded")).toBe(true);
      expect(
        (
          await holder.pool!.query(
            "select count(*)::int n from command_receipts where scope='agent.recovery' and idempotency_key like $1",
            [operationId + ":%"],
          )
        ).rows[0].n,
      ).toBe(100);
    },
  );
});

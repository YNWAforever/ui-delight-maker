import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  active: 0,
  peak: 0,
  calls: 0,
  policyReads: 0,
}));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, v: readonly unknown[] = [], db?: Queryable) => {
    if (sql.includes("distinct on (workflow_type)")) holder.policyReads++;
    return (await (db ?? holder.pool!).query(sql, [...v])).rows;
  },
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
vi.mock("@/lib/n8n", async (original) => ({
  ...(await original<typeof import("@/lib/n8n")>()),
  getN8nDispatchConfig: () => ({
    webhookUrl: "https://mock.fixture.invalid",
    workflowToken: "synthetic-mock-only",
  }),
  triggerN8n: vi.fn(async () => {
    holder.calls++;
    holder.active++;
    holder.peak = Math.max(holder.peak, holder.active);
    await new Promise((r) => setTimeout(r, 1));
    holder.active--;
  }),
}));
import { triggerN8n } from "@/lib/n8n";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { setAgentPolicy } from "@/server/repositories/agent-policy";
const enabled = Boolean(process.env.DATABASE_TEST_URL),
  databaseName = "clientops_ai_sweep_" + randomUUID().replaceAll("-", "");
let admin: Pool;
async function batch(sweepId: string, extra: Record<string, unknown> = {}) {
  const api = await import("../retention-sweep.server");
  return api.runRetentionSweepBatch({
    sweepId,
    today: "2026-10-03",
    limit: 50,
    deadlineAt: Date.now() + 60000,
    ...extra,
  });
}
describe("checkpointed retention sweep in physical PostgreSQL / mock external dispatcher", () => {
  beforeAll(async () => {
    if (!enabled) return;
    const u = new URL(process.env.DATABASE_TEST_URL!);
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    if (u.hostname !== "127.0.0.1") throw Error("Disposable loopback required");
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
    await holder.pool.query(
      "insert into profiles(id,email,name,role,status) values('sweep-owner','sweep@fixture.invalid','Synthetic','manager','active')",
    );
    const {
      rows: [client],
    } = await holder.pool.query(
      "insert into clients(company_name,account_owner) values('Synthetic Sweep','sweep-owner') returning id",
    );
    const {
      rows: [product],
    } = await holder.pool.query(
      "insert into products(name,billing_type) values('Synthetic','retainer') returning id",
    );
    await holder.pool.query(
      "insert into engagements(client_id,product_id,owner,billing_period,status,start_date,renewal_date,last_touch_at,created_at) select $1,$2,'sweep-owner','monthly','active','2025-01-01','2026-10-23','2026-08-01','2025-01-01' from generate_series(1,500)",
      [client.id, product.id],
    );
  }, 60000);
  beforeEach(async () => {
    if (!enabled) return;
    vi.restoreAllMocks();
    const schema = (await holder.pool!.query("select to_regclass('retention_sweeps') as exists"))
      .rows[0];
    await holder.pool!.query(
      schema.exists
        ? "truncate retention_sweep_items,retention_sweeps,agent_runs,notifications,agent_policy_versions cascade"
        : "truncate agent_runs,notifications,agent_policy_versions cascade",
    );
    holder.calls = 0;
    holder.active = 0;
    holder.peak = 0;
    holder.policyReads = 0;
    vi.mocked(triggerN8n)
      .mockReset()
      .mockImplementation(async () => {
        holder.calls++;
        holder.active++;
        holder.peak = Math.max(holder.peak, holder.active);
        await new Promise((r) => setTimeout(r, 1));
        holder.active--;
      });
  });
  afterAll(async () => {
    await holder.pool?.end();
    if (admin) {
      if (!/^clientops_ai_sweep_[a-f0-9]{32}$/.test(databaseName)) throw Error("Owned DB required");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });
  it.runIf(enabled)(
    "resumes_500_without_duplicate_notifications or dispatches and isolates one failure",
    async () => {
      vi.mocked(triggerN8n).mockRejectedValueOnce(new Error("Synthetic known provider error"));
      const sweepId = randomUUID();
      let cursor: string | null = null;
      let result;
      do {
        result = await batch(sweepId, { cursor });
        expect(result.scanned).toBeLessThanOrEqual(50);
        cursor = result.nextCursor;
      } while (!result.complete);
      expect(result.totals.scanned).toBe(500);
      expect(result.totals.failed).toBe(1);
      expect(holder.calls).toBe(499);
      expect(
        (await holder.pool!.query("select count(*)::int n from notifications")).rows[0].n,
      ).toBe(1000);
      expect((await holder.pool!.query("select count(*)::int n from agent_runs")).rows[0].n).toBe(
        500,
      );
      await batch(sweepId, { cursor });
      expect(holder.calls).toBe(499);
      expect(holder.peak).toBeLessThanOrEqual(3);
    },
    // Multiple physical DB batches share this test; each batch retains its own server deadline.
    120000,
  );
  it.runIf(enabled)(
    "stops_before_deadline_and_checkpoints without starting notifications or dispatch",
    async () => {
      const result = await batch(randomUUID(), { deadlineAt: Date.now() + 19000 });
      expect(result.scanned).toBe(0);
      expect(result.complete).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(holder.calls).toBe(0);
      expect(
        (await holder.pool!.query("select count(*)::int n from notifications")).rows[0].n,
      ).toBe(0);
    },
  );
  it.runIf(enabled)("allows_only_one_sweep_lease for two concurrent workers", async () => {
    const sweepId = randomUUID();
    const results = await Promise.all([batch(sweepId), batch(sweepId)]);
    expect(results.filter((r) => r.busy)).toHaveLength(1);
    expect(results.reduce((n, r) => n + r.scanned, 0)).toBe(50);
    expect(holder.calls).toBe(50);
  });
  it.runIf(enabled)(
    "marks_crash_after_dispatch_as_ambiguous and never blindly resends",
    async () => {
      const {
        rows: [first],
      } = await holder.pool!.query("select id from engagements order by id limit 1");
      await holder.pool!.query(
        `create function test_sweep_ack_failure() returns trigger language plpgsql as $$ begin if new.engagement_id='${first.id}'::uuid and new.action='dispatch' and new.state='acknowledged' then raise exception 'Synthetic after-send before-ack crash'; end if; return new; end $$`,
      );
      await holder.pool!.query(
        "create trigger test_sweep_ack_failure before update on retention_sweep_items for each row execute function test_sweep_ack_failure()",
      );
      const sweepId = randomUUID();
      try {
        const result = await batch(sweepId, { limit: 1 });
        expect(result.ambiguous).toBe(1);
        expect(holder.calls).toBe(1);
        await batch(sweepId, { cursor: result.nextCursor, limit: 1 });
        expect(holder.calls).toBe(2);
        expect(
          (
            await holder.pool!.query(
              "select state from retention_sweep_items where sweep_id=$1 and engagement_id=$2 and action='dispatch'",
              [sweepId, first.id],
            )
          ).rows[0].state,
        ).toBe("ambiguous");
      } finally {
        await holder.pool!.query("drop trigger test_sweep_ack_failure on retention_sweep_items");
        await holder.pool!.query("drop function test_sweep_ack_failure()");
      }
    },
  );
  it.runIf(enabled)(
    "honors_pause_before_next_dispatch_round and reloads policy once per round",
    async () => {
      let first = true;
      vi.mocked(triggerN8n).mockImplementation(async () => {
        holder.calls++;
        if (first) {
          first = false;
          await setAgentPolicy({
            workflowType: "score_renewal_risk",
            status: "inactive",
            humanApproval: true,
            changedBy: "sweep-owner",
            reason: "Synthetic pause between rounds",
          });
        }
      });
      const result = await batch(randomUUID());
      expect(holder.calls).toBe(3);
      expect(result.scanned).toBe(50);
      expect(result.dispatched).toBe(3);
      expect(holder.policyReads).toBe(17);
    },
  );
  it.runIf(enabled)("rejects wrong cursor, changed fixed day and oversized batches", async () => {
    const sweepId = randomUUID();
    const first = await batch(sweepId, { limit: 1 });
    await expect(batch(sweepId, { cursor: randomUUID() })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      batch(sweepId, { cursor: first.nextCursor, today: "2026-10-04" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(batch(sweepId, { limit: 51 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it.runIf(enabled)(
    "checkpoints the completed round when actual remaining deadline decreases",
    async () => {
      const now = Date.now.bind(Date);
      let elapsed = 0;
      vi.spyOn(Date, "now").mockImplementation(() => now() + elapsed);
      vi.mocked(triggerN8n).mockImplementation(async () => {
        holder.calls++;
        elapsed = 36000;
      });
      try {
        const result = await batch(randomUUID());
        expect(result.scanned).toBe(3);
        expect(result.complete).toBe(false);
        expect(result.nextCursor).not.toBeNull();
        expect(holder.calls).toBeLessThanOrEqual(3);
        expect(
          (
            await holder.pool!.query(
              "select cursor,lease_owner from retention_sweeps where id=$1",
              [result.sweepId],
            )
          ).rows[0],
        ).toMatchObject({ cursor: result.nextCursor, lease_owner: null });
      } finally {
        vi.restoreAllMocks();
      }
    },
  );
  it.runIf(enabled)(
    "expired intent becomes ambiguous without redispatch, even before a cursor was saved",
    async () => {
      const { claimRetentionSweep } = await import("@/server/repositories/retention-sweeps");
      const sweepId = randomUUID();
      await claimRetentionSweep({ sweepId, today: "2026-10-03" });
      const {
        rows: [first],
      } = await holder.pool!.query("select id from engagements order by id limit 1");
      const {
        rows: [run],
      } = await holder.pool!.query(
        "insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,trigger_type,status) values('Renewal Risk Agent','score_renewal_risk','engagement',$1,'schedule','running') returning id",
        [first.id],
      );
      await holder.pool!.query(
        "insert into retention_sweep_items(sweep_id,engagement_id,action,state,run_id) values($1,$2,'engagement','intent',$3),($1,$2,'dispatch','intent',$3)",
        [sweepId, first.id, run.id],
      );
      await holder.pool!.query(
        "update retention_sweeps set lease_until=clock_timestamp()-interval '1 second' where id=$1",
        [sweepId],
      );
      const result = await batch(sweepId, { limit: 1 });
      expect(holder.calls).toBe(0);
      expect(result.nextCursor).toBe(first.id);
      expect(result.totals.ambiguous).toBe(1);
      expect(
        (
          await holder.pool!.query(
            "select reason_code from retention_sweep_items where sweep_id=$1 and action='dispatch'",
            [sweepId],
          )
        ).rows[0].reason_code,
      ).toBe("LEASE_EXPIRED_AFTER_INTENT");
    },
  );
  it.runIf(enabled)(
    "resumes after checkpoint transaction failure without repeating recorded outcomes",
    async () => {
      await holder.pool!.query(
        "create function test_checkpoint_failure() returns trigger language plpgsql as $$ begin if new.cursor is not null then raise exception 'Synthetic checkpoint crash'; end if; return new; end $$",
      );
      await holder.pool!.query(
        "create trigger test_checkpoint_failure before update on retention_sweeps for each row execute function test_checkpoint_failure()",
      );
      const sweepId = randomUUID();
      try {
        await expect(batch(sweepId)).rejects.toThrow("Synthetic checkpoint crash");
        expect(holder.calls).toBe(50);
      } finally {
        await holder.pool!.query("drop trigger test_checkpoint_failure on retention_sweeps");
        await holder.pool!.query("drop function test_checkpoint_failure()");
      }
      await holder.pool!.query(
        "update retention_sweeps set lease_until=clock_timestamp()-interval '1 second' where id=$1",
        [sweepId],
      );
      const result = await batch(sweepId);
      expect(holder.calls).toBe(50);
      expect(result.scanned).toBe(50);
      expect(result.totals.dispatched).toBe(50);
      expect(result.totals.notified).toBe(100);
    },
  );
});


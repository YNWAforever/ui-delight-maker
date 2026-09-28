import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

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
  query: async (sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import {
  BulkItemError,
  createBulkService,
  type BulkActionHandler,
} from "@/server/operations/bulk.server";
import { productionBulkHandler } from "@/server/operations/bulk-actions.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = "audit-bulk-actor";
const otherActorId = "audit-bulk-other";
const createdIds: string[] = [];
const operationIds: string[] = [];
const db = () => holder.pool!;
function context(id = actorId): RequestAuthorization {
  return {
    session: { profile: { id, role: "admin", status: "active" } } as AppSession,
    actor: {
      profileId: id,
      role: "admin",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date(),
  };
}
type Probe = { id: string; version: number; outcome: string; write_count: number };
const handler: BulkActionHandler = {
  async preview(_context, id) {
    const row = (await db().query<Probe>("select * from bulk_probe_items where id=$1", [id]))
      .rows[0];
    return row
      ? { eligible: true, summary: "Probe " + id, version: row.version }
      : { eligible: false, summary: null, version: null };
  },
  async apply(_context, id, _action, expectedVersion, client) {
    const row = (
      await client.query<Probe>("select * from bulk_probe_items where id=$1 for update", [id])
    ).rows[0];
    if (!row) throw new BulkItemError("not_found", "NOT_FOUND", "Item is unavailable", false);
    if (row.outcome === "forbidden")
      throw new BulkItemError("forbidden", "FORBIDDEN", "Item is outside scope", false);
    if (row.version !== expectedVersion)
      throw new BulkItemError("stale", "STALE", "Item changed", false);
    await client.query(
      "update bulk_probe_items set write_count=write_count+1, version=version+1 where id=$1",
      [id],
    );
    if (row.outcome === "rollback")
      throw new BulkItemError("failed", "TRANSIENT", "Temporary failure", true);
    return { resultingVersion: row.version + 1 };
  },
};
const service = createBulkService({ handler });

async function fixture(count: number) {
  const ids = Array.from({ length: count }, () => randomUUID());
  createdIds.push(...ids);
  for (const id of ids) {
    await db().query("insert into bulk_probe_items(id) values ($1)", [id]);
  }
  return ids;
}
async function preview(ids: string[]) {
  const result = await service.previewBulk(context(), {
    action: { type: "task.status", status: "done" },
    ids,
  });
  operationIds.push(result.operationId);
  return result;
}
async function finish(operationId: string) {
  let result = await service.resumeBulk(context(), { operationId });
  for (let attempt = 0; result.state === "paused" && attempt < 10; attempt++) {
    result = await service.resumeBulk(context(), { operationId });
  }
  return result;
}

describe("persistent bulk receipts on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 8 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(db(), migrations);
    await db().query(
      "create table if not exists bulk_probe_items (id uuid primary key, version int not null default 0, outcome text not null default 'success', write_count int not null default 0)",
    );
    for (const id of [actorId, otherActorId]) {
      await db().query(
        "insert into profiles(id,email,name,role,status) values($1,$2,$1,'admin','active') on conflict (id) do update set status='active'",
        [id, id + "@bulk.test"],
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (!holder.pool) return;
    await db().query("delete from bulk_operations where actor_profile_id=any($1::text[])", [
      [actorId, otherActorId],
    ]);
    await db().query("delete from bulk_probe_items where id=any($1::uuid[])", [createdIds]);
    // Audit entries are append-only and reference the actor; keep these two disposable profiles.
    await db().query("drop table bulk_probe_items");
    await db().end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "reconciles 100 mixed outcomes and never rewrites a success on resume",
    async () => {
      const ids = await fixture(100);
      const prepared = await preview(ids);
      expect(prepared.eligibleCount).toBe(100);
      await db().query("update bulk_probe_items set outcome='forbidden' where id=any($1::uuid[])", [
        ids.slice(70, 80),
      ]);
      await db().query("update bulk_probe_items set version=version+1 where id=any($1::uuid[])", [
        ids.slice(80, 90),
      ]);
      await db().query("delete from bulk_probe_items where id=any($1::uuid[])", [ids.slice(90)]);
      const first = await service.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      });
      expect(first.processed).toBe(20);
      const result = await finish(prepared.operationId);
      expect(result.state).toBe("completed");
      expect(result.results).toHaveLength(100);
      expect(result.remainingIds).toEqual(ids.slice(70));
      expect(
        Object.fromEntries(
          ["succeeded", "forbidden", "stale", "not_found"].map((status) => [
            status,
            result.results.filter((item) => item.status === status).length,
          ]),
        ),
      ).toEqual({
        succeeded: 70,
        forbidden: 10,
        stale: 10,
        not_found: 10,
      });
      await service.resumeBulk(context(), { operationId: prepared.operationId });
      const writes = await db().query<{ total: string }>(
        "select sum(write_count)::text as total from bulk_probe_items where id=any($1::uuid[])",
        [ids],
      );
      expect(Number(writes.rows[0].total)).toBe(70);
    },
  );

  it.runIf(hasDatabase)("denies another actor and an expired preview", async () => {
    const ids = await fixture(1);
    const prepared = await preview(ids);
    await expect(
      service.commitBulk(context(otherActorId), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/owner|actor|access/i);
    await expect(
      service.getBulkResult(context(otherActorId), { operationId: prepared.operationId }),
    ).rejects.toThrow(/owner|actor|access/i);
    await db().query(
      "update bulk_operations set expires_at=now()-interval '1 second' where id=$1",
      [prepared.operationId],
    );
    await expect(
      service.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/expired/i);
  });

  it.runIf(hasDatabase)(
    "rolls a failed item write back and resumes only retryable failure",
    async () => {
      const ids = await fixture(1);
      await db().query("update bulk_probe_items set outcome='rollback' where id=$1", [ids[0]]);
      const prepared = await preview(ids);
      const key = randomUUID();
      const failed = await service.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: key,
      });
      expect(failed.results[0]).toMatchObject({ status: "failed", retryable: true });
      const before = await db().query<Probe>("select * from bulk_probe_items where id=$1", [
        ids[0],
      ]);
      expect(before.rows[0].write_count).toBe(0);
      await db().query("update bulk_probe_items set outcome='success' where id=$1", [ids[0]]);
      const resumed = await service.resumeBulk(context(), { operationId: prepared.operationId });
      expect(resumed.results[0]).toMatchObject({ status: "succeeded", retryable: false });
      const after = await db().query<Probe>("select * from bulk_probe_items where id=$1", [ids[0]]);
      expect(after.rows[0].write_count).toBe(1);
      const replay = await service.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: key,
      });
      expect(replay.results[0].status).toBe("succeeded");
      expect(
        (await db().query<Probe>("select * from bulk_probe_items where id=$1", [ids[0]])).rows[0]
          .write_count,
      ).toBe(1);
    },
  );

  it.runIf(hasDatabase)(
    "rechecks a real Task version and records only the accepted write",
    async () => {
      const staleId = randomUUID();
      const goodId = randomUUID();
      createdIds.push(staleId, goodId);
      await db().query(
        "insert into tasks(id,title) values($1,'Stale bulk task'),($2,'Good bulk task')",
        [staleId, goodId],
      );
      const live = createBulkService({ handler: productionBulkHandler });
      const prepared = await live.previewBulk(context(), {
        action: { type: "task.status", status: "done" },
        ids: [staleId, goodId],
      });
      operationIds.push(prepared.operationId);
      await db().query("update tasks set status='in_progress' where id=$1", [staleId]);
      const result = await live.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      });
      expect(result.results).toEqual([
        expect.objectContaining({ id: staleId, status: "stale" }),
        expect.objectContaining({ id: goodId, status: "succeeded", resultingVersion: 1 }),
      ]);
      await live.resumeBulk(context(), { operationId: prepared.operationId });
      const rows = await db().query<{ id: string; status: string; row_version: number }>(
        "select id,status,row_version from tasks where id=any($1::uuid[]) order by id",
        [[staleId, goodId]],
      );
      expect(rows.rows.find((row) => row.id === staleId)).toMatchObject({
        status: "in_progress",
        row_version: 1,
      });
      expect(rows.rows.find((row) => row.id === goodId)).toMatchObject({
        status: "done",
        row_version: 1,
      });
      await db().query("delete from tasks where id=any($1::uuid[])", [[staleId, goodId]]);
    },
  );

  it.runIf(hasDatabase)(
    "decides one approval type with a receipt and rejects mixed types",
    async () => {
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      await db().query(
        "insert into human_approvals(id,approval_type,assigned_to,context_data) values($1,'qualification_review',$4,'{}'),($2,'qualification_review',$4,'{}'),($3,'discount',$4,'{}')",
        [...ids, actorId],
      );
      const live = createBulkService({ handler: productionBulkHandler });
      await expect(
        live.previewBulk(context(), {
          action: { type: "approval.decide", decision: "approved" },
          ids: [ids[0], ids[2]],
        }),
      ).rejects.toThrow(/types must match/i);
      const prepared = await live.previewBulk(context(), {
        action: { type: "approval.decide", decision: "approved" },
        ids: ids.slice(0, 2),
      });
      operationIds.push(prepared.operationId);
      const result = await live.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      });
      expect(result.results.map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
      const rows = await db().query<{ status: string; row_version: number }>(
        "select status,row_version from human_approvals where id=any($1::uuid[])",
        [ids.slice(0, 2)],
      );
      expect(rows.rows.every((row) => row.status === "approved" && row.row_version === 1)).toBe(
        true,
      );
      await db().query(
        "delete from activity_logs where object_type='approval' and object_id=any($1::uuid[])",
        [ids],
      );
      await db().query("delete from human_approvals where id=any($1::uuid[])", [ids]);
    },
  );

  it.runIf(hasDatabase)(
    "adds eligible Team members and reports an inactive person separately",
    async () => {
      const teamId = randomUUID();
      const activeId = "audit-bulk-member-active-" + randomUUID();
      const inactiveId = "audit-bulk-member-inactive-" + randomUUID();
      await db().query(
        "insert into profiles(id,email,name,role,status) values($1,$3,$1,'sales','active'),($2,$4,$2,'sales','deactivated')",
        [activeId, inactiveId, activeId + "@bulk.test", inactiveId + "@bulk.test"],
      );
      await db().query("insert into teams(id,name,created_by) values($1,$2,$3)", [
        teamId,
        "Audit Bulk " + teamId,
        actorId,
      ]);
      const live = createBulkService({ handler: productionBulkHandler });
      const prepared = await live.previewBulk(context(), {
        action: { type: "team.add_member", teamId },
        ids: [activeId, inactiveId],
      });
      operationIds.push(prepared.operationId);
      expect(prepared.eligibleCount).toBe(1);
      const result = await live.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      });
      expect(result.results).toEqual([
        expect.objectContaining({ id: activeId, status: "succeeded" }),
        expect.objectContaining({ id: inactiveId, status: "forbidden" }),
      ]);
      expect(
        (
          await db().query<{ count: string }>(
            "select count(*)::text as count from team_memberships where team_id=$1",
            [teamId],
          )
        ).rows[0].count,
      ).toBe("1");
      await db().query("delete from team_memberships where team_id=$1", [teamId]);
      await db().query("delete from teams where id=$1", [teamId]);
      await db().query("delete from profiles where id=any($1::text[])", [[activeId, inactiveId]]);
    },
  );

  it.runIf(hasDatabase)(
    "returns at a five-second item boundary and releases unprocessed leases",
    async () => {
      const ids = await fixture(5);
      const slowService = createBulkService({
        handler: {
          preview: handler.preview,
          apply: async (...args) => {
            await new Promise((resolve) => setTimeout(resolve, 5_200));
            return handler.apply(...args);
          },
        },
      });
      const prepared = await slowService.previewBulk(context(), {
        action: { type: "task.status", status: "done" },
        ids,
      });
      const first = await slowService.commitBulk(context(), {
        previewToken: prepared.token,
        idempotencyKey: randomUUID(),
      });
      expect(first.state).toBe("paused");
      expect(first.processed).toBe(4);
      expect(first.remainingIds).toEqual([ids[4]]);
      const leased = await db().query<{ count: string }>(
        "select count(*)::text as count from bulk_operation_items where operation_id=$1 and lease_owner is not null",
        [prepared.operationId],
      );
      expect(Number(leased.rows[0].count)).toBe(0);
      const final = await service.resumeBulk(context(), { operationId: prepared.operationId });
      expect(final.state).toBe("completed");
      expect(final.processed).toBe(5);
    },
    15_000,
  );

  it.runIf(hasDatabase)("two workers claim one item once", async () => {
    const ids = await fixture(1);
    const prepared = await preview(ids);
    await service.commitBulk(context(), {
      previewToken: prepared.token,
      idempotencyKey: randomUUID(),
      processLimit: 0,
    });
    const [left, right] = await Promise.all([
      service.resumeBulk(context(), { operationId: prepared.operationId }),
      service.resumeBulk(context(), { operationId: prepared.operationId }),
    ]);
    expect([left, right].some((result) => result.results[0]?.status === "succeeded")).toBe(true);
    expect(
      (await db().query<Probe>("select * from bulk_probe_items where id=$1", [ids[0]])).rows[0]
        .write_count,
    ).toBe(1);
  });
});

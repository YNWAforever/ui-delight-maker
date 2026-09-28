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
  query: async (sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = [], db?: Queryable) =>
    (await (db ?? holder.pool!).query(sql, [...values])).rows[0] ?? null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import {
  cleanupExpiredImportSessions,
  createImportService,
  ImportRowError,
} from "@/server/imports/import-session.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actorId = "audit-import-resume-" + randomUUID();
const otherId = "audit-import-other-" + randomUUID();
const sessionIds: string[] = [];
const pool = () => holder.pool!;
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
const service = createImportService({
  handler: {
    async prepareRow(_ctx, _kind, values) {
      return values.value === "invalid"
        ? { status: "invalid" as const, action: "create", errors: ["Invalid value"] }
        : values.value === "duplicate"
          ? { status: "skipped" as const, action: "skip", errors: ["Duplicate external ID"] }
          : { status: null, action: "create", errors: [] };
    },
    async applyRow(_ctx, _kind, values, _prepared, db) {
      if (values.value === "forbidden")
        throw new ImportRowError("forbidden", "ROW_FORBIDDEN", "No access", false);
      const written = await db.query<{ id: string }>(
        "insert into import_probe_items(source_key,value) values($1,$2) returning id",
        [values.external_id, values.value],
      );
      if (values.value === "rollback") {
        throw new ImportRowError("failed", "TRANSIENT", "Retry later", true);
      }
      return { action: "created", id: written.rows[0].id };
    },
  },
});
async function preview(csvText: string) {
  const result = await service.previewImport(context(), { kind: "lead", csvText });
  sessionIds.push(result.sessionId);
  return result;
}
async function finish(sessionId: string) {
  let result = await service.resumeImport(context(), { sessionId });
  for (let i = 0; result.state === "paused" && i < 500; i++) {
    result = await service.resumeImport(context(), { sessionId });
  }
  return result;
}

describe("durable import receipts on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 8 });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(pool(), migrations);
    await pool().query(
      "create table if not exists import_probe_items (id uuid primary key default gen_random_uuid(), source_key text, value text not null)",
    );
    for (const id of [actorId, otherId]) {
      await pool().query(
        "insert into profiles(id,email,name,role,status) values($1,$2,$1,'admin','active')",
        [id, id + "@audit.test"],
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (!holder.pool) return;
    await pool().query("delete from import_sessions where id=any($1::uuid[])", [sessionIds]);
    await pool().query("drop table import_probe_items");
    await pool().query("delete from profiles where id=any($1::text[])", [[actorId, otherId]]);
    await pool().end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "reconciles 5,000 rows including validation, auth and duplicate outcomes",
    async () => {
      const lines = ["external_id,value"];
      for (let i = 0; i < 5000; i++) {
        const value =
          i % 10 === 0
            ? "invalid"
            : i % 10 === 1
              ? "forbidden"
              : i % 10 === 2
                ? "duplicate"
                : "good";
        lines.push(`row-${i},${value}`);
      }
      const prepared = await preview(lines.join("\n"));
      expect(prepared.total).toBe(5000);
      expect(prepared.rows.filter((row) => row.status === "invalid")).toHaveLength(500);
      const first = await service.commitImport(context(), {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        idempotencyKey: randomUUID(),
      });
      const preclassified = prepared.rows.filter((row) => row.status !== null).length;
      expect(first.processed).toBeGreaterThanOrEqual(preclassified);
      expect(first.processed).toBeLessThanOrEqual(preclassified + 20);
      const done = await finish(prepared.sessionId);
      expect(done.state).toBe("completed");
      expect(done.total).toBe(5000);
      expect(done.processed).toBe(5000);
      expect(done.rows.filter((row) => row.status === "succeeded")).toHaveLength(3500);
      expect(done.rows.filter((row) => row.status === "forbidden")).toHaveLength(500);
      expect(done.rows.filter((row) => row.status === "invalid")).toHaveLength(500);
      expect(done.rows.filter((row) => row.status === "skipped")).toHaveLength(500);
      expect(
        (await pool().query("select count(*)::int as count from import_probe_items")).rows[0].count,
      ).toBe(3500);
    },
    600_000,
  );

  it.runIf(hasDatabase)(
    "replays the same commit key after a lost response without duplicate creates",
    async () => {
      const prepared = await preview("external_id,value\nreplay,good");
      const key = randomUUID();
      await service.commitImport(context(), {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        idempotencyKey: key,
      });
      const replay = await service.commitImport(context(), {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        idempotencyKey: key,
      });
      expect(replay.rows).toEqual([expect.objectContaining({ status: "succeeded" })]);
      expect(
        (
          await pool().query(
            "select count(*)::int as count from import_probe_items where source_key='replay'",
          )
        ).rows[0].count,
      ).toBe(1);
    },
  );

  it.runIf(hasDatabase)(
    "rolls back a failed row while preserving later rows and resuming retryable failure",
    async () => {
      const prepared = await preview("external_id,value\nbad,rollback\ngood,good");
      const first = await service.commitImport(context(), {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        idempotencyKey: randomUUID(),
      });
      expect(first.rows.map((row) => row.status)).toEqual(["failed", "succeeded"]);
      expect(
        (
          await pool().query(
            "select count(*)::int as count from import_probe_items where source_key='bad'",
          )
        ).rows[0].count,
      ).toBe(0);
      const resumed = await service.resumeImport(context(), { sessionId: prepared.sessionId });
      expect(resumed.rows[0].status).toBe("failed");
      expect(
        (
          await pool().query(
            "select count(*)::int as count from import_probe_items where source_key='good'",
          )
        ).rows[0].count,
      ).toBe(1);
    },
  );

  it.runIf(hasDatabase)("rejects other actors and expires uncommitted previews", async () => {
    const prepared = await preview("external_id,value\nowner,good");
    await expect(
      service.getImportResult(context(otherId), { sessionId: prepared.sessionId }),
    ).rejects.toThrow(/owner|access/i);
    await pool().query(
      "update import_sessions set preview_expires_at=now()-interval '1 second' where id=$1",
      [prepared.sessionId],
    );
    await expect(
      service.commitImport(context(), {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/expired/i);
  });

  it.runIf(hasDatabase)("scrubs expired rows in a bounded maintenance sweep", async () => {
    const prepared = await preview("external_id,value\ncleanup,good");
    await pool().query(
      "update import_sessions set retain_until=now()-interval '1 second' where id=$1",
      [prepared.sessionId],
    );
    const cleaned = await cleanupExpiredImportSessions(1);
    expect(cleaned).toBe(1);
    const result = await service.getImportResult(context(), { sessionId: prepared.sessionId });
    expect(result.state).toBe("expired");
    expect(
      (
        await pool().query("select values_json from import_session_rows where session_id=$1", [
          prepared.sessionId,
        ])
      ).rows[0].values_json,
    ).toEqual({});
  });

  it.runIf(hasDatabase)(
    "continues committed work after preview expiry, then marks retention expiry explicitly",
    async () => {
      const prepared = await preview("external_id,value\nexpiry,good");
      const started = await service.commitImport(context(), {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        idempotencyKey: randomUUID(),
        processLimit: 0,
      });
      expect(started.state).toBe("paused");
      await pool().query(
        "update import_sessions set preview_expires_at=now()-interval '1 second' where id=$1",
        [prepared.sessionId],
      );
      const done = await service.resumeImport(context(), { sessionId: prepared.sessionId });
      expect(done.state).toBe("completed");
      await pool().query(
        "update import_sessions set retain_until=now()-interval '1 second' where id=$1",
        [prepared.sessionId],
      );
      const expired = await service.getImportResult(context(), { sessionId: prepared.sessionId });
      expect(expired.state).toBe("expired");
      expect(expired.rows[0].status).toBe("succeeded");
      const retained = await pool().query(
        "select values_json from import_session_rows where session_id=$1",
        [prepared.sessionId],
      );
      expect(retained.rows[0].values_json).toEqual({});
    },
  );
});

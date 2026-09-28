import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { listTasks } from "@/server/repositories/tasks";
import {
  loadWorkspaceTaskRows,
  selectLegacyDomainSource,
  selectLegacyTaskReadSource,
} from "@/server/repositories/legacy-domain-source.server";
import { reconcileLegacySnapshots } from "@/server/db/legacy-domain-parity";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const owner = "t20-owner";
const accountId = "20202020-2020-4020-8020-202020202020";
const projectId = "20202020-2020-4020-8020-202020202021";
const taskId = "20202020-2020-4020-8020-202020202022";
const overrideId = "20202020-2020-4020-8020-202020202023";

describe("legacy domain reconciliation", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await holder.pool.query("insert into profiles (id,email,name,role) values ($1,$2,$3,'sales')", [
      owner,
      "t20-owner@example.invalid",
      "T20 Owner",
    ]);
    await holder.pool.query(
      "insert into accounts (id,name,account_owner) values ($1,'T20 account',$2)",
      [accountId, owner],
    );
    await holder.pool.query(
      "insert into tasks (id,title,assigned_to,account_id,project_id,status) values ($1,'T20 task',$2,$3,$4,'open')",
      [taskId, owner, accountId, projectId],
    );
    await holder.pool.query(
      "insert into permission_overrides (id,profile_id,capability,effect,resource_type,resource_id,reason,granted_by) values ($1,$2,'tasks.view','allow','task',$3,'T20 fixture',$2)",
      [overrideId, owner, taskId],
    );
  }, 60_000);
  afterAll(async () => {
    if (holder.pool) {
      await holder.pool.query("delete from permission_overrides where id=$1", [overrideId]);
      await holder.pool.query("delete from tasks where id=$1", [taskId]);
      await holder.pool.query("delete from accounts where id=$1", [accountId]);
      await holder.pool.query("delete from profiles where id=$1", [owner]);
      await holder.pool.end();
    }
    holder.pool = null;
  });

  it("defaults to legacy and refuses production or unverified Neon task reads", () => {
    expect(selectLegacyTaskReadSource({})).toBe("legacy");
    expect(selectLegacyDomainSource("projects", {})).toBe("legacy");
    expect(() =>
      selectLegacyDomainSource("projects", { CLIENTOPS_LEGACY_PROJECTS_SOURCE: "neon" }),
    ).toThrow(/No verified Neon cutover/);
    expect(() => selectLegacyTaskReadSource({ CLIENTOPS_LEGACY_TASK_READ_SOURCE: "neon" })).toThrow(
      /rehearsal/i,
    );
    expect(() =>
      selectLegacyTaskReadSource({
        CLIENTOPS_LEGACY_TASK_READ_SOURCE: "neon",
        CLIENTOPS_LEGACY_TASK_REHEARSAL: "1",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/clientops_t20_test",
      }),
    ).toThrow(/production/i);
  });

  it("accepts only the matching disposable CI database in test mode", () => {
    const localTestUrl = "postgresql://localhost/clientops_test";
    const rehearsal = {
      CLIENTOPS_LEGACY_TASK_READ_SOURCE: "neon",
      CLIENTOPS_LEGACY_TASK_REHEARSAL: "1",
      NODE_ENV: "test",
      DATABASE_URL: localTestUrl,
      DATABASE_TEST_URL: localTestUrl,
    };
    expect(selectLegacyTaskReadSource(rehearsal)).toBe("neon");
    expect(() =>
      selectLegacyTaskReadSource({
        ...rehearsal,
        DATABASE_TEST_URL: "postgresql://localhost/other",
      }),
    ).toThrow(/disposable local database/);
    expect(() =>
      selectLegacyTaskReadSource({
        ...rehearsal,
        DATABASE_URL: "postgresql://db.example/clientops_test",
      }),
    ).toThrow(/disposable local database/);
    expect(() => selectLegacyTaskReadSource({ ...rehearsal, NODE_ENV: "production" })).toThrow(
      /production/i,
    );
  });

  it.runIf(hasDatabase)(
    "reads the same task ID, owner, status, and scope from Neon as the main task list",
    async () => {
      const main = await listTasks({ account_id: accountId });
      const workspace = await loadWorkspaceTaskRows(
        "account_id",
        accountId,
        async () => {
          throw new Error("legacy was called");
        },
        {
          CLIENTOPS_LEGACY_TASK_READ_SOURCE: "neon",
          CLIENTOPS_LEGACY_TASK_REHEARSAL: "1",
          NODE_ENV: "test",
          DATABASE_URL: process.env.DATABASE_TEST_URL,
          DATABASE_TEST_URL: process.env.DATABASE_TEST_URL,
        },
      );
      expect(workspace.error).toBeNull();
      expect(
        workspace.data?.map((row) => ({
          id: row.id,
          assigned_to: row.assigned_to,
          status: row.status,
          account_id: row.account_id,
        })),
      ).toEqual(
        main.map((row) => ({
          id: row.id,
          assigned_to: row.assigned_to,
          status: row.status,
          account_id: row.account_id,
        })),
      );
    },
  );

  it("surfaces a legacy outage instead of returning an empty task list", async () => {
    const result = await loadWorkspaceTaskRows(
      "project_id",
      projectId,
      async () => ({
        data: null,
        error: { message: "legacy unavailable" },
      }),
      {},
    );
    expect(result.error?.message).toContain("legacy unavailable");
    expect(result.data).toBeNull();
  });

  it.runIf(hasDatabase)(
    "compares exact IDs, owner, scope, status and permission overrides from real PostgreSQL rows",
    async () => {
      const tasks = (await holder.pool!.query("select * from tasks where id=$1", [taskId])).rows;
      const overrides = (
        await holder.pool!.query("select * from permission_overrides where id=$1", [overrideId])
      ).rows;
      const snapshot = { tables: { tasks, permission_overrides: overrides } };
      const result = reconcileLegacySnapshots(snapshot, structuredClone(snapshot));
      expect(result.tables.tasks.status).toBe("matched");
      expect(result.tables.permission_overrides.status).toBe("matched");
      const changed = structuredClone(snapshot);
      changed.tables.tasks[0].assigned_to = "other-owner";
      const drift = reconcileLegacySnapshots(snapshot, changed);
      expect(drift.tables.tasks.status).toBe("mismatch");
      expect(drift.tables.tasks.ownerMismatches).toBe(1);
      expect(drift.ready).toBe(false);
      const scopeDrift = structuredClone(snapshot);
      scopeDrift.tables.tasks[0].project_id = "other-project";
      expect(reconcileLegacySnapshots(snapshot, scopeDrift).tables.tasks.scopeMismatches).toBe(1);
      const overrideDrift = structuredClone(snapshot);
      overrideDrift.tables.permission_overrides[0].effect = "deny";
      expect(
        reconcileLegacySnapshots(snapshot, overrideDrift).tables.permission_overrides
          .overrideMismatches,
      ).toBe(1);
    },
  );

  it("marks missing domain snapshots blocked and never calls them matched", () => {
    const result = reconcileLegacySnapshots({ tables: { tasks: [] } }, { tables: { tasks: [] } });
    expect(result.ready).toBe(false);
    expect(result.tables.projects.status).toBe("missing_snapshot");
  });
});

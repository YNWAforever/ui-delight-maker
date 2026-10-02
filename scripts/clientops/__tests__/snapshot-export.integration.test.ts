import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertLocalSnapshotTarget,
  exportIsolatedSnapshot,
  maskSnapshotPair,
  withSnapshotTransaction,
} from "../snapshot-export";
import { reconcileLegacySnapshots } from "../../../src/server/db/legacy-domain-parity";
const testUrl = process.env.DATABASE_TEST_URL;
const suffix = randomBytes(6).toString("hex");
const database = "clientops_snapshot_export_" + suffix;
const role = "snapshot_reader_" + suffix;
const copyDatabase = "clientops_snapshot_pair_" + suffix;
let copyTarget: typeof target;
let admin: Client;
let source: Client;
let target: { connectionString: string; isolationConfirmed: boolean; sourceRecord: string };
function requireTestUrl() {
  if (!testUrl) throw new Error("Actual isolated PostgreSQL is required; no skipped exporter gate");
  const parsed = new URL(testUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/clientops_[a-z0-9_]+$/.test(parsed.pathname)
  )
    throw new Error("Unconfirmed test database");
  return parsed;
}
describe("snapshot export with real isolated PostgreSQL", () => {
  beforeAll(async () => {
    const parsed = requireTestUrl();
    admin = new Client({ connectionString: testUrl });
    await admin.connect();
    await admin.query('CREATE DATABASE "' + database + '"');
    parsed.hostname = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
    parsed.pathname = "/" + database;
    target = {
      connectionString: parsed.toString(),
      isolationConfirmed: true,
      sourceRecord: "synthetic-exporter-regression-only",
    };
    source = new Client({ connectionString: target.connectionString });
    await source.connect();
    await source.query(
      "CREATE TABLE profiles (id text PRIMARY KEY, email text);" +
        "CREATE TABLE accounts (id text PRIMARY KEY, name text);" +
        "CREATE TABLE projects (id text PRIMARY KEY, owner text);" +
        "CREATE TABLE tasks (id text PRIMARY KEY, assigned_to text, account_id text, project_id text, title text);" +
        "CREATE TABLE permission_overrides (id text PRIMARY KEY, profile_id text, resource_type text, resource_id text, effect text);" +
        [
          "customer_success_profiles",
          "success_touchpoints",
          "deals",
          "engagement_events",
          "channel_identities",
          "automation_playbooks",
          "automation_runs",
        ]
          .map((name) => 'CREATE TABLE "' + name + '" (id text PRIMARY KEY);')
          .join("") +
        "INSERT INTO profiles VALUES ('export-person', 'export-person@example.invalid');" +
        "INSERT INTO accounts VALUES ('export-account', 'Export private account');" +
        "INSERT INTO projects VALUES ('export-project', 'export-person');" +
        "INSERT INTO tasks VALUES ('export-task', 'export-person', 'export-account', 'export-project', 'Before concurrent write');" +
        "INSERT INTO permission_overrides VALUES ('export-override', 'export-person', 'task', 'export-task', 'allow');",
    );
    await source.query(
      "ALTER TABLE deals ADD COLUMN amount numeric; INSERT INTO deals VALUES ('export-deal',0.123456789012345678901)",
    );
    await source.end();
    await admin.query('CREATE DATABASE "' + copyDatabase + '" TEMPLATE "' + database + '"');
    const copyUrl = new URL(target.connectionString);
    copyUrl.pathname = "/" + copyDatabase;
    copyTarget = { ...target, connectionString: copyUrl.toString() };
    source = new Client({ connectionString: target.connectionString });
    await source.connect();
  }, 30_000);
  afterAll(async () => {
    await source?.end();
    if (admin) {
      await admin.query('DROP DATABASE IF EXISTS "' + copyDatabase + '" WITH (FORCE)');
      await admin.query('DROP DATABASE IF EXISTS "' + database + '" WITH (FORCE)');
      await admin.query('DROP ROLE IF EXISTS "' + role + '"');
      await admin.end();
    }
  });
  it("exports all named tables and keeps relationships under a shared mask", async () => {
    const snapshot = await exportIsolatedSnapshot(target);
    expect(snapshot.tables.tasks).toEqual([
      {
        id: "export-task",
        assigned_to: "export-person",
        account_id: "export-account",
        project_id: "export-project",
        title: "Before concurrent write",
      },
    ]);
    const pair = maskSnapshotPair(
      snapshot,
      await exportIsolatedSnapshot(copyTarget),
      randomBytes(32),
    );
    expect(reconcileLegacySnapshots(pair.legacy, pair.neon).ready).toBe(true);
    expect(JSON.stringify(pair)).not.toContain("export-person@example.invalid");
    expect((await source.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count).toBe(1);
  });
  it("enforces read-only in PostgreSQL and rolls back after an attempted write", async () => {
    let sqlState: string | undefined;
    await expect(
      withSnapshotTransaction(source, async (client) => {
        try {
          await client.query("UPDATE tasks SET title = 'Wrongly changed'");
        } catch (error) {
          sqlState = (error as { code?: string }).code;
          throw error;
        }
      }),
    ).rejects.toThrow("Snapshot preparation blocked");
    expect(sqlState).toBe("25006");
    expect((await source.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe(
      "off",
    );
    expect((await source.query("SELECT title FROM tasks")).rows[0].title).toBe(
      "Before concurrent write",
    );
  });
  it("reads a stable MVCC snapshot while a separate backend commits a task change", async () => {
    const writer = new Client({ connectionString: target.connectionString });
    await writer.connect();
    const reader = new Client({ connectionString: target.connectionString });
    await reader.connect();
    try {
      const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const readerPid = (await reader.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      expect(writerPid).not.toBe(readerPid);
      await writer.query(
        "BEGIN; LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE; UPDATE tasks SET title='After concurrent write'",
      );
      const exporting = exportIsolatedSnapshot(target);
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await reader.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query ILIKE '%to_jsonb%'",
          [database],
        );
        if (waiting.rowCount) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await writer.query("COMMIT");
      const snapshot = await exporting;
      expect(blocked).toBe(true);
      expect(snapshot.tables.tasks![0].title).toBe("Before concurrent write");
      expect((await source.query("SELECT title FROM tasks")).rows[0].title).toBe(
        "After concurrent write",
      );
    } finally {
      await writer.query("ROLLBACK");
      await writer.end();
      await reader.end();
      await source.query("UPDATE tasks SET title='Before concurrent write'");
    }
  });
  it("reports an absent domain as absent instead of inventing an empty export", async () => {
    await source.query("DROP TABLE automation_runs");
    try {
      const snapshot = await exportIsolatedSnapshot(target);
      expect(snapshot.tables).not.toHaveProperty("automation_runs");
      expect(snapshot.tables.automation_playbooks).toEqual([]);
      expect(reconcileLegacySnapshots(snapshot, snapshot).tables.automation_runs.status).toBe(
        "missing_snapshot",
      );
    } finally {
      await source.query("CREATE TABLE automation_runs (id text PRIMARY KEY)");
    }
  });
  it("fails closed when RLS would silently omit rows from the export", async () => {
    const password = randomBytes(16).toString("hex");
    await admin.query('CREATE ROLE "' + role + "\" LOGIN PASSWORD '" + password + "'");
    await source.query(
      'GRANT USAGE ON SCHEMA public TO "' +
        role +
        '"; GRANT SELECT ON ALL TABLES IN SCHEMA public TO "' +
        role +
        '"; ALTER TABLE tasks ENABLE ROW LEVEL SECURITY; CREATE POLICY no_export_rows ON tasks FOR SELECT TO "' +
        role +
        '" USING (false)',
    );
    const restricted = new URL(target.connectionString);
    restricted.username = role;
    restricted.password = password;
    try {
      await expect(
        exportIsolatedSnapshot({ ...target, connectionString: restricted.toString() }),
      ).rejects.toThrow("Snapshot preparation blocked");
      expect((await source.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count).toBe(
        1,
      );
    } finally {
      await source.query("ALTER TABLE tasks DISABLE ROW LEVEL SECURITY");
    }
  });
  it("denies production mode before connecting", () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertLocalSnapshotTarget(target)).toThrow("Snapshot preparation blocked");
    } finally {
      if (prior === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prior;
    }
  });
  it("does not lose a real PostgreSQL numeric difference through JSON conversion", async () => {
    const left = await exportIsolatedSnapshot(target);
    try {
      await source.query("UPDATE deals SET amount=0.123456789012345678902");
      const right = await exportIsolatedSnapshot(target);
      const pair = maskSnapshotPair(left, right, randomBytes(32));
      expect(reconcileLegacySnapshots(pair.legacy, pair.neon).tables.deals.status).toBe("mismatch");
    } finally {
      await source.query("UPDATE deals SET amount=0.123456789012345678901");
    }
  });
  it("does not execute an unverified view in place of a domain table", async () => {
    await source.query(
      "DROP TABLE automation_runs; CREATE VIEW automation_runs AS SELECT id FROM tasks",
    );
    try {
      await expect(exportIsolatedSnapshot(target)).rejects.toThrow("Snapshot preparation blocked");
    } finally {
      await source.query(
        "DROP VIEW automation_runs; CREATE TABLE automation_runs (id text PRIMARY KEY)",
      );
    }
  });
  it("runs the operator CLI against two distinct actual local copies without changing either", async () => {
    const exec = promisify(execFile);
    const root = resolve(".clientops-perf/snapshots");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(root, { recursive: true });
    const input = await mkdtemp(resolve(root, "database-cli-fixture-"));
    let output: string | undefined;
    try {
      const config = resolve(input, "private-config.json");
      await writeFile(
        config,
        JSON.stringify({ formatVersion: 1, legacy: target, neon: copyTarget }),
      );
      const result = await exec("bun", [
        "scripts/clientops/export-legacy-snapshots.ts",
        "--config=" + config,
      ]);
      const summary = JSON.parse(result.stdout);
      output = dirname(summary.files.manifest);
      expect(summary).toMatchObject({ parityMatched: true, releaseAccepted: false });
      const manifest = JSON.parse(await readFile(summary.files.manifest, "utf8"));
      expect(manifest).toMatchObject({
        mode: "operator_attested_local_copies",
        sourceProvenanceVerified: false,
        keyPersisted: false,
        numericComparison: "exact_json_lexemes",
      });
      expect((await source.query("SELECT title FROM tasks")).rows[0].title).toBe(
        "Before concurrent write",
      );
      const snapshot = JSON.parse(await readFile(summary.files.legacy, "utf8"));
      expect(snapshot.tables.tasks[0].assigned_to).toBe(snapshot.tables.profiles[0].id);
      expect(JSON.stringify(snapshot)).not.toContain("export-person@example.invalid");
      expect(JSON.stringify(snapshot)).not.toContain("0.123456789012345678901");
    } finally {
      for (const path of [output, input])
        if (path && (path.startsWith(root + "/") || path.startsWith(root + "\\")))
          await rm(path, { recursive: true, force: true });
    }
  }, 30_000);
});

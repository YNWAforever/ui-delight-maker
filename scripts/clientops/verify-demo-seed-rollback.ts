import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { selectClientOpsScriptDriver } from "../../src/lib/clientops-script-pool";

// Fault injection is restricted to the dedicated disposable seed-rehearsal database.
const url = process.env.DATABASE_TEST_URL;
if (!url || selectClientOpsScriptDriver(url, process.env) !== "pg") {
  throw new Error("Seed rollback rehearsal requires the guarded local test database");
}
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
async function fingerprint() {
  const tables = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  );
  const hash = createHash("sha256");
  for (const { tablename } of tables.rows) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = await client.query(
      "select to_jsonb(t)::text as row from public." + name + " t order by to_jsonb(t)::text",
    );
    hash.update(JSON.stringify([tablename, rows.rows]));
  }
  return hash.digest("hex");
}
const cases = [
  {
    table: "quotes",
    column: "issued_version_id",
    where: "number='QT-DEMO-003'",
    replacement: "null",
    error: "Existing demo Quote lifecycle",
  },
  {
    table: "job_sheets",
    column: "accepted_at",
    where: "number='JS-DEMO-001'",
    replacement: "null",
    error: "Existing demo Job Sheet acceptance",
  },
  {
    table: "human_approvals",
    column: "context_data",
    where: "context_data->>'demo_key'='approval-quote-fitness'",
    replacement: "context_data - 'quote_id'",
    error: "Existing demo approval evidence",
  },
  {
    table: "human_approvals",
    column: "decided_at",
    where: "context_data->>'demo_key'='approval-qualification-finance'",
    replacement: "null",
    error: "Existing demo approval evidence",
  },
];
async function inject(sql: string, values: unknown[] = []) {
  await client.query("begin");
  try {
    // Model records written before today's guards; applies only to this fixture connection.
    await client.query("set local session_replication_role = replica");
    const result = await client.query(sql, values);
    assert.equal(result.rowCount, 1);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
try {
  for (const fixture of cases) {
    // Round-trip timestamps as PostgreSQL text to preserve microseconds exactly.
    const previous = await client.query<{ value: string }>(
      "select " +
        fixture.column +
        "::text as value from " +
        fixture.table +
        " where " +
        fixture.where,
    );
    assert.equal(previous.rows.length, 1);
    await inject(
      "update " +
        fixture.table +
        " set " +
        fixture.column +
        "=" +
        fixture.replacement +
        " where " +
        fixture.where,
    );
    try {
      const before = await fingerprint();
      const result = spawnSync(process.execPath, ["scripts/clientops/seed-smoke-data.ts"], {
        env: process.env,
        encoding: "utf8",
        timeout: 120_000,
      });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0, "incomplete legacy fixture must reject seed replay");
      assert.ok(
        (result.stderr + result.stdout).includes(fixture.error),
        "expected integrity rejection",
      );
      assert.equal(
        await fingerprint(),
        before,
        "failed seed must roll back all public table writes",
      );
      console.log("PASS rollback: " + fixture.table + "." + fixture.column);
    } finally {
      await inject(
        "update " + fixture.table + " set " + fixture.column + "=$1 where " + fixture.where,
        [previous.rows[0].value],
      );
    }
  }
} finally {
  client.release();
  await pool.end();
}

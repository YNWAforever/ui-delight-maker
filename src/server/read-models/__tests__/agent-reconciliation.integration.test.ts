import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadAgentReconciliation, withAgentReconciliationRead } from "../agent-reconciliation";

const enabled = Boolean(process.env.DATABASE_TEST_URL);
const databaseName = "clientops_snapshot_ai_" + randomUUID().replaceAll("-", "");
let admin: Pool, pool: Pool;
const leadId = randomUUID(),
  valid = randomUUID(),
  demo = randomUUID(),
  escalated = randomUUID();
describe("physical read-only agent reconciliation", () => {
  beforeAll(async () => {
    if (!enabled) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    // CI names the local service "localhost". Pin it to loopback before connecting;
    // no hostname lookup or arbitrary network target is permitted by this fixture.
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    if (url.hostname !== "127.0.0.1") throw new Error("Disposable loopback PostgreSQL required");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`create database "${databaseName}"`);
    url.pathname = "/" + databaseName;
    pool = new Pool({ connectionString: url.toString() });
    await runClientOpsMigrations(
      pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    await pool.query("insert into leads(id,company_name) values($1,'Synthetic reconciliation')", [
      leadId,
    ]);
    await pool.query(
      `insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status,input_data)
      values($1,'demo-name-only','qualify_lead','lead',$4,'completed','{}'),
      ($2,'Quote Agent','draft_quote','lead',$5,'waiting_approval','{"demo":true}'),
      ($3,'Reply Agent','draft_reply','lead',$4,'waiting_approval','{"demo":false}')`,
      [valid, demo, escalated, leadId, randomUUID()],
    );
    await pool.query(
      "insert into human_approvals(agent_run_id,approval_type,status,context_data) values($1,'message_send','escalated','{}')",
      [escalated],
    );
  }, 60000);
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      if (!/^clientops_snapshot_ai_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Unexpected owned DB name");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });
  it.runIf(enabled)(
    "reads independent demo and approval anomalies without altering facts",
    async () => {
      const client = await pool.connect();
      try {
        const before = await pool.query(
          "select md5(string_agg(row_to_json(r)::text,',' order by r.id)) as hash from agent_runs r",
        );
        const rows = await withAgentReconciliationRead(client, () =>
          loadAgentReconciliation(client),
        );
        expect(rows.find((r) => r.runId === valid)).toMatchObject({
          isDemo: null,
          anomalyCodes: ["valid"],
        });
        expect(rows.find((r) => r.runId === demo)).toMatchObject({
          anomalyCodes: ["demo", "missing_subject", "missing_approval"],
        });
        expect(rows.find((r) => r.runId === escalated)).toMatchObject({
          anomalyCodes: ["escalated"],
          isDemo: false,
        });
        const after = await pool.query(
          "select md5(string_agg(row_to_json(r)::text,',' order by r.id)) as hash from agent_runs r",
        );
        expect(after.rows).toEqual(before.rows);
      } finally {
        client.release();
      }
    },
  );
  it.runIf(enabled)(
    "database rejects writes and rollback releases the failed transaction",
    async () => {
      const client = await pool.connect();
      try {
        await expect(
          withAgentReconciliationRead(client, () => client.query("delete from agent_runs")),
        ).rejects.toMatchObject({ code: "25006" });
        expect(
          (await client.query("select count(*)::int as count from agent_runs")).rows[0].count,
        ).toBe(3);
        expect(
          (await client.query("show transaction_read_only")).rows[0].transaction_read_only,
        ).toBe("off");
      } finally {
        client.release();
      }
    },
  );
});

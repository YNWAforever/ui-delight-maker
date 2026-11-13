import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import { validQualification } from "@/lib/workflows/__tests__/commercial-fixtures";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, failAudit: false }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = [], db: Queryable = holder.pool!) => {
    if (holder.failAudit && /insert into activity_logs/.test(sql))
      throw new Error("synthetic audit failure");
    return (await db.query(sql, [...values])).rows;
  },
  queryOne: async (sql: string, values: readonly unknown[] = [], db: Queryable = holder.pool!) =>
    (await db.query(sql, [...values])).rows[0] ?? null,
  transaction: async <T>(work: (db: Queryable) => Promise<T>) => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work(client);
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
import { dispatchAgentWorkflow } from "../n8n-dispatch.server";
import { recordInvalidWriteback, writeQualificationResult } from "../writebacks";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const databaseName = "clientops_n8n_trace_" + randomUUID().replaceAll("-", "");
let admin: Pool | null = null;
async function fixture() {
  const leadId = randomUUID(),
    runId = randomUUID(),
    attemptId = randomUUID();
  await holder.pool!.query("insert into leads(id,company_name) values($1,'Synthetic trace lead')", [
    leadId,
  ]);
  await holder.pool!.query(
    "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status,attempt_id) values($1,'Trace Agent','qualify_lead','lead',$2,'running',$3)",
    [runId, leadId, attemptId],
  );
  return {
    runId,
    leadId,
    attemptId,
    payload: {
      agent_run_id: runId,
      lead_id: leadId,
      attempt_id: attemptId,
      workflow_type: "qualify_lead" as const,
      qualification_data: { ...validQualification },
      lead_score: 80,
      confidence_score: 0.8,
      output_summary: "private-business-content-canary",
    },
  };
}
async function traces(runId: string) {
  return (
    await holder.pool!.query(
      "select * from agent_tool_calls where agent_run_id=$1 order by called_at,id",
      [runId],
    )
  ).rows;
}

describe("n8n boundary tracing on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("Disposable loopback database required");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`create database "${databaseName}"`);
    url.pathname = "/" + databaseName;
    holder.pool = new Pool({ connectionString: url.toString(), max: 5 });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
  }, 60_000);
  afterEach(() => {
    holder.failAudit = false;
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
    if (admin) {
      if (!/^clientops_n8n_trace_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Unexpected database cleanup target");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });

  it.runIf(hasDatabase)(
    "links HTTP acceptance and callback deliveries without repeating business effects",
    async () => {
      const f = await fixture();
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
      vi.stubGlobal("fetch", fetchMock);
      await dispatchAgentWorkflow(
        { webhookUrl: "https://worker.example.test/hook", workflowToken: "private-token-canary" },
        f.payload,
        { agentRunId: f.runId, workflowType: "qualify_lead" },
      );
      // Callback replay is another delivery, but the qualified lead and activity are written once.
      await writeQualificationResult(f.payload);
      await writeQualificationResult(f.payload);
      const evidence = await traces(f.runId);
      expect(evidence.map((row) => row.source)).toEqual([
        "n8n_dispatch",
        "n8n_writeback",
        "n8n_writeback",
      ]);
      expect(evidence.every((row) => row.status === "ok" && row.duration_ms >= 0)).toBe(true);
      expect(evidence.every((row) => /^[a-f0-9]{64}$/.test(row.args_digest))).toBe(true);
      expect(evidence.every((row) => row.input_params === null && row.output_result === null)).toBe(
        true,
      );
      expect(JSON.stringify(evidence)).not.toContain(f.payload.output_summary);
      expect(JSON.stringify(evidence)).not.toContain("private-token-canary");
      expect(
        (
          await holder.pool!.query(
            "select count(*)::int count from activity_logs where actor_id=$1 and action='qualified lead'",
            [f.runId],
          )
        ).rows[0].count,
      ).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(hasDatabase)(
    "does not attribute a callback with the wrong subject or attempt",
    async () => {
      const f = await fixture();
      await expect(
        writeQualificationResult({ ...f.payload, lead_id: randomUUID() }),
      ).rejects.toThrow();
      await expect(
        writeQualificationResult({ ...f.payload, attempt_id: randomUUID() }),
      ).rejects.toThrow();
      expect(await traces(f.runId)).toHaveLength(0);
    },
  );

  it.runIf(hasDatabase)(
    "keeps invalid-output evidence after committing the rejection receipt",
    async () => {
      const f = await fixture();
      await recordInvalidWriteback(
        { ...f.payload, invalid_output_code: "schema_invalid" },
        "qualify_lead",
      );
      const run = (
        await holder.pool!.query("select status,outcome_code from agent_runs where id=$1", [
          f.runId,
        ])
      ).rows[0];
      expect(run).toMatchObject({ status: "failed", outcome_code: "invalid_output" });
      expect(await traces(f.runId)).toEqual([
        expect.objectContaining({
          source: "n8n_writeback",
          status: "error",
          error_code: "invalid_output",
        }),
      ]);
    },
  );

  it.runIf(hasDatabase)(
    "keeps failure evidence after a business transaction rolls back",
    async () => {
      const f = await fixture();
      holder.failAudit = true;
      await expect(writeQualificationResult(f.payload)).rejects.toThrow("synthetic audit failure");
      holder.failAudit = false;
      const run = (await holder.pool!.query("select status from agent_runs where id=$1", [f.runId]))
        .rows[0];
      expect(run.status).toBe("running");
      const lead = (
        await holder.pool!.query("select qualification_data from leads where id=$1", [f.leadId])
      ).rows[0];
      expect(lead.qualification_data).toBeNull();
      expect(await traces(f.runId)).toEqual([
        expect.objectContaining({
          source: "n8n_writeback",
          status: "error",
          error_code: "callback_failed",
        }),
      ]);
      expect(JSON.stringify(await traces(f.runId))).not.toContain("synthetic audit failure");
    },
  );
});

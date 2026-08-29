import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * BD-3 slice 4, Task 3: the one place `duration_ms` is proven against a real database.
 *
 * `updateAgentRunResult` computes `duration_ms` in SQL from `created_at`, and its unit tests
 * only ever assert on the JS values array passed to a mocked `query` — the query *text* cannot
 * affect that array, so a bug in the SQL itself (a wrong interval direction, a placeholder
 * mixed up with a neighbour) is invisible to every mocked test in this repo. This file is the
 * only thing that runs the real expression against a real clock and a real column, the way
 * `agent-policy.integration.test.ts` does for the policy store.
 *
 * Only the session boundary is mocked. `updateAgentRunResult` and `writeQualificationResult`
 * both run for real against the migrated schema, because each is part of what this file exists
 * to prove.
 */
const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
}));

// Redirecting this module at the pg driver is what lets the real repositories run against the
// CI Postgres service without touching production code. The SQL text is identical either way.
vi.mock("@/server/db/neon.server", () => {
  type Runner = { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> };
  const getPool = (): Runner => {
    if (!holder.pool) throw new Error("test pool not initialised");
    return holder.pool as unknown as Runner;
  };
  const query = async (text: string, values: readonly unknown[] = [], db?: Runner) => {
    const result = await (db ?? getPool()).query(text, values as unknown[]);
    return result.rows;
  };
  const queryOne = async (text: string, values: readonly unknown[] = [], db?: Runner) => {
    const rows = await query(text, values, db);
    return rows[0] ?? null;
  };
  const transaction = async (work: (db: Runner) => Promise<unknown>) => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: (text: string, values?: unknown[]) => client.query(text, values),
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  return { query, queryOne, transaction, getDatabaseUrl: () => "test" };
});

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { updateAgentRunResult } from "@/server/repositories/agent-runs";
import { writeQualificationResult } from "@/server/workflows/writebacks";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

function db() {
  if (!holder.pool) throw new Error("test pool not initialised");
  return holder.pool;
}

/**
 * Inserts an `agent_runs` row directly, bypassing `createAgentRun`, so `created_at` can be
 * pushed into the past. That is what lets case 1 assert a real, non-zero interval rather than
 * a value indistinguishable from "the clock ticked one millisecond during the test".
 */
async function insertAgentRun(input: {
  subjectId: string;
  status?: "running" | "completed" | "failed" | "waiting_approval";
  createdAt?: string;
}) {
  const { rows } = await db().query<{ id: string }>(
    `
      insert into agent_runs
        (agent_name, workflow_type, subject_type, subject_id, input_data, status, created_at)
      values ($1, 'qualify_lead', 'lead', $2, '{}'::jsonb, $3, coalesce($4::timestamptz, now()))
      returning id
    `,
    [
      "Lead Qualification Agent",
      input.subjectId,
      input.status ?? "running",
      input.createdAt ?? null,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("failed to insert agent run fixture");
  return id;
}

async function insertLead(id: string) {
  await db().query("insert into leads (id, company_name) values ($1, $2)", [id, "Duration Co"]);
}

async function readDurationMs(id: string) {
  const { rows } = await db().query<{ duration_ms: number | null }>(
    "select duration_ms from agent_runs where id = $1",
    [id],
  );
  return rows[0]?.duration_ms ?? null;
}

async function deleteAgentRun(id: string) {
  await db().query("delete from agent_runs where id = $1", [id]);
}

async function deleteLead(id: string) {
  await db().query("delete from leads where id = $1", [id]);
}

describe("agent run duration, proven against a real database", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)("a completed run gets a positive duration", async () => {
    const runId = await insertAgentRun({
      subjectId: randomUUID(),
      status: "running",
      createdAt: new Date(Date.now() - 2000).toISOString(),
    });

    try {
      const run = await updateAgentRunResult(runId, {
        status: "completed",
        tokens_used: 512,
        model_used: "anthropic/claude-sonnet-4-6",
      });

      // A tolerance, not an equality — the value depends on real clock time between the insert
      // above and the update just now, on top of the two-second offset baked into created_at.
      expect(run.duration_ms).not.toBeNull();
      expect(run.duration_ms).toBeGreaterThanOrEqual(1500);
      expect(run.duration_ms).toBeLessThanOrEqual(10_000);
      expect(run.tokens_used).toBe(512);
      expect(run.model_used).toBe("anthropic/claude-sonnet-4-6");
    } finally {
      await deleteAgentRun(runId);
    }
  });

  it.runIf(hasDatabase)("a run that never calls back keeps duration_ms null", async () => {
    const runId = await insertAgentRun({ subjectId: randomUUID(), status: "running" });

    try {
      // Deliberately no updateAgentRunResult call — the row is left exactly as inserted. An
      // unmeasured run and an instantaneous one must not look alike.
      const duration = await readDurationMs(runId);
      expect(duration).toBeNull();
    } finally {
      await deleteAgentRun(runId);
    }
  });

  it.runIf(hasDatabase)("a failed run still gets a duration", async () => {
    const runId = await insertAgentRun({
      subjectId: randomUUID(),
      status: "running",
      createdAt: new Date(Date.now() - 2000).toISOString(),
    });

    try {
      const run = await updateAgentRunResult(runId, { status: "failed" });

      expect(run.duration_ms).not.toBeNull();
      expect(run.duration_ms).toBeGreaterThanOrEqual(1500);
      expect(run.duration_ms).toBeLessThanOrEqual(10_000);
    } finally {
      await deleteAgentRun(runId);
    }
  });

  it.runIf(hasDatabase)(
    "a redelivered callback does not change the recorded duration",
    async () => {
      const leadId = randomUUID();
      await insertLead(leadId);

      const runId = await insertAgentRun({
        subjectId: leadId,
        status: "running",
        createdAt: new Date(Date.now() - 2000).toISOString(),
      });

      try {
        const payload = {
          lead_id: leadId,
          agent_run_id: runId,
          qualification_data: { fit: "high" },
          lead_score: 80,
          output_summary: "Qualified",
          confidence_score: 0.9,
          tokens_used: 200,
          model_used: "anthropic/claude-sonnet-4-6",
        };

        // A real writeback, not `updateAgentRunResult` directly: calling the repository twice
        // bypasses the already-settled short-circuit at writebacks.ts:139-141 and would prove
        // nothing about what an n8n retry actually does.
        await writeQualificationResult(payload);
        const firstDuration = await readDurationMs(runId);

        await writeQualificationResult(payload);
        const secondDuration = await readDurationMs(runId);

        expect(firstDuration).not.toBeNull();
        expect(secondDuration).toBe(firstDuration);
      } finally {
        await deleteAgentRun(runId);
        await deleteLead(leadId);
      }
    },
  );
});

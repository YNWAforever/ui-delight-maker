import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => {
  const query = async (
    sql: string,
    values: readonly unknown[] = [],
    db?: { query: Pool["query"] },
  ) => (await (db ?? holder.pool!).query(sql, [...values])).rows;
  return {
    query,
    queryOne: async (sql: string, values: readonly unknown[] = [], db?: { query: Pool["query"] }) =>
      (await query(sql, values, db))[0] ?? null,
    transaction: async <T>(work: (db: { query: Pool["query"] }) => Promise<T>): Promise<T> => {
      const client = await holder.pool!.connect();
      try {
        await client.query("begin");
        const result = await work(client as unknown as { query: Pool["query"] });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
});

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import {
  beginNoteTidyRun,
  finishNoteTidyRun,
  readNoteTidyPolicy,
} from "@/server/repositories/ai-invocations";
import { createAgentRun, updateAgentRunResult } from "@/server/repositories/agent-runs";
import { writeQualificationResult } from "@/server/workflows/writebacks";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const actor = "t21-ai-owner-" + randomUUID();

describe("governed AI persistence and stale callbacks", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await holder.pool.query(
      "insert into profiles (id,email,name,role) values ($1,$2,'T21 Owner','sales')",
      [actor, actor + "@example.invalid"],
    );
  }, 60_000);
  afterAll(async () => {
    if (holder.pool) {
      await holder.pool.query("delete from agent_runs where created_by=$1", [actor]);
      await holder.pool.query("delete from profiles where id=$1", [actor]);
      await holder.pool.end();
    }
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "deduplicates concurrent same-key note tidy runs and rejects changed input",
    async () => {
      expect(await readNoteTidyPolicy()).toEqual({ status: "active", versionId: null });
      const key = randomUUID();
      const input = {
        actorId: actor,
        workflowType: "note_tidy" as const,
        subjectType: "note",
        subjectId: randomUUID(),
        idempotencyKey: key,
        inputLength: 12,
        inputFingerprint: "a".repeat(64),
        policyVersionId: null,
      };
      const [first, second] = await Promise.all([
        beginNoteTidyRun(input),
        beginNoteTidyRun({ ...input, subjectId: randomUUID() }),
      ]);
      expect(first.runId).toBe(second.runId);
      expect([first.created, second.created].sort()).toEqual([false, true]);
      await expect(
        beginNoteTidyRun({ ...input, inputFingerprint: "b".repeat(64) }),
      ).rejects.toThrow(/different input/);
      await finishNoteTidyRun(first.runId, {
        status: "completed",
        outcomeCode: "completed",
        output: "Tidied.",
        usage: null,
        model: null,
      });
      const row = (
        await holder.pool!.query(
          "select status,tokens_used,usage_data,input_data,outcome_code from agent_runs where id=$1",
          [first.runId],
        )
      ).rows[0];
      expect(row.status).toBe("completed");
      expect(row.tokens_used).toBeNull();
      expect(row.usage_data).toBeNull();
      expect(row.outcome_code).toBe("completed");
      expect(row.input_data).toEqual({ length: 12, sha256: "a".repeat(64) });
      expect((await beginNoteTidyRun(input)).output).toBe("Tidied.");
    },
  );

  it.runIf(hasDatabase)("stores only provider-reported tokens and cost", async () => {
    const run = await beginNoteTidyRun({
      actorId: actor,
      workflowType: "note_tidy",
      subjectType: "note",
      subjectId: randomUUID(),
      idempotencyKey: randomUUID(),
      inputLength: 4,
      inputFingerprint: "c".repeat(64),
      policyVersionId: null,
    });
    await finishNoteTidyRun(run.runId, {
      status: "completed",
      outcomeCode: "completed",
      output: "Done.",
      usage: {
        inputTokens: 17,
        outputTokens: 8,
        totalTokens: 25,
        cost: 0.001,
        currency: null,
        source: "openrouter",
      },
      model: "test-model",
    });
    const row = (
      await holder.pool!.query(
        "select tokens_used,usage_data,model_used from agent_runs where id=$1",
        [run.runId],
      )
    ).rows[0];
    expect(row.tokens_used).toBe(25);
    expect(row.usage_data).toMatchObject({ inputTokens: 17, outputTokens: 8, cost: 0.001 });
    expect(row.model_used).toBe("test-model");
  });

  it.runIf(hasDatabase)("returns persisted failure outcome on a same-key replay", async () => {
    const input = {
      actorId: actor,
      workflowType: "note_tidy" as const,
      subjectType: "note",
      subjectId: randomUUID(),
      idempotencyKey: randomUUID(),
      inputLength: 4,
      inputFingerprint: "d".repeat(64),
      policyVersionId: null,
    };
    const first = await beginNoteTidyRun(input);
    await finishNoteTidyRun(first.runId, {
      status: "failed",
      outcomeCode: "timeout",
      output: null,
      usage: null,
      model: null,
    });
    await expect(beginNoteTidyRun(input)).resolves.toMatchObject({
      runId: first.runId,
      created: false,
      status: "failed",
      outcomeCode: "timeout",
    });
  });

  it.runIf(hasDatabase)(
    "rejects an old failed run callback without changing the newer run or lead",
    async () => {
      const leadId = randomUUID();
      await holder.pool!.query(
        "insert into leads (id,company_name,lead_score) values ($1,'T21 lead',37)",
        [leadId],
      );
      const oldId = randomUUID();
      const newId = randomUUID();
      await holder.pool!.query(
        "insert into agent_runs (id,agent_name,workflow_type,subject_type,subject_id,status) values ($1,'Old','qualify_lead','lead',$3,'failed'),($2,'New','qualify_lead','lead',$3,'running')",
        [oldId, newId, leadId],
      );
      try {
        await expect(
          writeQualificationResult({
            lead_id: leadId,
            agent_run_id: oldId,
            qualification_data: { fit: "high" },
            lead_score: 95,
            output_summary: "late result",
            confidence_score: 0.9,
          }),
        ).rejects.toThrow();
        const lead = (
          await holder.pool!.query("select lead_score from leads where id=$1", [leadId])
        ).rows[0];
        const newer = (
          await holder.pool!.query("select status from agent_runs where id=$1", [newId])
        ).rows[0];
        expect(lead.lead_score).toBe(37);
        expect(newer.status).toBe("running");
      } finally {
        await holder.pool!.query("delete from agent_runs where id=any($1)", [[oldId, newId]]);
        await holder.pool!.query("delete from leads where id=$1", [leadId]);
      }
    },
  );
  it.runIf(hasDatabase).each(["completed", "failed"] as const)(
    "keeps an unreported Note Tidy model unknown for %s",
    async (status) => {
      const run = await beginNoteTidyRun({
        actorId: actor,
        workflowType: "note_tidy",
        subjectType: "note",
        subjectId: randomUUID(),
        idempotencyKey: randomUUID(),
        inputLength: 7,
        inputFingerprint: "e".repeat(64),
        policyVersionId: null,
      });
      const pending = (
        await holder.pool!.query("select model_used from agent_runs where id=$1", [run.runId])
      ).rows[0];
      expect(pending.model_used).toBeNull();
      await finishNoteTidyRun(run.runId, {
        status,
        outcomeCode: status === "completed" ? "completed" : "provider_error",
        output: status === "completed" ? "Reviewed proposal." : null,
        usage: null,
        model: null,
      });
      const stored = (
        await holder.pool!.query(
          "select status,model_used,tokens_used,usage_data from agent_runs where id=$1",
          [run.runId],
        )
      ).rows[0];
      expect(stored).toEqual({ status, model_used: null, tokens_used: null, usage_data: null });
    },
  );
  it.runIf(hasDatabase)(
    "does not infer a native worker model before its provider receipt",
    async () => {
      const { run, created } = await createAgentRun({
        agent_name: "Synthetic provider metadata",
        workflow_type: "qualify_lead",
        subject_id: randomUUID(),
        subject_type: "lead",
        input_data: {},
        created_by: actor,
      });
      expect(created).toBe(true);
      expect(
        (await holder.pool!.query("select model_used from agent_runs where id=$1", [run.id]))
          .rows[0].model_used,
      ).toBeNull();
      await updateAgentRunResult(run.id, {
        status: "failed",
        model_used: null,
        tokens_used: null,
        outcome_code: "provider_error",
      });
      expect(
        (
          await holder.pool!.query("select model_used,tokens_used from agent_runs where id=$1", [
            run.id,
          ])
        ).rows[0],
      ).toEqual({ model_used: null, tokens_used: null });
    },
  );
});

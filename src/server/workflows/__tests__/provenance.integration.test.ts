import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, types, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
// Only transport is substituted: repositories, locks, transactions, policies and SQL are real.
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = [], db: Queryable = holder.pool!) =>
    (await db.query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = [], db: Queryable = holder.pool!) =>
    (await db.query(sql, [...values])).rows[0] ?? null,
  transaction: async (work: (client: PoolClient) => Promise<unknown>) => {
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
import { runClientOpsMigrations, type ClientOpsMigration } from "@/server/db/clientops-migrations";
import { normalizeAIExecutionProvenance } from "@/lib/workflows/provenance";
import {
  writeQualificationResult,
  writeReplyDraftResult,
  writeQuoteDraftResult,
  writeScoreRenewalRiskResult,
  writeRelationshipIntelligenceResult,
} from "../writebacks";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const databaseName = "clientops_provenance_" + randomUUID().replaceAll("-", "");
let admin: Pool | null = null,
  migrations: ClientOpsMigration[] = [];
const legacyRun = randomUUID();
const metadata = {
  source: "provider" as const,
  providerRequestId: "synthetic-provider-receipt",
  workerExecutionId: "synthetic-worker-execution",
  workerVersion: "synthetic-v1",
  requestedModel: "requested-model",
  actualModel: "transport-model",
  fallbackReason: null,
};
const workflows = [
  "qualify_lead",
  "draft_reply",
  "draft_quote",
  "score_renewal_risk",
  "relationship_intelligence",
] as const;

async function fixture(workflow: (typeof workflows)[number]) {
  const subjectId = randomUUID(),
    runId = randomUUID(),
    attemptId = randomUUID();
  let subject = "lead";
  if (workflow === "score_renewal_risk") {
    subject = "engagement";
    const client = randomUUID(),
      product = randomUUID();
    await holder.pool!.query(
      "insert into clients(id,company_name) values($1,'Synthetic provenance client')",
      [client],
    );
    await holder.pool!.query(
      "insert into products(id,name,billing_type) values($1,'Synthetic provenance product','retainer')",
      [product],
    );
    await holder.pool!.query(
      "insert into engagements(id,client_id,product_id,billing_period,renewal_risk) values($1,$2,$3,'monthly','medium')",
      [subjectId, client, product],
    );
  } else if (workflow === "relationship_intelligence") {
    subject = "account";
    await holder.pool!.query("insert into accounts(id,name) values($1,$2)", [
      subjectId,
      "Synthetic provenance account " + subjectId,
    ]);
  } else
    await holder.pool!.query(
      "insert into leads(id,company_name) values($1,'Synthetic provenance lead')",
      [subjectId],
    );
  await holder.pool!.query(
    "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status,attempt_id) values($1,'Synthetic provenance Agent',$2,$3,$4,'running',$5)",
    [runId, workflow, subject, subjectId, attemptId],
  );
  const common = {
    agent_run_id: runId,
    attempt_id: attemptId,
    execution_metadata: metadata,
    usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125, source: "openrouter" },
    model_used: "fake-content-model",
  };
  const confidence = { confidence_score: 0.8 };
  let writer: (payload: never) => Promise<unknown>, payload: object;
  switch (workflow) {
    case "qualify_lead":
      writer = writeQualificationResult;
      payload = {
        ...common,
        ...confidence,
        lead_id: subjectId,
        qualification_data: {},
        lead_score: 80,
        output_summary: "Synthetic",
      };
      break;
    case "draft_reply":
      writer = writeReplyDraftResult;
      payload = {
        ...common,
        ...confidence,
        lead_id: subjectId,
        draft_message: "Synthetic draft",
        context_summary: "Synthetic",
      };
      break;
    case "draft_quote":
      writer = writeQuoteDraftResult;
      payload = {
        ...common,
        ...confidence,
        lead_id: subjectId,
        quote: {
          currency: "HKD",
          total_value: 200,
          line_items: [
            {
              id: "synthetic",
              service: "Synthetic",
              description: "Synthetic",
              qty: 2,
              unit_price: 100,
            },
          ],
        },
        create_send_approval: false,
      };
      break;
    case "score_renewal_risk":
      writer = writeScoreRenewalRiskResult;
      payload = {
        ...common,
        engagement_id: subjectId,
        health_score: 80,
        renewal_risk: "medium",
        risk_reasoning: "Synthetic",
        suggested_next_action: "Review",
        confidence: 0.8,
        output_summary: "Synthetic",
      };
      break;
    case "relationship_intelligence":
      writer = writeRelationshipIntelligenceResult;
      payload = {
        ...common,
        ...confidence,
        account_id: subjectId,
        output_summary: "Synthetic",
        next_action: null,
        signals: [],
      };
      break;
  }
  return { runId, subjectId, writer, payload };
}

describe("AI provenance migration and callback facts on real PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      throw new Error("Disposable loopback PostgreSQL required");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`create database "${databaseName}"`);
    url.pathname = "/" + databaseName;
    holder.pool = new Pool({
      connectionString: url.toString(),
      max: 8,
      types: { getTypeParser: (oid: number) => (oid === 1700 ? Number : types.getTypeParser(oid)) },
    });
    migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations.slice(0, 22));
    await holder.pool.query(
      "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status) values($1,'Synthetic legacy Agent','qualify_lead','lead',$2,'completed')",
      [legacyRun, randomUUID()],
    );
    await runClientOpsMigrations(holder.pool, migrations.slice(0, 23));
  }, 60000);
  afterAll(async () => {
    await holder.pool?.end();
    if (admin) {
      if (!/^clientops_provenance_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Unexpected owned DB name");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });

  it.runIf(hasDatabase)(
    "replays the additive migration without modifying nullable legacy facts",
    async () => {
      const replay = await runClientOpsMigrations(holder.pool!, migrations.slice(0, 23));
      expect(replay.applied).toEqual([]);
      expect(replay.skipped).toHaveLength(23);
      const old = (
        await holder.pool!.query("select execution_metadata from agent_runs where id=$1", [
          legacyRun,
        ])
      ).rows[0];
      expect(old.execution_metadata).toBeNull();
      expect(normalizeAIExecutionProvenance(old.execution_metadata)).toMatchObject({
        source: "unknown",
        actualModel: null,
      });
    },
  );
  it.runIf(hasDatabase)(
    "rejects secret / raw response keys at the database constraint",
    async () => {
      await expect(
        holder.pool!.query("update agent_runs set execution_metadata=$2::jsonb where id=$1", [
          legacyRun,
          JSON.stringify({ source: "provider", apiKey: "synthetic-forbidden-field" }),
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );
  it.runIf(hasDatabase).each(workflows)(
    "%s preserves first callback facts under concurrent duplicate replay",
    async (workflow) => {
      const { runId, writer, payload } = await fixture(workflow);
      await Promise.all([writer(payload as never), writer(payload as never)]);
      const first = (await holder.pool!.query("select * from agent_runs where id=$1", [runId]))
        .rows[0];
      expect(first.execution_metadata).toEqual(metadata);
      expect(first.tokens_used).toBe(125);
      expect(first.usage_data.cost).toBeNull();
      expect(first.model_used).toBe("transport-model");
      await writer({
        ...payload,
        execution_metadata: { ...metadata, actualModel: "replacement-model" },
        usage: { totalTokens: 999, source: "openrouter" },
      } as never);
      const replay = (await holder.pool!.query("select * from agent_runs where id=$1", [runId]))
        .rows[0];
      expect(replay.execution_metadata).toEqual(first.execution_metadata);
      expect(replay.tokens_used).toBe(first.tokens_used);
      expect(replay.model_used).toBe(first.model_used);
      expect(replay.output_data).toEqual(first.output_data);
      expect(
        (
          await holder.pool!.query("select count(*)::int n from activity_logs where actor_id=$1", [
            runId,
          ])
        ).rows[0].n,
      ).toBe(1);
    },
  );
  it.runIf(hasDatabase).each(workflows)(
    "%s rejects_cross_attempt_callback with no committed writes",
    async (workflow) => {
      const { runId, writer, payload } = await fixture(workflow);
      await expect(writer({ ...payload, attempt_id: randomUUID() } as never)).rejects.toThrow(
        "attempt",
      );
      expect(
        (
          await holder.pool!.query("select status,execution_metadata from agent_runs where id=$1", [
            runId,
          ])
        ).rows[0],
      ).toEqual({ status: "running", execution_metadata: null });
      expect(
        (
          await holder.pool!.query(
            "select count(*)::int n from human_approvals where agent_run_id=$1",
            [runId],
          )
        ).rows[0].n,
      ).toBe(0);
    },
  );
  it.runIf(hasDatabase)(
    "rolls back business and telemetry writes when the audit insert fails",
    async () => {
      const { runId, subjectId, writer, payload } = await fixture("qualify_lead");
      const beforeScore = (
        await holder.pool!.query("select lead_score from leads where id=$1", [subjectId])
      ).rows[0].lead_score;
      await holder.pool!.query(
        `create function synthetic_provenance_failure() returns trigger language plpgsql as $$ begin if new.actor_id='${runId}' then raise exception 'synthetic audit failure'; end if; return new; end $$; create trigger synthetic_provenance_failure before insert on activity_logs for each row execute function synthetic_provenance_failure()`,
      );
      try {
        await expect(writer(payload as never)).rejects.toThrow("synthetic audit failure");
        expect(
          (
            await holder.pool!.query(
              "select status,execution_metadata from agent_runs where id=$1",
              [runId],
            )
          ).rows[0],
        ).toEqual({ status: "running", execution_metadata: null });
        expect(
          (await holder.pool!.query("select lead_score from leads where id=$1", [subjectId]))
            .rows[0].lead_score,
        ).toBe(beforeScore);
      } finally {
        await holder.pool!.query(
          "drop trigger synthetic_provenance_failure on activity_logs; drop function synthetic_provenance_failure()",
        );
      }
    },
  );
});

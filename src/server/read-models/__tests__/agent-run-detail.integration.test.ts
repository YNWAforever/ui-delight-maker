import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ pool: null as Pool | null, traceReads: 0 }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) => {
    if (sql.includes("from agent_tool_calls")) holder.traceReads++;
    return (await holder.pool!.query(sql, [...values])).rows;
  },
  queryOne: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows[0] ?? null,
}));
import {
  requirePageAuthorization,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import type { AgentRunDetailInput } from "@/lib/agent-run-detail";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadAgentRunDetail } from "../agent-run-detail";
const enabled = Boolean(process.env.DATABASE_TEST_URL);
const databaseName = "clientops_run_detail_" + randomUUID().replaceAll("-", "");
const owner = "detail-owner",
  other = "detail-other",
  manager = "detail-manager";
const leadId = randomUUID(),
  otherLeadId = randomUUID(),
  runId = randomUUID(),
  otherRunId = randomUUID(),
  noteRunId = randomUUID();
let admin: Pool | null = null;
function context(changes: Partial<RequestAuthorization> = {}): RequestAuthorization {
  return {
    session: { profile: { id: manager, role: "manager", status: "active" } },
    actor: {
      profileId: manager,
      role: "manager",
      status: "active",
      managedTeamIds: [],
      managedDepartmentIds: [],
      directReportIds: [owner],
    },
    overrides: [],
    now: new Date(),
    ...changes,
  } as RequestAuthorization;
}
async function read(input: AgentRunDetailInput, ctx = context()) {
  const { rows } = await requirePageAuthorization(["agents.view"], {
    context: ctx,
    cacheRowOwners: true,
  });
  return loadAgentRunDetail(input, ctx, rows);
}

describe("physical scoped run-detail access", () => {
  beforeAll(async () => {
    if (!enabled) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      throw new Error("Disposable loopback PostgreSQL required");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`create database "${databaseName}"`);
    url.pathname = "/" + databaseName;
    holder.pool = new Pool({ connectionString: url.toString() });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    await holder.pool.query(
      "insert into profiles(id,email,name,role,status) values($1,'detail-owner@fixture.invalid','Owner','sales','active'),($2,'detail-other@fixture.invalid','Other','sales','active'),($3,'detail-manager@fixture.invalid','Manager','manager','active')",
      [owner, other, manager],
    );
    await holder.pool.query(
      "insert into leads(id,company_name,assigned_to) values($1,'Owned detail fixture',$2),($3,'Other detail fixture',$4)",
      [leadId, owner, otherLeadId, other],
    );
    await holder.pool.query(
      "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,created_by,status,input_data,output_data) values($1,'Qualification','qualify_lead','lead',$2,$3,'completed','{\"private\":\"raw-input-canary\"}','{\"private\":\"raw-output-canary\"}'),($4,'Other','qualify_lead','lead',$5,$6,'completed','{}','{}'),($7,'Note Tidy','note_tidy','note',$8,$3,'completed','{}','{}')",
      [runId, leadId, owner, otherRunId, otherLeadId, other, noteRunId, randomUUID()],
    );
    await holder.pool.query(
      `insert into agent_tool_calls(agent_run_id,tool_name,source,status,duration_ms,args_digest,args_keys,input_params,output_result,error_message,target_ids,called_at)
      select $1,'qualify_lead','n8n_dispatch','ok',5,repeat('a',64),array['lead_id'],'{"private":"legacy-input-canary"}','{"private":"legacy-output-canary"}','legacy-error-canary',array[$2::uuid],
      case when i<=51 then '2026-11-14T00:00:00.123456Z'::timestamptz else '2026-11-14T00:00:00.123455Z'::timestamptz end from generate_series(1,53) i`,
      [runId, otherLeadId],
    );
  }, 60000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
    if (admin) {
      if (!/^clientops_run_detail_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Unexpected cleanup target");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });

  it.runIf(enabled)(
    "reads an owned subject while denying another manager's subject without any trace query",
    async () => {
      expect(await read({ runId })).toMatchObject({ available: true });
      holder.traceReads = 0;
      const denied = await read({ runId: otherRunId });
      const missing = await read({ runId: randomUUID() });
      expect(denied).toEqual(missing);
      expect(denied).toEqual({ available: false, actorId: manager });
      expect(holder.traceReads).toBe(0);
    },
  );

  it.runIf(enabled)("honors a resource deny on every trace page", async () => {
    const ctx = context({
      overrides: [
        {
          profileId: manager,
          capability: "leads.view",
          effect: "deny",
          resourceType: "lead",
          resourceId: leadId,
        },
      ],
    });
    const firstPage = await read({ runId });
    if (!firstPage.available || !firstPage.nextCursor) throw new Error("Expected paged fixture");
    holder.traceReads = 0;
    expect(await read({ runId }, ctx)).toMatchObject({ available: false });
    expect(await read({ runId, cursor: firstPage.nextCursor }, ctx)).toMatchObject({
      available: false,
    });
    expect(holder.traceReads).toBe(0);
  });

  it.runIf(enabled)(
    "traverses microsecond and tied timestamp boundaries without duplicates or raw fields",
    async () => {
      const ids: string[] = [];
      let cursor: AgentRunDetailInput["cursor"];
      do {
        const page = await read({ runId, cursor });
        expect(page.available).toBe(true);
        if (!page.available) throw new Error("Expected permitted fixture");
        expect(page.events.length).toBeLessThanOrEqual(50);
        ids.push(...page.events.map((e) => e.id));
        cursor = page.nextCursor ?? undefined;
        if (cursor) expect(cursor.calledAt).toBe("2026-11-14T00:00:00.123456Z");
        for (const canary of [
          "raw-input-canary",
          "raw-output-canary",
          "legacy-input-canary",
          "legacy-output-canary",
          "legacy-error-canary",
          otherLeadId,
        ])
          expect(JSON.stringify(page)).not.toContain(canary);
      } while (cursor);
      expect(ids).toHaveLength(53);
      expect(new Set(ids).size).toBe(53);
    },
  );

  it.runIf(enabled)(
    "does not grant access to another user's Note Tidy run through a broad role",
    async () => {
      const ctx = context();
      expect(
        await read({ runId: noteRunId }, { ...ctx, actor: { ...ctx.actor, role: "admin" } }),
      ).toMatchObject({ available: false });
      const own = { ...ctx, actor: { ...ctx.actor, profileId: owner, role: "sales" as const } };
      expect(await read({ runId: noteRunId }, own)).toMatchObject({ available: true, events: [] });
    },
  );
});

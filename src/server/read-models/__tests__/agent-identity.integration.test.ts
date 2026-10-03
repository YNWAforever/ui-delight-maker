import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, client: null as PoolClient | null }));
// Transport substitution only: all application SQL runs on real isolated PostgreSQL.
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.client!.query(sql, [...values])).rows,
}));
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadAgentDirectoryRead, loadAgentHistoryPage } from "../agent-workspaces";
const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const allowRows: RowAuthorizer = {
  allow: async (_capability, _type, ids) => new Map(ids.map((id) => [id, true])),
};

describe("AI identity and attention on real PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 2 });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    holder.client = await holder.pool.connect();
  }, 60000);
  beforeEach(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      await holder.client.query("begin");
    }
  });
  afterAll(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      holder.client.release();
    }
    await holder.pool?.end();
  });
  async function seed(workflow: string, name: string, status: string, ageSeconds: number) {
    const id = randomUUID();
    await holder.client!.query(
      "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status,created_at,updated_at) values($1,$2,$3,'lead',$4,$5,now()-($6::int*interval '1 second'),now())",
      [id, name, workflow, randomUUID(), status, ageSeconds],
    );
    return id;
  }

  it.runIf(hasDatabase)("groups_legacy_names_by_workflow in metrics and history", async () => {
    await seed("draft_quote", "Quotation Agent", "completed", 10);
    await seed("draft_quote", "Quote Draft Agent", "completed", 20);
    const directory = await loadAgentDirectoryRead({}, allowRows);
    expect(directory.agents.find((agent) => agent.workflow_type === "draft_quote")?.runs_24h).toBe(
      2,
    );
    const history = await loadAgentHistoryPage({
      workflowType: "draft_quote",
      page: 1,
      limit: 25,
      access: {},
      rows: allowRows,
    } as Parameters<typeof loadAgentHistoryPage>[0]);
    expect(history.total).toBe(2);
    expect(history.items.map((run) => run.agent_name)).toEqual([
      "Quotation Agent",
      "Quote Draft Agent",
    ]);
  });

  it.runIf(hasDatabase)("uses_created_at_at_exact_60_minutes with newer updated_at", async () => {
    const ids: string[] = [];
    for (const seconds of [899, 900, 3599, 3600, 3601])
      ids.push(await seed("qualify_lead", "Synthetic Agent", "running", seconds));
    const directory = await loadAgentDirectoryRead({}, allowRows);
    expect(directory.operations.stuck_runs).toBe(2);
    expect(directory.attentionRuns.map((run) => run.id).sort()).toEqual(ids.slice(3).sort());
    expect(directory.attentionRuns.find((run) => run.id === ids[3])?.age_minutes).toBe(60);
  });

  it.runIf(hasDatabase)(
    "matches_attention_count_to_rows for 25h, 6d and exact 7d failures",
    async () => {
      const eligible: string[] = [];
      for (const seconds of [25 * 3600, 6 * 86400, 7 * 86400])
        eligible.push(await seed("qualify_lead", "Synthetic Agent", "failed", seconds));
      await seed("qualify_lead", "Synthetic Agent", "failed", 7 * 86400 + 1);
      eligible.push(await seed("qualify_lead", "Synthetic Agent", "waiting_approval", 10 * 86400));
      const directory = await loadAgentDirectoryRead({}, allowRows);
      expect(directory.operations.failed_24h).toBe(0);
      expect(directory.operations.needs_attention).toBe(eligible.length);
      expect(directory.attentionRuns.map((run) => run.id).sort()).toEqual(eligible.sort());
    },
  );
});

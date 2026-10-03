import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  client: null as PoolClient | null,
  queries: 0,
}));
// Transport substitution only: all application SQL runs on real isolated PostgreSQL.
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) => {
    holder.queries += 1;
    return (await holder.client!.query(sql, [...values])).rows;
  },
}));
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadAgentDirectoryRead, loadAgentHistoryPage } from "../agent-workspaces";
import { resolveOwnerProfileIds } from "@/server/auth/resource-ownership";
const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const databaseName = "clientops_identity_" + randomUUID().replaceAll("-", "");
let admin: Pool | null = null;
const allowRows: RowAuthorizer = {
  allow: async (_capability, _type, ids) => new Map(ids.map((id) => [id, true])),
};

describe("AI identity and attention on real PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      throw new Error("Identity regression requires disposable loopback PostgreSQL");
    admin = new Pool({ connectionString: url.toString(), max: 1 });
    await admin.query(`create database "${databaseName}"`);
    url.pathname = "/" + databaseName;
    holder.pool = new Pool({ connectionString: url.toString(), max: 2 });
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
    if (admin) {
      if (!/^clientops_identity_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Unsafe identity fixture database name");
      await admin.query(`drop database "${databaseName}"`);
      await admin.end();
    }
  });
  async function seed(workflow: string, name: string, status: string, ageSeconds: number) {
    const id = randomUUID();
    await holder.client!.query(
      "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status,created_at,updated_at) values($1,$2,$3,'lead',$4,$5,now()-($6::int*interval '1 second'),now())",
      [id, name, workflow, randomUUID(), status, ageSeconds],
    );
    return id;
  }

  it.runIf(hasDatabase)(
    "owns an independent database regardless of other suite fixtures",
    async () => {
      const row = await holder.client!.query("select current_database() as name");
      expect(row.rows[0].name).toBe(databaseName);
      expect("/" + row.rows[0].name).not.toBe(new URL(process.env.DATABASE_TEST_URL!).pathname);
    },
  );

  it.runIf(hasDatabase)(
    "keeps real ownership queries constant for 25 and 50 history rows",
    async () => {
      const owner = randomUUID();
      await holder.client!.query(
        "insert into profiles(id,name) values($1,'Synthetic identity owner')",
        [owner],
      );
      for (let index = 0; index < 51; index++) {
        const subject = randomUUID();
        await holder.client!.query(
          "insert into leads(id,company_name,assigned_to) values($1,$2,$3)",
          [subject, "Synthetic identity " + subject, owner],
        );
        await holder.client!.query(
          "insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,status) values('Qualification Agent','qualify_lead','lead',$1,'completed')",
          [subject],
        );
      }
      const rows: RowAuthorizer = {
        allow: async (_capability, type, ids) => {
          const owners = await resolveOwnerProfileIds(type, ids);
          return new Map(ids.map((id) => [id, owners.get(id) === owner]));
        },
      };
      for (const limit of [25, 50]) {
        holder.queries = 0;
        const page = await loadAgentHistoryPage({
          workflowType: "qualify_lead",
          page: 1,
          limit,
          access: {},
          rows,
        });
        expect(page.items).toHaveLength(limit);
        expect(page.total).toBe(51);
        expect(holder.queries).toBe(4); // Three history reads and one batched ownership read.
      }
    },
  );

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

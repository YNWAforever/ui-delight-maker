import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, reads: [] as string[] }));
// Driver boundary only: every read below executes the actual SQL on isolated PostgreSQL.
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) => {
    holder.reads.push(sql);
    return (await holder.pool!.query(sql, [...values])).rows;
  },
}));
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { loadAiReviewRead } from "../agent-workspaces";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const visibleSubject = randomUUID(),
  deniedSubject = randomUUID();
const visibleRun = randomUUID(),
  deniedRun = randomUUID();
const approvalIds = [randomUUID(), randomUUID(), randomUUID()];
// Controls content projection only; real ownership/grants and genuine sessions have separate gates.
const rows: RowAuthorizer = {
  allow: async (_capability, _resourceType, ids) =>
    new Map(ids.map((id) => [id, id === visibleSubject])),
};
async function read() {
  return loadAiReviewRead({}, rows);
}

describe("AI review persisted version against real PostgreSQL", () => {
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
    for (const [id, subjectId] of [
      [visibleRun, visibleSubject],
      [deniedRun, deniedSubject],
    ]) {
      await holder.pool.query(
        "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,status,human_review_required) values($1,'Synthetic version review','qualify_lead','lead',$2,'completed',true)",
        [id, subjectId],
      );
    }
    for (const [index, id] of approvalIds.entries()) {
      await holder.pool.query(
        "insert into human_approvals(id,agent_run_id,approval_type,status,row_version,context_data,context_summary,reviewer_notes) values($1,$2,'qualification_review','pending',7,$3::jsonb,'Synthetic private summary','Synthetic private notes')",
        [
          id,
          index === 0 ? visibleRun : index === 1 ? deniedRun : null,
          JSON.stringify({ synthetic: "private context" }),
        ],
      );
    }
  }, 60000);
  beforeEach(() => {
    holder.reads.length = 0;
  });
  afterAll(async () => {
    if (!holder.pool) return;
    await holder.pool.query("delete from human_approvals where id=any($1::uuid[])", [approvalIds]);
    await holder.pool.query("delete from agent_runs where id=any($1::uuid[])", [
      [visibleRun, deniedRun],
    ]);
    await holder.pool.end();
  });
  it.runIf(hasDatabase)(
    "returns the true nonzero approval version to the decision caller",
    async () => {
      const result = await read();
      const approval = result.approvals.find((row) => row.id === approvalIds[0]);
      expect(approval?.row_version).toBe(7);
      expect(approval?.context_summary).toBe("Synthetic private summary");
      expect(approval?.subject_restricted).toBe(false);
    },
  );
  it.runIf(hasDatabase)("retains the version while redacting a denied linked subject", async () => {
    const result = await read();
    expect(result.approvals.find((row) => row.id === approvalIds[1])).toMatchObject({
      row_version: 7,
      subject_restricted: true,
      context_data: null,
      context_summary: null,
      reviewer_notes: null,
    });
  });
  it.runIf(hasDatabase)(
    "keeps orphan approvals in the queue with true version and redacted content",
    async () => {
      const result = await read();
      expect(result.approvals.find((row) => row.id === approvalIds[2])).toMatchObject({
        row_version: 7,
        subject_restricted: true,
        context_data: null,
        context_summary: null,
        reviewer_notes: null,
      });
    },
  );
  it.runIf(hasDatabase)("strips subject identity and retains two composed reads", async () => {
    const result = await read();
    for (const id of approvalIds) {
      const row = result.approvals.find((row) => row.id === id);
      expect(row).not.toHaveProperty("subject_id");
      expect(row).not.toHaveProperty("subject_type");
    }
    expect(holder.reads).toHaveLength(2);
  });
});

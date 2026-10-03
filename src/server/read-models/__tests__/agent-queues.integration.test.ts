import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  calls: 0,
  statements: [] as { sql: string; values: unknown[] }[],
}));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) => {
    holder.calls++;
    holder.statements.push({ sql, values: [...values] });
    return (await holder.pool!.query(sql, [...values])).rows;
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const chain = {
      validator: (v: typeof validate) => {
        validate = v;
        return chain;
      },
      handler:
        (handler: (arg: { data: unknown }) => unknown) =>
        (arg: { data?: unknown } = {}) =>
          handler({ data: validate(arg.data) }),
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => ({
    profile: {
      id: "queue-manager",
      role: "manager",
      status: "active",
      primary_department_id: null,
    },
  }),
}));
import { getAiReviewRead } from "@/server-functions/agent-runs";
import { loadAgentQueue } from "../agent-queues";
import {
  requirePageAuthorization,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
const enabled = Boolean(process.env.DATABASE_TEST_URL),
  databaseName = "clientops_ai_queue_" + randomUUID().replaceAll("-", "");
const owner = "queue-owner",
  other = "queue-other",
  manager = "queue-manager",
  lead = randomUUID(),
  otherLead = randomUUID(),
  otherApproval = randomUUID();
let admin: Pool;
const context = (changes: Partial<RequestAuthorization> = {}) =>
  ({
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
  }) as RequestAuthorization;
async function read(input: Record<string, unknown>, ctx = context()) {
  const { rows } = await requirePageAuthorization(["agents.view", "approvals.view"], {
    context: ctx,
    cacheRowOwners: true,
  });
  return loadAgentQueue(input, ctx, rows);
}
describe("complete scoped AI queue in physical PostgreSQL", () => {
  beforeAll(async () => {
    if (!enabled) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    if (url.hostname !== "127.0.0.1") throw new Error("Disposable loopback PostgreSQL required");
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
      "insert into profiles(id,email,name,role,status) values($1,'queue-owner@fixture.invalid','Owner','sales','active'),($2,'queue-other@fixture.invalid','Other','sales','active'),($3,'queue-manager@fixture.invalid','Manager','manager','active')",
      [owner, other, manager],
    );
    await holder.pool.query("update profiles set manager_profile_id=$1 where id=$2", [
      manager,
      owner,
    ]);
    await holder.pool.query(
      "insert into leads(id,company_name,assigned_to) values($1,'Owned synthetic',$2),($3,'Other synthetic',$4)",
      [lead, owner, otherLead, other],
    );
    await holder.pool.query(
      "insert into leads(company_name,assigned_to) select 'Owned queue synthetic '||i,$1 from generate_series(1,101) i",
      [owner],
    );
    await holder.pool.query(
      `insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,created_by,status,output_summary,created_at) select 'Reply Draft','draft_reply','lead',id,$1,'waiting_approval','Owned summary','2023-01-01T00:00:00.123456Z' from leads where assigned_to=$1 and id<>$2`,
      [owner, lead],
    );
    await holder.pool.query(
      `insert into human_approvals(agent_run_id,approval_type,status,assigned_to,context_data,context_summary,created_at) select id,'message_send','pending',$1,'{}','Owned approval','2023-01-01T00:00:00.123456Z' from agent_runs`,
      [owner],
    );
    const run = randomUUID();
    await holder.pool.query(
      "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,created_by,status,output_summary) values($1,'Other Reply','draft_reply','lead',$2,$3,'waiting_approval','Do not disclose')",
      [run, otherLead, other],
    );
    await holder.pool.query(
      "insert into human_approvals(id,agent_run_id,approval_type,status,assigned_to,context_data) values($1,$2,'message_send','pending',$3,'{}')",
      [otherApproval, run, other],
    );
  }, 60000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
    if (admin) {
      if (!/^clientops_ai_queue_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Owned DB required");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  }, 60000);
  it.runIf(enabled)(
    "AI Review public BFF exposes a scoped count and bounded first page",
    async () => {
      const readReview = getAiReviewRead as unknown as (arg: {
        data: { limit: number };
      }) => Promise<{ approvals: { id: string }[]; pagination: { totalMatching: number } }>;
      const result = await readReview({ data: { limit: 25 } });
      expect(result.pagination?.totalMatching).toBe(101);
      expect(result.approvals).toHaveLength(25);
      expect(result.approvals.map((a) => a.id)).not.toContain(otherApproval);
    },
  );
  it.runIf(enabled)(
    "reaches_oldest_of_101_pending and counts only SQL-visible approvals",
    async () => {
      let cursor: string | undefined;
      const ids: string[] = [];
      do {
        const page = await read({ queue: "approvals", status: "pending", limit: 25, cursor });
        expect(page.totalMatching).toBe(101);
        expect(page.items.length).toBeLessThanOrEqual(25);
        ids.push(...page.items.map((v) => v.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(new Set(ids).size).toBe(101);
      expect(ids).not.toContain(otherApproval);
    },
  );
  it.runIf(enabled)(
    "paginates_tied_timestamps_without_duplicates at 25 and 50 with bounded query count",
    async () => {
      for (const limit of [25, 50]) {
        holder.calls = 0;
        const page = await read({ queue: "runs", limit });
        const count = holder.calls;
        holder.calls = 0;
        const next = await read({ queue: "runs", limit, cursor: page.nextCursor });
        expect(holder.calls).toBe(count);
        expect(count).toBeLessThanOrEqual(3);
        expect(new Set([...page.items, ...next.items].map((v) => v.id)).size).toBe(
          page.items.length + next.items.length,
        );
        expect(JSON.stringify(page)).not.toContain("Do not disclose");
      }
    },
  );
  it.runIf(enabled)("rejects_cursor_with_changed_filters or actor", async () => {
    const first = await read({ queue: "approvals", limit: 25 });
    await expect(
      read({ queue: "approvals", status: "escalated", limit: 25, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const otherContext = context({
      actor: { ...context().actor, profileId: owner, role: "sales", directReportIds: [] },
    });
    await expect(
      read({ queue: "approvals", limit: 25, cursor: first.nextCursor }, otherContext),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it.runIf(enabled)(
    "parallel new insert is excluded by asOf while fresh refresh sees it",
    async () => {
      const cutoff = new Date("2025-01-01T00:00:00.123Z");
      const first = await read({ queue: "approvals", limit: 50 }, context({ now: cutoff }));
      const id = randomUUID();
      try {
        // PostgreSQL preserves microseconds; JS truncates to milliseconds. Pin both
        // boundaries so a faster query cannot race the next wall-clock millisecond.
        await holder.pool!.query(
          "insert into human_approvals(id,approval_type,status,assigned_to,context_data,created_at) values($1,'message_send','pending',$2,'{}','2025-01-01T00:00:00.123456Z')",
          [id, owner],
        );
        const next = await read(
          { queue: "approvals", limit: 50, cursor: first.nextCursor },
          context({ now: new Date("2025-01-01T00:00:00.124Z") }),
        );
        expect(next.totalMatching).toBe(101);
        expect(next.asOf).toBe(first.asOf);
        expect(next.items.map((row) => row.id)).not.toContain(id);
        const fresh = await read(
          { queue: "approvals", limit: 50 },
          context({ now: new Date("2025-01-01T00:00:00.124Z") }),
        );
        expect(fresh.totalMatching).toBe(102);
        expect(fresh.asOf).not.toBe(first.asOf);
      } finally {
        await holder.pool!.query("delete from human_approvals where id=$1", [id]);
      }
    },
  );
  it.runIf(enabled)("explicit denial removes a row from SQL matching count", async () => {
    const { rows } = await holder.pool!.query(
      "select id from human_approvals where assigned_to=$1 limit 1",
      [owner],
    );
    const ctx = context({
      overrides: [
        {
          profileId: manager,
          capability: "approvals.view",
          effect: "deny",
          resourceType: "human_approval",
          resourceId: rows[0].id,
        },
      ],
    });
    expect((await read({ queue: "approvals", limit: 25 }, ctx)).totalMatching).toBe(100);
  });
  it.runIf(enabled)(
    "open queue includes escalated and workflow filters are server predicates",
    async () => {
      const {
        rows: [row],
      } = await holder.pool!.query(
        "select id,agent_run_id from human_approvals where assigned_to=$1 order by created_at,id limit 1",
        [owner],
      );
      try {
        await holder.pool!.query("update human_approvals set status='escalated' where id=$1", [
          row.id,
        ]);
        await holder.pool!.query("update agent_runs set workflow_type='qualify_lead' where id=$1", [
          row.agent_run_id,
        ]);
        const open = await read({ queue: "approvals", limit: 25 });
        expect(open.totalMatching).toBe(101);
        expect(open.items[0]).toMatchObject({ id: row.id, status: "escalated" });
        const filtered = await read({
          queue: "approvals",
          workflowType: "qualify_lead",
          status: "escalated",
          limit: 25,
        });
        expect(filtered.totalMatching).toBe(1);
        expect(filtered.items[0].id).toBe(row.id);
      } finally {
        await holder.pool!.query("update human_approvals set status='pending' where id=$1", [
          row.id,
        ]);
        await holder.pool!.query("update agent_runs set workflow_type='draft_reply' where id=$1", [
          row.agent_run_id,
        ]);
      }
    },
  );
  it.runIf(enabled)(
    "attention uses inclusive actual 60 minute deadline and 7 day failure window",
    async () => {
      const { rows: runs } = await holder.pool!.query(
        "select id from agent_runs where created_by=$1 order by id limit 2",
        [owner],
      );
      const now = new Date("2026-10-03T12:00:00Z");
      try {
        await holder.pool!.query(
          "update agent_runs set status='running',created_at=$2 where id=$1",
          [runs[0].id, new Date(now.getTime() - 3600000)],
        );
        await holder.pool!.query(
          "update agent_runs set status='running',created_at=$2 where id=$1",
          [runs[1].id, new Date(now.getTime() - 3599999)],
        );
        const page = await read(
          { queue: "runs", status: "running", attention: true, limit: 25 },
          context({ now }),
        );
        expect(page.items.map((v) => v.id)).toEqual([runs[0].id]);
        await holder.pool!.query(
          "update agent_runs set status='failed',created_at=$2 where id=$1",
          [runs[0].id, new Date(now.getTime() - 7 * 86400000)],
        );
        await holder.pool!.query(
          "update agent_runs set status='failed',created_at=$2 where id=$1",
          [runs[1].id, new Date(now.getTime() - 7 * 86400000 - 1)],
        );
        const failed = await read(
          { queue: "runs", status: "failed", attention: true, limit: 25 },
          context({ now }),
        );
        expect(failed.items.map((v) => v.id)).toEqual([runs[0].id]);
      } finally {
        await holder.pool!.query(
          "update agent_runs set status='waiting_approval',created_at='2023-01-01T00:00:00.123456Z' where id=any($1::uuid[])",
          [runs.map((r) => r.id)],
        );
      }
    },
  );
  it.runIf(enabled)(
    "25 and 50 review rows use one cached ownership load and measured PostgreSQL plans",
    async () => {
      const counts: number[] = [];
      for (const limit of [25, 50]) {
        const ctx = context();
        const { rows } = await requirePageAuthorization(["agents.view", "approvals.view"], {
          context: ctx,
          cacheRowOwners: true,
        });
        const { loadAiReviewQueueRead } = await import("../agent-queues");
        holder.calls = 0;
        holder.statements = [];
        await loadAiReviewQueueRead({ limit }, ctx, rows);
        counts.push(holder.calls);
        expect(holder.calls).toBeLessThanOrEqual(4);
        for (const statement of holder.statements.filter((s) =>
          s.sql.includes("from human_approvals a"),
        )) {
          const plan = await holder.pool!.query(
            "explain (analyze,buffers,format json) " + statement.sql,
            statement.values,
          );
          const result = plan.rows[0]["QUERY PLAN"][0];
          expect(result["Execution Time"]).toBeGreaterThanOrEqual(0);
          expect(result.Plan["Actual Rows"]).toBeLessThanOrEqual(limit + 1);
        }
      }
      expect(counts[0]).toBe(counts[1]);
    },
  );
  it.runIf(enabled)(
    "rejects queue-specific invalid status, oversized limits and crossed dates",
    async () => {
      for (const input of [
        { queue: "approvals", status: "running" },
        { queue: "runs", status: "pending" },
        { queue: "runs", limit: 100 },
        { queue: "runs", from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" },
      ])
        await expect(read(input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    },
  );
  it.runIf(enabled)(
    "unknown workflow filter reads pre-existing drift without admitting it through the real schema",
    async () => {
      const id = randomUUID();
      // Only this disposable fixture simulates historical schema drift. Production migrations
      // remain strict and immutable; restore their exact constraint before leaving this case.
      const {
        rows: [constraint],
      } = await holder.pool!.query(
        "select pg_get_constraintdef(oid) as definition from pg_constraint where conname='agent_runs_workflow_type_check'",
      );
      await holder.pool!.query(
        "alter table agent_runs drop constraint agent_runs_workflow_type_check",
      );
      try {
        await holder.pool!.query(
          "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,created_by,status,created_at) values($1,'Legacy name','legacy_unknown','lead',$2,$3,'failed','2023-01-01T00:00:00.123456Z')",
          [id, lead, owner],
        );
        const page = await read({ queue: "runs", workflowType: "unknown", limit: 25 });
        expect(page.totalMatching).toBe(1);
        expect(page.items.map((r) => r.id)).toEqual([id]);
      } finally {
        await holder.pool!.query("delete from agent_runs where id=$1", [id]);
        await holder.pool!.query(
          "alter table agent_runs add constraint agent_runs_workflow_type_check " +
            constraint.definition,
        );
      }
      await expect(
        holder.pool!.query(
          "insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,status) values('Forbidden drift','legacy_unknown','lead',$1,'failed')",
          [lead],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );
  it.runIf(enabled)(
    "refreshes_after_last_page_disappears without resurrecting changed states",
    async () => {
      let cursor: string | undefined;
      let page;
      do {
        page = await read({ queue: "approvals", limit: 50, cursor });
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      } while (cursor);
      expect(page.items).toHaveLength(1);
      const id = page.items[0].id;
      {
        await holder.pool!.query("update human_approvals set status='approved' where id=$1", [id]);
        const vanished = await read({ queue: "approvals", limit: 50, cursor });
        expect(vanished.items).toHaveLength(0);
        expect(vanished.totalMatching).toBe(100);
        expect((await read({ queue: "approvals", limit: 50 })).items).toHaveLength(50);
      } // Terminal state stays immutable; the owned fixture database is dropped after this final case.
    },
  );

  it.runIf(enabled)(
    "avoids unnecessary JIT compilation for scoped 100k queues",
    async () => {
      const tag = "queue-plan-" + randomUUID();
      type PlanNode = { "Relation Name"?: string; "Actual Loops"?: number; Plans?: PlanNode[] };
      const collect = (node: PlanNode): PlanNode[] => [
        node,
        ...(node.Plans ?? []).flatMap(collect),
      ];
      try {
        await holder.pool!.query(
          `insert into leads(company_name,assigned_to)
           select $1||' '||i,case when i%10=0 then $2 else $3 end from generate_series(1,100000) i`,
          [tag, other, owner],
        );
        await holder.pool!.query(
          `insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,created_by,status,created_at)
           select $1,'qualify_lead','lead',id,assigned_to,'completed','2023-01-01T00:00:00Z'
             from leads where company_name like $1||' %'`,
          [tag],
        );
        await holder.pool!.query("analyze leads");
        await holder.pool!.query("analyze agent_runs");
        const counts: number[] = [];
        for (const limit of [25, 50]) {
          holder.calls = 0;
          holder.statements = [];
          const result = await read({ queue: "runs", workflowType: "qualify_lead", limit });
          // 90k owned subjects, 10k foreign; derived independently from the i%10 fixture.
          expect(result.totalMatching).toBe(90000);
          expect(result.items).toHaveLength(limit);
          counts.push(holder.calls);
          expect(holder.calls).toBeLessThanOrEqual(3);
          const owners = await holder.pool!.query<{ assigned_to: string }>(
            "select assigned_to from leads where id=any($1::uuid[])",
            [result.items.map((r) => ("subject_id" in r ? r.subject_id : null))],
          );
          expect(owners.rows.every((r) => r.assigned_to === owner)).toBe(true);
          for (const statement of holder.statements.filter((s) =>
            s.sql.includes("from agent_runs r"),
          )) {
            const explained = await holder.pool!.query<{
              "QUERY PLAN": {
                Plan: PlanNode;
                JIT?: { Functions: number };
                "Execution Time": number;
              }[];
            }>("explain (analyze,buffers,format json) " + statement.sql, statement.values);
            const plan = explained.rows[0]["QUERY PLAN"][0];
            const scans = collect(plan.Plan).filter((n) => n["Relation Name"] === "leads");
            expect(scans.length).toBeGreaterThan(0);
            const subjectScanLoops = Math.max(...scans.map((n) => n["Actual Loops"] ?? 0));
            console.info(
              JSON.stringify({
                tag: "queue-plan",
                limit,
                subjectScanLoops,
                jitFunctions: plan.JIT?.Functions ?? 0,
                executionMs: plan["Execution Time"],
              }),
            );
            // Eligibility must be computed as a set, not correlated once per run.
            expect(subjectScanLoops).toBeLessThanOrEqual(2);
            // A set-based predicate should stay below the JIT threshold on this PG17 fixture.
            expect(plan.JIT?.Functions ?? 0).toBe(0);
          }
        }
        expect(counts[0]).toBe(counts[1]);
        const ownRun = (
          await holder.pool!.query<{ id: string; subject_id: string }>(
            "select id,subject_id from agent_runs where agent_name=$1 and created_by=$2 limit 1",
            [tag, owner],
          )
        ).rows[0];
        const foreignRun = (
          await holder.pool!.query<{ id: string; subject_id: string }>(
            "select id,subject_id from agent_runs where agent_name=$1 and created_by=$2 limit 1",
            [tag, other],
          )
        ).rows[0];
        const overridden = context({
          overrides: [
            {
              profileId: manager,
              capability: "leads.view",
              effect: "deny",
              resourceType: "lead",
              resourceId: ownRun.subject_id,
            },
            {
              profileId: manager,
              capability: "leads.view",
              effect: "allow",
              resourceType: "lead",
              resourceId: foreignRun.subject_id,
            },
          ],
        });
        expect(
          (await read({ queue: "runs", workflowType: "qualify_lead", limit: 25 }, overridden))
            .totalMatching,
        ).toBe(90000);
        expect(
          (await read({ queue: "runs", runId: ownRun.id, limit: 25 }, overridden)).totalMatching,
        ).toBe(0);
        expect(
          (await read({ queue: "runs", runId: foreignRun.id, limit: 25 }, overridden)).items.map(
            (r) => r.id,
          ),
        ).toEqual([foreignRun.id]);
      } finally {
        await holder.pool!.query("delete from agent_runs where agent_name=$1", [tag]);
        await holder.pool!.query("delete from leads where company_name like $1||' %'", [tag]);
        await holder.pool!.query("analyze leads");
        await holder.pool!.query("analyze agent_runs");
      }
    },
    60000,
  );
});

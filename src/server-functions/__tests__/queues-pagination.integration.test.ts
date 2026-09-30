import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({ client: null as PoolClient | null }));
const authMocks = vi.hoisted(() => ({
  loadRequestAuthorization: vi.fn(),
  requireCapability: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(next: (data: unknown) => unknown) {
        validate = next;
        return chain;
      },
      handler<T extends ({ data }: { data: never }) => unknown>(handler: T) {
        return ({ data }: { data?: unknown } = {}) => handler({ data: validate(data) } as never);
      },
    };
    return chain;
  },
}));
vi.mock("@/server/auth/authorization.server", () => ({
  loadRequestAuthorization: authMocks.loadRequestAuthorization,
  requireCapability: authMocks.requireCapability,
  requireAnyCapability: vi.fn(),
  requirePageAuthorization: vi.fn(),
}));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.client!.query(sql, [...values])).rows,
  queryOne: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.client!.query(sql, [...values])).rows[0] ?? null,
}));
const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let pool: Pool | null = null;

function context(deniedId?: string): RequestAuthorization {
  return {
    session: { profile: { id: "queue-manager" } } as AppSession,
    actor: {
      profileId: "queue-manager",
      role: "manager",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: ["owner-a"],
    },
    overrides: deniedId
      ? [
          {
            profileId: "queue-manager",
            capability: "tasks.view",
            effect: "deny",
            resourceType: "task",
            resourceId: deniedId,
          },
        ]
      : [],
    now: new Date("2026-09-27T10:00:00.000Z"),
  };
}

describe("work queue keyset pagination on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    authMocks.loadRequestAuthorization.mockResolvedValue(context());
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 1 });
    holder.client = await pool.connect();
    await holder.client.query("begin");
    await holder.client.query(`create temp table tasks (
      id uuid primary key, title text, description text, assigned_to text,
      account_id text, due_date date, priority text, status text,
      created_by_agent text, created_at timestamptz
    ) on commit drop`);
    await holder.client.query(`insert into tasks
      (id,title,description,assigned_to,account_id,due_date,priority,status,created_by_agent,created_at)
      select gen_random_uuid(), 'Task ' || i, 'Private ' || i,
        case when i <= 120 then 'owner-a' else 'owner-b' end,
        null,null,case when i % 2 = 0 then 'high' else 'medium' end,
        'open',null, now() - i * interval '1 second'
      from generate_series(1,150) i`);
    await holder.client.query(`create temp table profiles (
      id text primary key, name text, email text, role text, status text
    ) on commit drop`);
    await holder.client.query(`insert into profiles (id,name,email,role,status)
      values ('owner-a','Alice Owner','private-a@example.test','sales','active'),
             ('owner-b','Bob Outside','private-b@example.test','sales','active')`);
    await holder.client.query(`insert into profiles (id,name,email,role,status)
      select 'profile-' || i,
        case when i=250 then 'Search Target 250' else 'Person ' || i end,
        'private-' || i || '@example.test','sales','active'
      from generate_series(1,250) i`);
    await holder.client.query(`create temp table agent_runs (
      id uuid primary key, status text, subject_type text, subject_id uuid
    ) on commit drop`);
    await holder.client.query(`create temp table human_approvals (
      id uuid primary key, agent_run_id uuid, approval_type text, requested_by text,
      assigned_to text, status text, row_version int, superseded_by uuid,
      recovery_outcome_code text, recovery_reason text, context_data jsonb,
      context_summary text, reviewer_notes text, decided_at timestamptz,
      created_at timestamptz
    ) on commit drop`);
    await holder.client.query(`insert into human_approvals
      (id,approval_type,assigned_to,status,row_version,context_data,context_summary,created_at)
      select gen_random_uuid(),'message_send',
        case when i <= 120 then 'owner-a' else 'owner-b' end,
        'pending',1,'{"private_draft":"Never list me"}'::jsonb,'Request ' || i,
        now() - i * interval '1 second'
      from generate_series(1,150) i`);
    await holder.client.query(`insert into human_approvals
      (id,approval_type,assigned_to,status,row_version,context_data,context_summary,created_at,decided_at)
      select gen_random_uuid(),'message_send','owner-a','approved',2,
        '{"private_draft":"Never list me"}'::jsonb,'History ' || i,
        now() - i * interval '1 second', now() - i * interval '1 second'
      from generate_series(1,20) i`);
  });
  afterAll(async () => {
    if (holder.client) {
      await holder.client.query("rollback");
      holder.client.release();
      holder.client = null;
    }
    await pool?.end();
  });

  it.runIf(hasDatabase)(
    "caps pages at 100 and traverses 120 visible tasks without duplicates",
    async () => {
      const repository = await import("@/server/repositories/tasks");
      expect(repository.listTaskQueuePage).toBeTypeOf("function");
      const first = await repository.listTaskQueuePage({ limit: 1000 }, context());
      expect(first.items).toHaveLength(100);
      expect(first.total).toBe(120);
      expect(first.nextCursor).toBeTruthy();
      const second = await repository.listTaskQueuePage(
        { limit: 1000, cursor: first.nextCursor! },
        context(),
      );
      expect(second.items).toHaveLength(20);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(120);
    },
  );

  it.runIf(hasDatabase)(
    "filters priority in SQL and counts only scoped, non-denied rows",
    async () => {
      const repository = await import("@/server/repositories/tasks");
      expect(repository.listTaskQueuePage).toBeTypeOf("function");
      const denied = await holder.client!.query("select id from tasks where title='Task 2'");
      const page = await repository.listTaskQueuePage(
        { priority: "high", limit: 100 },
        context(denied.rows[0].id),
      );
      expect(page.total).toBe(59);
      expect(page.items).toHaveLength(59);
      expect(page.items.every((row) => row.priority === "high")).toBe(true);
      expect(page.items.some((row) => row.id === denied.rows[0].id)).toBe(false);
    },
  );

  it.runIf(hasDatabase)("rejects a cursor reused with a different filter", async () => {
    const repository = await import("@/server/repositories/tasks");
    expect(repository.listTaskQueuePage).toBeTypeOf("function");
    const first = await repository.listTaskQueuePage({ priority: "high", limit: 10 }, context());
    await expect(
      repository.listTaskQueuePage(
        { priority: "medium", limit: 10, cursor: first.nextCursor! },
        context(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
  it.runIf(hasDatabase)("mine owner preset resolves to the actor inside SQL", async () => {
    const repository = await import("@/server/repositories/tasks");
    const self = context();
    self.actor.profileId = "owner-a";
    self.actor.directReportIds = [];
    const page = await repository.listTaskQueuePage({ assigned_to: "mine", limit: 100 }, self);
    expect(page.total).toBe(120);
    expect(page.items.every((row) => row.assigned_to === "owner-a")).toBe(true);
  });

  it.runIf(hasDatabase)("server endpoint returns only a bounded visible page", async () => {
    const server = await import("../tasks");
    expect(server.getTasksPage).toBeTypeOf("function");
    const page = await server.getTasksPage({ data: { priority: "high", limit: 10 } });
    expect(page.items).toHaveLength(10);
    expect(page.total).toBe(60);
    expect(authMocks.requireCapability).toHaveBeenCalledWith(
      "tasks.view",
      {},
      expect.objectContaining({ actor: expect.objectContaining({ role: "manager" }) }),
    );
  });

  it.runIf(hasDatabase)(
    "approval pending and history pages are scoped, bounded, and omit context data",
    async () => {
      const repository = await import("@/server/repositories/approvals");
      expect(repository.listApprovalQueuePage).toBeTypeOf("function");
      const first = await repository.listApprovalQueuePage(
        { group: "pending", limit: 50 },
        context(),
      );
      expect(first.total).toBe(120);
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).toBeTruthy();
      expect(JSON.stringify(first)).not.toContain("private_draft");
      expect(first.items[0]).not.toHaveProperty("context_data");
      const second = await repository.listApprovalQueuePage(
        { group: "pending", limit: 50, cursor: first.nextCursor! },
        context(),
      );
      expect(second.items).toHaveLength(50);
      expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(100);
      const history = await repository.listApprovalQueuePage(
        { group: "history", limit: 50 },
        context(),
      );
      expect(history.total).toBe(20);
      expect(history.items).toHaveLength(20);
    },
  );

  it.runIf(hasDatabase)(
    "includes only manager-claimable unassigned linked approvals in pending counts",
    async () => {
      const task = await holder.client!.query("select id from tasks where title='Task 1'");
      const run = await holder.client!.query(
        `insert into agent_runs (id,status,subject_type,subject_id)
         values (gen_random_uuid(),'waiting_approval','task',$1) returning id`,
        [task.rows[0].id],
      );
      const approval = await holder.client!.query(
        `insert into human_approvals
         (id,agent_run_id,approval_type,assigned_to,status,row_version,context_data,created_at)
         values (gen_random_uuid(),$1,'message_send',null,'pending',1,'{}'::jsonb,
                 now()+interval '1 minute') returning id`,
        [run.rows[0].id],
      );
      const repository = await import("@/server/repositories/approvals");
      const page = await repository.listApprovalQueuePage(
        { group: "pending", limit: 50 },
        context(),
      );
      expect(page.total).toBe(121);
      expect(page.items[0].id).toBe(approval.rows[0].id);
    },
  );

  it.runIf(hasDatabase)(
    "history keeps scoped overrides without treating terminal rows as claimable",
    async () => {
      await holder.client!.query("savepoint history_scope");
      try {
        const task = (await holder.client!.query("select id from tasks where title='Task 1'"))
          .rows[0].id;
        const run = (
          await holder.client!.query(
            "insert into agent_runs (id,status,subject_type,subject_id) values(gen_random_uuid(),'waiting_approval','task',$1) returning id",
            [task],
          )
        ).rows[0].id;
        const terminal = (
          await holder.client!.query(
            "insert into human_approvals (id,agent_run_id,approval_type,assigned_to,status,row_version,context_data,created_at) values(gen_random_uuid(),$1,'message_send',null,'approved',1,'{}',now()) returning id",
            [run],
          )
        ).rows[0].id;
        const denied = (
          await holder.client!.query(
            "select id from human_approvals where assigned_to='owner-a' and status='approved' limit 1",
          )
        ).rows[0].id;
        const repo = await import("@/server/repositories/approvals");
        const actor = context();
        expect((await repo.listApprovalQueuePage({ group: "history" }, actor)).total).toBe(20);
        actor.overrides = [
          {
            profileId: actor.actor.profileId,
            capability: "approvals.view",
            effect: "allow",
            resourceType: "human_approval",
            resourceId: terminal,
          },
          {
            profileId: actor.actor.profileId,
            capability: "approvals.view",
            effect: "deny",
            resourceType: "human_approval",
            resourceId: denied,
          },
        ];
        const allowed = await repo.listApprovalQueuePage({ group: "history" }, actor);
        expect(allowed.total).toBe(20);
        expect(allowed.items.some((row) => row.id === terminal)).toBe(true);
        expect(allowed.items.some((row) => row.id === denied)).toBe(false);
        actor.overrides[0].expiresAt = "2026-09-01T00:00:00Z";
        const expired = await repo.listApprovalQueuePage({ group: "history" }, actor);
        expect(expired.total).toBe(19);
        expect(expired.items.some((row) => row.id === terminal)).toBe(false);
      } finally {
        await holder.client!.query("rollback to savepoint history_scope");
      }
    },
  );

  it.runIf(hasDatabase)(
    "approval server list omits payload while selected detail and aggregate stay scoped",
    async () => {
      const server = await import("../approvals");
      const page = await server.getApprovalsPage({
        data: { group: "pending", limit: 10 },
      });
      expect(page.items).toHaveLength(10);
      expect(page.items[0]).not.toHaveProperty("context_data");
      const detail = await server.getApprovalDetailFn({
        data: { id: page.items.find((item) => item.assigned_to === "owner-a")!.id },
      });
      expect(JSON.stringify(detail.context_data)).toContain("private_draft");
      const lastReviewedAt = await server.getLastReviewedAtFn();
      expect(lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    },
  );

  it.runIf(hasDatabase)(
    "finds the 250th eligible profile without exposing private directory fields",
    async () => {
      const repository = await import("@/server/repositories/assignable-profiles").catch(
        () => null,
      );
      expect(repository?.listAssignableProfiles).toBeTypeOf("function");
      const admin = context();
      admin.actor.role = "admin";
      const page = await repository!.listAssignableProfiles(
        { purpose: "task_assign", query: "Search Target 250", limit: 20 },
        admin,
      );
      expect(page.items).toMatchObject([
        { id: "profile-250", displayName: "Search Target 250", isEligible: true },
      ]);
      expect(JSON.stringify(page)).not.toContain("private-250@example.test");
    },
  );

  it.runIf(hasDatabase)(
    "reviewer roster honors persisted approval scope, scoped allow, deny and expiry",
    async () => {
      const repo = await import("@/server/repositories/assignable-profiles");
      await holder.client!.query(
        "insert into profiles(id,name,email,role,status) values('queue-manager','Queue Manager','private-queue@example.test','manager','active') on conflict(id) do nothing",
      );
      const id = (
        await holder.client!.query(
          "select id from human_approvals where assigned_to='owner-b' limit 1",
        )
      ).rows[0].id;
      const actor = context(),
        input = { purpose: "approval_reviewer" as const, resourceId: id, query: "Queue Manager" };
      await expect(repo.listAssignableProfiles(input, actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      actor.overrides = [
        {
          profileId: actor.actor.profileId,
          capability: "approvals.decide",
          effect: "allow",
          resourceType: "human_approval",
          resourceId: id,
        },
      ];
      expect((await repo.listAssignableProfiles(input, actor)).items).toMatchObject([
        { id: "queue-manager", displayName: "Queue Manager" },
      ]);
      expect(
        await repo.resolveAssignableProfile(
          { purpose: "approval_reviewer", resourceId: id, id: "queue-manager" },
          actor,
        ),
      ).toMatchObject({ displayName: "Queue Manager" });
      actor.overrides.push({
        profileId: actor.actor.profileId,
        capability: "approvals.decide",
        effect: "deny",
        resourceType: "human_approval",
        resourceId: id,
      });
      await expect(
        repo.resolveAssignableProfile(
          { purpose: "approval_reviewer", resourceId: id, id: "queue-manager" },
          actor,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      actor.overrides = [
        {
          profileId: actor.actor.profileId,
          capability: "approvals.decide",
          effect: "allow",
          resourceType: "human_approval",
          resourceId: id,
          expiresAt: "2026-09-01T00:00:00Z",
        },
      ];
      await expect(repo.listAssignableProfiles(input, actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it.runIf(hasDatabase)("task filter names only owners of visible tasks", async () => {
    const repository = await import("@/server/repositories/assignable-profiles").catch(() => null);
    expect(repository?.listAssignableProfiles).toBeTypeOf("function");
    const page = await repository!.listAssignableProfiles(
      { purpose: "task_filter", query: "Owner", limit: 20 },
      context(),
    );
    expect(page.items.map((person) => person.displayName)).toEqual(["Alice Owner"]);
    expect(JSON.stringify(page)).not.toContain("private-a@example.test");
    expect(JSON.stringify(page)).not.toContain("owner-b");
  });

  it.runIf(hasDatabase)("server people search returns the minimal visible owner name", async () => {
    const server = await import("../assignable-profiles").catch(() => null);
    expect(server?.listAssignableProfilesFn).toBeTypeOf("function");
    const page = await server!.listAssignableProfilesFn({
      data: { purpose: "task_filter", query: "Alice" },
    });
    expect(page.items).toMatchObject([
      { id: "owner-a", displayName: "Alice Owner", isEligible: true },
    ]);
    expect(JSON.stringify(page)).not.toContain("private-a@example.test");
  });

  it.runIf(hasDatabase)(
    "resolves a selected owner name only when its tasks are visible",
    async () => {
      const repository = await import("@/server/repositories/assignable-profiles");
      expect(repository.resolveAssignableProfile).toBeTypeOf("function");
      const visible = await repository.resolveAssignableProfile(
        { purpose: "task_filter", id: "owner-a" },
        context(),
      );
      const hidden = await repository.resolveAssignableProfile(
        { purpose: "task_filter", id: "owner-b" },
        context(),
      );
      expect(visible).toMatchObject({ id: "owner-a", displayName: "Alice Owner" });
      expect(hidden).toBeNull();
    },
  );

  it.runIf(hasDatabase)("server resolves a selected visible owner by ID", async () => {
    const server = await import("../assignable-profiles");
    expect(server.resolveAssignableProfileFn).toBeTypeOf("function");
    const person = await server.resolveAssignableProfileFn({
      data: { purpose: "task_filter", id: "owner-a" },
    });
    expect(person).toMatchObject({ id: "owner-a", displayName: "Alice Owner" });
  });
});

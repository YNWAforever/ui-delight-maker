import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getTasks` used to gate the list on an untargeted `requireCapability("tasks.view")` while
 * `updateTask` gated the same task row-by-row (`resourceType: "task", resourceId`). A `deny`
 * override scoped to one task, or manager scoping, was therefore inert on the list — a task a
 * reader could not update still showed its title and description in the queue. This file pins
 * the fix: `getTasks` now resolves `rows.allow("tasks.view", "task", ids)` once per page and
 * nulls `title`/`description` for any row the decision denies, exactly the rule
 * `requireCapability("tasks.view", { resourceType: "task", resourceId })` would apply one row
 * at a time.
 *
 * Mocking pattern cloned from `agent-runs-performance.test.ts`: `createServerFn` is stripped to
 * a passthrough so the handler can be invoked directly, and `requirePageAuthorization` is
 * mocked so these are unit tests of `getTasks`'s own redaction logic, not of authorization
 * policy or of `listTasks`'s SQL.
 */

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  requirePageAuthorization: vi.fn(),
  listTasks: vi.fn(),
  createTaskInNeon: vi.fn(),
  updateTaskInNeon: vi.fn(),
  allow: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(validator: (data: unknown) => unknown) {
        validate = validator;
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
  requireCapability: mocks.requireCapability,
  requirePageAuthorization: mocks.requirePageAuthorization,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: vi.fn(),
}));

vi.mock("@/server/repositories/tasks", () => ({
  listTasks: mocks.listTasks,
  createTask: mocks.createTaskInNeon,
  updateTask: mocks.updateTaskInNeon,
}));

const loadModule = () => import("../tasks");

type FixtureTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  account_id: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "done";
  created_by_agent: string | null;
};

const task = (overrides: Partial<FixtureTask> & { id: string }): FixtureTask => ({
  title: `Title for ${overrides.id}`,
  description: `Description for ${overrides.id}`,
  assigned_to: "profile-1",
  account_id: "account-1",
  due_date: "2026-09-10",
  priority: "medium",
  status: "open",
  created_by_agent: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCapability.mockResolvedValue({ profile: { id: "user-1" } });
  mocks.allow.mockResolvedValue(new Map());
  mocks.requirePageAuthorization.mockResolvedValue({
    access: { "tasks.view": true },
    rows: { allow: mocks.allow },
  });
});

describe("getTasks row-level redaction", () => {
  it("redacts a denied task and leaves its neighbours untouched, in one response", async () => {
    const { getTasks } = await loadModule();
    const allowed = task({ id: "task-allowed-1" });
    const denied = task({ id: "task-denied" });
    const allowedToo = task({ id: "task-allowed-2" });
    mocks.listTasks.mockResolvedValue([allowed, denied, allowedToo]);
    mocks.allow.mockResolvedValue(
      new Map([
        ["task-allowed-1", true],
        ["task-denied", false],
        ["task-allowed-2", true],
      ]),
    );

    const result = await getTasks({ data: {} });

    expect(result).toHaveLength(3);
    const byId = new Map(result.map((row) => [row.id, row]));

    expect(byId.get("task-allowed-1")).toMatchObject({
      title: allowed.title,
      description: allowed.description,
      restricted: false,
    });
    expect(byId.get("task-allowed-2")).toMatchObject({
      title: allowedToo.title,
      description: allowedToo.description,
      restricted: false,
    });
    expect(byId.get("task-denied")).toMatchObject({
      title: null,
      description: null,
      restricted: true,
    });
  });

  it("keeps status, due_date, priority and account_id on a restricted row", async () => {
    const { getTasks } = await loadModule();
    const denied = task({
      id: "task-denied",
      status: "in_progress",
      due_date: "2026-09-20",
      priority: "high",
      account_id: "account-load-bearing",
      assigned_to: "profile-99",
      created_by_agent: "Renewal Risk Agent",
    });
    mocks.listTasks.mockResolvedValue([denied]);
    mocks.allow.mockResolvedValue(new Map([["task-denied", false]]));

    const [row] = await getTasks({ data: {} });

    expect(row.title).toBeNull();
    expect(row.description).toBeNull();
    expect(row.restricted).toBe(true);
    // account_id is never rendered, but src/routes/tasks.tsx's `move()` reads
    // `movedTask?.account_id` for cache invalidation — nulling it would break that silently.
    expect(row.account_id).toBe("account-load-bearing");
    expect(row.status).toBe("in_progress");
    expect(row.due_date).toBe("2026-09-20");
    expect(row.priority).toBe("high");
    expect(row.assigned_to).toBe("profile-99");
    expect(row.created_by_agent).toBe("Renewal Risk Agent");
  });

  it("resolves the whole page with one allow call, not one per row", async () => {
    const { getTasks } = await loadModule();
    const twenty = Array.from({ length: 20 }, (_, index) => task({ id: `task-${index}` }));
    mocks.listTasks.mockResolvedValue(twenty);
    mocks.allow.mockResolvedValue(new Map(twenty.map((t) => [t.id, true])));

    const result = await getTasks({ data: {} });

    expect(result).toHaveLength(20);
    expect(mocks.allow).toHaveBeenCalledTimes(1);
    expect(mocks.allow).toHaveBeenCalledWith(
      "tasks.view",
      "task",
      twenty.map((t) => t.id),
    );
  });

  it("requires tasks.view for the page and throws on denial exactly as before", async () => {
    const { getTasks } = await loadModule();
    mocks.requirePageAuthorization.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(getTasks({ data: {} })).rejects.toThrow("FORBIDDEN");
    expect(mocks.listTasks).not.toHaveBeenCalled();
  });
});

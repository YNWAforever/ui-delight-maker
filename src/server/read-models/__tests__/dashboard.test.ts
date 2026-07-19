import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, requireCapabilityMock, createServerFnChain } = vi.hoisted(() => {
  const createServerFnChain = {
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    queryMock: vi.fn(),
    requireCapabilityMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("dashboard read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts every bounded dashboard read concurrently and preserves the initial UI contract", async () => {
    const pending = Array.from({ length: 7 }, () => deferred<unknown[]>());
    pending.forEach(({ promise }) => queryMock.mockReturnValueOnce(promise));
    const { getDashboardRead } = await import("../dashboard");

    const resultPromise = getDashboardRead();

    expect(queryMock).toHaveBeenCalledTimes(7);
    const calls = queryMock.mock.calls as Array<[string, unknown[]?]>;
    const sql = calls.map(([statement]) => statement.replace(/\s+/g, " ").trim());
    expect(sql.every((statement) => /limit \$1/i.test(statement))).toBe(true);
    expect(calls.map(([, values]) => values)).toEqual([
      [200],
      [300],
      [300],
      [100],
      [50],
      [20],
      [100],
    ]);
    expect(sql[5]).toContain("from activity_logs");

    const rows = [
      [{ id: "lead-1" }],
      [{ id: "quote-1" }],
      [{ id: "task-1" }],
      [{ id: "approval-1", context_data: {} }],
      [{ id: "run-1", input_data: {}, output_data: {} }],
      [{ id: "activity-1", diff_data: {} }],
      [{ id: "product-1" }],
    ];
    pending.forEach((item, index) => item.resolve(rows[index]));

    await expect(resultPromise).resolves.toEqual({
      leads: rows[0],
      quotes: rows[1],
      tasks: rows[2],
      approvals: rows[3],
      agentRuns: rows[4],
      activityLogs: rows[5],
      products: rows[6],
    });
  });

  it("authorizes exactly once before starting dashboard reads", async () => {
    const authorization = deferred<{ user: { id: string } }>();
    requireCapabilityMock.mockReturnValueOnce(authorization.promise);
    queryMock.mockResolvedValue([]);
    const { getDashboard } = await import("@/server-functions/dashboard");

    const resultPromise = getDashboard();

    expect(requireCapabilityMock).toHaveBeenCalledTimes(1);
    expect(requireCapabilityMock).toHaveBeenCalledWith("leads.view");
    expect(queryMock).not.toHaveBeenCalled();

    authorization.resolve({ user: { id: "user-1" } });

    await expect(resultPromise).resolves.toMatchObject({
      leads: [],
      activityLogs: [],
      products: [],
    });
    expect(requireCapabilityMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(7);
  });
});

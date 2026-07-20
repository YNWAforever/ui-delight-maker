import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTE_PERFORMANCE_BUDGET, measureSerializedBytes } from "@/lib/performance/route-performance";

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
    const pending = Array.from({ length: 8 }, () => deferred<unknown[]>());
    pending.forEach(({ promise }) => queryMock.mockReturnValueOnce(promise));
    const { getDashboardRead } = await import("../dashboard");

    const resultPromise = getDashboardRead();

    expect(queryMock).toHaveBeenCalledTimes(8);
    const calls = queryMock.mock.calls as Array<[string, unknown[]?]>;
    const sql = calls.map(([statement]) => statement.replace(/\s+/g, " ").trim());
    expect(sql.slice(0, 7).every((statement) => /limit \$1/i.test(statement))).toBe(true);
    expect(calls.map(([, values]) => values)).toEqual([
      [40],
      [40],
      [60],
      [30],
      [30],
      [20],
      [50],
      undefined,
    ]);
    expect(sql[5]).toContain("from activity_logs");
    expect(sql.slice(0, 7).every((statement) => !/select\s+(?:\w+\.)?\*/i.test(statement))).toBe(true);
    expect(sql[0]).toContain("left(enquiry_text, 500)");
    expect(sql[1]).toContain("'[]'::jsonb as line_items");
    expect(sql[3]).toContain("jsonb_build_object('lead_id'");
    expect(sql[4]).toContain("jsonb_build_object('lead_id'");

    const rows = [
      [{ id: "lead-1" }],
      [{ id: "quote-1" }],
      [{ id: "task-1" }],
      [{ id: "approval-1", context_data: {} }],
      [{ id: "run-1", input_data: {}, output_data: {} }],
      [{ id: "activity-1", diff_data: {} }],
      [{ id: "product-1", category: "CRM" }],
      [{ open_leads: "80", active_quote_value: "120000", open_tasks: "25", pending_approvals: "4" }],
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
      pipelineTotals: { openLeads: 80, activeQuoteValue: 120000, openTasks: 25, pendingApprovals: 4 },
      productSummary: { CRM: 1 },
    });
  });

  it("stays within the initial payload budget for bounded high-activity data", async () => {
    const repeated = (count: number, row: (index: number) => Record<string, unknown>) =>
      Array.from({ length: count }, (_, index) => row(index));
    queryMock
      .mockResolvedValueOnce(
        repeated(50, (index) => ({
          id: `lead-${index}`,
          company_name: `Company ${index}`,
          contact_name: `Contact ${index}`,
          contact_email: `contact-${index}@example.com`,
          contact_phone: null,
          source: "website",
          status: "qualified",
          assigned_to: "user-1",
          lead_score: 80,
          qualification_data: { next_action: "Follow up" },
          enquiry_text: "Interested in CRM and campaign services.",
          created_at: "2026-07-20T00:00:00.000Z",
          updated_at: "2026-07-20T00:00:00.000Z",
        })),
      )
      .mockResolvedValueOnce(
        repeated(100, (index) => ({
          id: `quote-${index}`,
          number: `Q-${index}`,
          lead_id: `lead-${index % 50}`,
          status: "sent",
          total_value: 10000,
          currency: "HKD",
          valid_until: "2026-08-20",
          line_items: [],
          created_at: "2026-07-20T00:00:00.000Z",
        })),
      )
      .mockResolvedValueOnce(
        repeated(100, (index) => ({
          id: `task-${index}`,
          title: `Follow up ${index}`,
          assigned_to: "user-1",
          lead_id: `lead-${index % 50}`,
          due_date: "2026-07-20",
          priority: "medium",
          status: "open",
          created_at: "2026-07-20T00:00:00.000Z",
        })),
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        repeated(20, (index) => ({
          id: `product-${index}`,
          name: `Product ${index}`,
          description: "Service package",
          category: "CRM",
          billing_type: "one_off",
          active: true,
        })),
      )
      .mockResolvedValueOnce([
        { open_leads: 500, active_quote_value: 1000000, open_tasks: 250, pending_approvals: 20 },
      ]);
    const { getDashboardRead } = await import("../dashboard");

    expect(measureSerializedBytes(await getDashboardRead())).toBeLessThanOrEqual(
      ROUTE_PERFORMANCE_BUDGET.maxInitialPayloadBytes,
    );
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
    expect(queryMock).toHaveBeenCalledTimes(8);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { REPORT_IDS } from "@/lib/reports";

const {
  queryMock,
  queryOneMock,
  requireCapabilityChecksMock,
  requireCapabilityMock,
  requireCapabilitySetMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    requireCapabilityChecksMock: vi.fn(),
    requireCapabilityMock: vi.fn(),
    requireCapabilitySetMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapabilityChecks: requireCapabilityChecksMock,
  requireCapability: requireCapabilityMock,
  requireCapabilitySet: requireCapabilitySetMock,
}));
vi.mock("@/server/db/neon.server", () => ({ query: queryMock, queryOne: queryOneMock }));

const sqlText = (value: unknown) => String(value).replace(/\s+/g, " ").trim().toLowerCase();

describe("operations read models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
    queryOneMock.mockResolvedValue(null);
    requireCapabilityChecksMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    requireCapabilityMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    requireCapabilitySetMock.mockResolvedValue({ "quotes.view": true, "accounts.view": true });
  });

  it("loads one job sheet with portions and compact linked summaries", async () => {
    const { getJobSheetOperationsRead } = await import("@/server/repositories/job-sheets");
    queryOneMock.mockResolvedValueOnce({
      id: "job-1",
      number: "JS-001",
      quote_id: "quote-1",
      client_id: "client-1",
      quote_number: "Q-001",
      quote_status: "accepted",
      client_company_name: "Acme",
    });
    queryMock.mockResolvedValueOnce([{ id: "portion-1", job_sheet_id: "job-1" }]);

    const result = await getJobSheetOperationsRead("job-1");

    expect(result).toMatchObject({
      jobSheet: { id: "job-1" },
      quote: { id: "quote-1", number: "Q-001" },
      client: { id: "client-1", company_name: "Acme" },
    });
    expect(result.portions).toHaveLength(1);
    expect(queryOneMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sqlText(queryOneMock.mock.calls[0]?.[0])).not.toContain("select *");
    expect(sqlText(queryMock.mock.calls[0]?.[0])).not.toContain("select *");
  });

  it("returns the complete portion set beyond one hundred rows", async () => {
    const { getJobSheetOperationsRead } = await import("@/server/repositories/job-sheets");
    queryOneMock.mockResolvedValueOnce({ id: "job-1", quote_id: "quote-1" });
    queryMock.mockResolvedValueOnce(
      Array.from({ length: 101 }, (_, index) => ({
        id: `portion-${index}`,
        job_sheet_id: "job-1",
      })),
    );

    const result = await getJobSheetOperationsRead("job-1");

    expect(result.portions).toHaveLength(101);
    expect(sqlText(queryMock.mock.calls[0]?.[0])).not.toContain("limit 100");
  });
  it("throws when the job sheet does not exist", async () => {
    const { getJobSheetOperationsRead } = await import("@/server/repositories/job-sheets");
    await expect(getJobSheetOperationsRead("missing")).rejects.toThrow("Job sheet not found");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["overdue", "<"],
    ["30", "between"],
    ["60", "between"],
    ["90", "between"],
    ["later", ">"],
  ] as const)("filters the %s renewal window in SQL", async (renewalWindow, operator) => {
    const { loadRenewalsRead } = await import("../operations");
    await loadRenewalsRead({ renewalWindow, asOf: "2026-07-20" });
    const sql = sqlText(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("e.status = 'active'");
    expect(sql).toContain("e.renewal_date");
    expect(sql).toContain(operator);
    expect(queryMock.mock.calls[0]?.[1]).toContain("2026-07-20");
  });

  it("applies risk and product filters in SQL and returns compact active products", async () => {
    const { loadRenewalsRead } = await import("../operations");
    queryMock
      .mockResolvedValueOnce([{ id: "engagement-1", product_id: "product-1" }])
      .mockResolvedValueOnce([{ id: "product-1", name: "CRM", billing_type: "retainer" }]);

    const result = await loadRenewalsRead({
      renewalWindow: "all",
      risk: "high",
      productId: "product-1",
      asOf: "2026-07-20",
    });

    const engagementSql = sqlText(queryMock.mock.calls[0]?.[0]);
    expect(engagementSql).toContain("e.renewal_risk");
    expect(engagementSql).toContain("e.product_id");
    expect(engagementSql).not.toContain("select e.*");
    const productSql = sqlText(queryMock.mock.calls[1]?.[0]);
    expect(productSql).toContain("p.active = true");
    expect(productSql).not.toContain("select *");
    expect(result.products).toEqual([{ id: "product-1", name: "CRM", billing_type: "retainer" }]);
  });

  it("bounds renewal pages to 50 and returns total metrics and products", async () => {
    const { loadRenewalsRead } = await import("../operations");
    queryMock
      .mockResolvedValueOnce([{ id: "engagement-1" }])
      .mockResolvedValueOnce([{ id: "product-1", name: "CRM", billing_type: "retainer" }]);
    queryOneMock.mockResolvedValueOnce({
      total: "75",
      annualized_value: "12000",
      arr_at_risk: "3000",
      due_soon: "12",
      stale: "4",
    });

    const result = await loadRenewalsRead({
      renewalWindow: "all",
      asOf: "2026-07-20",
      page: 2,
      limit: 500,
    });

    expect(queryMock.mock.calls[0]?.[1]).toContain(50);
    expect(result).toMatchObject({
      total: 75,
      page: 2,
      limit: 50,
      metrics: { annualizedValue: 12000, arrAtRisk: 3000, dueSoon: 12, stale: 4 },
    });
  });
  it("returns lightweight report summary metrics and definitions without datasets", async () => {
    const { loadReportSummary } = await import("../operations");
    queryOneMock.mockResolvedValueOnce({
      revenue: "1200",
      pipeline_value: "4000",
      leads: "8",
      won_leads: "2",
      agent_runs: "5",
      successful_agent_runs: "4",
      open_tasks: "3",
    });

    const result = await loadReportSummary({ range: "30d" });

    expect(result.metrics).toEqual({
      revenue: 1200,
      pipelineValue: 4000,
      leads: 8,
      wonLeads: 2,
      conversionRate: 25,
      agentRuns: 5,
      successfulAgentRuns: 4,
      openTasks: 3,
    });
    // Asserted against the catalogue rather than a list retyped here. A hand-written list of
    // five literals is what let PR #70's sixth report ship with no tab while this test stayed
    // green, so a list of six would be the same trap set one report further along.
    expect(result.reports.map((report) => report.id)).toEqual([...REPORT_IDS]);
    expect(queryOneMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
    const summarySql = sqlText(queryOneMock.mock.calls[0]?.[0]);
    expect(summarySql).not.toContain("generate_series");
    expect(summarySql).toMatch(/status = 'won'[\s\S]*created_at >=/);
    expect(summarySql).not.toMatch(/status = 'won'[\s\S]*updated_at >=/);
  });

  it.each([
    ["revenue", "from quotes"],
    ["pipeline", "from leads"],
    ["conversion", "from leads"],
    ["agents", "from agent_runs"],
    ["tasks", "from tasks"],
  ] as const)("queries only the selected %s report dataset", async (report, table) => {
    const { loadReportDataset } = await import("../operations");
    await loadReportDataset({ report, range: "30d" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = sqlText(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain(table);
    expect(sql).toContain("order by");
  });

  it("keeps pending unwindowed while windowing decided", async () => {
    // A 7-day range must not hide a 30-day-old untouched approval - that is the single row
    // this report exists to surface.
    const { reportQueries } = await import("../operations");
    const sql = reportQueries["human_review_workload"];

    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("or a.decided_at >= now()");
    expect(sql).toContain("left join profiles");
  });

  it("updates matched portions in place without overwriting Xero fields", async () => {
    const db = { query: vi.fn() };
    queryOneMock.mockResolvedValueOnce({ id: "job-1", status: "draft", locked_at: null });
    queryMock.mockResolvedValueOnce([
      {
        id: "portion-1",
        source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
        sort_order: 0,
        status: "entered_in_xero",
        xero_invoice_number: "INV-42",
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ id: "portion-1", status: "entered_in_xero" });
    const { replaceJobSheetPortions } = await import("@/server/repositories/job-sheets");

    await replaceJobSheetPortions(
      "job-1",
      [
        {
          id: "portion-1",
          name: "Strategy",
          source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
          description: "Updated",
          amount: 125,
          currency: "HKD",
          target_invoice_date: "2026-08-01",
          billing_type: "progress",
          status: "planned",
          sort_order: 0,
        },
      ],
      db,
    );

    const updateSql = sqlText(queryOneMock.mock.calls[1]?.[0]);
    expect(updateSql).toContain("update job_sheet_portions");
    expect(updateSql).not.toContain("xero_invoice_number =");
    expect(queryOneMock.mock.calls[1]?.[1]).toContain("portion-1");
  });

  it("rejects replacing a Xero-linked portion through an unknown identity", async () => {
    const db = { query: vi.fn() };
    queryOneMock.mockResolvedValueOnce({ id: "job-1", status: "draft", locked_at: null });
    queryMock.mockResolvedValueOnce([
      {
        id: "portion-1",
        source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
        sort_order: 0,
        status: "entered_in_xero",
        xero_invoice_number: "INV-42",
      },
    ]);
    const { replaceJobSheetPortions } = await import("@/server/repositories/job-sheets");

    await expect(
      replaceJobSheetPortions(
        "job-1",
        [
          {
            id: "portion-forged",
            name: "Strategy",
            source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
            description: "Replacement",
            amount: 125,
            currency: "HKD",
            billing_type: "progress",
            status: "planned",
            sort_order: 0,
          },
        ],
        db,
      ),
    ).rejects.toThrow("Billing portion ID does not belong to this job sheet");
    expect(queryOneMock).toHaveBeenCalledTimes(1);
  });
  it("rejects removing a portion after Xero details are saved", async () => {
    const db = { query: vi.fn() };
    queryOneMock.mockResolvedValueOnce({ id: "job-1", status: "draft", locked_at: null });
    queryMock.mockResolvedValueOnce([
      {
        id: "portion-1",
        source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
        sort_order: 0,
        status: "entered_in_xero",
        xero_invoice_number: "INV-42",
      },
    ]);
    const { replaceJobSheetPortions } = await import("@/server/repositories/job-sheets");

    await expect(replaceJobSheetPortions("job-1", [], db)).rejects.toThrow(
      "Cannot remove or replace a billing portion after Xero details are saved",
    );
  });
});

describe("operations server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
    queryOneMock.mockResolvedValue({
      id: "job-1",
      quote_id: "quote-1",
      client_id: "client-1",
      quote_number: "Q-001",
      quote_status: "accepted",
      client_company_name: "Acme",
    });
  });

  it("grants the core job sheet while redacting denied linked summaries by actual ID", async () => {
    requireCapabilitySetMock
      .mockResolvedValueOnce({ "quotes.view": false })
      .mockResolvedValueOnce({ "accounts.view": false });
    const { getJobSheetRead } = await import("@/server-functions/operations");

    const result = await getJobSheetRead({ data: { id: "job-1" } });

    expect(requireCapabilityMock).toHaveBeenCalledWith("job_sheets.view", {
      resourceType: "job_sheet",
      resourceId: "job-1",
    });
    expect(requireCapabilitySetMock).toHaveBeenNthCalledWith(1, [], {
      optional: ["quotes.view"],
      target: { resourceType: "quote", resourceId: "quote-1" },
    });
    expect(requireCapabilitySetMock).toHaveBeenNthCalledWith(2, [], {
      optional: ["accounts.view"],
      target: { resourceType: "client", resourceId: "client-1" },
    });
    expect(result.quote).toBeNull();
    expect(result.client).toBeNull();
  });

  it("does not swallow linked authorization infrastructure failures", async () => {
    requireCapabilitySetMock.mockRejectedValueOnce(new Error("authorization database unavailable"));
    const { getJobSheetRead } = await import("@/server-functions/operations");

    await expect(getJobSheetRead({ data: { id: "job-1" } })).rejects.toThrow(
      "authorization database unavailable",
    );
  });
  it("authorizes renewal rows and product summaries together", async () => {
    const { getRenewalsRead } = await import("@/server-functions/operations");
    await getRenewalsRead({ data: { renewalWindow: "all", asOf: "2026-07-20" } });
    expect(requireCapabilityChecksMock).toHaveBeenCalledWith([
      { capability: "engagements.view" },
      { capability: "products.view" },
    ]);
  });

  it("requires reports.view independently for summary and dataset reads", async () => {
    const { getReportDataset, getReportSummary } = await import("@/server-functions/operations");
    await getReportSummary({ data: { range: "7d" } });
    await getReportDataset({ data: { report: "tasks", range: "90d" } });
    expect(requireCapabilityMock).toHaveBeenNthCalledWith(1, "reports.view");
    expect(requireCapabilityMock).toHaveBeenNthCalledWith(2, "reports.view");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  transaction: vi.fn(),
}));

const quoteFilters = {
  status: "sent",
  lead_id: "lead-1",
  client_id: "client-1",
  contact_id: "contact-1",
  account_id: "account-1",
  deal_id: "deal-1",
};

const filterValues = Object.values(quoteFilters);
const sqlMarkers = Object.keys(quoteFilters);
const visibility = { leads: true, clients: true };

describe("paginated quote repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([{ id: "quote-1" }]);
  });

  it("defaults to the first page with 50 rows and returns the total", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "quote-1" }])
      .mockResolvedValueOnce([{ status: "sent", currency: "HKD", count: "7", total: "0" }]);
    const { listQuotesPage } = await import("../quotes");

    const page = await listQuotesPage({ visibility });

    expect(page).toMatchObject({
      items: [{ id: "quote-1" }],
      total: 7,
      page: 1,
      limit: 50,
    });
    expect(page.aggregates).toEqual([{ status: "sent", currency: "HKD", count: 7, total: 0 }]);

    const [listSql, listValues] = mockQuery.mock.calls[0];
    expect(listSql).toMatch(/order by q\.created_at desc[\s\S]+limit \$1 offset \$2/i);
    expect(listValues).toEqual([50, 0]);
    // The aggregate replaces the count query rather than joining it — `queryOne` must be
    // untouched, or the route's two-query budget (ROUTE_LOADER_CONTRACT) has silently moved.
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("pushes every quote filter into the row and count queries and caps limits at 100", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "quote-1" }])
      .mockResolvedValueOnce([{ status: "sent", currency: "HKD", count: "7", total: "0" }]);
    const { listQuotesPage } = await import("../quotes");

    const result = await listQuotesPage({
      ...quoteFilters,
      page: 2,
      limit: 500,
      visibility,
    });

    expect(result).toMatchObject({ total: 7, page: 2, limit: 100 });
    const [listSql, listValues] = mockQuery.mock.calls[0];
    const [countSql, countValues] = mockQuery.mock.calls[1];
    for (const marker of sqlMarkers) {
      // Markers are bare column names (e.g. "status"); the SQL now qualifies them as
      // "q.status". `toContain` still matches on the substring.
      expect(listSql).toContain(marker);
      expect(countSql).toContain(marker);
    }
    expect(listValues).toEqual([...filterValues, 100, 100]);
    expect(countValues).toEqual(filterValues);
  });

  it("starts the row and count queries before either query resolves", async () => {
    let resolveRows: (rows: Array<{ id: string }>) => void;
    let resolveAggregates: (
      rows: Array<{ status: string; currency: string; count: string; total: string }>,
    ) => void;
    mockQuery
      .mockImplementationOnce(
        () => new Promise<Array<{ id: string }>>((resolve) => (resolveRows = resolve)),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Array<{ status: string; currency: string; count: string; total: string }>>(
            (resolve) => (resolveAggregates = resolve),
          ),
      );
    const { listQuotesPage } = await import("../quotes");

    const pending = listQuotesPage({ visibility });

    // Both `query` calls fire synchronously inside the `Promise.all([...])` array
    // construction, before either awaits — this is the concurrency the aggregate depends on.
    expect(mockQuery).toHaveBeenCalledTimes(2);
    resolveRows!([{ id: "quote-1" }]);
    resolveAggregates!([{ status: "sent", currency: "HKD", count: "1", total: "0" }]);
    await expect(pending).resolves.toMatchObject({ total: 1 });
  });
});

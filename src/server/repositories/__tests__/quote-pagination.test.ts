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

describe("paginated quote repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([{ id: "quote-1" }]);
    mockQueryOne.mockResolvedValue({ total: "7" });
  });

  it("defaults to the first page with 50 rows and returns the total", async () => {
    const { listQuotesPage } = await import("../quotes");

    await expect(listQuotesPage()).resolves.toEqual({
      items: [{ id: "quote-1" }],
      total: 7,
      page: 1,
      limit: 50,
    });

    const [listSql, listValues] = mockQuery.mock.calls[0];
    expect(listSql).toMatch(/order by created_at desc[\s\S]+limit \$1 offset \$2/i);
    expect(listValues).toEqual([50, 0]);
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("count(*)"), []);
  });

  it("pushes every quote filter into the row and count queries and caps limits at 100", async () => {
    const { listQuotesPage } = await import("../quotes");

    const result = await listQuotesPage({ ...quoteFilters, page: 2, limit: 500 });

    expect(result).toMatchObject({ total: 7, page: 2, limit: 100 });
    const [listSql, listValues] = mockQuery.mock.calls[0];
    const [countSql, countValues] = mockQueryOne.mock.calls[0];
    for (const marker of sqlMarkers) {
      expect(listSql).toContain(marker);
      expect(countSql).toContain(marker);
    }
    expect(listValues).toEqual([...filterValues, 100, 100]);
    expect(countValues).toEqual(filterValues);
  });

  it("starts the row and count queries before either query resolves", async () => {
    let resolveRows: (rows: Array<{ id: string }>) => void;
    let resolveCount: (row: { total: string }) => void;
    mockQuery.mockImplementation(
      () => new Promise<Array<{ id: string }>>((resolve) => (resolveRows = resolve)),
    );
    mockQueryOne.mockImplementation(
      () => new Promise<{ total: string }>((resolve) => (resolveCount = resolve)),
    );
    const { listQuotesPage } = await import("../quotes");

    const pending = listQuotesPage();

    expect(mockQuery).toHaveBeenCalledOnce();
    expect(mockQueryOne).toHaveBeenCalledOnce();
    resolveRows!([{ id: "quote-1" }]);
    resolveCount!({ total: "1" });
    await expect(pending).resolves.toMatchObject({ total: 1 });
  });
});

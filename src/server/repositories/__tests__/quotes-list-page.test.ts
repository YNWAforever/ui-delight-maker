import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne, mockTransaction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  transaction: mockTransaction,
}));

const { listQuotesPage } = await import("../quotes");

/** The WHERE clause only, so the two queries' predicates can be compared directly. */
function predicateOf(sql: string): string {
  const start = sql.indexOf(" where ");
  if (start === -1) return "";
  const rest = sql.slice(start);
  const end = rest.search(/\s(order|group)\s+by\s/);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " ").trim();
}

describe("listQuotesPage", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it("derives the total from the aggregate instead of a second count query", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "quote-1", status: "sent", currency: "HKD" }])
      .mockResolvedValueOnce([
        { status: "sent", currency: "HKD", count: "7", total: "1000.00" },
        { status: "draft", currency: "USD", count: "3", total: "250.50" },
      ]);

    const page = await listQuotesPage({ visibility: { leads: true, clients: true } });

    expect(page.total).toBe(10);
    expect(page.aggregates).toEqual([
      { status: "sent", currency: "HKD", count: 7, total: 1000 },
      { status: "draft", currency: "USD", count: 3, total: 250.5 },
    ]);
    // Two queries, not three. `queryOne` was the old count and must be gone.
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("gives both queries the identical predicate", async () => {
    // If they diverge the tiles total a different set than the rows beneath them.
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await listQuotesPage({
      status: "sent",
      search: "Acme",
      visibility: { leads: true, clients: true },
    });

    const [rowSql, rowValues] = mockQuery.mock.calls[0];
    const [aggSql, aggValues] = mockQuery.mock.calls[1];

    expect(predicateOf(aggSql)).toBe(predicateOf(rowSql));
    // The row query appends limit and offset; the aggregate takes only the filters.
    expect(rowValues.slice(0, aggValues.length)).toEqual(aggValues);
  });

  it("omits the lead join from both queries when leads are not visible", async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await listQuotesPage({ search: "Acme", visibility: { leads: false, clients: true } });

    for (const [sql] of mockQuery.mock.calls) {
      expect(sql).not.toContain("leads");
    }
  });
});

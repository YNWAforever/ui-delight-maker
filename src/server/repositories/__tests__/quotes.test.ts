import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("quotes repository line items", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces normalized quote line items in a transaction-compatible way", async () => {
    const db = { query: vi.fn() };
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ id: "line-item-1" });
    const { replaceQuoteLineItems } = await import("../quotes");

    await replaceQuoteLineItems(
      "quote-1",
      [{ id: "local-1", service: "Strategy", description: "Planning", qty: 1, unit_price: 30000 }],
      db,
    );

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("delete from quote_line_items"),
      ["quote-1"],
      db,
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("insert into quote_line_items"),
      ["quote-1", null, null, null, "Strategy", "Planning", 1, 30000, false, 0],
      db,
    );
  });

  it("serializes document sections on update", async () => {
    mockQueryOne.mockResolvedValue({ id: "quote-1" });
    const { updateQuote } = await import("../quotes");

    await updateQuote("quote-1", {
      document_sections: [{ title: "Scope", body: "Planning" }],
    });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("document_sections = $1"),
      [JSON.stringify([{ title: "Scope", body: "Planning" }]), "quote-1"],
    );
  });
});

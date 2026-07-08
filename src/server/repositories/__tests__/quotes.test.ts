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

  it("lists quote line items ordered by sort order and creation time", async () => {
    mockQuery.mockResolvedValue([]);
    const { listQuoteLineItems } = await import("../quotes");

    await listQuoteLineItems("quote-1");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from quote_line_items"),
      ["quote-1"],
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("order by sort_order, created_at"),
      ["quote-1"],
    );
  });

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

  it("throws Quote not found for ordinary updates without immutable version references", async () => {
    mockQueryOne.mockResolvedValue(null);
    const { updateQuote } = await import("../quotes");

    await expect(
      updateQuote("quote-1", {
        status: "sent",
      }),
    ).rejects.toThrow("Quote not found");

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("set status = $1"),
      ["sent", "quote-1"],
    );
  });

  it("guards immutable quote version references during update", async () => {
    mockQueryOne.mockResolvedValue({ id: "quote-1" });
    const { updateQuote } = await import("../quotes");

    await updateQuote("quote-1", {
      accepted_version_id: "accepted-version-1",
      issued_version_id: "issued-version-1",
    });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("accepted_version_id is null or accepted_version_id is not distinct from $1"),
      [
        "accepted-version-1",
        "issued-version-1",
        "accepted-version-1",
        "issued-version-1",
        "quote-1",
      ],
    );
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("issued_version_id is null or issued_version_id is not distinct from $2"),
      [
        "accepted-version-1",
        "issued-version-1",
        "accepted-version-1",
        "issued-version-1",
        "quote-1",
      ],
    );
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("set accepted_version_id = $3, issued_version_id = $4"),
      [
        "accepted-version-1",
        "issued-version-1",
        "accepted-version-1",
        "issued-version-1",
        "quote-1",
      ],
    );
  });

  it("guards accepted_version_id updates when issued_version_id is absent", async () => {
    mockQueryOne.mockResolvedValue(null);
    const { updateQuote } = await import("../quotes");

    await expect(
      updateQuote("quote-1", {
        accepted_version_id: "accepted-version-1",
      }),
    ).rejects.toThrow("Quote not found or version reference is immutable");

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("accepted_version_id is null or accepted_version_id is not distinct from $1"),
      ["accepted-version-1", "accepted-version-1", "quote-1"],
    );
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("set accepted_version_id = $2"), [
      "accepted-version-1",
      "accepted-version-1",
      "quote-1",
    ]);
  });

  it("guards issued_version_id updates when accepted_version_id is absent", async () => {
    mockQueryOne.mockResolvedValue(null);
    const { updateQuote } = await import("../quotes");

    await expect(
      updateQuote("quote-1", {
        issued_version_id: "issued-version-1",
      }),
    ).rejects.toThrow("Quote not found or version reference is immutable");

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("issued_version_id is null or issued_version_id is not distinct from $1"),
      ["issued-version-1", "issued-version-1", "quote-1"],
    );
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("set issued_version_id = $2"), [
      "issued-version-1",
      "issued-version-1",
      "quote-1",
    ]);
  });

  it("rejects updates that would repoint immutable quote version references", async () => {
    mockQueryOne.mockResolvedValue(null);
    const { updateQuote } = await import("../quotes");

    await expect(
      updateQuote("quote-1", {
        accepted_version_id: "accepted-version-1",
      }),
    ).rejects.toThrow("Quote not found or version reference is immutable");
  });
});

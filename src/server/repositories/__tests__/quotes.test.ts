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

describe("quotes repository line items", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation(async (work) => work({ query: vi.fn() }));
  });

  it("normalizes quote line items on create and returns UUID-backed rows", async () => {
    const normalizedLineItem = {
      id: "11111111-1111-4111-8111-111111111111",
      quote_id: "quote-1",
      pricing_template_id: null,
      product_id: null,
      section_label: null,
      service: "Strategy",
      description: "Planning",
      qty: 1,
      unit_price: 120000,
      total: 120000,
      taxable: false,
      sort_order: 0,
      created_at: "2026-07-09T00:00:00.000Z",
      updated_at: "2026-07-09T00:00:00.000Z",
    };
    mockQueryOne
      .mockResolvedValueOnce({ id: "quote-1", line_items: [] })
      .mockResolvedValueOnce(normalizedLineItem)
      .mockResolvedValueOnce({ id: "quote-1", line_items: [normalizedLineItem] });
    mockQuery.mockResolvedValueOnce([]);
    const { createQuote } = await import("../quotes");

    const result = await createQuote({
      number: "Q-1001",
      lead_id: "lead-1",
      client_id: "client-1",
      contact_id: "contact-1",
      account_id: "account-1",
      deal_id: "deal-1",
      total_value: 120000,
      currency: "USD",
      valid_until: "2026-08-01",
      line_items: [{ id: "line-1", service: "Strategy", description: "Planning", qty: 1, unit_price: 120000 }],
      quote_template_id: "template-1",
      cover_text: "Intro copy",
      assumptions: "Assume approvals within 48 hours.",
      payment_terms: "50% upfront.",
      document_sections: [{ title: "Scope", body: "Planning" }],
      created_by: "user-1",
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        "(number, lead_id, client_id, contact_id, account_id, deal_id, status, total_value, currency, valid_until, line_items, quote_template_id, document_sections, cover_text, assumptions, payment_terms, created_by)",
      ),
      [
        "Q-1001",
        "lead-1",
        "client-1",
        "contact-1",
        "account-1",
        "deal-1",
        120000,
        "USD",
        "2026-08-01",
        JSON.stringify([
          { id: "line-1", service: "Strategy", description: "Planning", qty: 1, unit_price: 120000 },
        ]),
        "template-1",
        JSON.stringify([{ title: "Scope", body: "Planning" }]),
        "Intro copy",
        "Assume approvals within 48 hours.",
        "50% upfront.",
        "user-1",
      ],
      expect.any(Object),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("delete from quote_line_items"),
      ["quote-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("insert into quote_line_items"),
      ["quote-1", null, null, null, "Strategy", "Planning", 1, 120000, false, 0],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("update quotes"),
      [JSON.stringify([normalizedLineItem]), "quote-1"],
      expect.any(Object),
    );
    expect(result.line_items).toEqual([normalizedLineItem]);
  });

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
      undefined,
    );
  });

  it("syncs normalized quote line items on update when builder ids are provided", async () => {
    const normalizedLineItem = {
      id: "11111111-1111-4111-8111-111111111111",
      quote_id: "quote-1",
      pricing_template_id: null,
      product_id: null,
      section_label: null,
      service: "Strategy",
      description: "Planning",
      qty: 1,
      unit_price: 30000,
      total: 30000,
      taxable: false,
      sort_order: 0,
      created_at: "2026-07-09T00:00:00.000Z",
      updated_at: "2026-07-09T00:00:00.000Z",
    };
    mockQueryOne
      .mockResolvedValueOnce({ id: "quote-1", status: "draft", line_items: [] })
      .mockResolvedValueOnce(normalizedLineItem)
      .mockResolvedValueOnce({ id: "quote-1", status: "draft", line_items: [normalizedLineItem] });
    mockQuery.mockResolvedValueOnce([]);
    const { updateQuote } = await import("../quotes");

    const result = await updateQuote("quote-1", {
      line_items: [
        {
          id: "li-local-1",
          service: "Strategy",
          description: "Planning",
          qty: 1,
          unit_price: 30000,
        },
      ],
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("delete from quote_line_items"),
      ["quote-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("insert into quote_line_items"),
      ["quote-1", null, null, null, "Strategy", "Planning", 1, 30000, false, 0],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("update quotes"),
      [JSON.stringify([normalizedLineItem]), "quote-1"],
      expect.any(Object),
    );
    expect(result.line_items).toEqual([normalizedLineItem]);
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
      undefined,
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
      undefined,
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
      undefined,
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
      undefined,
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
      undefined,
    );
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("set accepted_version_id = $2"), [
      "accepted-version-1",
      "accepted-version-1",
      "quote-1",
    ], undefined);
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
      undefined,
    );
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining("set issued_version_id = $2"), [
      "issued-version-1",
      "issued-version-1",
      "quote-1",
    ], undefined);
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

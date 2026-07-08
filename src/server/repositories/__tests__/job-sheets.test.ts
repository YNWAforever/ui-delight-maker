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

describe("job sheets repository", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation(async (work) => work({ query: vi.fn() }));
  });

  it("creates a job sheet idempotently from an accepted quote version", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "job-1",
        number: "JS-2026-0001",
        quote_id: "quote-1",
        accepted_quote_version_id: "version-1",
        total_amount: 120000,
        currency: "HKD",
      })
      .mockResolvedValueOnce({
        id: "job-1",
        number: "JS-2026-0001",
        status: "accounting_review",
        quote_id: "quote-1",
        accepted_quote_version_id: "version-1",
        total_amount: 120000,
        currency: "HKD",
        po_number: null,
        client_order_number: null,
        locked_at: null,
      })
      .mockResolvedValueOnce({
        id: "version-1",
        snapshot: {
          line_items: [
            {
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
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: "job-1",
        number: "JS-2026-0001",
        status: "accounting_review",
        quote_id: "quote-1",
        accepted_quote_version_id: "version-1",
        total_amount: 120000,
        currency: "HKD",
        po_number: null,
        client_order_number: null,
        locked_at: null,
      })
      .mockResolvedValueOnce({ id: "portion-1", job_sheet_id: "job-1" });
    mockQuery.mockResolvedValueOnce([]);

    const { createJobSheetFromAcceptedQuote } = await import("../job-sheets");

    const jobSheet = await createJobSheetFromAcceptedQuote({
      quote_id: "quote-1",
      accepted_quote_version_id: "version-1",
      account_id: "account-1",
      client_id: "client-1",
      contact_id: null,
      sales_owner: "sales-1",
      total_amount: 120000,
      currency: "HKD",
      created_by: "sales-1",
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("on conflict (quote_id, accepted_quote_version_id)"),
      ["quote-1", "version-1", "account-1", "client-1", null, "sales-1", 120000, "HKD", "sales-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from job_sheets where id = $1 for update"),
      ["job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("from quote_versions where id = $1"),
      ["version-1"],
      expect.any(Object),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheet_portions"),
      ["job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("insert into job_sheet_portions"),
      [
        "job-1",
        "Strategy",
        ["11111111-1111-4111-8111-111111111111"],
        "Planning",
        120000,
        "HKD",
        null,
        "progress",
        "planned",
        0,
      ],
      expect.any(Object),
    );
    expect(jobSheet.id).toBe("job-1");
  });

  it("does not regenerate portions when an idempotent job sheet already has them", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "job-1",
        number: "JS-2026-0001",
        quote_id: "quote-1",
        accepted_quote_version_id: "version-1",
        total_amount: 120000,
        currency: "HKD",
      })
      .mockResolvedValueOnce({
        id: "job-1",
        number: "JS-2026-0001",
        status: "accounting_review",
        quote_id: "quote-1",
        accepted_quote_version_id: "version-1",
        total_amount: 120000,
        currency: "HKD",
        po_number: null,
        client_order_number: null,
        locked_at: null,
      });
    mockQuery.mockResolvedValueOnce([{ id: "existing-portion" }]);

    const { createJobSheetFromAcceptedQuote } = await import("../job-sheets");

    await createJobSheetFromAcceptedQuote({
      quote_id: "quote-1",
      accepted_quote_version_id: "version-1",
      account_id: "account-1",
      client_id: "client-1",
      contact_id: null,
      sales_owner: "sales-1",
      total_amount: 120000,
      currency: "HKD",
      created_by: "sales-1",
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheet_portions"),
      ["job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
  });

  it("lists job sheets by status filter", async () => {
    mockQuery.mockResolvedValue([]);
    const { listJobSheets } = await import("../job-sheets");

    await listJobSheets({ status: "accounting_review" });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheets"),
      ["accounting_review"],
    );
  });

  it("lists job sheets by client and account filters", async () => {
    mockQuery.mockResolvedValue([]);
    const { listJobSheets } = await import("../job-sheets");

    await listJobSheets({ client_id: "client-1", account_id: "account-1" });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheets"),
      ["client-1", "account-1"],
    );
  });

  it("gets a job sheet with ordered portions", async () => {
    mockQueryOne.mockResolvedValueOnce({ id: "job-1", number: "JS-2026-0001" });
    mockQuery.mockResolvedValueOnce([{ id: "portion-1", sort_order: 0 }]);
    const { getJobSheet } = await import("../job-sheets");

    const result = await getJobSheet("job-1");

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheets where id = $1"),
      ["job-1"],
      undefined,
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("order by sort_order, created_at"),
      ["job-1"],
      undefined,
    );
    expect(result).toEqual({
      jobSheet: { id: "job-1", number: "JS-2026-0001" },
      portions: [{ id: "portion-1", sort_order: 0 }],
    });
  });

  it("locks the parent job sheet before replacing portions in a transaction-compatible call", async () => {
    const db = { query: vi.fn() };
    mockQueryOne.mockResolvedValue({
      id: "job-1",
      status: "draft",
      total_amount: 120000,
      currency: "HKD",
      po_number: null,
      client_order_number: null,
    });
    mockQuery.mockResolvedValueOnce([]);
    mockQueryOne.mockResolvedValueOnce({
      id: "portion-1",
      job_sheet_id: "job-1",
    });
    const { replaceJobSheetPortions } = await import("../job-sheets");

    await replaceJobSheetPortions(
      "job-1",
      [
        {
          name: "Strategy",
          source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
          description: "Planning",
          amount: 120000,
          currency: "HKD",
          target_invoice_date: "2026-07-31",
          billing_type: "progress",
          status: "planned",
          sort_order: 0,
        },
      ],
      db,
    );

    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("from job_sheets where id = $1 for update"),
      ["job-1"],
      db,
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("delete from job_sheet_portions"),
      ["job-1"],
      db,
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("insert into job_sheet_portions"),
      [
        "job-1",
        "Strategy",
        ["11111111-1111-4111-8111-111111111111"],
        "Planning",
        120000,
        "HKD",
        "2026-07-31",
        "progress",
        "planned",
        0,
      ],
      db,
    );
  });

  it.each([
    ["accepted", { status: "accepted", locked_at: null }],
    ["locked", { status: "accounting_review", locked_at: "2026-07-09T12:00:00.000Z" }],
  ])("rejects replacing portions when the locked row is %s", async (_, jobSheet) => {
    mockQueryOne.mockResolvedValue({
      id: "job-1",
      total_amount: 120000,
      currency: "HKD",
      po_number: null,
      client_order_number: null,
      ...jobSheet,
    });
    const { replaceJobSheetPortions } = await import("../job-sheets");

    await expect(replaceJobSheetPortions("job-1", [])).rejects.toThrow(
      "Accepted job sheet commercial fields are immutable",
    );
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheets where id = $1 for update"),
      ["job-1"],
      expect.any(Object),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("accepts only when portions reconcile and then locks the job sheet", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "job-1",
        status: "accounting_review",
        total_amount: 120000,
        currency: "HKD",
        po_number: null,
        client_order_number: null,
      })
      .mockResolvedValueOnce({ id: "job-1", status: "accepted" });
    mockQuery.mockResolvedValueOnce([{ id: "portion-1", amount: 120000 }]);
    const { acceptJobSheet } = await import("../job-sheets");

    await acceptJobSheet("job-1", { accepted_by: "acct-1" });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("from job_sheet_portions"),
      ["job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("status = 'accepted'"),
      ["acct-1", "job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("status = 'accounting_review'"),
      ["acct-1", "job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("locked_at is null"),
      ["acct-1", "job-1"],
      expect.any(Object),
    );
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("locked_at = now()"),
      ["acct-1", "job-1"],
      expect.any(Object),
    );
  });

  it("rejects re-accepting a locked or already accepted job sheet", async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: "job-1",
      status: "accepted",
      total_amount: 120000,
      currency: "HKD",
      po_number: null,
      client_order_number: null,
      locked_at: "2026-07-09T12:00:00.000Z",
    });

    const { acceptJobSheet } = await import("../job-sheets");

    await expect(acceptJobSheet("job-1", { accepted_by: "acct-1" })).rejects.toThrow(
      "Job sheet is already accepted or locked",
    );
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
  });

  it("blocks acceptance when job sheet totals do not reconcile", async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: "job-1",
      status: "accounting_review",
      total_amount: 120000,
      currency: "HKD",
      po_number: null,
      client_order_number: null,
    });
    mockQuery.mockResolvedValueOnce([{ id: "portion-1", amount: 100000 }]);
    const { acceptJobSheet } = await import("../job-sheets");

    await expect(acceptJobSheet("job-1", { accepted_by: "acct-1" })).rejects.toThrow(
      "Billing portions are short by HKD 20,000.",
    );
  });

  it("updates Xero references and marks the portion entered in Xero", async () => {
    mockQueryOne.mockResolvedValue({ id: "portion-1", status: "entered_in_xero" });
    const { updateJobSheetXeroReference } = await import("../job-sheets");

    await updateJobSheetXeroReference({
      portion_id: "portion-1",
      xero_invoice_number: "INV-001",
      xero_invoice_reference: "XERO-REF-001",
      xero_invoice_date: "2026-07-09",
      xero_notes: "Manually entered in Xero",
    });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("status = 'entered_in_xero'"),
      ["INV-001", "XERO-REF-001", "2026-07-09", "Manually entered in Xero", "portion-1"],
    );
  });
});

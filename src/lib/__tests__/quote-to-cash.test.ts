import { describe, expect, it } from "vitest";
import {
  buildDefaultPortionsFromLineItems,
  calculateQuoteLineTotal,
  calculateQuoteTotal,
  canAcceptJobSheet,
  getPortionReconciliation,
  isLockedJobSheetCommercialField,
} from "../quote-to-cash";
import type { QuoteLineItemRecord } from "../types";

const items: QuoteLineItemRecord[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    quote_id: "quote-1",
    pricing_template_id: null,
    product_id: null,
    section_label: "Media",
    service: "Campaign Strategy",
    description: "Planning and creative direction",
    qty: 1,
    unit_price: 30000,
    total: 30000,
    taxable: false,
    sort_order: 0,
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    quote_id: "quote-1",
    pricing_template_id: null,
    product_id: null,
    section_label: "Media",
    service: "Content Production",
    description: "Short-form video package",
    qty: 2,
    unit_price: 45000,
    total: 90000,
    taxable: false,
    sort_order: 1,
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
  },
];

describe("calculateQuoteTotal", () => {
  it("sums quantity by unit price without trusting stored totals", () => {
    expect(calculateQuoteTotal(items)).toBe(120000);
  });
});

describe("calculateQuoteLineTotal", () => {
  it("preserves cents for decimal-priced lines", () => {
    expect(calculateQuoteLineTotal({ qty: 1, unit_price: 99.99 })).toBe(99.99);
    expect(calculateQuoteLineTotal({ qty: 1, unit_price: 10.49 })).toBe(10.49);
    expect(
      calculateQuoteTotal([
        { qty: 1, unit_price: 99.99 },
        { qty: 1, unit_price: 10.49 },
      ]),
    ).toBe(110.48);
  });
});

describe("buildDefaultPortionsFromLineItems", () => {
  it("creates one planned billing portion per quote line", () => {
    expect(buildDefaultPortionsFromLineItems(items, "HKD")).toEqual([
      {
        name: "Campaign Strategy",
        source_quote_line_item_ids: ["11111111-1111-4111-8111-111111111111"],
        description: "Planning and creative direction",
        amount: 30000,
        currency: "HKD",
        billing_type: "progress",
        status: "planned",
        sort_order: 0,
      },
      {
        name: "Content Production",
        source_quote_line_item_ids: ["22222222-2222-4222-8222-222222222222"],
        description: "Short-form video package",
        amount: 90000,
        currency: "HKD",
        billing_type: "progress",
        status: "planned",
        sort_order: 1,
      },
    ]);
  });
});

describe("getPortionReconciliation", () => {
  it("marks matching portions as reconciled", () => {
    expect(getPortionReconciliation(120000, [{ amount: 30000 }, { amount: 90000 }])).toEqual({
      totalAmount: 120000,
      portionTotal: 120000,
      delta: 0,
      reconciled: true,
    });
  });

  it("reports the amount delta when portions do not match", () => {
    expect(getPortionReconciliation(120000, [{ amount: 50000 }])).toEqual({
      totalAmount: 120000,
      portionTotal: 50000,
      delta: 70000,
      reconciled: false,
    });
  });

  it("treats floating point residue as reconciled after rounding", () => {
    expect(getPortionReconciliation(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toEqual({
      totalAmount: 0.3,
      portionTotal: 0.3,
      delta: 0,
      reconciled: true,
    });
  });
});

describe("canAcceptJobSheet", () => {
  it("allows acceptance when totals reconcile and PO/order info is present", () => {
    expect(
      canAcceptJobSheet({
        totalAmount: 120000,
        portions: [{ amount: 120000 }],
        requirePoNumber: true,
        poNumber: "PO-123",
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it("allows acceptance when client order number satisfies the PO/order requirement", () => {
    expect(
      canAcceptJobSheet({
        totalAmount: 120000,
        portions: [{ amount: 120000 }],
        requirePoNumber: true,
        clientOrderNumber: "CO-123",
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it("blocks acceptance when totals do not reconcile", () => {
    expect(
      canAcceptJobSheet({
        totalAmount: 120000,
        portions: [{ amount: 100000 }],
        requirePoNumber: false,
      }),
    ).toEqual({ ok: false, reasons: ["Billing portions are short by HKD 20,000."] });
  });

  it("reports over-by deltas when portions exceed the total", () => {
    expect(
      canAcceptJobSheet({
        totalAmount: 100000,
        portions: [{ amount: 120000 }],
        requirePoNumber: false,
      }),
    ).toEqual({ ok: false, reasons: ["Billing portions are over by HKD 20,000."] });
  });

  it("blocks acceptance when PO/order info is required but missing", () => {
    expect(
      canAcceptJobSheet({
        totalAmount: 120000,
        portions: [{ amount: 120000 }],
        requirePoNumber: true,
      }),
    ).toEqual({
      ok: false,
      reasons: ["PO number or client order number is required before acceptance."],
    });
  });
});

describe("isLockedJobSheetCommercialField", () => {
  it("locks the intended commercial fields and leaves non-commercial fields editable", () => {
    [
      "accepted_scope_summary",
      "po_number",
      "client_order_number",
      "total_amount",
      "currency",
      "target_invoice_date",
      "amount",
      "billing_type",
      "source_quote_line_item_ids",
    ].forEach((field) => {
      expect(isLockedJobSheetCommercialField(field)).toBe(true);
    });

    expect(isLockedJobSheetCommercialField("accounting_notes")).toBe(false);
  });
});

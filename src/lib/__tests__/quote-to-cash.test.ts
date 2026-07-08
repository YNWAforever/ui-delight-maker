import { describe, expect, it } from "vitest";
import {
  buildDefaultPortionsFromLineItems,
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

  it("blocks acceptance when totals do not reconcile", () => {
    expect(
      canAcceptJobSheet({
        totalAmount: 120000,
        portions: [{ amount: 100000 }],
        requirePoNumber: false,
      }),
    ).toEqual({ ok: false, reasons: ["Billing portions are short by HKD 20,000."] });
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
  it("locks commercial fields after accounting acceptance", () => {
    expect(isLockedJobSheetCommercialField("total_amount")).toBe(true);
    expect(isLockedJobSheetCommercialField("accounting_notes")).toBe(false);
    expect(isLockedJobSheetCommercialField("xero_invoice_reference")).toBe(false);
  });
});

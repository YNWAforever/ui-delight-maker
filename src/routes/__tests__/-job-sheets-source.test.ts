import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BillingPortionsTable } from "@/components/job-sheets/billing-portions-table";
import { canAcceptJobSheet } from "@/lib/quote-to-cash";
import type { JobSheetPortion } from "@/lib/types";
import {
  isJobSheetCommercialLocked,
  toPortionDrafts,
  toXeroDrafts,
} from "../job-sheets.$id";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const makePortion = (overrides: Partial<JobSheetPortion>): JobSheetPortion => ({
  id: "portion-1",
  job_sheet_id: "job-sheet-1",
  name: "Deposit",
  source_quote_line_item_ids: ["line-1"],
  description: "Initial billing slice",
  amount: 400,
  currency: "HKD",
  target_invoice_date: "2026-07-10",
  billing_type: "progress",
  status: "planned",
  xero_invoice_number: null,
  xero_invoice_reference: null,
  xero_invoice_date: null,
  xero_notes: null,
  internal_note: null,
  sort_order: 0,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("job sheet accounting workspace behavior", () => {
  it("renders billing totals, reconciled state, and fallback table content from live props", () => {
    const markup = renderToStaticMarkup(
      createElement(BillingPortionsTable, {
        totalAmount: 1000,
        currency: "HKD",
        portions: [
          makePortion({ id: "portion-1", name: "Deposit", amount: 400 }),
          makePortion({
            id: "portion-2",
            name: "Final payment",
            amount: 600,
            description: " ",
            target_invoice_date: "2026-08-01",
            xero_invoice_reference: " ",
          }),
        ],
      }),
    );

    expect(markup).toContain("Accepted total");
    expect(markup).toContain("Planned billing");
    expect(markup).toContain("HKD 1,000");
    expect(markup).toContain("Billing plan reconciles with the accepted quote total.");
    expect(markup).toContain("No billing note");
    expect(markup).toContain("Not entered in Xero");
    expect(markup).toContain("Progress");
    expect(markup).toContain("10 Jul 2026");
    expect(markup).toContain("01 Aug 2026");
  });

  it("surfaces unreconciled billing as both UI output and an acceptance failure", () => {
    const portions = [
      makePortion({ id: "portion-1", amount: 400 }),
      makePortion({ id: "portion-2", amount: 500 }),
    ];

    const markup = renderToStaticMarkup(
      createElement(BillingPortionsTable, { totalAmount: 1000, currency: "HKD", portions }),
    );
    const acceptance = canAcceptJobSheet({
      totalAmount: 1000,
      portions,
      requirePoNumber: false,
      poNumber: null,
      clientOrderNumber: null,
    });

    expect(markup).toContain("Reconciliation delta: HKD 100");
    expect(acceptance.ok).toBe(false);
    expect(acceptance.reasons).toContain("Billing portions are short by HKD 100.");
  });

  it("normalizes route drafts for editing and reflects accepted-or-locked commercial immutability", () => {
    const portions = [
      makePortion({
        id: "portion-entered",
        amount: 250,
        description: null,
        status: "entered_in_xero",
        xero_invoice_number: null,
        xero_invoice_reference: null,
        xero_invoice_date: null,
        xero_notes: null,
      }),
    ];

    expect(toPortionDrafts(portions)).toEqual([
      expect.objectContaining({
        id: "portion-entered",
        amount: "250",
        description: "",
        status: "planned",
      }),
    ]);
    expect(toXeroDrafts(portions)).toEqual({
      "portion-entered": {
        xero_invoice_number: "",
        xero_invoice_reference: "",
        xero_invoice_date: "",
        xero_notes: "",
      },
    });
    expect(isJobSheetCommercialLocked("accepted", null)).toBe(true);
    expect(isJobSheetCommercialLocked("draft", "2026-07-08T09:30:00.000Z")).toBe(true);
    expect(isJobSheetCommercialLocked("draft", null)).toBe(false);
  });

  it("keeps the job sheet detail route registered", () => {
    const detailSource = readRoute("job-sheets.$id.tsx");

    expect(detailSource).toContain('createFileRoute("/job-sheets/$id")');
  });
});

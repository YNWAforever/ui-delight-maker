import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BillingPortionsTable } from "@/components/job-sheets/billing-portions-table";
import { canAcceptJobSheet } from "@/lib/quote-to-cash";
import type { JobSheet, JobSheetPortion } from "@/lib/types";
import {
  isJobSheetCommercialLocked,
  toPortionDrafts,
  toXeroDrafts,
} from "../job-sheets.$id";
import { formatAcceptedValueSummary as formatAcceptedQueueValueSummary } from "../job-sheets";

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

const makeJobSheet = (overrides: Partial<JobSheet>): JobSheet => ({
  id: "job-1",
  number: "JS-1",
  quote_id: "quote-1",
  accepted_quote_version_id: "version-1",
  account_id: null,
  client_id: null,
  contact_id: null,
  sales_owner: null,
  accounting_owner: null,
  status: "accepted",
  accepted_scope_summary: null,
  po_number: null,
  client_order_number: null,
  xero_customer_reference: null,
  accounting_notes: null,
  special_billing_instructions: null,
  total_amount: 1000,
  currency: "HKD",
  accepted_at: null,
  accepted_by: null,
  locked_at: null,
  created_by: null,
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

  it("preserves entered-in-xero drafts and reflects accepted-or-locked commercial immutability", () => {
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
        status: "entered_in_xero",
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

  it("summarizes accepted queue value per currency instead of cross-currency summing", () => {
    expect(
      formatAcceptedQueueValueSummary([
        makeJobSheet({ total_amount: 1000, currency: "HKD" }),
        makeJobSheet({ id: "job-2", number: "JS-2", total_amount: 500, currency: "USD" }),
        makeJobSheet({ id: "job-3", number: "JS-3", total_amount: 250, currency: "HKD" }),
        makeJobSheet({
          id: "job-4",
          number: "JS-4",
          status: "accounting_review",
          total_amount: 999,
          currency: "EUR",
        }),
      ]),
    ).toBe("HKD 1,250 / USD 500");
  });

  it("keeps the job sheet detail route registered", () => {
    const detailSource = readRoute("job-sheets.$id.tsx");

    expect(detailSource).toContain('createFileRoute("/job-sheets/$id")');
  });
});

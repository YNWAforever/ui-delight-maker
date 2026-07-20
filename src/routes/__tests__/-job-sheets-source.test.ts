import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BillingPortionsTable } from "@/components/job-sheets/billing-portions-table";
import { canAcceptJobSheet } from "@/lib/quote-to-cash";
import type { JobSheet, JobSheetPortion } from "@/lib/types";
import {
  buildPortionSavePayload,
  buildPreviewPortions,
  canShowAcceptAndLockAction,
  getAcceptBlockedReason,
  getAcceptanceGateAlertConfig,
  hasUnsavedBillingDraftChanges,
  hasUnsavedXeroDraftChanges,
  isAcceptAndLockDisabled,
  isJobSheetEditorBusy,
  isJobSheetCommercialLocked,
  getJobSheetMutationQueryKeys,
  rebaseBillingDrafts,
  rebaseXeroDrafts,
  resetBillingDrafts,
  resetXeroDrafts,
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
        target_invoice_date: "2026-07-10",
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

  it("builds preview portions from edited drafts while preserving entered-in-xero rows", () => {
    const portions = [
      makePortion({
        id: "portion-planned",
        amount: 400,
        status: "planned",
        target_invoice_date: "2026-07-10",
      }),
      makePortion({
        id: "portion-entered",
        amount: 600,
        status: "entered_in_xero",
        target_invoice_date: "2026-07-12",
      }),
    ];
    const drafts = [
      {
        ...toPortionDrafts([portions[0]])[0],
        amount: "450",
        status: "cancelled" as const,
        target_invoice_date: "2026-08-01",
      },
      {
        ...toPortionDrafts([portions[1]])[0],
        amount: "550",
        status: "cancelled" as const,
        target_invoice_date: "2026-08-03",
      },
    ];

    const preview = buildPreviewPortions({
      jobSheetId: "job-sheet-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      originals: portions,
      drafts,
    });

    expect(preview).toEqual([
      expect.objectContaining({
        id: "portion-planned",
        amount: 450,
        status: "cancelled",
        target_invoice_date: "2026-08-01",
      }),
      expect.objectContaining({
        id: "portion-entered",
        amount: 550,
        status: "entered_in_xero",
        target_invoice_date: "2026-08-03",
      }),
    ]);

    const acceptance = canAcceptJobSheet({
      totalAmount: 1100,
      portions: preview,
      requirePoNumber: false,
      poNumber: null,
      clientOrderNumber: null,
    });

    expect(acceptance.ok).toBe(false);
    expect(acceptance.reasons).toContain("Billing portions are short by HKD 100.");
  });

  it("builds the save payload with target invoice dates and without downgrading entered rows", () => {
    const portions = [
      makePortion({
        id: "portion-planned",
        status: "planned",
        target_invoice_date: "2026-07-10",
      }),
      makePortion({
        id: "portion-entered",
        status: "entered_in_xero",
        target_invoice_date: "2026-07-12",
      }),
    ];
    const drafts = [
      {
        ...toPortionDrafts([portions[0]])[0],
        name: "Deposit updated",
        amount: "450",
        status: "cancelled" as const,
        target_invoice_date: "2026-08-01",
      },
      {
        ...toPortionDrafts([portions[1]])[0],
        amount: "550",
        status: "cancelled" as const,
        target_invoice_date: "",
      },
    ];

    expect(buildPortionSavePayload(drafts, portions)).toEqual([
      expect.objectContaining({
        id: "portion-planned",
        name: "Deposit updated",
        amount: 450,
        status: "cancelled",
        target_invoice_date: "2026-08-01",
      }),
      expect.objectContaining({
        id: "portion-entered",
        amount: 550,
        status: "entered_in_xero",
        target_invoice_date: null,
      }),
    ]);
  });

  it("rebases clean drafts to a refreshed server baseline without overwriting dirty drafts", () => {
    const previous = [makePortion({ amount: 400, xero_notes: null })];
    const refreshed = [makePortion({ amount: 450, xero_notes: "Synced by accounting" })];
    const dirtyBilling = [{ ...toPortionDrafts(previous)[0], amount: "475" }];
    const dirtyXero = {
      "portion-1": { ...toXeroDrafts(previous)["portion-1"], xero_notes: "Local note" },
    };

    expect(rebaseBillingDrafts(toPortionDrafts(previous), previous, refreshed)).toEqual(
      toPortionDrafts(refreshed),
    );
    expect(rebaseXeroDrafts(toXeroDrafts(previous), previous, refreshed)).toEqual(
      toXeroDrafts(refreshed),
    );
    expect(rebaseBillingDrafts(dirtyBilling, previous, refreshed)).toBe(dirtyBilling);
    expect(rebaseXeroDrafts(dirtyXero, previous, refreshed)).toBe(dirtyXero);
  });

  it("uses mutation-specific job-sheet and linked workspace invalidation keys", () => {
    const jobSheet = makeJobSheet({
      id: "job-1",
      client_id: "client-1",
      account_id: "account-1",
    });

    expect(getJobSheetMutationQueryKeys(jobSheet, "billing")).toEqual([
      ["job-sheets", "detail", "job-1"],
      ["clients", "detail", "client-1", "section", "job_sheets"],
    ]);
    expect(getJobSheetMutationQueryKeys(jobSheet, "xero")).toEqual([
      ["job-sheets", "detail", "job-1"],
      ["clients", "detail", "client-1", "section", "job_sheets"],
    ]);
    expect(getJobSheetMutationQueryKeys(jobSheet, "accept")).toEqual([
      ["job-sheets", "detail", "job-1"],
      ["job-sheets", "list"],
      ["clients", "detail", "client-1", "section", "job_sheets"],
      ["clients", "detail", "client-1", "section", "commercial"],
      ["company-workspace", "account-1", "delivery"],
      ["company-workspace", "account-1", "commercial"],
    ]);
  });

  it("detects unsaved billing draft changes from the persisted save payload shape", () => {
    const portions = [
      makePortion({
        id: "portion-planned",
        name: "Deposit",
        description: "Initial billing slice",
        amount: 400,
        status: "planned",
        target_invoice_date: "2026-07-10",
      }),
    ];

    expect(hasUnsavedBillingDraftChanges(toPortionDrafts(portions), portions)).toBe(false);

    const editedDrafts = [
      {
        ...toPortionDrafts(portions)[0],
        amount: "450",
      },
    ];

    expect(hasUnsavedBillingDraftChanges(editedDrafts, portions)).toBe(true);
  });

  it("detects unsaved xero draft changes from normalized saved values", () => {
    const portions = [
      makePortion({
        id: "portion-1",
        xero_invoice_number: "INV-001",
        xero_invoice_reference: null,
        xero_invoice_date: "2026-07-10",
        xero_notes: null,
      }),
    ];

    expect(hasUnsavedXeroDraftChanges(toXeroDrafts(portions), portions)).toBe(false);

    expect(
      hasUnsavedXeroDraftChanges(
        {
          "portion-1": {
            ...toXeroDrafts(portions)["portion-1"],
            xero_invoice_reference: "XERO-REF-9",
          },
        },
        portions,
      ),
    ).toBe(true);
  });

  it("resets billing and xero drafts back to persisted portions so dual-dirty conflicts are escapable", () => {
    const portions = [
      makePortion({
        id: "portion-1",
        amount: 400,
        xero_invoice_number: "INV-001",
        xero_invoice_reference: "XERO-REF-1",
        xero_invoice_date: "2026-07-10",
        xero_notes: "First sync",
      }),
    ];
    const editedBillingDrafts = [
      {
        ...toPortionDrafts(portions)[0],
        amount: "450",
        description: "Changed locally",
      },
    ];
    const editedXeroDrafts = {
      "portion-1": {
        ...toXeroDrafts(portions)["portion-1"],
        xero_notes: "Changed locally",
      },
    };

    expect(hasUnsavedBillingDraftChanges(editedBillingDrafts, portions)).toBe(true);
    expect(hasUnsavedXeroDraftChanges(editedXeroDrafts, portions)).toBe(true);

    const resetBilling = resetBillingDrafts(portions);
    const resetXero = resetXeroDrafts(portions);

    expect(resetBilling).toEqual(toPortionDrafts(portions));
    expect(resetXero).toEqual(toXeroDrafts(portions));
    expect(hasUnsavedBillingDraftChanges(resetBilling, portions)).toBe(false);
    expect(hasUnsavedXeroDraftChanges(resetXero, portions)).toBe(false);
  });

  it("shows the accept action only when the job sheet is not already commercially locked", () => {
    expect(canShowAcceptAndLockAction("accounting_review", null)).toBe(true);
    expect(canShowAcceptAndLockAction("accepted", null)).toBe(false);
    expect(canShowAcceptAndLockAction("draft", "2026-07-08T09:30:00.000Z")).toBe(false);
  });

  it("disables accept and lock when billing or xero drafts are unsaved", () => {
    expect(
      isAcceptAndLockDisabled({
        editorBusy: false,
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: true,
        acceptanceOk: false,
      }),
    ).toBe(true);
    expect(
      isAcceptAndLockDisabled({
        editorBusy: true,
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: false,
        acceptanceOk: true,
      }),
    ).toBe(true);
    expect(
      isAcceptAndLockDisabled({
        editorBusy: false,
        hasUnsavedBillingChanges: true,
        hasUnsavedXeroChanges: false,
        acceptanceOk: true,
      }),
    ).toBe(true);
    expect(
      isAcceptAndLockDisabled({
        editorBusy: isJobSheetEditorBusy({
          accepting: false,
          savingPortions: false,
          savingXeroFor: "portion-1",
        }),
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: false,
        acceptanceOk: true,
      }),
    ).toBe(true);
    expect(
      isAcceptAndLockDisabled({
        editorBusy: false,
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: true,
        acceptanceOk: false,
      }),
    ).toBe(true);
    expect(
      isAcceptAndLockDisabled({
        editorBusy: false,
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: false,
        acceptanceOk: true,
      }),
    ).toBe(false);
  });

  it("treats any save or accept mutation as a shared editor busy state", () => {
    expect(
      isJobSheetEditorBusy({
        accepting: false,
        savingPortions: false,
        savingXeroFor: null,
      }),
    ).toBe(false);
    expect(
      isJobSheetEditorBusy({
        accepting: true,
        savingPortions: false,
        savingXeroFor: null,
      }),
    ).toBe(true);
    expect(
      isJobSheetEditorBusy({
        accepting: false,
        savingPortions: true,
        savingXeroFor: null,
      }),
    ).toBe(true);
    expect(
      isJobSheetEditorBusy({
        accepting: false,
        savingPortions: false,
        savingXeroFor: "portion-1",
      }),
    ).toBe(true);
  });

  it("returns a clear accept block reason for unsaved xero drafts", () => {
    expect(
      getAcceptBlockedReason({
        commercialLocked: false,
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: true,
      }),
    ).toBe("Save Xero references before accepting.");
  });

  it("uses actionable acceptance-gate copy and non-destructive ready states", () => {
    expect(
      getAcceptanceGateAlertConfig({
        commercialLocked: false,
        hasUnsavedBillingChanges: true,
        hasUnsavedXeroChanges: true,
        acceptanceOk: true,
        acceptanceReasons: [],
      }),
    ).toEqual({
      variant: "default",
      title: "Acceptance gate",
      description: "Save or discard one set of edits before continuing.",
    });

    expect(
      getAcceptanceGateAlertConfig({
        commercialLocked: false,
        hasUnsavedBillingChanges: false,
        hasUnsavedXeroChanges: false,
        acceptanceOk: true,
        acceptanceReasons: [],
      }),
    ).toEqual({
      variant: "default",
      title: "Acceptance gate",
      description: "Billing plan reconciles and can be accepted by accounting.",
    });
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

  it("renders discard actions for dirty billing and xero drafts", () => {
    const detailSource = readRoute("job-sheets.$id.tsx");

    expect(detailSource).toContain("Discard billing changes");
    expect(detailSource).toContain("Discard Xero changes");
  });

  it("wires refreshed portions through the per-job-sheet server baseline", () => {
    const detailSource = readRoute("job-sheets.$id.tsx");

    expect(detailSource).toContain("serverPortionBaselinesByJobSheetId");
    expect(detailSource).toContain("rebaseBillingDrafts(current[jobSheet.id]");
    expect(detailSource).toContain("rebaseXeroDrafts(current[jobSheet.id]");
    expect(detailSource).toContain("[jobSheet.id]: portions");
  });

  it("derives both billing and xero editor disabled states from the shared busy flag", () => {
    const detailSource = readRoute("job-sheets.$id.tsx");

    expect(detailSource).toContain("const editorBusy = isJobSheetEditorBusy({");
    expect(detailSource).toContain("disabled={commercialLocked || editorBusy}");
    expect(detailSource).toContain("disabled={editorBusy}");
  });
});

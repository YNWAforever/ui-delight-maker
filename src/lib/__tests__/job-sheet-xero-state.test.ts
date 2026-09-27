import { describe, expect, it } from "vitest";
import { describeBillingProgress } from "../job-sheet-editor";
import { XeroNotesSchema } from "../operations/input-schemas";

describe("manual Xero progress", () => {
  it("does not count a legacy notes-only entered row as verified invoice evidence", () => {
    const legacy = {
      status: "entered_in_xero" as const,
      xero_invoice_number: null,
      xero_invoice_reference: null,
      xero_invoice_date: null,
      xero_confirmed_at: null,
      xero_confirmed_by: null,
    };
    expect(describeBillingProgress([legacy])).toBe(
      "0 of 1 portions with recorded invoice evidence; 1 needs review",
    );
  });
  it("rejects legacy combined invoice fields at the notes-only boundary", () => {
    const base = {
      portionId: "11111111-1111-4111-8111-111111111111",
      notes: "Awaiting PO",
      expectedVersion: 0,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    };
    expect(XeroNotesSchema.safeParse(base).success).toBe(true);
    expect(
      XeroNotesSchema.safeParse({ ...base, xero_invoice_number: "INV-UNCONFIRMED" }).success,
    ).toBe(false);
  });
});

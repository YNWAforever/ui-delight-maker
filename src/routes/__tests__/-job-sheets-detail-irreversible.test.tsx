// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobSheet, JobSheetPortion } from "@/lib/types";

const acceptJobSheetMock = vi.hoisted(() => vi.fn());
const updatePortionsMock = vi.hoisted(() => vi.fn());
const updateXeroReferenceMock = vi.hoisted(() => vi.fn());
const invalidateRouterMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useLoaderData: vi.fn(),
  }),
  useRouter: () => ({ invalidate: invalidateRouterMock }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/server-functions/job-sheets", () => ({
  acceptJobSheetForAccounting: acceptJobSheetMock,
  updateJobSheetPortions: updatePortionsMock,
  updatePortionXeroReference: updateXeroReferenceMock,
}));
vi.mock("@/server-functions/operations", () => ({ getJobSheetRead: vi.fn() }));
// The reconciliation table is a read-only summary of the same portions; rendering it here
// would only duplicate the numbers the assertions already read off the editor.
vi.mock("@/components/job-sheets/billing-portions-table", () => ({
  BillingPortionsTable: () => null,
}));

import { Route } from "../job-sheets.$id";

const now = "2026-08-01T09:00:00.000Z";

const jobSheet: JobSheet = {
  id: "js-1",
  number: "JS-2041",
  quote_id: "q-1",
  accepted_quote_version_id: "qv-1",
  account_id: null,
  client_id: null,
  contact_id: null,
  sales_owner: null,
  accounting_owner: null,
  status: "accounting_review",
  accepted_scope_summary: null,
  po_number: "PO-9",
  client_order_number: null,
  xero_customer_reference: null,
  accounting_notes: null,
  special_billing_instructions: null,
  total_amount: 10_000,
  currency: "HKD",
  accepted_at: null,
  accepted_by: null,
  locked_at: null,
  created_by: null,
  created_at: now,
  updated_at: now,
};

const portion = (overrides: Partial<JobSheetPortion>): JobSheetPortion => ({
  id: "p-1",
  job_sheet_id: "js-1",
  name: "Deposit",
  source_quote_line_item_ids: [],
  description: null,
  amount: 10_000,
  currency: "HKD",
  target_invoice_date: "2026-09-01",
  billing_type: "deposit",
  status: "planned",
  xero_invoice_number: null,
  xero_invoice_reference: null,
  xero_invoice_date: null,
  xero_notes: null,
  internal_note: null,
  sort_order: 0,
  created_at: now,
  updated_at: now,
  ...overrides,
});

function renderDetail(portions: JobSheetPortion[]) {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    jobSheet,
    portions,
    quote: null,
    client: null,
  } as never);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  return render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  acceptJobSheetMock.mockReset().mockResolvedValue(undefined);
  updatePortionsMock.mockReset();
  updateXeroReferenceMock.mockReset();
  invalidateRouterMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Accept & lock is confirmed, and the confirmation says what is lost", () => {
  it("does not accept on the first click — it asks, naming the consequence", async () => {
    renderDetail([portion({})]);

    fireEvent.click(screen.getByRole("button", { name: /Accept & lock/ }));

    // The point of the dialog is that the write has not happened yet. A confirmation that
    // fires the mutation and then asks is decoration.
    expect(acceptJobSheetMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Accept and lock JS-2041\?/)).toBeTruthy();

    // The rule: the description must name the consequence, not just re-ask the question.
    // "Accept and lock JS-2041?" alone tells a reader nothing about what lock means, and
    // this action has no undo anywhere in the product.
    const description = dialog.textContent ?? "";
    expect(description).toContain("stops being editable");
    expect(description).toMatch(/no unlock or reopen action/i);
    // The money at stake is stated, because the number is what the reader is signing off.
    expect(description).toContain("10,000");
  });

  it("accepts only after the confirming control is pressed", async () => {
    renderDetail([portion({})]);

    fireEvent.click(screen.getByRole("button", { name: /Accept & lock/ }));
    const dialog = await screen.findByRole("alertdialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Accept & lock" }));

    await waitFor(() => expect(acceptJobSheetMock).toHaveBeenCalledTimes(1));
    expect(acceptJobSheetMock).toHaveBeenCalledWith({ data: { id: "js-1" } });
  });

  it("cancelling leaves the job sheet untouched", async () => {
    renderDetail([portion({})]);

    fireEvent.click(screen.getByRole("button", { name: /Accept & lock/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(acceptJobSheetMock).not.toHaveBeenCalled();
  });

  it("confirms clearing the last Xero reference, because that quietly unlocks the money", async () => {
    // Clearing all four fields flips the portion from Entered in Xero back to Planned, which
    // re-opens its amount for editing. Same shape of loss as accepting, opposite direction —
    // so it gets the same gate rather than a silent save.
    renderDetail([
      portion({
        status: "entered_in_xero",
        xero_invoice_number: "INV-77",
        xero_invoice_reference: "REF-77",
      }),
    ]);

    fireEvent.change(screen.getByLabelText("Invoice number"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /Save Xero reference/i }));

    expect(updateXeroReferenceMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toMatch(/returns to Planned/i);
    expect(text).toMatch(/editable again/i);
  });
});

describe("Xero-entered portions are commercially read-only, with the reason on screen", () => {
  it("disables amount, billing type and target date once the portion is in Xero", () => {
    renderDetail([portion({ status: "entered_in_xero", xero_invoice_number: "INV-77" })]);

    // The server silently discards edits to these three — `replaceJobSheetPortions` guards
    // them with `case when status = 'entered_in_xero'`. An enabled field here accepts
    // keystrokes, returns 200 and snaps back, and the reconciliation preview counts the
    // number the database will never hold.
    expect((screen.getByLabelText("Amount") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Target invoice date") as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByRole("combobox", { name: "Billing type for Deposit" }).hasAttribute("disabled"),
    ).toBe(true);

    // Disabled without a reason is its own defect: the reader sees a dead field and no
    // account of who settled it or where to change it.
    expect(
      screen.getByText(/Amount, billing type and target invoice date are settled in Xero/i),
    ).toBeTruthy();
  });

  it("leaves the fields Xero does not own editable", () => {
    // The discriminating half. A blanket "disable the whole card" would pass the assertions
    // above while taking away the billing note and the portion name, which the server does
    // accept on an entered_in_xero portion.
    renderDetail([portion({ status: "entered_in_xero", xero_invoice_number: "INV-77" })]);

    expect((screen.getByLabelText(/^Portion 1/) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Billing note") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("does not lock a portion that is merely planned", () => {
    // Without this the suite would still pass if every portion were locked unconditionally.
    renderDetail([portion({})]);

    expect((screen.getByLabelText("Amount") as HTMLInputElement).disabled).toBe(false);
    expect(
      screen.queryByText(/Amount, billing type and target invoice date are settled in Xero/i),
    ).toBeNull();
  });

  it("refuses to remove a portion that carries Xero data, and says why", () => {
    renderDetail([portion({ status: "entered_in_xero", xero_invoice_number: "INV-77" })]);

    const remove = screen.getByRole("button", { name: /Remove portion/i });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(/has Xero details saved against it and cannot be removed/i),
    ).toBeTruthy();
  });
});

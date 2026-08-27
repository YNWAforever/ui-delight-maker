// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { convertWonLeadMock, navigateMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  convertWonLeadMock: vi.fn(),
  navigateMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/server-functions/leads", () => ({ convertWonLead: convertWonLeadMock }));

import { WonConversionDialog } from "../won-conversion-dialog";
import type { Lead, Product, Quote } from "@/lib/types";

const lead: Lead = {
  id: "lead-1",
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  company_name: "Northstar Retail",
  contact_name: "Ada Chan",
  contact_email: "ada@northstar.example",
  contact_phone: null,
  source: "website",
  status: "won",
  assigned_to: null,
  lead_score: 88,
  qualification_data: null,
  enquiry_text: "Needs a retainer",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const products = [
  { id: "prod-1", name: "Social retainer", default_term_months: 12 },
  { id: "prod-2", name: "Media buy", default_term_months: 6 },
] as Product[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const quote = { id: "quote-1", lead_id: "lead-1", total_value: 64000 } as Quote;

function renderDialog() {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <WonConversionDialog
      lead={lead}
      products={products}
      matchingQuote={null}
      onClose={onClose}
      onDone={onDone}
    />,
  );
  return { onClose, onDone };
}

/**
 * How the Revenue Desk actually uses this dialog: mounted once and permanently, with the
 * lead flipped from null to the won lead rather than the dialog being mounted on demand.
 */
function renderAsRouteDoes() {
  const props = {
    products,
    onClose: vi.fn(),
    onDone: vi.fn(),
  };
  const { rerender } = render(<WonConversionDialog lead={null} matchingQuote={null} {...props} />);
  return {
    props,
    openFor: (nextLead: Lead, matchingQuote: Quote | null) =>
      rerender(<WonConversionDialog lead={nextLead} matchingQuote={matchingQuote} {...props} />),
    close: () => rerender(<WonConversionDialog lead={null} matchingQuote={null} {...props} />),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("WonConversionDialog", () => {
  it("creates one engagement no matter how many times the button is pressed", async () => {
    // `convertWonLead` inserts a client *and* an engagement. Before the in-flight lock a
    // double click produced two of each, and the duplicate client then had to be merged by
    // hand. The lock is set before the await, so the second press must find a dead control.
    const request = deferred<{ clientId: string }>();
    convertWonLeadMock.mockReturnValue(request.promise);
    renderDialog();

    const submit = screen.getByRole("button", { name: "Create engagement" });
    fireEvent.click(submit);

    const inFlight = screen.getByRole("button", { name: "Creating…" });
    expect(inFlight.hasAttribute("disabled")).toBe(true);
    fireEvent.click(inFlight);
    fireEvent.click(inFlight);

    expect(convertWonLeadMock).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve({ clientId: "client-9" });
      await request.promise;
    });
  });

  it("stays locked after a successful create, because the route is still navigating away", async () => {
    // Success hands off to `onDone` + `navigate`, both of which unmount this dialog — but
    // not synchronously. Re-enabling the button on success would reopen the duplicate
    // window for exactly as long as that navigation takes.
    const { onDone } = renderDialog();
    convertWonLeadMock.mockResolvedValue({ clientId: "client-9" });

    fireEvent.click(screen.getByRole("button", { name: "Create engagement" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(navigateMock).toHaveBeenCalledWith({ to: "/clients/$id", params: { id: "client-9" } });
    expect(screen.getByRole("button", { name: "Creating…" }).hasAttribute("disabled")).toBe(true);
    expect(convertWonLeadMock).toHaveBeenCalledOnce();
  });

  it("reopens for a retry when the create fails, keeping what was typed", async () => {
    // The alternative is a closed dialog and a lost form: the salesperson has to rebuild
    // the value, term and dates from memory. The failure must also not be reported as
    // success — nothing was created.
    convertWonLeadMock.mockRejectedValue(new Error("Something went wrong. Please try again."));
    const { onDone } = renderDialog();

    const value = screen.getByLabelText("Value (HKD)") as HTMLInputElement;
    fireEvent.change(value, { target: { value: "48000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create engagement" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Value (HKD)") as HTMLInputElement).value).toBe("48000");

    const retry = screen.getByRole("button", { name: "Create engagement" });
    expect(retry.hasAttribute("disabled")).toBe(false);
    fireEvent.click(retry);
    await waitFor(() => expect(convertWonLeadMock).toHaveBeenCalledTimes(2));
  });

  it("never shows the database its own words", async () => {
    // The catch used to toast `error.message`. Repository failures here quote the failing
    // INSERT, which names the engagements table and its columns.
    convertWonLeadMock.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "engagements_pkey"'),
    );
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Create engagement" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("prefills from the lead it opens for, not from the empty props it was mounted with", () => {
    // The engagement is created with whatever is in this box. The accepted quote total is
    // the number the client agreed to, so opening at 0 is not a harmless default — it is
    // the value that gets written if nobody notices.
    const { openFor } = renderAsRouteDoes();

    openFor(lead, quote);

    expect((screen.getByLabelText("Value (HKD)") as HTMLInputElement).value).toBe("64000");
  });

  it("does not carry one conversion's numbers into the next", () => {
    // Two won leads in a session share this one mounted dialog. The second must not open
    // showing the first lead's negotiated value.
    const { openFor, close } = renderAsRouteDoes();

    openFor(lead, quote);
    fireEvent.change(screen.getByLabelText("Value (HKD)"), { target: { value: "48000" } });
    close();

    openFor({ ...lead, id: "lead-2", company_name: "Harbour Foods" }, null);

    expect((screen.getByLabelText("Value (HKD)") as HTMLInputElement).value).toBe("0");
  });

  it("sends the value and dates the user actually entered", async () => {
    // The write is the whole point of the dialog: a form that silently drops the edited
    // value creates an engagement worth the quote total instead of the negotiated one.
    convertWonLeadMock.mockResolvedValue({ clientId: "client-9" });
    renderDialog();

    fireEvent.change(screen.getByLabelText("Value (HKD)"), { target: { value: "48000" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Renewal date"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Create engagement" }));

    await waitFor(() => expect(convertWonLeadMock).toHaveBeenCalledOnce());
    expect(convertWonLeadMock).toHaveBeenCalledWith({
      data: {
        leadId: "lead-1",
        productId: "prod-1",
        value: 48000,
        billingPeriod: "monthly",
        startDate: "2026-08-01",
        renewalDate: "2027-02-01",
        quoteId: undefined,
      },
    });
  });
});

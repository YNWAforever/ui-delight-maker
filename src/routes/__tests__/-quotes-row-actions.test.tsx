// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Quote } from "@/lib/types";

const createQuoteMock = vi.hoisted(() => vi.fn());
const updateQuoteMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/quotes",
    useLoaderData: vi.fn(),
    useSearch: () => ({ page: 1, limit: 50, status: "all" }),
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Outlet: () => null,
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/server-functions/quotes", () => ({
  getQuotesPage: vi.fn(),
  createQuote: createQuoteMock,
  updateQuote: updateQuoteMock,
}));

import { Route } from "../quotes";

const SOURCE_QUOTE: Quote = {
  id: "quote-1",
  number: "QT-1001",
  lead_id: "lead-9",
  client_id: null,
  contact_id: "contact-3",
  account_id: "account-4",
  deal_id: null,
  status: "sent",
  quote_template_id: "template-2",
  accepted_version_id: "version-7",
  issued_version_id: "version-8",
  document_sections: null,
  cover_text: "Thanks for the brief.",
  assumptions: "Scope excludes print.",
  payment_terms: "30 days",
  accepted_at: "2026-07-04T00:00:00.000Z",
  accepted_by: "user-2",
  parent_quote_id: null,
  change_order_reason: null,
  total_value: 1000,
  currency: "HKD",
  valid_until: "2026-09-01",
  line_items: [
    { id: "li-1", service: "Design", description: "Key visual", qty: 1, unit_price: 1000 },
  ],
  pdf_url: "https://example.invalid/qt-1001.pdf",
  created_by: "user-1",
  approved_by: "user-5",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  createQuoteMock.mockReset();
  updateQuoteMock.mockReset();
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue({
    items: [SOURCE_QUOTE],
    total: 1,
    page: 1,
    limit: 50,
  } as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderQuotes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return { invalidateQueries };
}

/** Radix opens its menu on pointerdown; the table and the card list each render a trigger. */
const openRowMenu = async () => {
  const [trigger] = screen.getAllByRole("button", { name: "Actions for row quote-1" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findByRole("menu");
};

describe("Quotes offers no Archive, because the schema has no archived state", () => {
  it("puts nothing but Duplicate in the row menu", async () => {
    // Archive used to drop the row out of local state and toast success, so the user
    // watched a destructive action land and then watched the next loader run undo it.
    // `quotes_status_check` permits nine states and none of them is `archived`.
    renderQuotes();
    const menu = await openRowMenu();

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Duplicate"]);
  });
});

describe("Quotes Duplicate performs two real writes", () => {
  it("creates the copy, then links it to the original", async () => {
    // It used to toast `Duplicated …` while nothing was persisted at all.
    createQuoteMock.mockResolvedValue({ id: "quote-copy" });
    updateQuoteMock.mockResolvedValue({});
    const { invalidateQueries } = renderQuotes();

    const menu = await openRowMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledOnce());
    expect(createQuoteMock).toHaveBeenCalledOnce();
    expect(updateQuoteMock).toHaveBeenCalledWith({
      data: { id: "quote-copy", updates: { parent_quote_id: "quote-1" } },
    });
    // The parent link needs the copy's id, so it cannot be written first.
    expect(createQuoteMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateQuoteMock.mock.invocationCallOrder[0],
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Duplicated QT-1001 as a new draft.");
    expect(toastErrorMock).not.toHaveBeenCalled();

    // The component reads the loader's data, so the copy only shows up once the cache is
    // marked stale AND this route's loader has re-run.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["quotes", "list"] });
    expect(routerInvalidateMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/quotes/$id",
      params: { id: "quote-copy" },
    });
  });

  it("copies the commercial content but never the quote number or lifecycle state", async () => {
    createQuoteMock.mockResolvedValue({ id: "quote-copy" });
    updateQuoteMock.mockResolvedValue({});
    renderQuotes();

    const menu = await openRowMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(createQuoteMock).toHaveBeenCalledOnce());
    const payload = createQuoteMock.mock.calls[0][0].data as Record<string, unknown>;
    // `quotes.number` is not unique in the schema, so cloning it would put two different
    // quotes on screen under one reference. A copy is a fresh draft and gets its number
    // when it is issued — and must not inherit the original's approval or acceptance.
    expect(Object.keys(payload)).not.toContain("number");
    expect(Object.keys(payload)).not.toContain("status");
    expect(Object.keys(payload)).not.toContain("accepted_at");
    expect(Object.keys(payload)).not.toContain("approved_by");
    // What the copy is *for* still has to come across.
    expect(payload.line_items).toEqual(SOURCE_QUOTE.line_items);
    expect(payload.total_value).toBe(1000);
    expect(payload.currency).toBe("HKD");
    expect(payload.lead_id).toBe("lead-9");
  });

  it("says the copy exists but is unlinked when only the lineage write fails", async () => {
    // `quotes.create` and `quotes.update` are separate capabilities, so this is a real
    // permission shape rather than just a flaky network. Reporting plain success here would
    // hide an unparented copy from whoever has to reconcile the two.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createQuoteMock.mockResolvedValue({ id: "quote-copy" });
    updateQuoteMock.mockRejectedValue(new Error("You do not have access to this."));
    renderQuotes();

    const menu = await openRowMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledOnce());
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Duplicated QT-1001, but it could not be linked to the original.",
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
    // The copy is real, so the user is still taken to it.
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/quotes/$id",
      params: { id: "quote-copy" },
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("claims nothing and links nothing when the copy itself fails", async () => {
    createQuoteMock.mockRejectedValue(new Error("You do not have access to this."));
    const { invalidateQueries } = renderQuotes();

    const menu = await openRowMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(toastErrorMock).toHaveBeenCalledWith("You do not have access to this.");
    expect(updateQuoteMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("refuses a second duplicate while the first is still in flight", async () => {
    // Duplicate is not idempotent: a double fire leaves an extra orphan draft behind.
    const inFlight = deferred<{ id: string }>();
    createQuoteMock.mockReturnValue(inFlight.promise);
    updateQuoteMock.mockResolvedValue({});
    renderQuotes();

    const menu = await openRowMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(createQuoteMock).toHaveBeenCalledOnce());

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicating…" }));
    expect(createQuoteMock).toHaveBeenCalledOnce();

    await act(async () => {
      inFlight.resolve({ id: "quote-copy" });
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledOnce());
  });
});

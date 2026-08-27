// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead } from "@/lib/types";

const updateLeadMock = vi.hoisted(() => vi.fn());
const createLeadMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/leads",
    useLoaderData: vi.fn(),
    useSearch: () => ({ page: 1, limit: 50 }),
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
vi.mock("@/server-functions/leads", () => ({
  getLeadsPage: vi.fn(),
  createLead: createLeadMock,
  updateLead: updateLeadMock,
}));

import { Route } from "../leads";

const makeLead = (overrides: Partial<Lead> & Pick<Lead, "id" | "company_name">): Lead => ({
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  source: "website",
  status: "new",
  assigned_to: null,
  lead_score: 50,
  qualification_data: null,
  enquiry_text: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const LEADS: Lead[] = [
  makeLead({ id: "lead-1", company_name: "Northstar", created_at: "2026-07-01T00:00:00.000Z" }),
  makeLead({ id: "lead-2", company_name: "Bluepeak", created_at: "2026-07-02T00:00:00.000Z" }),
];

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
  updateLeadMock.mockReset();
  createLeadMock.mockReset();
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue({
    items: LEADS,
    total: 2,
    page: 1,
    limit: 50,
  } as never);
});

afterEach(cleanup);

function renderLeads() {
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

/** The table and the card list each render one, and they share the caller's selection. */
const rowCheckbox = (id: string) =>
  screen.getAllByRole("checkbox", { name: `Select row ${id}` })[0];

const selectEveryLead = () => {
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
};

/** Clicks the bulk bar's Mark qualified, then confirms in the alert dialog it opens. */
const confirmMarkQualified = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Mark qualified" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark qualified" }));
};

/** The dialog stays open after a failed batch, so a retry is one more click on it. */
const retryFromOpenDialog = () => {
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark qualified" }));
};

const dismissOpenDialog = () => {
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
};

describe("Leads bulk writes keep the table agreeing with the database", () => {
  it("refreshes and clears the selection when every write lands", async () => {
    updateLeadMock.mockResolvedValue({});
    const { invalidateQueries } = renderLeads();

    selectEveryLead();
    expect(screen.getByText("2 selected")).toBeTruthy();
    await confirmMarkQualified();

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledOnce());
    expect(updateLeadMock).toHaveBeenCalledTimes(2);
    expect(toastSuccessMock).toHaveBeenCalledWith("Marked 2 leads as Qualified");
    // Nothing stays selected, so the bulk bar goes away rather than inviting a second run
    // of a batch that already succeeded.
    expect(screen.queryByText(/ selected$/)).toBeNull();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(routerInvalidateMock).toHaveBeenCalledOnce();
  });

  it("still refreshes on a partial failure, and says how many of how many failed", async () => {
    // The batch used to be a `Promise.all`, which rejects on the first failure and returns
    // before the invalidation ever runs — so the writes that DID land stayed invisible and
    // the table sat there showing pre-write state next to an error toast.
    updateLeadMock.mockImplementation(({ data }: { data: { id: string } }) =>
      data.id === "lead-2"
        ? Promise.reject(new Error("That lead is locked by another user."))
        : Promise.resolve({}),
    );
    const { invalidateQueries } = renderLeads();

    selectEveryLead();
    await confirmMarkQualified();

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(routerInvalidateMock).toHaveBeenCalledOnce();
    // The counts are the point: "some failed" is not actionable, "1 of 2" is.
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Marked 1 lead as Qualified. 1 of 2 failed — That lead is locked by another user.",
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("unticks the leads that succeeded and leaves the failed one ticked", async () => {
    updateLeadMock.mockImplementation(({ data }: { data: { id: string } }) =>
      data.id === "lead-2" ? Promise.reject(new Error("Try again shortly.")) : Promise.resolve({}),
    );
    renderLeads();

    selectEveryLead();
    await confirmMarkQualified();
    await waitFor(() => expect(screen.getByText("1 selected")).toBeTruthy());
    dismissOpenDialog();

    expect(rowCheckbox("lead-2").getAttribute("aria-checked")).toBe("true");
    expect(rowCheckbox("lead-1").getAttribute("aria-checked")).toBe("false");
  });

  it("retries against only the leads that failed", async () => {
    // The retry is the reason the failed ids stay selected. If the selection were cleared
    // wholesale, this second run would rewrite `lead-1`, which already changed.
    updateLeadMock.mockImplementation(({ data }: { data: { id: string } }) =>
      data.id === "lead-2" ? Promise.reject(new Error("Try again shortly.")) : Promise.resolve({}),
    );
    renderLeads();

    selectEveryLead();
    await confirmMarkQualified();
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());

    updateLeadMock.mockReset();
    updateLeadMock.mockResolvedValue({});
    retryFromOpenDialog();

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledOnce());
    expect(updateLeadMock).toHaveBeenCalledTimes(1);
    expect(updateLeadMock).toHaveBeenCalledWith({
      data: { id: "lead-2", updates: { status: "qualified" } },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Marked 1 lead as Qualified");
  });

  it("asks about the leads it is actually about to write, not the ones first selected", async () => {
    // The dialog stays open after a partial failure and the selection shrinks under it, so
    // a title captured when the dialog opened asks about a number the button no longer
    // touches — and the user confirms a batch of two that writes one.
    updateLeadMock.mockImplementation(({ data }: { data: { id: string } }) =>
      data.id === "lead-2" ? Promise.reject(new Error("Try again shortly.")) : Promise.resolve({}),
    );
    renderLeads();

    selectEveryLead();
    fireEvent.click(screen.getByRole("button", { name: "Mark qualified" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Mark 2 leads as qualified?");

    fireEvent.click(within(dialog).getByRole("button", { name: "Mark qualified" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(within(screen.getByRole("alertdialog")).getByRole("heading").textContent).toBe(
      "Mark 1 lead as qualified?",
    );
  });

  it("refreshes and keeps every id selected when the whole batch fails", async () => {
    updateLeadMock.mockRejectedValue(new Error("Try again shortly."));
    const { invalidateQueries } = renderLeads();

    selectEveryLead();
    await confirmMarkQualified();

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(toastErrorMock).toHaveBeenCalledWith("No leads were updated. Try again shortly.");
    expect(screen.getByText("2 selected")).toBeTruthy();
    // A rejected write is not proof nothing changed server side, so the view still refreshes.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(routerInvalidateMock).toHaveBeenCalledOnce();
  });

  it("refuses a second submit while the batch is in flight", async () => {
    // Two batches over the same ids would double-write, and the second would race the
    // first one's invalidation.
    const inFlight = deferred<unknown>();
    updateLeadMock.mockReturnValue(inFlight.promise);
    renderLeads();

    selectEveryLead();
    await confirmMarkQualified();
    expect(updateLeadMock).toHaveBeenCalledTimes(2);

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Updating…" }));
    expect(updateLeadMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      inFlight.resolve({});
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledOnce());
  });
});

describe("Leads bulk assign refuses an empty owner before it writes", () => {
  const openAssignDialog = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Assign owner" }));
    return screen.findByRole("dialog");
  };

  it("issues zero writes when the owner box holds nothing but whitespace", async () => {
    // `leads.assigned_to` references `profiles(id)`. Sending "" for every selected id used
    // to hand Postgres a foreign-key violation, one per lead.
    updateLeadMock.mockResolvedValue({});
    renderLeads();

    selectEveryLead();
    const dialog = await openAssignDialog();
    const assign = within(dialog).getByRole("button", { name: "Assign" });

    fireEvent.click(assign);
    fireEvent.change(within(dialog).getByLabelText("Owner user ID"), {
      target: { value: "   " },
    });
    fireEvent.click(assign);

    expect(updateLeadMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("writes the trimmed owner to every selected lead once a real id is given", async () => {
    updateLeadMock.mockResolvedValue({});
    renderLeads();

    selectEveryLead();
    const dialog = await openAssignDialog();
    fireEvent.change(within(dialog).getByLabelText("Owner user ID"), {
      target: { value: "  user-77  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(updateLeadMock).toHaveBeenCalledTimes(2));
    expect(updateLeadMock).toHaveBeenCalledWith({
      data: { id: "lead-1", updates: { assigned_to: "user-77" } },
    });
    expect(updateLeadMock).toHaveBeenCalledWith({
      data: { id: "lead-2", updates: { assigned_to: "user-77" } },
    });
  });

  it("keeps the assign dialog open when the batch fails, so the error toast has context", async () => {
    updateLeadMock.mockRejectedValue(new Error("Try again shortly."));
    renderLeads();

    selectEveryLead();
    const dialog = await openAssignDialog();
    fireEvent.change(within(dialog).getByLabelText("Owner user ID"), {
      target: { value: "user-77" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    const stillOpen = screen.getByRole("dialog");
    expect(within(stillOpen).getByLabelText("Owner user ID")).toHaveProperty("value", "user-77");
  });
});

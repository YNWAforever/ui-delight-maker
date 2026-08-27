// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import type { ClientContact, Engagement } from "@/lib/types";

const createContactMock = vi.hoisted(() => vi.fn());
const updateContactMock = vi.hoisted(() => vi.fn());
const deleteContactMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const sectionCalls = vi.hoisted(
  () => [] as Array<{ section: string; enabled: boolean | undefined }>,
);
const sectionStates = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/clients/$id",
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/hooks/use-client-workspace-section", () => ({
  useClientWorkspaceSection: (
    _clientId: string,
    section: string,
    options?: { enabled?: boolean },
  ) => {
    sectionCalls.push({ section, enabled: options?.enabled });
    return (
      sectionStates[section] ?? {
        data: undefined,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      }
    );
  },
}));
vi.mock("@/server-functions/client-contacts", () => ({
  createClientContact: createContactMock,
  updateClientContact: updateContactMock,
  deleteClientContact: deleteContactMock,
}));
vi.mock("@/server-functions/client-workspace", () => ({ getClientWorkspaceRead: vi.fn() }));
vi.mock("@/server-functions/touchpoints", () => ({ getTouchpointsByClient: vi.fn() }));
vi.mock("@/server-functions/tasks", () => ({ getTasks: vi.fn() }));
vi.mock("@/server-functions/products", () => ({ getProducts: vi.fn() }));

import { Route } from "../clients.$id";

const CLIENT_ID = "client-1";

const contact = (overrides: Partial<ClientContact> & Pick<ClientContact, "id" | "name">) =>
  ({
    client_id: CLIENT_ID,
    title: "Head of Marketing",
    email: "ada@northstar.test",
    phone: "+852 1234 5678",
    is_primary: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as ClientContact;

const engagement = (overrides: Partial<Engagement> & Pick<Engagement, "id">) =>
  ({
    client_id: CLIENT_ID,
    product_id: "product-1",
    owner: null,
    value: 5000,
    billing_period: "monthly",
    start_date: "2026-01-01",
    renewal_date: "2026-12-01",
    status: "active",
    health_score: 70,
    renewal_risk: "low",
    risk_reasoning: null,
    next_action: null,
    last_touch_at: null,
    end_reason: null,
    lead_id: null,
    quote_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as Engagement;

const workspace = (counts: Partial<Record<string, number | null>> = {}) => ({
  requestId: "req-1",
  identity: {
    id: CLIENT_ID,
    accountId: null,
    primaryContactId: null,
    companyName: "Northstar Retail",
    industry: "Retail",
    tier: "SME",
    createdAt: "2025-06-01T00:00:00.000Z",
  },
  ownership: { accountOwnerId: null },
  relationship: {
    healthScore: 62,
    onboardingStatus: "active",
    renewalDate: "2026-12-01",
    renewalRisk: "medium",
    arr: 120000,
  },
  counts: {
    contacts: 1,
    engagements: 2,
    quotes: 0,
    jobSheets: 0,
    ...counts,
  },
});

function readySection<T>(data: T) {
  return { data: { status: "ready", data }, isPending: false, isError: false, refetch: vi.fn() };
}

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
  createContactMock.mockReset();
  updateContactMock.mockReset();
  deleteContactMock.mockReset();
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  routerInvalidateMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  sectionCalls.length = 0;
  for (const key of Object.keys(sectionStates)) delete sectionStates[key];
  sectionStates.contacts = readySection({ contacts: [contact({ id: "contact-1", name: "Ada" })] });
  vi.mocked(Route.useLoaderData).mockReturnValue(workspace() as never);
  vi.mocked(Route.useSearch).mockReturnValue({ tab: "contacts" } as never);
});

afterEach(cleanup);

function renderDetail() {
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

async function openAddContact() {
  fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
  await screen.findByText("New contact");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Grace" } });
}

/** The two halves of a contact write's refresh, asserted together because both are required. */
function expectBothRefreshes(invalidateQueries: ReturnType<typeof vi.spyOn>) {
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: crmQueryKeys.clients.section(CLIENT_ID, "contacts"),
  });
  const filter = routerInvalidateMock.mock.calls[0][0].filter as (m: {
    routeId: string;
  }) => boolean;
  expect(filter({ routeId: "/clients/$id" })).toBe(true);
  expect(filter({ routeId: "/clients" })).toBe(false);
}

describe("/clients/$id contact create", () => {
  it("refreshes the section query and the loader that owns the tab count", async () => {
    createContactMock.mockResolvedValue(contact({ id: "contact-2", name: "Grace" }));
    const { invalidateQueries } = renderDetail();
    await openAddContact();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Added contact Grace"));

    // `invalidateQueries` cannot touch loader data, and "Contacts (n)" plus the Account card's
    // count both come from `Route.useLoaderData()` — which is why they never moved.
    expectBothRefreshes(invalidateQueries);
  });

  it("creates once however many times Create is clicked", async () => {
    const pending = deferred<ClientContact>();
    createContactMock.mockReturnValue(pending.promise);
    renderDetail();
    await openAddContact();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createContactMock).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole("button", { name: "Creating…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(createContactMock).toHaveBeenCalledTimes(1);

    pending.resolve(contact({ id: "contact-2", name: "Grace" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it("sanitises a failed create and leaves the dialog open", async () => {
    createContactMock.mockRejectedValue(
      new Error('null value in column "client_id" of relation "client_contacts"'),
    );
    renderDetail();
    await openAddContact();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));

    expect(toastErrorMock.mock.calls[0][0]).toBe("Something went wrong. Please try again.");
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Grace");
  });
});

describe("/clients/$id contact remove", () => {
  it("asks first, and writes nothing until the confirmation is taken", async () => {
    deleteContactMock.mockResolvedValue({ ok: true });
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(deleteContactMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove contact" }));
    await waitFor(() => expect(deleteContactMock).toHaveBeenCalledTimes(1));
    expect(deleteContactMock).toHaveBeenCalledWith({ data: { id: "contact-1" } });
  });

  it("reports the removal, which it used to perform in silence", async () => {
    deleteContactMock.mockResolvedValue({ ok: true });
    const { invalidateQueries } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove contact" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Removed contact Ada"));
    expectBothRefreshes(invalidateQueries);
  });

  it("keeps the row when the server refuses the delete", async () => {
    deleteContactMock.mockRejectedValue(new Error("permission denied for table client_contacts"));
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove contact" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    // The row used to be dropped from local state before the await resolved, so a refused
    // delete looked exactly like a successful one.
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock.mock.calls[0][0]).toBe("Something went wrong. Please try again.");
  });
});

describe("/clients/$id contact edit", () => {
  it("wires the update server function that had no caller anywhere in the product", async () => {
    updateContactMock.mockResolvedValue(contact({ id: "contact-1", name: "Ada Lovelace" }));
    const { invalidateQueries } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit contact");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateContactMock).toHaveBeenCalledTimes(1));
    expect(updateContactMock).toHaveBeenCalledWith({
      data: {
        id: "contact-1",
        updates: {
          name: "Ada Lovelace",
          title: "Head of Marketing",
          email: "ada@northstar.test",
          phone: "+852 1234 5678",
        },
      },
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expectBothRefreshes(invalidateQueries);
  });
});

describe("/clients/$id restricted sections", () => {
  it("disables a tab the caller cannot read instead of failing it as a transient outage", () => {
    vi.mocked(Route.useLoaderData).mockReturnValue(workspace({ contacts: null }) as never);
    vi.mocked(Route.useSearch).mockReturnValue({ tab: "overview" } as never);
    renderDetail();

    const trigger = screen.getByRole("tab", { name: "Contacts" });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);

    const reasonId = trigger.getAttribute("aria-describedby") as string;
    expect(document.getElementById(reasonId)?.textContent).toMatch(/do not have access/i);
    // And the reason never names the capability the reader is missing.
    expect(document.getElementById(reasonId)?.textContent).not.toMatch(/contacts\.view/);

    // The section read is never fired for a section the loader already said is off-limits.
    const contactsCall = sectionCalls.find((call) => call.section === "contacts");
    expect(contactsCall?.enabled).toBe(false);
  });
});

describe("/clients/$id relationship health", () => {
  beforeEach(() => {
    vi.mocked(Route.useSearch).mockReturnValue({ tab: "overview" } as never);
    sectionStates.engagements = readySection({
      engagements: [
        engagement({ id: "eng-1", health_score: 80 }),
        engagement({
          id: "eng-2",
          health_score: 62,
          renewal_risk: "medium",
          risk_reasoning: "Usage fell 40% since March and the sponsor has gone quiet.",
          next_action: "Book a check-in before renewal",
          updated_at: "2026-05-02T00:00:00.000Z",
        }),
      ],
    });
  });

  it("explains the score instead of printing a bare number", async () => {
    renderDetail();

    expect(
      await screen.findByText(/Health is the lowest score across 2 active engagements/),
    ).toBeTruthy();
    expect(screen.getByText(/the lowest is 62/)).toBeTruthy();
    expect(screen.getByText(/Renewal risk is the highest across active engagements/)).toBeTruthy();
    expect(screen.getByText(/annualises the value of the active engagements/)).toBeTruthy();
  });

  it("marks the agent's assessment as machine output, in words", async () => {
    renderDetail();

    expect(await screen.findByText("Agent output")).toBeTruthy();
    expect(
      screen.getByText(/Written by the Renewal Risk Agent — not a confirmed human decision\./),
    ).toBeTruthy();
    expect(
      screen.getByText("Usage fell 40% since March and the sponsor has gone quiet."),
    ).toBeTruthy();
  });

  it("says the score cannot be explained rather than explaining it from data it lacks", () => {
    vi.mocked(Route.useLoaderData).mockReturnValue(workspace({ engagements: null }) as never);
    renderDetail();

    expect(screen.getByText(/This score cannot be explained here/)).toBeTruthy();
    expect(screen.queryByText(/Health is the lowest score across/)).toBeNull();
  });
});

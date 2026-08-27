// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import type { Client, RenewalRisk } from "@/lib/types";

const createClientMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/clients",
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
vi.mock("@/server-functions/clients", () => ({
  getClientsPage: vi.fn(),
  createClient: createClientMock,
}));

import { Route } from "../clients";

type ClientRow = Client & { renewal_risk: RenewalRisk };

const makeClient = (overrides: Partial<ClientRow> & Pick<ClientRow, "id" | "company_name">) =>
  ({
    account_id: null,
    primary_contact_id: null,
    industry: "Retail",
    tier: "SME",
    onboarding_status: "active",
    account_owner: null,
    health_score: 80,
    renewal_date: "2026-12-01",
    arr: 120000,
    renewal_risk: "low",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as ClientRow;

const CLIENTS: ClientRow[] = [
  makeClient({ id: "client-1", company_name: "Northstar Retail" }),
  makeClient({ id: "client-2", company_name: "Bluepeak Logistics", health_score: 40 }),
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
  createClientMock.mockReset();
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  routerInvalidateMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue({
    items: CLIENTS,
    total: 2,
    page: 1,
    limit: 50,
  } as never);
});

afterEach(cleanup);

function renderClients() {
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

async function openNewClientDialog() {
  fireEvent.click(screen.getByRole("button", { name: /new client/i }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme Trading" } });
  return dialog;
}

describe("/clients new-client dialog", () => {
  it("does not submit twice while the first create is in flight", async () => {
    const pending = deferred<Client>();
    createClientMock.mockReturnValue(pending.promise);
    renderClients();
    await openNewClientDialog();

    const submit = screen.getByRole("button", { name: "Create client" });
    fireEvent.click(submit);
    await waitFor(() => expect(createClientMock).toHaveBeenCalledTimes(1));

    // The button carries the in-flight state, and a second click is refused outright.
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Creating…" }));
    expect(createClientMock).toHaveBeenCalledTimes(1);

    pending.resolve(makeClient({ id: "client-3", company_name: "Acme Trading" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it("never submits an account owner, because no owner directory is readable here", async () => {
    createClientMock.mockResolvedValue(
      makeClient({ id: "client-3", company_name: "Acme Trading" }),
    );
    renderClients();
    await openNewClientDialog();

    fireEvent.click(screen.getByRole("button", { name: "Create client" }));
    await waitFor(() => expect(createClientMock).toHaveBeenCalledTimes(1));

    const payload = createClientMock.mock.calls[0][0].data as Record<string, unknown>;
    // `clients.account_owner` references `profiles(id)`. The fixture ids this control used to
    // default to exist in no seed, so the default path of this dialog raised an FK violation.
    expect(payload).not.toHaveProperty("account_owner");
    expect(payload.company_name).toBe("Acme Trading");
  });

  it("explains why the owner field cannot be used instead of offering a broken one", async () => {
    renderClients();
    await openNewClientDialog();

    const owner = screen.getByLabelText("Account owner");
    expect((owner as HTMLInputElement).disabled).toBe(true);
    const reasonId = owner.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId as string)?.textContent).toMatch(/no owner directory/i);
  });

  it("reports a failed create through the sanitiser and keeps the dialog open", async () => {
    createClientMock.mockRejectedValue(
      new Error(
        'insert or update on table "clients" violates foreign key constraint "clients_account_owner_fkey"',
      ),
    );
    renderClients();
    await openNewClientDialog();

    fireEvent.click(screen.getByRole("button", { name: "Create client" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));

    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).toBe("Something went wrong. Please try again.");
    expect(message).not.toMatch(/constraint|violates|clients_account_owner/i);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    // Still open, still populated: the user can correct and retry rather than retype.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("Company") as HTMLInputElement).value).toBe("Acme Trading");
  });

  it("refreshes the list cache and this route's loader after a create, and invents no risk grade", async () => {
    createClientMock.mockResolvedValue(
      makeClient({ id: "client-3", company_name: "Acme Trading" }),
    );
    const { invalidateQueries } = renderClients();
    await openNewClientDialog();

    fireEvent.click(screen.getByRole("button", { name: "Create client" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: crmQueryKeys.clients.lists() });

    // Scoped, never a bare router.invalidate: a whole-router invalidate refetches every
    // mounted loader in the app.
    const filter = routerInvalidateMock.mock.calls[0][0].filter as (m: {
      routeId: string;
    }) => boolean;
    expect(filter({ routeId: "/clients" })).toBe(true);
    expect(filter({ routeId: "/leads" })).toBe(false);

    // The created row is not prepended locally. `createClient` returns a bare Client with no
    // `renewal_risk`, and the old code spread a hard-coded "low" onto it — a green badge the
    // server had never produced. Only the loader may add rows.
    expect(screen.queryByText("Acme Trading")).toBeNull();
  });
});

describe("/clients filters", () => {
  it("offers Clear while rows are still visible, not only once everything is hidden", () => {
    renderClients();

    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(screen.getAllByText("Northstar Retail").length).toBeGreaterThan(0);
  });

  it("restores every row when the filtered empty state is cleared", async () => {
    renderClients();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "no-such-company" },
    });

    expect(await screen.findByText("No results match these filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() =>
      expect(screen.getAllByText("Bluepeak Logistics").length).toBeGreaterThan(0),
    );
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("");
  });
});

describe("/clients health presentation", () => {
  it("never shows a health number without the word that goes with it", () => {
    renderClients();

    // 40 is "At risk", 80 is "Healthy". Colour is not the only channel (§14).
    expect(screen.getAllByText("At risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Healthy").length).toBeGreaterThan(0);
  });
});

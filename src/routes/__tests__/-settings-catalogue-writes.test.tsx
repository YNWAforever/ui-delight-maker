// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_DEFINITIONS } from "@/lib/agents";
import { crmQueryKeys } from "@/lib/query-keys";

/**
 * The product catalogue is the only group on `/settings` that writes, and every defect the
 * audit found in it is asserted here.
 *
 * - **IF-E1-27** Create was a bare `async` on `onClick`: no guard, no `catch`. Two clicks
 *   wrote two catalogue rows, and a capability refusal was an unhandled rejection.
 * - **IF-E1-28 / M-5** Activate and deactivate had no in-flight state, no success toast and
 *   no failure toast, so a forbidden click was a row that did not change and said nothing.
 * - **IF-E1-29** Both handlers invalidated `["products","list"]` while the page's own query
 *   was keyed `["settings","detail","products"]` - a prefix that can never match it. The page
 *   is now keyed under `products`, so one invalidation serves this table and
 *   `/clients/$id`'s active-only list.
 * - **IF-E1-30** Create and Deactivate rendered enabled for the five roles that hold
 *   `products.view` without `products.manage`.
 */

const {
  navigateMock,
  routerInvalidateMock,
  createProductMock,
  deactivateProductMock,
  updateProductMock,
  getProductsMock,
  getEffectiveAgentCatalogueMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  createProductMock: vi.fn(),
  deactivateProductMock: vi.fn(),
  updateProductMock: vi.fn(),
  getProductsMock: vi.fn(),
  getEffectiveAgentCatalogueMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

const routeContext = { profile: null as { role: string } | null, adminNavigation: [] as unknown[] };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/settings",
    useLoaderData: vi.fn(),
    useSearch: () => ({ tab: undefined }),
    useRouteContext: () => routeContext,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ children }: { children?: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));

vi.mock("@/server-functions/products", () => ({
  createProduct: createProductMock,
  deactivateProductFn: deactivateProductMock,
  getProducts: getProductsMock,
  updateProduct: updateProductMock,
}));

vi.mock("@/server-functions/agents-catalogue", () => ({
  getEffectiveAgentCatalogue: getEffectiveAgentCatalogueMock,
}));

// Rendered flat so both tabs and the dialog body are in the document at once. The tab and
// dialog mechanics belong to Radix and to `-admin-url-state.test.tsx`; what matters here is
// the write behaviour of the controls inside them.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));

vi.mock("@/components/sales", () => ({
  EmptyWorkspaceState: ({ title }: { title: string }) => <p>{title}</p>,
  ErrorState: () => null,
  SectionHeader: ({ title, action }: { title: string; action?: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {action}
    </div>
  ),
  StaleDataIndicator: () => null,
  StatusBadge: ({ value }: { value: string }) => <span data-testid="status-badge">{value}</span>,
  WorkspaceHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  ResponsiveRecordList: <T,>({
    rows,
    rowKey,
    renderCard,
  }: {
    rows: T[];
    rowKey: (row: T) => string;
    renderCard: (row: T) => ReactNode;
  }) => (
    <ul>
      {rows.map((row) => (
        <li key={rowKey(row)}>{renderCard(row)}</li>
      ))}
    </ul>
  ),
}));

import { Route } from "../settings";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const product = {
  id: "product-1",
  name: "CRM Retainer",
  description: null,
  category: "CRM",
  billing_type: "retainer",
  default_term_months: 12,
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function renderPage() {
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
  return { queryClient, invalidateQueries };
}

beforeEach(() => {
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  createProductMock.mockReset();
  deactivateProductMock.mockReset();
  updateProductMock.mockReset();
  getProductsMock.mockReset();
  getProductsMock.mockResolvedValue([product]);
  getEffectiveAgentCatalogueMock.mockReset();
  getEffectiveAgentCatalogueMock.mockResolvedValue(AGENT_DEFINITIONS);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  routeContext.profile = { role: "admin" };
  routeContext.adminNavigation = [];
  vi.mocked(Route.useLoaderData).mockReturnValue([product] as never);
});

afterEach(cleanup);

describe("settings product catalogue", () => {
  it("writes a deactivation through the server function and refreshes every product key", async () => {
    deactivateProductMock.mockResolvedValue({ ...product, active: false });
    const { invalidateQueries } = renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() =>
      expect(deactivateProductMock).toHaveBeenCalledWith({ data: { id: "product-1" } }),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: crmQueryKeys.products.lists(),
      }),
    );
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("CRM Retainer deactivated"));
    // The group reports when it last saved, not just that something happened.
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((node) => /^Saved /.test(node.textContent ?? "")),
      ).toBe(true),
    );
  });

  it("locks the row while the write is in flight, so one click is one write", async () => {
    const request = deferred<unknown>();
    deactivateProductMock.mockReturnValue(request.promise);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    const saving = await screen.findByRole("button", { name: "Saving..." });
    expect(saving.hasAttribute("disabled")).toBe(true);
    fireEvent.click(saving);
    expect(deactivateProductMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve({ ...product, active: false }));
  });

  it("reports a refused deactivation without leaking driver text, and offers a retry", async () => {
    deactivateProductMock.mockRejectedValue(
      new Error("permission denied for table products (SQLSTATE 42501)"),
    );
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).toBe("Something went wrong. Please try again.");
    expect(message).not.toContain("permission denied");
    expect(message).not.toContain("products");
    expect(toastSuccessMock).not.toHaveBeenCalled();

    // Inline recovery, next to the group that failed.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("refuses to create a product with no name instead of inventing one", async () => {
    createProductMock.mockResolvedValue({ ...product, id: "product-2", name: "Data Platform" });
    renderPage();

    const create = screen.getByRole("button", { name: "Create" });
    expect(create.hasAttribute("disabled")).toBe(true);
    fireEvent.click(create);
    expect(createProductMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Data Platform  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createProductMock).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "Data Platform" }),
      }),
    );
  });

  it("locks Create while it is in flight, so two clicks cannot write two rows", async () => {
    const request = deferred<unknown>();
    createProductMock.mockReturnValue(request.promise);
    renderPage();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Data Platform" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const creating = await screen.findByRole("button", { name: "Creating..." });
    expect(creating.hasAttribute("disabled")).toBe(true);
    fireEvent.click(creating);
    expect(createProductMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve({ ...product, id: "product-2", name: "Data Platform" }));
  });

  it("keeps the failed create dialog filled in so the retry is one click", async () => {
    createProductMock.mockRejectedValue(new Error("You do not have this capability"));
    renderPage();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Data Platform" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    // A sentence a person wrote survives the sanitizer; a driver string does not.
    expect(toastErrorMock.mock.calls[0][0]).toBe("You do not have this capability");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Data Platform");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("states the permission a role lacks up front, and leaves the server to decide", () => {
    routeContext.profile = { role: "sales" };
    renderPage();

    expect(
      screen.getAllByRole("note").some((node) => (node.textContent ?? "").includes("admin access")),
    ).toBe(true);
    // Deliberately still enabled: `permission_overrides` can grant an individual a capability
    // their role denies, and the client cannot see that table (BD-12).
    expect(screen.getByRole("button", { name: "Deactivate" }).hasAttribute("disabled")).toBe(false);
  });

  it("says nothing about permissions to a role that holds products.manage", () => {
    routeContext.profile = { role: "admin" };
    renderPage();

    expect(
      screen.queryAllByRole("note").some((node) => /admin access/.test(node.textContent ?? "")),
    ).toBe(false);
  });
});

describe("settings agent catalogue", () => {
  it("renders the catalogue read-only, with the reason BD-3 gives", async () => {
    renderPage();
    await waitFor(() => expect(getEffectiveAgentCatalogueMock).toHaveBeenCalled());

    await waitFor(() =>
      expect(
        screen
          .getAllByRole("note")
          .some((node) =>
            (node.textContent ?? "").includes(
              "These are the values the dispatch path enforces today. Changing them requires the " +
                "agents.configure capability and is not yet available from this page.",
            ),
          ),
      ).toBe(true),
    );
    // The two switches that wrote nothing but React state are gone, along with the badge that
    // re-rendered from them (IF-E1-21/22).
    expect(screen.queryAllByRole("switch")).toEqual([]);
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
  });

  /**
   * `AgentCatalogueTab` used to map `AGENT_DEFINITIONS` directly, so a paused agent still read
   * "Active" here while the dispatch path refused it. It now reads `getEffectiveAgentCatalogue`
   * through a `useQuery` on the same key `agents.$name.tsx`'s loader warms - this proves a
   * stored override actually reaches the render, not just the read model `loadAgentPolicies`
   * feeds (that path is covered separately in
   * `src/server/read-models/__tests__/agent-catalogue.test.ts`).
   */
  it("shows a stored 'inactive' override rather than the catalogue's own 'active' status", async () => {
    const target = AGENT_DEFINITIONS.find((agent) => agent.workflow_type === "qualify_lead");
    if (!target) throw new Error("fixture: qualify_lead missing from the catalogue");
    // The code catalogue says "active" for every entry today - assert the premise so this
    // test cannot pass by accident if that ever stops being true.
    expect(target.status).toBe("active");

    getEffectiveAgentCatalogueMock.mockResolvedValue(
      AGENT_DEFINITIONS.map((agent) =>
        agent.name === target.name ? { ...agent, status: "inactive" as const } : agent,
      ),
    );
    renderPage();

    const card = await waitFor(() => {
      const node = screen.getByText(target.display_name).closest("li");
      if (!node) throw new Error("agent card <li> not found");
      return node;
    });
    const badge = card.querySelector('[data-testid="status-badge"]');
    expect(badge?.textContent).toBe("inactive");
  });
});

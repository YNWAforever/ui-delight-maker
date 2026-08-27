// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import type { Campaign } from "@/lib/types";

const createCampaignMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const useSearchMock = vi.hoisted(() => vi.fn());
const useRouteContextMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/campaigns",
    useLoaderData: vi.fn(),
    useSearch: useSearchMock,
    useRouteContext: useRouteContextMock,
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
vi.mock("@/server-functions/campaigns", () => ({
  getCampaignsPage: vi.fn(),
  createCampaign: createCampaignMock,
}));

import { Route } from "../campaigns";

const makeCampaign = (overrides: Partial<Campaign> & Pick<Campaign, "id" | "name">): Campaign => ({
  type: "client_event",
  status: "active",
  objective: null,
  owner: "user-1",
  starts_at: "2026-07-01T00:00:00.000Z",
  ends_at: "2026-07-02T00:00:00.000Z",
  notes: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

const CAMPAIGNS: Campaign[] = [
  makeCampaign({ id: "campaign-1", name: "Spring Roadshow" }),
  makeCampaign({ id: "campaign-2", name: "Retail Webinar", status: "completed" }),
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
  createCampaignMock.mockReset();
  navigateMock.mockReset();
  navigateMock.mockResolvedValue(undefined);
  routerInvalidateMock.mockReset();
  routerInvalidateMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  useSearchMock.mockReturnValue({ page: 1, limit: 50 });
  useRouteContextMock.mockReturnValue({ profile: { id: "user-1", role: "client_success" } });
  vi.mocked(Route.useLoaderData).mockReturnValue({
    items: CAMPAIGNS,
    total: 137,
    page: 1,
    limit: 50,
  } as never);
});

afterEach(cleanup);

function renderCampaigns() {
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

/** Opens the create dialog and types a name into it. */
function openCreateDialog(name = "Autumn Roadshow") {
  fireEvent.click(screen.getAllByRole("button", { name: /new campaign/i })[0]);
  const field = screen.getByLabelText("Name");
  fireEvent.change(field, { target: { value: name } });
  return field;
}

const submitCreate = () => fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));

/** The invalidation filter this route is allowed to use — never a bare invalidate(). */
const invalidatedRouteIds = () =>
  routerInvalidateMock.mock.calls.map(([argument]) => {
    const filter = (argument as { filter: (match: { routeId: string }) => boolean }).filter;
    return ["/campaigns", "/campaigns/$id", "/leads", "/"].filter((routeId) => filter({ routeId }));
  });

describe("/campaigns create", () => {
  it("refreshes the index cache and this route's loader before navigating away", async () => {
    /**
     * IF-D2-15. `createCampaign` invalidated nothing, and the loader is cache-backed via
     * `ensureQueryData` with a 30s stale time, so returning to /campaigns inside that
     * window served the pre-create page: the campaign was missing from its own index.
     * Both halves are asserted because either alone leaves the bug — the query key
     * refreshes the cache entry, the scoped router invalidate re-runs the loader that
     * feeds `Route.useLoaderData()`.
     */
    createCampaignMock.mockResolvedValue({ id: "campaign-9" });
    const { invalidateQueries } = renderCampaigns();

    openCreateDialog();
    submitCreate();

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.campaigns.lists(),
    });
    expect(invalidatedRouteIds()).toEqual([["/campaigns"]]);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/campaigns/$id",
      params: { id: "campaign-9" },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Campaign created");
  });

  it("never sends an owner the server would discard", () => {
    /**
     * IF-D2-17. The dialog carried an Owner select whose value `createCampaign` overwrites
     * with `session.profile.id`, populated from a five-entry fixture whose ids match no
     * `profiles` row. Sending it was a lie about who would own the record.
     */
    createCampaignMock.mockResolvedValue({ id: "campaign-9" });
    renderCampaigns();

    openCreateDialog();
    // Scoped to the dialog: the toolbar keeps an Owner *filter*, which is a read path and
    // a different question from who the new record will belong to.
    expect(within(screen.getByRole("dialog")).queryByLabelText("Owner")).toBeNull();
    submitCreate();

    expect(createCampaignMock).toHaveBeenCalledTimes(1);
    const payload = createCampaignMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(payload).not.toHaveProperty("owner");
    expect(payload.name).toBe("Autumn Roadshow");
  });

  it("reports a failure without leaking the thrown text, and keeps the typed values", async () => {
    /**
     * IF-D2-16. `submit` had a `finally` and no `catch`: a rejected create — a
     * `campaigns.manage` denial is the everyday case — was an unhandled rejection, the
     * button went back to reading "Create campaign", and nothing said why.
     */
    createCampaignMock.mockRejectedValue(
      new Error('insert into campaigns violates foreign key constraint "campaigns_owner_fkey"'),
    );
    renderCampaigns();

    openCreateDialog();
    submitCreate();

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());

    const message = String(toastErrorMock.mock.calls[0][0]);
    expect(message).not.toMatch(/insert into|constraint|fkey/i);
    expect(message).toBe("Something went wrong. Please try again.");
    expect(navigateMock).not.toHaveBeenCalled();
    // The dialog is still open with the name intact, so the retry is one more click.
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Autumn Roadshow");
  });

  it("cannot be submitted twice while the first write is in flight", async () => {
    const pending = deferred<{ id: string }>();
    createCampaignMock.mockReturnValue(pending.promise);
    renderCampaigns();

    openCreateDialog();
    submitCreate();

    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Creating…" }));

    expect(createCampaignMock).toHaveBeenCalledTimes(1);
    pending.resolve({ id: "campaign-9" });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });

  it("refuses an end date before the start date instead of writing it", () => {
    createCampaignMock.mockResolvedValue({ id: "campaign-9" });
    renderCampaigns();

    openCreateDialog();
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-09-01" } });
    submitCreate();

    expect(createCampaignMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("The end date cannot be before the start date.");
  });
});

describe("/campaigns filters and counts", () => {
  it("reports the server total, not the number of rows it happens to hold", () => {
    /**
     * IF-D2-19. All three tiles counted `campaignPage.items`, so the tile labelled
     * "Campaigns" read 50 no matter how many existed, while `campaignPage.total` sat
     * unused two lines away. The page-scoped tiles now say "on this page".
     */
    renderCampaigns();

    expect(screen.getByText("137")).toBeTruthy();
    expect(screen.getAllByText("on this page").length).toBeGreaterThan(0);
  });

  it("shows the status the URL is actually filtered by", () => {
    // IF-D2-18: `status`, `type` and `owner` were validated, passed to the server and
    // honoured there, but no control in the file could set or show any of them.
    useSearchMock.mockReturnValue({ page: 1, limit: 50, status: "active" });
    renderCampaigns();

    expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("Active");
  });

  it("clears every server-side filter through the URL", () => {
    useSearchMock.mockReturnValue({
      page: 3,
      limit: 50,
      status: "active",
      type: "webinar",
      owner: "user-1",
    });
    renderCampaigns();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    const updater = navigateMock.mock.calls.at(-1)?.[0].search as (
      current: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(
      updater({ page: 3, limit: 50, status: "active", type: "webinar", owner: "user-1" }),
    ).toEqual({
      page: 1,
      limit: 50,
      status: undefined,
      type: undefined,
      owner: undefined,
    });
  });

  it("offers Owned by me rather than a roster of fixture users", () => {
    // The only other owner list in the codebase is APP_USERS, five hardcoded ids that
    // match no profile row — picking one filters the workspace to nothing.
    renderCampaigns();

    expect(screen.getByRole("combobox", { name: "Owner" }).textContent).toContain("All owners");
    expect(screen.queryByText("Ada Wong")).toBeNull();
  });
});

describe("/campaigns capability honesty", () => {
  it("disables creation with a reason for a role that cannot create", () => {
    useRouteContextMock.mockReturnValue({ profile: { id: "user-2", role: "read_only" } });
    renderCampaigns();

    const create = screen.getAllByRole("button", {
      name: /new campaign/i,
    })[0] as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText("Creating campaigns is not part of your role.")).toBeTruthy();
  });

  it("keeps creation enabled when the profile is unknown, because a per-user override can widen access", () => {
    useRouteContextMock.mockReturnValue({ profile: null });
    renderCampaigns();

    const create = screen.getAllByRole("button", {
      name: /new campaign/i,
    })[0] as HTMLButtonElement;
    expect(create.disabled).toBe(false);
  });
});

// @vitest-environment jsdom

/**
 * Write safety and cache discipline for the Accounts list.
 *
 * `toggleWorkspaceFavorite` deletes a row when one exists and inserts when it does not, so
 * two clicks in flight together net to zero while both requests race. The star had no
 * pending state, no `try`/`catch` and no toast on either outcome: the only feedback was the
 * icon changing once the loader happened to come back.
 *
 * Saving a personal view had the same shape from the other direction — the write landed but
 * nothing refreshed, so the view the user had just named was missing from its own dropdown
 * until a hard reload.
 */

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";

const captures = vi.hoisted(() => ({
  preview: null as Record<string, unknown> | null,
  viewSwitcher: null as Record<string, unknown> | null,
  queryOptions: [] as Array<Record<string, unknown>>,
}));
const togglePersonalWorkspaceFavorite = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const routerInvalidate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toastCalls = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastCalls }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    captures.queryOptions.push(options);
    return { data: undefined, isFetching: false, isError: false, error: null, refetch: vi.fn() };
  },
  useQueryClient: () => ({ getQueryData: vi.fn(), invalidateQueries }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
  }),
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  Outlet: () => null,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: routerInvalidate }),
}));

vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("@/server-functions/accounts-index", () => ({ getAccountsIndexRead: vi.fn() }));
vi.mock("@/server-functions/company-workspace", () => ({ getCompanyWorkspaceRead: vi.fn() }));
vi.mock("@/server-functions/workspace-preferences", () => ({
  togglePersonalWorkspaceFavorite,
}));
vi.mock("@/components/relationship/account-preview-panel", () => ({
  AccountPreviewPanel: (props: Record<string, unknown>) => {
    captures.preview = props;
    return null;
  },
}));
vi.mock("@/components/relationship/workspace-view-switcher", () => ({
  WorkspaceViewSwitcher: (props: Record<string, unknown>) => {
    captures.viewSwitcher = props;
    return null;
  },
}));

import { Route } from "../accounts";

const accounts = [
  {
    id: "account-1",
    name: "Northstar Media",
    domain: null,
    industry: "Marketing",
    tier: null,
    account_owner: null,
    cs_owner: null,
    lifecycle_stage: "active_client",
    relationship_health: 80,
    last_activity_at: "2026-07-10T00:00:00.000Z",
    next_action: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
  },
];

const search = { lifecycle: "active_client", page: 1, limit: 50, account: "account-1" };

function renderAccounts() {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    accounts,
    accountCounts: { "account-1": { linkedClientCount: 2, openSignalCount: 1 } },
    pagination: { page: 1, limit: 50, total: 1 },
    preferences: { favorites: [], views: [] },
  } as never);
  vi.mocked(Route.useSearch).mockReturnValue(search as never);
  const Component = Route.options.component as ComponentType;
  return render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  captures.preview = null;
  captures.viewSwitcher = null;
  captures.queryOptions = [];
  invalidateQueries.mockResolvedValue(undefined);
  routerInvalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Accounts list favorite toggle", () => {
  it("confirms the write and refreshes both the cache entry and the loader", async () => {
    togglePersonalWorkspaceFavorite.mockResolvedValue({ id: "favorite-1" });
    renderAccounts();

    await act(async () => {
      await (captures.preview?.onToggleFavorite as () => Promise<void>)();
    });

    expect(togglePersonalWorkspaceFavorite).toHaveBeenCalledWith({
      data: {
        kind: "account",
        label: "Northstar Media",
        href: "/accounts/account-1",
        accountId: "account-1",
      },
    });
    expect(toastCalls.success).toHaveBeenCalledWith("Added to favorites");

    // Favorites arrive with the loader read, so the cache alone cannot repaint the star.
    const keys = invalidateQueries.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(
      JSON.stringify(
        crmQueryKeys.accounts.list({
          q: undefined,
          lifecycle: "active_client",
          sort: undefined,
          page: 1,
          limit: 50,
        }),
      ),
    );
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    const filter = routerInvalidate.mock.calls[0][0].filter as (m: { routeId: string }) => boolean;
    expect(filter({ routeId: "/accounts" })).toBe(true);
    expect(filter({ routeId: "__root__" })).toBe(true);
    expect(filter({ routeId: "/leads" })).toBe(false);
  });

  it("locks the toggle so two clicks cannot race a delete against an insert", async () => {
    let release: (value: unknown) => void = () => {};
    togglePersonalWorkspaceFavorite.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderAccounts();

    const toggle = captures.preview?.onToggleFavorite as () => void;
    act(() => toggle());
    await waitFor(() => expect(captures.preview?.favoritePending).toBe(true));
    act(() => toggle());

    expect(togglePersonalWorkspaceFavorite).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ id: "favorite-1" });
    });
    await waitFor(() => expect(captures.preview?.favoritePending).toBe(false));
  });

  it("reports a failed toggle without leaking the thrown text", async () => {
    togglePersonalWorkspaceFavorite.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "workspace_favorites_pkey"'),
    );
    renderAccounts();

    await act(async () => {
      await (captures.preview?.onToggleFavorite as () => Promise<void>)();
    });

    expect(toastCalls.success).not.toHaveBeenCalled();
    const message = String(toastCalls.error.mock.calls.at(-1)?.[0]);
    expect(message).not.toMatch(/workspace_favorites/);
    expect(message).toBe("Something went wrong. Please try again.");
    await waitFor(() => expect(captures.preview?.favoritePending).toBe(false));
  });
});

describe("Accounts list saved views", () => {
  it("refreshes the loader and confirms the save, so a new view appears in its own list", async () => {
    renderAccounts();

    await act(async () => {
      await (captures.viewSwitcher?.onSaved as (name: string) => Promise<void>)("At-risk accounts");
    });

    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    expect(toastCalls.success).toHaveBeenCalledWith("Saved the view “At-risk accounts”");
  });
});

describe("Accounts list preview read", () => {
  it("reads the preview under the key Account 360 uses, not a second inline key", () => {
    // The preview used to be a bare Promise.all in a useEffect: uncached, refired whenever
    // the accounts array identity changed, and impossible to invalidate.
    renderAccounts();

    const previewOptions = captures.queryOptions.at(-1);
    expect(previewOptions?.queryKey).toEqual(
      crmQueryKeys.companyWorkspace.section("account-1", "overview"),
    );
    expect(previewOptions?.enabled).toBe(true);
  });
});

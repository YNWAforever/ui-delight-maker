// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";

/**
 * `/renewals` could not repaint after any of its four writes.
 *
 * The board rendered from `Route.useLoaderData()` with no `useQuery` and no `useRouter`
 * anywhere in the file, while "Mark renewed", "Mark ended", "Log touchpoint" and
 * "Re-score risk" all refreshed by invalidating `crmQueryKeys.renewals.lists()`.
 * Invalidating a React Query entry cannot push data into a router loader snapshot, so
 * every one of them toasted success over an unchanged card.
 *
 * Both halves of the fix are asserted here as behaviour, not as source text:
 *
 * 1. the board re-renders when the query the loader primes changes, which is the only
 *    thing that makes the children's existing invalidation reach the screen; and
 * 2. a child write refreshes that query *and* re-runs this route's loader, scoped by
 *    `routeId` so one renewal does not refetch every mounted loader in the app.
 */

const { navigateMock, routerInvalidateMock, getRenewalsReadMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(() => Promise.resolve()),
  getRenewalsReadMock: vi.fn(),
}));

const search = {
  risk: "all" as const,
  productId: "all",
  renewalWindow: "all" as const,
  page: 1,
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/renewals",
    useLoaderData: vi.fn(),
    useSearch: () => search,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ children }: { children?: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

vi.mock("@/server-functions/operations", () => ({ getRenewalsRead: getRenewalsReadMock }));

vi.mock("@/components/list-pagination", () => ({ ListPagination: () => null }));

/** The preview panel stands in for all four of its writes: it just reports "something changed". */
vi.mock("@/components/renewals/renewals-preview-panel", () => ({
  RenewalsPreviewPanel: ({ onChanged }: { onChanged?: () => void | Promise<void> }) => (
    <button type="button" onClick={() => void onChanged?.()}>
      simulate child write
    </button>
  ),
}));

vi.mock("@/components/sales", () => ({
  WorkspaceHeader: ({ description }: { description?: string }) => <p>{description}</p>,
  SectionHeader: () => null,
  MetricStrip: () => null,
  FilterToolbar: () => null,
  FilteredEmptyState: () => null,
  EmptyWorkspaceState: () => null,
  ErrorState: () => null,
  StaleDataIndicator: () => null,
  AttentionQueue: ({ items }: { items: Array<{ id: string; severity: string; age: string }> }) => (
    <ul aria-label="needs attention">
      {items.map((item) => (
        <li key={item.id}>{`${item.severity}: ${item.age}`}</li>
      ))}
    </ul>
  ),
  StatusBadge: ({ value }: { value?: string }) => <span>{value}</span>,
  ResponsiveRecordList: ({
    rows,
  }: {
    rows: Array<{ id: string; client_company_name: string; renewal_date: string | null }>;
  }) => (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>{`${row.client_company_name} renews ${row.renewal_date ?? "never"}`}</li>
      ))}
    </ul>
  ),
}));

import { Route } from "../renewals";

const filters = { ...search, limit: 50 };
const renewalsKey = crmQueryKeys.renewals.list(filters);

const engagement = {
  id: "eng-1",
  client_id: "client-1",
  product_id: "prod-1",
  owner: null,
  value: 12000,
  billing_period: "monthly",
  start_date: "2026-01-01",
  renewal_date: "2026-09-01",
  status: "active",
  health_score: 70,
  renewal_risk: "medium",
  risk_reasoning: null,
  next_action: null,
  last_touch_at: "2026-08-20",
  end_reason: null,
  lead_id: null,
  quote_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  client_company_name: "Harbour Foods",
  client_tier: "SME",
  product_name: "Social retainer",
};

const read = {
  rows: [engagement],
  total: 1,
  page: 1,
  limit: 50,
  products: [{ id: "prod-1", name: "Social retainer" }],
  metrics: { annualizedValue: 144000, arrAtRisk: 0, dueSoon: 1, stale: 0 },
  asOf: "2026-08-27",
};

function renderBoard() {
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
  routerInvalidateMock.mockResolvedValue(undefined);
  getRenewalsReadMock.mockReset();
  getRenewalsReadMock.mockResolvedValue(read);
  vi.mocked(Route.useLoaderData).mockReturnValue(read as never);
});

afterEach(cleanup);

describe("renewal board refresh", () => {
  it("renders from the query key the loader primes, so a cache update repaints the board", async () => {
    const { queryClient } = renderBoard();

    expect(screen.getByText("Harbour Foods renews 2026-09-01")).toBeTruthy();

    // Exactly what `invalidateQueries({ queryKey: crmQueryKeys.renewals.lists() })` in the
    // children ends up doing once the refetch lands. Under the old loader-only board this
    // could not change a single pixel.
    act(() => {
      queryClient.setQueryData(renewalsKey, {
        ...read,
        rows: [{ ...engagement, renewal_date: "2027-09-01", renewal_risk: "low" }],
      });
    });

    await waitFor(() => expect(screen.getByText("Harbour Foods renews 2027-09-01")).toBeTruthy());
  });

  it("refreshes the renewals query and re-runs only this route's loader after a child write", async () => {
    const { invalidateQueries } = renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "simulate child write" }));

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: crmQueryKeys.renewals.lists(),
      }),
    );
    await waitFor(() => expect(routerInvalidateMock).toHaveBeenCalledTimes(1));

    const [options] = routerInvalidateMock.mock.calls[0] as unknown as [
      { filter: (match: { routeId: string }) => boolean },
    ];
    expect(typeof options.filter).toBe("function");
    // Scoped, not a bare `router.invalidate()`: one renewal must not refetch every loader.
    expect(options.filter({ routeId: "/renewals" })).toBe(true);
    expect(options.filter({ routeId: "/leads" })).toBe(false);
  });

  it("derives Overdue from the server's as-of date rather than the rendering machine's clock", () => {
    // The route used to compute `new Date().toISOString().slice(0, 10)` during render, on
    // the server and again on the client. Here the two disagree on purpose: the clock says
    // the renewal is nine months past, the read says the business date is the day before it.
    // The queue must follow the read, otherwise a card hydrates into a different state than
    // it was server-rendered in.
    vi.setSystemTime(new Date("2027-06-01T00:00:00.000Z"));
    try {
      vi.mocked(Route.useLoaderData).mockReturnValue({ ...read, asOf: "2026-08-31" } as never);
      renderBoard();
      expect(screen.queryByText(/Renewal due/)).toBeNull();
    } finally {
      vi.useRealTimers();
      cleanup();
    }

    // And with an as-of date past the renewal, the same row is listed as needing attention.
    vi.mocked(Route.useLoaderData).mockReturnValue({ ...read, asOf: "2026-10-01" } as never);
    renderBoard();
    expect(screen.getByText(/^risk: Renewal due/)).toBeTruthy();
  });
});

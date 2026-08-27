// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";

/**
 * The one write on `/relationships`, and the three things that were wrong with it.
 *
 * 1. **The control was enabled for people who cannot use it.** The page loads on
 *    `accounts.view` + `engagements.view`; dismissing needs `engagements.update`, which is
 *    strictly stronger. A view-only user saw a live Dismiss button and got a generic
 *    "Could not dismiss signal" with no hint it was a permissions refusal. The read now
 *    reports the caller's decision and the button is not rendered when it is false.
 * 2. **Failures were unreadable.** The handler caught everything into one fixed sentence,
 *    so a Postgres error and a capability denial looked identical. Failures now go through
 *    `toSafeErrorMessage`, which is also what stops driver text reaching a toast.
 * 3. **The refresh could not be trusted.** The page's own snapshot was never refreshed, so
 *    a dismissed signal could reappear. Both the query and this route's loader refresh now,
 *    the latter scoped by `routeId`.
 */

const { navigateMock, routerInvalidateMock, dismissMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    routerInvalidateMock: vi.fn(),
    dismissMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }));

const search = { page: 1, severity: "all" as const, signalType: "all" as const };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/relationships",
    useLoaderData: vi.fn(),
    useSearch: () => search,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ children }: { children?: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));

vi.mock("@/server-functions/relationship-signals", () => ({
  dismissRelationshipSignalFn: dismissMock,
}));
vi.mock("@/server-functions/relationship-workspaces", () => ({
  getRelationshipIndexRead: vi.fn(),
}));
vi.mock("@/components/list-pagination", () => ({ ListPagination: () => null }));

vi.mock("@/components/sales", () => ({
  WorkspaceHeader: () => null,
  SectionHeader: () => null,
  MetricStrip: () => null,
  FilterToolbar: () => null,
  FilteredEmptyState: () => null,
  EmptyWorkspaceState: () => null,
  ErrorState: () => null,
  StaleDataIndicator: () => null,
  AttentionQueue: ({
    items,
  }: {
    items: Array<{ id: string; title: string; action?: ReactNode }>;
  }) => (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <span>{item.title}</span>
          {item.action}
        </li>
      ))}
    </ul>
  ),
}));

import { Route } from "../relationships";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const signal = {
  id: "signal-1",
  account_id: "account-1",
  signal_type: "missing_decision_maker",
  severity: "high",
  title: "Decision maker missing",
  reason: "Acme has no mapped decision maker.",
  suggested_action: "Identify and add the decision maker.",
  source: "deterministic",
  dedupe_key: "missing-decision-maker",
  dismissed_at: null,
  dismissed_by: null,
  dismissal_reason: null,
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
};

const readWith = (canDismissSignals: boolean) => ({
  items: [
    {
      account: {
        id: "account-1",
        name: "Acme",
        domain: null,
        industry: null,
        tier: null,
        account_owner: "profile-9",
        lifecycle_stage: "active_client",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      openSignalCount: 1,
      highestSeverity: "high",
      latestSignalAt: "2026-08-20T00:00:00.000Z",
      signalSummaries: [signal],
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  canDismissSignals,
});

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
  routerInvalidateMock.mockResolvedValue(undefined);
  dismissMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue(readWith(true) as never);
});

afterEach(cleanup);

const openDismissDialog = () => {
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  fireEvent.change(screen.getByLabelText("Dismissal reason"), {
    target: { value: "Contact confirmed by phone" },
  });
};

describe("relationship signal dismissal", () => {
  it("renders no dismiss control when the caller cannot update engagements", () => {
    vi.mocked(Route.useLoaderData).mockReturnValue(readWith(false) as never);
    renderPage();

    expect(screen.getByText(/Decision maker missing/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(screen.getByText(/not dismiss them/)).toBeTruthy();
  });

  it("writes through the server function and refreshes both the query and this route only", async () => {
    dismissMock.mockResolvedValue({ id: "signal-1" });
    const { invalidateQueries } = renderPage();

    openDismissDialog();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss signal" }));

    await waitFor(() =>
      expect(dismissMock).toHaveBeenCalledWith({
        data: { id: "signal-1", reason: "Contact confirmed by phone" },
      }),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: crmQueryKeys.relationships.lists(),
      }),
    );
    await waitFor(() => expect(routerInvalidateMock).toHaveBeenCalledTimes(1));

    const [options] = routerInvalidateMock.mock.calls[0] as unknown as [
      { filter: (match: { routeId: string }) => boolean },
    ];
    expect(options.filter({ routeId: "/relationships" })).toBe(true);
    expect(options.filter({ routeId: "/accounts" })).toBe(false);
    expect(toastSuccessMock).toHaveBeenCalledWith("Signal dismissed");
  });

  it("locks the control while the write is in flight so one click is one dismissal", async () => {
    const request = deferred<unknown>();
    dismissMock.mockReturnValue(request.promise);
    renderPage();

    openDismissDialog();
    const confirm = screen.getByRole("button", { name: /Dismiss/ });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Dismissing…" }).hasAttribute("disabled")).toBe(
        true,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismissing…" }));
    expect(dismissMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve({ id: "signal-1" }));
  });

  it("keeps the dialog open on failure and never puts driver text in the toast", async () => {
    dismissMock.mockRejectedValue(
      new Error("permission denied for table relationship_signals (SQLSTATE 42501)"),
    );
    renderPage();

    openDismissDialog();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss signal" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).not.toContain("permission denied");
    expect(message).not.toContain("relationship_signals");
    expect(message).toBe("Something went wrong. Please try again.");

    // Still open, with the typed reason intact, so the retry is one click.
    expect((screen.getByLabelText("Dismissal reason") as HTMLInputElement).value).toBe(
      "Contact confirmed by phone",
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("refuses to write without a reason", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("button", { name: "Dismiss signal" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(dismissMock).not.toHaveBeenCalled();
  });
});

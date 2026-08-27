// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/notifications` had a real loader, a real search schema and a careful hook - and then
 * bound both of its writes straight to `onClick` (IF-E2-51). The hook does a token-guarded
 * optimistic update with a real rollback and rethrows on failure, so what the user saw was a
 * row flipping to read and silently flipping back: a UI glitch rather than a reported
 * failure. Repeat clicks fired repeat writes.
 *
 * The second defect was the "Open" button (IF-E2-52): `<Link to={notificationLink(n) as never}>`
 * switched off the router's link type checking for the whole page, and behind the cast an
 * unknown object type linked `/notifications` to itself.
 */

const {
  navigateMock,
  routerInvalidateMock,
  markAsReadMock,
  markAllReadMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  markAsReadMock: vi.fn(),
  markAllReadMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

const search = { filter: "all" as string };
const hookState = {
  notifications: [] as Array<Record<string, unknown>>,
  unreadCount: 0,
};
const captures = { metrics: null as Array<Record<string, unknown>> | null };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/notifications",
    useLoaderData: vi.fn(),
    useSearch: () => search,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({
    notifications: hookState.notifications,
    unreadCount: hookState.unreadCount,
    markAsRead: markAsReadMock,
    markAllRead: markAllReadMock,
    refresh: vi.fn(),
    isFetching: false,
    dataUpdatedAt: 1_770_000_000_000,
  }),
}));
vi.mock("@/hooks/use-client-now", () => ({ useClientNow: () => null }));
vi.mock("@/server-functions/notifications", () => ({ getNotifications: vi.fn() }));

vi.mock("@/components/sales", () => ({
  EmptyWorkspaceState: ({ title }: { title: string }) => <p>{title}</p>,
  ErrorState: () => null,
  FilteredEmptyState: ({ filterSummary }: { filterSummary?: string }) => (
    <p>Filtered to nothing: {filterSummary}</p>
  ),
  FilterToolbar: ({
    filters,
  }: {
    filters: Array<{ id: string; options: Array<{ value: string; label: string }> }>;
  }) => <div data-testid="filter-options">{filters[0].options.length}</div>,
  MetricStrip: ({ metrics }: { metrics: Array<Record<string, unknown>> }) => {
    captures.metrics = metrics;
    return null;
  },
  StaleDataIndicator: () => null,
  WorkspaceHeader: ({ title, primaryAction }: { title: string; primaryAction?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {primaryAction}
    </div>
  ),
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

import { Route } from "../notifications";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const notification = (overrides: Record<string, unknown> = {}) => ({
  id: "notification-1",
  user_id: "profile-1",
  type: "approval_pending",
  title: "Quote send waiting on you",
  body: null,
  object_type: "approval",
  object_id: "approval-1",
  dedupe_key: null,
  read_at: null,
  created_at: "2026-08-20T10:00:00.000Z",
  ...overrides,
});

function renderPage() {
  const Component = Route.options.component as ComponentType;
  render(<Component />);
}

beforeEach(() => {
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  markAsReadMock.mockReset();
  markAsReadMock.mockResolvedValue(undefined);
  markAllReadMock.mockReset();
  markAllReadMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  search.filter = "all";
  hookState.notifications = [notification()];
  hookState.unreadCount = 1;
  captures.metrics = null;
});

afterEach(cleanup);

describe("marking one notification read", () => {
  it("writes through the hook and locks the row while it is in flight", async () => {
    const request = deferred<unknown>();
    markAsReadMock.mockReturnValue(request.promise);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Mark read/ }));
    expect(markAsReadMock).toHaveBeenCalledWith("notification-1");

    const marking = await screen.findByRole("button", { name: /Marking/ });
    expect(marking.hasAttribute("disabled")).toBe(true);
    fireEvent.click(marking);
    expect(markAsReadMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve(undefined));
  });

  it("reports the rollback instead of letting it read as a glitch", async () => {
    markAsReadMock.mockRejectedValue(
      new Error("permission denied for table notifications (SQLSTATE 42501)"),
    );
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Mark read/ }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).toBe("Something went wrong. Please try again.");
    expect(message).not.toContain("permission denied");
    expect(message).not.toContain("notifications");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe("marking everything read", () => {
  it("confirms how many rows it changed", async () => {
    hookState.unreadCount = 3;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));

    await waitFor(() => expect(markAllReadMock).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith("Marked 3 notifications read");
  });

  it("offers nothing to do when nothing is unread", () => {
    hookState.unreadCount = 0;
    hookState.notifications = [notification({ read_at: "2026-08-21T00:00:00.000Z" })];
    renderPage();

    expect(screen.getByRole("button", { name: /Mark all read/ }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: /^Mark read/ })).toBeNull();
  });

  it("sanitizes a failure rather than leaving the rollback unexplained", async () => {
    hookState.unreadCount = 2;
    markAllReadMock.mockRejectedValue(new Error("relation notifications does not exist"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock.mock.calls[0][0]).toBe("Something went wrong. Please try again.");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe("where a notification opens", () => {
  it("names the destination it can actually reach for an engagement", () => {
    hookState.notifications = [
      notification({ object_type: "engagement", object_id: "engagement-1" }),
    ];
    renderPage();

    // Labelled for the board, not for the engagement: there is no engagement detail route,
    // so promising the record would be a lie the link cannot keep.
    const link = screen.getByRole("link", { name: "Open renewals" });
    expect(link.getAttribute("href")).toBe("/renewals");
  });

  it("renders no Open button for an object type with nowhere to go", () => {
    hookState.notifications = [notification({ object_type: "quote", object_id: "quote-1" })];
    renderPage();

    // The old default branch linked /notifications back to itself.
    expect(screen.queryByRole("link", { name: /^Open/ })).toBeNull();
  });

  it("carries the record id into a typed route param", () => {
    hookState.notifications = [notification({ object_type: "lead", object_id: "lead-9" })];
    renderPage();

    expect(screen.getByRole("link", { name: "Open lead" })).toBeTruthy();
  });
});

describe("empty and filtered states", () => {
  it("distinguishes an empty inbox from a filter that matched nothing", () => {
    hookState.notifications = [];
    hookState.unreadCount = 0;
    renderPage();
    expect(screen.getByText("No notifications")).toBeTruthy();
    cleanup();

    hookState.notifications = [notification()];
    hookState.unreadCount = 1;
    search.filter = "risk_change";
    renderPage();
    expect(screen.getByText(/Filtered to nothing/)).toBeTruthy();
    expect(screen.queryByText("No notifications")).toBeNull();
  });
});

describe("what the metric strip claims", () => {
  it("separates the server's unread total from the fifty rows this page holds", () => {
    hookState.unreadCount = 12;
    hookState.notifications = [notification(), notification({ id: "notification-2" })];
    renderPage();

    const metrics = captures.metrics ?? [];
    const unread = metrics.find((metric) => metric.id === "unread");
    const loaded = metrics.find((metric) => metric.id === "loaded");

    // `countUnreadNotifications` is a server-side count over every row.
    expect(unread?.value).toBe(12);
    // `listNotifications` takes `limit = 50`, so this one says so rather than posing as a
    // workspace total.
    expect(loaded?.value).toBe(2);
    expect(loaded?.hint).toBe("most recent 50");
  });
});

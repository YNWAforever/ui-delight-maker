// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationRecord } from "@/lib/types";

const { navigateMock, markAsReadMock, markAllReadMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    markAsReadMock: vi.fn(),
    markAllReadMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }));

const hookState = {
  notifications: [] as NotificationRecord[],
  unreadCount: 0,
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
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
  }),
}));

// The bell renders an absolute timestamp until the client clock resolves; the assertions
// here are about targets and writes, not about relative time.
vi.mock("@/hooks/use-client-now", () => ({ useClientNow: () => null }));

import { NotificationBell } from "../notification-bell";

const notification = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
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

function openBell() {
  const view = render(<NotificationBell />);
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  return view;
}

function row() {
  return screen.getByRole("button", { name: /Quote send waiting on you/ });
}

beforeEach(() => {
  navigateMock.mockReset();
  markAsReadMock.mockReset();
  markAsReadMock.mockResolvedValue(undefined);
  markAllReadMock.mockReset();
  markAllReadMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  hookState.notifications = [notification()];
  hookState.unreadCount = 1;
});

afterEach(cleanup);

describe("a notification with no resolvable target", () => {
  const unresolvedCases: Array<[string, Partial<NotificationRecord>]> = [
    ["a client with no object id", { object_type: "client", object_id: null }],
    ["a lead with a blank object id", { object_type: "lead", object_id: "  " }],
    ["an unknown object type", { object_type: "quote", object_id: "quote-1" }],
  ];

  it.each(unresolvedCases)("marks %s read without navigating", async (_label, overrides) => {
    // The removed local resolver built "/clients/null" and "/leads/null", and its default
    // branch linked /notifications back to itself. A null target is a row, not a link.
    hookState.notifications = [notification(overrides)];
    openBell();

    fireEvent.click(row());

    await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith("notification-1"));
    expect(navigateMock).not.toHaveBeenCalled();
    // Still open: there was nowhere to go, so the panel is not dismissed as if there were.
    expect(screen.getByText("Quote send waiting on you")).toBeTruthy();
    expect(document.querySelector('a[href*="/null"]')).toBeNull();
  });
});

describe("a notification with a real target", () => {
  it("carries the record id into the typed route it opens", async () => {
    hookState.notifications = [notification({ object_type: "lead", object_id: "lead-9" })];
    openBell();

    fireEvent.click(row());

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: "/leads/$id", params: { id: "lead-9" } }),
    );
    expect(markAsReadMock).toHaveBeenCalledWith("notification-1");
  });

  it("does not rewrite an already-read row, and still navigates", async () => {
    hookState.notifications = [
      notification({
        object_type: "client",
        object_id: "client-3",
        read_at: "2026-08-21T00:00:00.000Z",
      }),
    ];
    hookState.unreadCount = 0;
    openBell();

    fireEvent.click(row());

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/clients/$id",
        params: { id: "client-3" },
      }),
    );
    expect(markAsReadMock).not.toHaveBeenCalled();
  });
});

describe("an approval escalation", () => {
  const escalation = (overrides: Partial<NotificationRecord> = {}): NotificationRecord =>
    notification({
      type: "approval_escalated",
      title: "Approval overdue: quote send",
      object_type: "approval",
      object_id: "approval-7",
      ...overrides,
    });

  it("uses the overdue-clock icon, not the pending shield", () => {
    hookState.notifications = [escalation()];
    const { container } = openBell();

    expect(container.querySelector(".lucide-alarm-clock")).toBeTruthy();
    expect(container.querySelector(".lucide-shield-alert")).toBeNull();
  });

  it("marks it read and opens the approvals desk", async () => {
    hookState.notifications = [escalation()];
    openBell();

    fireEvent.click(screen.getByRole("button", { name: /Approval overdue: quote send/ }));

    await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith("notification-1"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/approvals" }));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("does not rewrite an already-read escalation but still navigates", async () => {
    hookState.notifications = [escalation({ read_at: "2026-08-21T00:00:00.000Z" })];
    hookState.unreadCount = 0;
    openBell();

    fireEvent.click(screen.getByRole("button", { name: /Approval overdue: quote send/ }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/approvals" }));
    expect(markAsReadMock).not.toHaveBeenCalled();
  });
});

describe("failed writes", () => {
  it("reports a failed mark-read and keeps the panel open instead of navigating", async () => {
    markAsReadMock.mockRejectedValue(
      new Error("permission denied for table notifications (SQLSTATE 42501)"),
    );
    openBell();

    fireEvent.click(row());

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).toBe("Something went wrong. Please try again.");
    expect(message).not.toContain("permission denied");
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText("Quote send waiting on you")).toBeTruthy();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("reports a failed mark-all rather than leaving the rollback unexplained", async () => {
    hookState.unreadCount = 3;
    markAllReadMock.mockRejectedValue(new Error("relation notifications does not exist"));
    openBell();

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock.mock.calls[0][0]).toBe("Something went wrong. Please try again.");
    expect(screen.getByText("Quote send waiting on you")).toBeTruthy();
  });
});

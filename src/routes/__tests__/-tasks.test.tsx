// @vitest-environment jsdom

import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateTaskMock = vi.hoisted(() => vi.fn());
const createTaskMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/tasks",
    useLoaderData: vi.fn(),
    useSearch: () => ({ priority: "all", assignee: "all" }),
  }),
  useNavigate: () => navigateMock,
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/sales", () => ({
  CommandHeader: () => null,
  MetricStrip: () => null,
  WorkSurfaceEmpty: () => null,
}));
vi.mock("@/components/status-badge", () => ({ StatusBadge: () => null }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));
vi.mock("@/lib/business-date", () => ({ getBusinessDateKey: () => "2026-07-14" }));
vi.mock("@/lib/format", () => ({ formatDate: (value: string | null) => value ?? "" }));
vi.mock("@/lib/sales-workspace", () => ({
  getTaskBoardMetrics: () => ({ open: 1, overdue: 0, dueToday: 0, aiCreated: 0 }),
}));
vi.mock("@/lib/users", () => ({ APP_USERS: [], userById: () => undefined }));
vi.mock("@/server-functions/tasks", () => ({
  getTasks: vi.fn(),
  createTask: createTaskMock,
  updateTask: updateTaskMock,
}));

import { Route } from "../tasks";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tasks = [
  {
    id: "task-1",
    title: "Call Northstar",
    description: "Follow up",
    status: "open",
    priority: "high",
    due_date: "2026-07-15",
    assigned_to: null,
    created_by_agent: null,
  },
  {
    id: "task-2",
    title: "Prepare renewal",
    description: "Draft renewal",
    status: "in_progress",
    priority: "medium",
    due_date: "2026-07-16",
    assigned_to: null,
    created_by_agent: null,
  },
];

beforeEach(() => {
  updateTaskMock.mockReset();
  createTaskMock.mockReset();
  navigateMock.mockReset();
  toastErrorMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue(tasks as never);
});

afterEach(cleanup);

describe("Task board move reliability", () => {
  const renderBoard = () => {
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
  };

  it("moves optimistically, locks duplicate input, and invalidates task caches after success", async () => {
    const request = deferred<unknown>();
    updateTaskMock.mockReturnValue(request.promise);
    const { invalidateQueries } = renderBoard();

    fireEvent.keyDown(screen.getByRole("button", { name: /Call Northstar — Open/ }), {
      key: "ArrowRight",
    });

    const pending = await screen.findByRole("button", { name: /Call Northstar — In progress/ });
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.getAttribute("draggable")).toBe("false");
    expect(pending.tabIndex).toBe(-1);
    fireEvent.keyDown(pending, { key: "ArrowRight" });
    expect(updateTaskMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve(undefined));
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(2));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks", "detail", "task-1"],
      exact: true,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tasks", "list"] });
    expect(
      screen
        .getByRole("button", { name: /Call Northstar — In progress/ })
        .getAttribute("aria-busy"),
    ).toBe("false");
  });

  it("rolls back only the failed task and shows the failure toast", async () => {
    const request = deferred<unknown>();
    updateTaskMock.mockReturnValue(request.promise);
    const { invalidateQueries } = renderBoard();

    fireEvent.keyDown(screen.getByRole("button", { name: /Call Northstar — Open/ }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("button", { name: /Prepare renewal — In progress/ })).toBeTruthy();

    await act(async () => request.reject(new Error("network")));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Call Northstar — Open/ })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Prepare renewal — In progress/ })).toBeTruthy();
    expect(toastErrorMock).toHaveBeenCalledWith("Task move failed. Try again.");
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
  it("preserves a later successful move when an earlier move rolls back", async () => {
    const firstRequest = deferred<unknown>();
    const secondRequest = deferred<unknown>();
    updateTaskMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    renderBoard();

    fireEvent.keyDown(screen.getByRole("button", { name: /Call Northstar — Open/ }), {
      key: "ArrowRight",
    });
    fireEvent.keyDown(screen.getByRole("button", { name: /Prepare renewal — In progress/ }), {
      key: "ArrowRight",
    });

    await act(async () => secondRequest.resolve(undefined));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Prepare renewal — Done/ })).toBeTruthy(),
    );
    await act(async () => firstRequest.reject(new Error("network")));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Call Northstar — Open/ })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Prepare renewal — Done/ })).toBeTruthy();
  });
});

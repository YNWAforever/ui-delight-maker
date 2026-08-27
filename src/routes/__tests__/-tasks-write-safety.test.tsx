// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Three rules `/tasks` did not hold.
 *
 * - **Which view you are looking at belongs in the URL.** A board and a list are two
 *   readings of one queue; held in component state neither survives a refresh or a shared
 *   link.
 * - **Creating a task was unguarded and, worse, could not succeed.** `submit` had no
 *   in-flight flag and no `catch`, so a rejection was an unhandled rejection with the
 *   dialog still open and nothing said, and two clicks made two tasks. The assignee Select
 *   also defaulted to a fixture UUID present in no seed, while `tasks.assigned_to` is
 *   `text references profiles(id)` — so every create was writing an id the foreign key
 *   could not resolve.
 * - **An assigned task must show its owner.** The name lookup ran against the same fixture
 *   roster, so a genuinely-assigned task rendered a blank owner cell.
 */

const {
  navigateMock,
  routerInvalidateMock,
  createTaskMock,
  updateTaskMock,
  getTasksMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  createTaskMock: vi.fn(),
  updateTaskMock: vi.fn(),
  getTasksMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

const search: { view: "board" | "list"; priority: string; assignee: string } = {
  view: "board",
  priority: "all",
  assignee: "all",
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/tasks",
    useLoaderData: vi.fn(),
    useSearch: () => search,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));

vi.mock("@/server-functions/tasks", () => ({
  getTasks: getTasksMock,
  createTask: createTaskMock,
  updateTask: updateTaskMock,
}));

vi.mock("@/lib/business-date", () => ({ getBusinessDateKey: () => "2026-07-14" }));
vi.mock("@/lib/sales-workspace", () => ({
  getTaskBoardMetrics: () => ({ open: 1, overdue: 0, dueToday: 0, highPriority: 0 }),
}));

vi.mock("@/components/sales", () => ({
  WorkspaceHeader: ({ primaryAction }: { primaryAction?: ReactNode }) => <div>{primaryAction}</div>,
  SectionHeader: ({ title, action }: { title?: string; action?: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {action}
    </div>
  ),
  MetricStrip: () => null,
  FilterToolbar: () => null,
  FilteredEmptyState: () => null,
  EmptyWorkspaceState: () => null,
  ErrorState: () => null,
  StaleDataIndicator: () => null,
  RowActionsMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ResponsiveRecordList: ({
    rows,
    columns,
  }: {
    rows: Array<Record<string, unknown>>;
    columns: Array<{ id: string; cell: (row: Record<string, unknown>) => ReactNode }>;
  }) => (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row.id)} data-testid="task-row">
            {columns.map((column) => (
              <td key={column.id} data-testid={`cell-${column.id}`}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
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
    assigned_to: "profile-42",
    created_by_agent: null,
  },
];

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

const openCreateDialog = () => {
  fireEvent.click(screen.getByRole("button", { name: /New task/ }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renewal check-in" } });
};

beforeEach(() => {
  search.view = "board";
  search.priority = "all";
  search.assignee = "all";
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  getTasksMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue(tasks as never);
});

afterEach(cleanup);

describe("task view switcher", () => {
  it("writes the chosen view into the URL rather than component state", () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "List" }));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0][0] as {
      replace?: boolean;
      search: (current: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({ view: "board", priority: "all", assignee: "all" })).toEqual({
      view: "list",
      priority: "all",
      assignee: "all",
    });
  });

  it("renders the board or the list according to the search param, not a local toggle", () => {
    renderBoard();
    // The board is a set of draggable cards, each exposing the arrow-key affordance.
    expect(screen.getByRole("button", { name: /Call Northstar — Open/ })).toBeTruthy();
    expect(screen.queryAllByTestId("task-row")).toHaveLength(0);

    cleanup();
    search.view = "list";
    renderBoard();
    expect(screen.queryByRole("button", { name: /Call Northstar — Open/ })).toBeNull();
    expect(screen.getAllByTestId("task-row")).toHaveLength(1);
  });

  it("shows the owner an assigned task actually has", () => {
    search.view = "list";
    renderBoard();

    // Previously `userById(task.assigned_to)?.name` against a fixture roster: always blank.
    expect(screen.getByTestId("cell-owner").textContent).toBe("profile-42");
  });
});

describe("task creation safety", () => {
  it("locks the submit while the create is in flight so two clicks make one task", async () => {
    const request = deferred<unknown>();
    createTaskMock.mockReturnValue(request.promise);
    renderBoard();

    openCreateDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const pending = await screen.findByRole("button", { name: "Creating…" });
    expect(pending.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pending);
    expect(createTaskMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve({ ...tasks[0], id: "task-2" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Task created"));
  });

  it("leaves an unassigned task unassigned instead of writing a fixture profile id", async () => {
    createTaskMock.mockResolvedValue({ ...tasks[0], id: "task-2" });
    renderBoard();

    openCreateDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createTaskMock).toHaveBeenCalledTimes(1));
    const payload = createTaskMock.mock.calls[0][0] as { data: { assigned_to?: string } };
    expect(payload.data.assigned_to).toBeUndefined();
  });

  it("reports a failed create through the sanitizer and keeps the dialog open", async () => {
    createTaskMock.mockRejectedValue(
      new Error("insert into tasks (title) values ($1) — violates foreign key constraint"),
    );
    renderBoard();

    openCreateDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).not.toContain("insert into");
    expect(message).not.toContain("foreign key");
    expect(message).toBe("Something went wrong. Please try again.");

    // The typed title survives, so the retry does not start from scratch.
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Renewal check-in");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

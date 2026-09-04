// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getTasks` (`src/server-functions/tasks.ts`) nulls `title` and `description` and sets
 * `restricted: true` on a task row the reader's own `tasks.view` denies — redaction is against
 * the task's own ownership (`resourceType: "task"`, `tasks.assigned_to`), not any record the
 * task points at. `/tasks` is supposed to show dedicated copy for that state, in both the
 * board and the list view, rather than falling through to an empty title/description or to
 * whatever a genuinely blank description renders as.
 *
 * Harness cloned from `-tasks-write-safety.test.tsx`, which already mounts this route end to
 * end via `Route.options.component` and stubs `ResponsiveRecordList` to render every column's
 * `cell` function into a real `<table>` — exactly what the list view needs to be inspectable.
 * The board view renders its cards directly inside `tasks.tsx` (not through `@/components/sales`
 * at all), so nothing further needs stubbing to reach it.
 */

const { navigateMock, routerInvalidateMock, getTasksMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  getTasksMock: vi.fn(),
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
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

vi.mock("@/server-functions/tasks", () => ({
  getTasks: getTasksMock,
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("@/lib/business-date", () => ({ getBusinessDateKey: () => "2026-09-02" }));
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

const RESTRICTED_TITLE = "Task restricted.";
const RESTRICTED_DESCRIPTION = "Restricted. You do not have permission to view this task.";

const tasks = [
  {
    id: "task-visible",
    title: "Call Northstar",
    description: "Follow up",
    status: "open",
    priority: "high",
    due_date: "2026-09-05",
    assigned_to: "profile-1",
    account_id: "account-1",
    created_by_agent: null,
    restricted: false,
  },
  {
    id: "task-restricted",
    title: null,
    description: null,
    status: "in_progress",
    priority: "medium",
    due_date: "2026-09-10",
    assigned_to: "profile-2",
    account_id: "account-2",
    created_by_agent: null,
    restricted: true,
  },
];

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  search.view = "board";
  search.priority = "all";
  search.assignee = "all";
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  getTasksMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue(tasks as never);
});

afterEach(cleanup);

describe("/tasks renders the redaction copy `restricted: true` implies", () => {
  it("shows restricted copy on the board, not an empty title or description", () => {
    renderBoard();

    expect(screen.getByText(RESTRICTED_TITLE)).toBeTruthy();
    expect(screen.getByText(RESTRICTED_DESCRIPTION)).toBeTruthy();
    // The unrestricted neighbour is untouched.
    expect(screen.getByText("Call Northstar")).toBeTruthy();
    expect(screen.getByText("Follow up")).toBeTruthy();
  });

  it("shows restricted copy in the list view too", () => {
    search.view = "list";
    renderBoard();

    expect(screen.getAllByTestId("task-row")).toHaveLength(2);
    const cells = screen.getAllByTestId("cell-task");
    const restrictedCell = cells.find((cell) => cell.textContent?.includes(RESTRICTED_TITLE));
    const visibleCell = cells.find((cell) => cell.textContent?.includes("Call Northstar"));

    expect(restrictedCell?.textContent).toContain(RESTRICTED_DESCRIPTION);
    expect(visibleCell?.textContent).not.toContain(RESTRICTED_TITLE);
    expect(visibleCell?.textContent).toContain("Follow up");
  });
});

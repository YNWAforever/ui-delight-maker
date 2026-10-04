import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { ProfileSearchCombobox } from "@/components/people/profile-search-combobox";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/operations/bulk-action-bar";
import { remainingBulkSelection } from "@/components/operations/bulk-results";
import { BulkPreviewDialog } from "@/components/operations/bulk-preview-dialog";
import { useBulkOperation } from "@/components/operations/use-bulk-operation";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate } from "@/lib/format";
import { getBusinessDateKey } from "@/lib/business-date";
import { invalidateLinkedCompanyWorkspaceMutation } from "@/lib/company-workspace/invalidation";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getDerivedStatusLabel, getStatusLabel, isOverdue } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import { getTasksPage, createTask, updateTask } from "@/server-functions/tasks";
import type { TaskListItem } from "@/server-functions/tasks";
import type { Task, TaskStatus } from "@/lib/types";

/** Board/list and filters live in the URL so refresh and shared links retain the queue. */
const taskSearchSchema = z.object({
  view: z.enum(["board", "list"]).default("board").catch("board"),
  priority: z.enum(["all", "high", "medium", "low"]).default("all").catch("all"),
  assignee: z.string().default("all").catch("all"),
  search: z.string().default("").catch(""),
});

type TaskSearch = z.infer<typeof taskSearchSchema>;

type QueuePage = { items: TaskListItem[]; nextCursor: string | null; total: number };
type QueueData =
  | { view: "list"; page: QueuePage }
  | { view: "board"; lanes: Record<TaskStatus, QueuePage> };
const QUEUE_STATUSES: TaskStatus[] = ["open", "in_progress", "done"];

const getTaskReadInput = (filters: TaskSearch, status?: TaskStatus, cursor?: string) => ({
  priority: filters.priority === "all" ? undefined : filters.priority,
  assigned_to: filters.assignee === "all" ? undefined : filters.assignee,
  search: filters.search.trim() || undefined,
  status,
  cursor,
  limit: 50,
});

async function fetchTaskQueue(filters: TaskSearch): Promise<QueueData> {
  if (filters.view === "list") {
    return { view: "list", page: await getTasksPage({ data: getTaskReadInput(filters) }) };
  }
  const pages = await Promise.all(
    QUEUE_STATUSES.map((status) => getTasksPage({ data: getTaskReadInput(filters, status) })),
  );
  return {
    view: "board",
    lanes: { open: pages[0], in_progress: pages[1], done: pages[2] },
  };
}

function queueRows(data: QueueData): TaskListItem[] {
  return data.view === "list"
    ? data.page.items
    : QUEUE_STATUSES.flatMap((status) => data.lanes[status].items);
}

function mapQueueRows(
  data: QueueData,
  transform: (rows: TaskListItem[]) => TaskListItem[],
): QueueData {
  if (data.view === "list")
    return { ...data, page: { ...data.page, items: transform(data.page.items) } };
  return {
    ...data,
    lanes: Object.fromEntries(
      QUEUE_STATUSES.map((status) => [
        status,
        { ...data.lanes[status], items: transform(data.lanes[status].items) },
      ]),
    ) as Record<TaskStatus, QueuePage>,
  };
}

export const Route = createFileRoute("/tasks")({
  // Keep authorization and queue loading on the server; render the interactive
  // board once in the browser instead of sending all cards again as HTML.
  ssr: "data-only",
  pendingMinMs: 0,
  pendingComponent: TasksPendingState,
  validateSearch: taskSearchSchema,
  // `view` is deliberately not a dep: it changes what is drawn, never what is fetched.
  loaderDeps: ({ search }) => ({
    priority: search.priority,
    assignee: search.assignee,
    search: search.search,
    view: search.view,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.tasks.list(deps),
        queryFn: () => fetchTaskQueue(deps),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Tasks — Fimmick ClientOps" },
      {
        name: "description",
        content: "Board and list views of open, in-progress and completed tasks.",
      },
    ],
  }),
  errorComponent: TasksErrorState,
  component: TasksBoard,
});

function TasksPendingState() {
  return (
    <div role="status" className="px-4 py-6 text-sm text-muted-foreground md:px-6">
      Loading tasks…
    </div>
  );
}

/** `getTasks` hard-requires `tasks.view` and throws; the sidebar shows the entry regardless. */
function TasksErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Tasks did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/tasks" });
        }}
      />
    </div>
  );
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "open", label: getStatusLabel("tasks", "open").label },
  { id: "in_progress", label: getStatusLabel("tasks", "in_progress").label },
  { id: "done", label: getStatusLabel("tasks", "done").label },
];

const OVERDUE_LABEL = getDerivedStatusLabel("overdue").label;

/**
 * The wording `getTasks` implies with `restricted: true`, matched to the short/long split
 * `/ai-review` and `/agents` already use for this same distinction: a compact label for a
 * name-sized slot, and a full sentence for a body-sized one. Task rows are gated on the
 * task's own ownership (`tasks.view` against `resourceType: "task"`), not a record the task
 * points at, so this says "this task", not "a record".
 */
const RESTRICTED_TASK_TITLE = "Task restricted.";
const RESTRICTED_TASK_DESCRIPTION = "Restricted. You do not have permission to view this task.";

function taskTitle(task: TaskListItem): string {
  return task.restricted ? RESTRICTED_TASK_TITLE : (task.title ?? "");
}

function taskDescription(task: TaskListItem): string | null {
  return task.restricted ? RESTRICTED_TASK_DESCRIPTION : task.description;
}
function taskOwnerName(task: TaskListItem): string {
  if (!task.assigned_to) return "Unassigned";
  const named = task as TaskListItem & { owner_display_name?: string | null };
  return named.owner_display_name || "Name unavailable";
}

const replaceOnlyTaskStatus = (tasks: TaskListItem[], id: string, status: TaskStatus) =>
  tasks.map((task) => (task.id === id ? { ...task, status } : task));

function TasksBoard() {
  const loaderTasks = Route.useLoaderData();
  const { capabilities = [] } = Route.useRouteContext();
  const canCreate = capabilities.includes("tasks.create");
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const router = useRouter();
  const today = getBusinessDateKey();
  const tasksQueryKey = crmQueryKeys.tasks.list({
    priority: filters.priority,
    assignee: filters.assignee,
    search: filters.search,
    view: filters.view,
  });
  const tasksQuery = useQuery({
    ...routeQueryOptions({
      queryKey: tasksQueryKey,
      queryFn: () => fetchTaskQueue(filters),
    }),
    initialData: loaderTasks,
  });
  const rows = queueRows(tasksQuery.data);
  let total = 0;
  if (tasksQuery.data.view === "list") {
    total = tasksQuery.data.page.total;
  } else {
    for (const status of QUEUE_STATUSES) total += tasksQuery.data.lanes[status].total;
  }
  const query = filters.search ?? "";
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const pendingTaskIdsRef = useRef(new Set<string>());
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const bulkOperation = useBulkOperation("clientops:bulk:tasks", async (result) => {
    setBulkSelected((current) => new Set(remainingBulkSelection(Array.from(current), result)));
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.tasks.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/tasks" });
  });
  const writableIds = new Set(
    rows.filter((task) => task.can_update === true).map((task) => task.id),
  );
  const selectedWritable = new Set([...bulkSelected].filter((id) => writableIds.has(id)));
  const canUpdate = writableIds.size > 0;
  const bulkIds = () => Array.from(selectedWritable);

  const setFilters = (patch: Partial<TaskSearch>) =>
    navigate({
      search: (current) => ({ ...current, ...patch }),
      replace: true,
    });

  // PostgreSQL applies search before the page limit; the loaded rows are already filtered.
  const filtered = rows;

  const loadMore = async (status?: TaskStatus) => {
    const current = queryClient.getQueryData<QueueData>(tasksQueryKey) ?? tasksQuery.data;
    const page = current.view === "list" ? current.page : current.lanes[status!];
    if (!page.nextCursor || loadingMore) return;
    setLoadingMore(status ?? "list");
    try {
      const next = await getTasksPage({
        data: getTaskReadInput(filters, status, page.nextCursor),
      });
      queryClient.setQueryData<QueueData>(tasksQueryKey, (existing) => {
        if (!existing) return current;
        if (existing.view === "list") {
          return {
            ...existing,
            page: {
              ...next,
              items: [...existing.page.items, ...next.items],
            },
          };
        }
        const lane = existing.lanes[status!];
        return {
          ...existing,
          lanes: {
            ...existing.lanes,
            [status!]: {
              ...next,
              items: [...lane.items, ...next.items],
            },
          },
        };
      });
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setLoadingMore(null);
    }
  };

  const markPending = (id: string) => {
    pendingTaskIdsRef.current.add(id);
    setPendingTaskIds(new Set(pendingTaskIdsRef.current));
  };

  const clearPending = (id: string) => {
    pendingTaskIdsRef.current.delete(id);
    setPendingTaskIds(new Set(pendingTaskIdsRef.current));
  };

  /**
   * The one status write, shared by the board's drag/arrow keys and the list's row menu.
   *
   * Optimistic, but only because all three of the things that makes safe are here: a
   * per-task in-flight lock that refuses a second move, a rollback that restores exactly
   * the previous status on rejection, and a failure toast. Both surfaces call this rather
   * than each holding their own copy, so the guarantees cannot drift apart.
   */
  const move = async (id: string, status: TaskStatus) => {
    if (pendingTaskIdsRef.current.has(id)) return;
    const movedTask = rows.find((task) => task.id === id);
    if (movedTask?.can_update !== true) return;
    const previousStatus = movedTask.status;
    if (!previousStatus || previousStatus === status) return;

    markPending(id);
    await queryClient.cancelQueries({ queryKey: crmQueryKeys.tasks.lists() });
    queryClient.setQueriesData<QueueData>({ queryKey: crmQueryKeys.tasks.lists() }, (current) =>
      current
        ? mapQueueRows(current, (items) => replaceOnlyTaskStatus(items, id, status))
        : current,
    );

    try {
      await updateTask({ data: { id, updates: { status } } });
    } catch {
      queryClient.setQueriesData<QueueData>({ queryKey: crmQueryKeys.tasks.lists() }, (current) =>
        current
          ? mapQueueRows(current, (items) => replaceOnlyTaskStatus(items, id, previousStatus))
          : current,
      );
      toast.error("Task move failed. Try again.");
      clearPending(id);
      return;
    }

    clearPending(id);
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: crmQueryKeys.tasks.detail(id),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.tasks.lists() }),
        invalidateLinkedCompanyWorkspaceMutation(queryClient, movedTask?.account_id, "change_task"),
      ]);
    } catch {
      toast.error("Task saved, but the board could not refresh.");
    }
  };

  const createAndRefresh = async (payload: CreateTaskPayload) => {
    if (!canCreate) return;
    await createTask({ data: payload });
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.tasks.lists() });
    toast.success("Task created");
  };

  const hasActiveFilters =
    filters.priority !== "all" || filters.assignee !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setFilters({ priority: "all", assignee: "all", search: "" });
  };
  const filterSummary = [
    filters.priority !== "all"
      ? `Priority: ${getStatusLabel("priority", filters.priority).label}`
      : null,
    filters.assignee !== "all" ? "Owner filter active" : null,
    query.trim() !== "" ? `Search: ${query.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const listColumns: ColumnDef<TaskListItem>[] = [
    {
      id: "task",
      header: "Task",
      priority: "primary",
      sticky: true,
      width: "18rem",
      cell: (task) => (
        <div className="min-w-0 max-w-xs">
          <span className="font-medium [overflow-wrap:anywhere]">{taskTitle(task)}</span>
          {taskDescription(task) && (
            <span className="block truncate text-xs text-muted-foreground">
              {taskDescription(task)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (task) => <StatusBadge domain="tasks" value={task.status} />,
    },
    {
      id: "priority",
      header: "Priority",
      priority: "primary",
      cell: (task) => <StatusBadge domain="priority" value={task.priority} />,
    },
    {
      id: "due",
      header: "Due",
      priority: "secondary",
      cell: (task) => (
        <span
          className={cn(
            "text-xs text-muted-foreground",
            isOverdue(task.due_date, today) &&
              task.status !== "done" &&
              "font-medium text-destructive",
          )}
        >
          {formatDate(task.due_date)}
          {isOverdue(task.due_date, today) && task.status !== "done" ? ` · ${OVERDUE_LABEL}` : ""}
        </span>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      priority: "tertiary",
      cell: (task) => (
        <span className="truncate text-xs text-muted-foreground">{taskOwnerName(task)}</span>
      ),
    },
    {
      id: "agent",
      header: "Created by",
      priority: "tertiary",
      cell: (task) => (
        <span className="text-xs text-muted-foreground">{task.created_by_agent ?? "Person"}</span>
      ),
    },
  ];

  const taskRowActions = (task: TaskListItem) =>
    task.can_update === true ? (
      <>
        {COLUMNS.filter((column) => column.id !== task.status).map((column) => (
          <DropdownMenuItem
            key={column.id}
            disabled={pendingTaskIds.has(task.id)}
            onSelect={() => void move(task.id, column.id)}
          >
            Move to {column.label.toLowerCase()}
          </DropdownMenuItem>
        ))}
      </>
    ) : null;

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Task Queue"
        description={
          query.trim() === ""
            ? `${formatCount(total)} tasks across follow-up, renewal and client success work.`
            : `${formatCount(total)} tasks match this search.`
        }
        status={
          <StaleDataIndicator
            updatedAt={new Date(tasksQuery.dataUpdatedAt).toISOString()}
            isRefetching={tasksQuery.isFetching}
          />
        }
        primaryAction={canCreate ? <NewTaskDialog onCreate={createAndRefresh} /> : undefined}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        {/*
          `tasksQuery.isError` was referenced nowhere. Because `initialData` is set, `data`
          is always defined, so a failed background refetch was completely invisible: the
          board went on showing pre-mutation positions with no sign the refresh had failed.
        */}
        {tasksQuery.isError && (
          <ErrorState
            kind="stale"
            error={tasksQuery.error}
            title="The latest tasks did not load"
            description="You are looking at the last set of tasks that loaded successfully."
            retryLabel="Retry"
            onRetry={() => void tasksQuery.refetch()}
          />
        )}

        <FilterToolbar
          search={{
            value: query,
            onChange: (search) => setFilters({ search }),
            placeholder: "Search tasks by title or description",
          }}
          filters={[
            {
              id: "priority",
              label: "Priority",
              value: filters.priority,
              onChange: (priority) => setFilters({ priority: priority as TaskSearch["priority"] }),
              options: [
                { value: "all", label: "All priorities" },
                { value: "high", label: getStatusLabel("priority", "high").label },
                { value: "medium", label: getStatusLabel("priority", "medium").label },
                { value: "low", label: getStatusLabel("priority", "low").label },
              ],
            },
          ]}
          onClear={clearFilters}
          resultCount={total}
        />
        <ProfileSearchCombobox
          purpose="task_filter"
          label="Owner"
          value={filters.assignee}
          onChange={(assignee) => setFilters({ assignee })}
        />

        {(bulkSelected.size > 0 || bulkOperation.result || bulkOperation.recoveryState) && (
          <BulkActionBar
            selectedCount={bulkSelected.size}
            busy={bulkOperation.busy}
            result={bulkOperation.result}
            recoveryState={bulkOperation.recoveryState}
            onRetryResult={bulkOperation.retryLoadResult}
            canResume={canUpdate}
            onResume={() => {
              if (canUpdate) void bulkOperation.resume();
            }}
            onClear={() => {
              setBulkSelected(new Set());
              bulkOperation.dismiss();
            }}
          >
            {selectedWritable.size > 0 && (
              <>
                <Select
                  onValueChange={(value) =>
                    void bulkOperation.prepare(
                      { type: "task.status", status: value as TaskStatus },
                      bulkIds(),
                    )
                  }
                >
                  <SelectTrigger className="w-40" aria-label="Bulk task status">
                    <SelectValue placeholder="Set status" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) =>
                    void bulkOperation.prepare(
                      { type: "task.priority", priority: value as Task["priority"] },
                      bulkIds(),
                    )
                  }
                >
                  <SelectTrigger className="w-40" aria-label="Bulk task priority">
                    <SelectValue placeholder="Set priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high"] as const).map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {getStatusLabel("priority", priority).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="flex items-center gap-2 text-xs">
                  Due date
                  <Input
                    type="date"
                    value={bulkDueDate}
                    onChange={(event) => setBulkDueDate(event.target.value)}
                    className="w-40"
                  />
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkOperation.busy}
                  onClick={() =>
                    void bulkOperation.prepare(
                      { type: "task.due", dueDate: bulkDueDate || null },
                      bulkIds(),
                    )
                  }
                >
                  Set due date
                </Button>
                <ProfileSearchCombobox
                  purpose="task_assign"
                  label="Bulk task owner"
                  value={bulkAssignee}
                  onChange={setBulkAssignee}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkOperation.busy || !bulkAssignee}
                  onClick={() =>
                    void bulkOperation.prepare(
                      { type: "task.assign", profileId: bulkAssignee },
                      bulkIds(),
                    )
                  }
                >
                  Assign owner
                </Button>
              </>
            )}
          </BulkActionBar>
        )}
        <BulkPreviewDialog
          preview={bulkOperation.preview}
          busy={bulkOperation.busy}
          onCancel={bulkOperation.cancelPreview}
          onCommit={() => {
            if (canUpdate) void bulkOperation.commit();
          }}
        />

        <section className="space-y-3">
          <SectionHeader
            title={filters.view === "board" ? "Board" : "List"}
            description={
              !canUpdate
                ? "View tasks and their current status."
                : filters.view === "board"
                  ? "Drag a card between columns, or focus it and press ← / →."
                  : "Matching tasks in pages. Use the row menu to change a status."
            }
            action={
              <div
                role="group"
                aria-label="Task view"
                className="inline-flex rounded-md border border-border p-0.5"
              >
                {(["board", "list"] as const).map((view) => (
                  <Button
                    key={view}
                    type="button"
                    size="sm"
                    variant={filters.view === view ? "secondary" : "ghost"}
                    aria-pressed={filters.view === view}
                    onClick={() => setFilters({ view })}
                  >
                    {view === "board" ? "Board" : "List"}
                  </Button>
                ))}
              </div>
            }
          />

          {filtered.length === 0 ? (
            hasActiveFilters ? (
              <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
            ) : (
              <EmptyWorkspaceState
                title="No tasks yet"
                description="Follow-ups, renewal checks and client success work land here. Create one to start the queue."
              />
            )
          ) : filters.view === "list" ? (
            <>
              <ResponsiveRecordList
                caption="Tasks"
                breakpoint="xl"
                columns={listColumns}
                rows={filtered}
                rowKey={(task) => task.id}
                rowLabel={(task) => taskTitle(task)}
                selection={
                  canUpdate || bulkSelected.size > 0
                    ? {
                        selected: bulkSelected,
                        isRowSelectable: (task) => task.can_update === true,
                        onChange: (next) => {
                          if (next.size > 100) {
                            toast.error("Select at most 100 tasks per bulk operation.");
                            return;
                          }
                          setBulkSelected(
                            new Set(
                              [...next].filter((id) => bulkSelected.has(id) || writableIds.has(id)),
                            ),
                          );
                        },
                      }
                    : undefined
                }
                rowActions={canUpdate ? taskRowActions : undefined}
                renderCard={(task) => (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge domain="tasks" value={task.status} />
                      <StatusBadge domain="priority" value={task.priority} />
                    </div>
                    <p className="text-sm font-medium">{taskTitle(task)}</p>
                    {taskDescription(task) && (
                      <p className="text-xs text-muted-foreground">{taskDescription(task)}</p>
                    )}
                    <p
                      className={cn(
                        "text-xs tabular-nums text-muted-foreground",
                        isOverdue(task.due_date, today) &&
                          task.status !== "done" &&
                          "font-medium text-destructive",
                      )}
                    >
                      Due {formatDate(task.due_date)} · {taskOwnerName(task)}
                    </p>
                  </div>
                )}
              />
              {tasksQuery.data.view === "list" && tasksQuery.data.page.nextCursor && (
                <Button
                  type="button"
                  disabled={Boolean(loadingMore)}
                  onClick={() => void loadMore()}
                >
                  Load more tasks
                </Button>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COLUMNS.map((col) => {
                const colTasks = filtered.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    className="flex flex-col gap-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragging) move(dragging, col.id);
                      setDragging(null);
                    }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-medium">
                        {col.label}{" "}
                        <span className="ml-1 tabular-nums text-muted-foreground">
                          ({colTasks.length})
                        </span>
                      </h3>
                    </div>
                    <div className="flex min-h-[120px] flex-col gap-3 rounded-md bg-muted/20 p-2">
                      {colTasks.map((t) => {
                        const overdue = isOverdue(t.due_date, today) && t.status !== "done";
                        const isPending = pendingTaskIds.has(t.id);
                        const canMove = t.can_update === true;
                        return (
                          <Card
                            key={t.id}
                            role={canMove ? "button" : "group"}
                            tabIndex={canMove && !isPending ? 0 : undefined}
                            aria-label={`${taskTitle(t)} — ${col.label}${canMove ? ". Press left or right arrow to move between columns." : ""}`}
                            aria-busy={isPending}
                            aria-disabled={!canMove || isPending}
                            draggable={canMove && !isPending}
                            onDragStart={() => {
                              if (canMove && !isPending) setDragging(t.id);
                            }}
                            onDragEnd={() => setDragging(null)}
                            onKeyDown={(e) => {
                              if (!canMove || isPending) return;
                              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                              e.preventDefault();
                              const idx = COLUMNS.findIndex((c) => c.id === col.id);
                              const target = COLUMNS[e.key === "ArrowLeft" ? idx - 1 : idx + 1];
                              if (target) move(t.id, target.id);
                            }}
                            className={cn(
                              "p-4 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              canMove && "cursor-grab hover:shadow-md active:cursor-grabbing",
                              dragging === t.id && "opacity-50",
                              isPending && "cursor-wait opacity-60",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug">{taskTitle(t)}</p>
                              <StatusBadge domain="priority" value={t.priority} />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {taskDescription(t)}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                              <span
                                className={cn(
                                  "tabular-nums text-muted-foreground",
                                  overdue && "font-medium text-destructive",
                                )}
                              >
                                Due {formatDate(t.due_date)}
                                {overdue && ` · ${OVERDUE_LABEL}`}
                              </span>
                              <span className="truncate text-muted-foreground">
                                {taskOwnerName(t)}
                              </span>
                            </div>
                            {t.created_by_agent && (
                              <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                                <Bot className="h-3 w-3" aria-hidden="true" /> {t.created_by_agent}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                      {tasksQuery.data.view === "board" &&
                        tasksQuery.data.lanes[col.id].nextCursor && (
                          <Button
                            type="button"
                            disabled={Boolean(loadingMore)}
                            onClick={() => void loadMore(col.id)}
                          >
                            Load more {col.label.toLowerCase()} tasks
                          </Button>
                        )}
                      {colTasks.length === 0 && (
                        <EmptyWorkspaceState
                          title={`No ${col.label.toLowerCase()} tasks`}
                          description="Drop tasks here or create one when retention work appears."
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

type CreateTaskPayload = {
  title: string;
  description?: string;
  assigned_to?: string;
  due_date?: string;
  priority?: Task["priority"];
};

function NewTaskDialog({ onCreate }: { onCreate: (t: CreateTaskPayload) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pri, setPri] = useState<Task["priority"]>("medium");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState(() =>
    getBusinessDateKey(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)),
  );
  /**
   * `submit` was passed straight to `onClick` with no in-flight flag and no `catch`, so a
   * rejected `createTask` was an unhandled rejection — dialog open, fields full, no toast —
   * and two clicks created two tasks.
   */
  const [saving, setSaving] = useState(false);
  // Shown under the field and linked to it, not as a toast that vanishes (UX-16).
  const [titleError, setTitleError] = useState<string | null>(null);

  const submit = async () => {
    if (saving) return;
    if (!title.trim()) {
      setTitleError("Enter a title for the task.");
      document.getElementById("new-task-title")?.focus();
      return;
    }

    setTitleError(null);
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        description: desc.trim() || undefined,
        assigned_to: assignee.trim() || undefined,
        due_date: due || undefined,
        priority: pri,
      });
      setOpen(false);
      setTitle("");
      setDesc("");
      setAssignee("");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Tasks appear on the board immediately and in every queue that filters on them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-task-title" className="text-xs">
              Title
            </Label>
            <Input
              id="new-task-title"
              name="title"
              autoComplete="off"
              className="mt-1"
              value={title}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? "new-task-title-error" : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError ? (
              <p id="new-task-title-error" className="mt-1 text-xs font-medium text-tone-danger-fg">
                {titleError}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="new-task-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="new-task-description"
              name="description"
              className="mt-1"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <Label htmlFor="new-task-priority" className="text-xs">
                Priority
              </Label>
              <Select value={pri} onValueChange={(v) => setPri(v as Task["priority"])}>
                <SelectTrigger id="new-task-priority" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{getStatusLabel("priority", "low").label}</SelectItem>
                  <SelectItem value="medium">
                    {getStatusLabel("priority", "medium").label}
                  </SelectItem>
                  <SelectItem value="high">{getStatusLabel("priority", "high").label}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <ProfileSearchCombobox
                purpose="task_assign"
                label="Owner"
                value={assignee}
                onChange={setAssignee}
              />
            </div>
            <div>
              <Label htmlFor="new-task-due" className="text-xs">
                Due
              </Label>
              <Input
                id="new-task-due"
                name="due"
                type="date"
                className="mt-1"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

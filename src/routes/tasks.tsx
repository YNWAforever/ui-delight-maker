import { useMemo, useRef, useState } from "react";
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
  MetricStrip,
  ResponsiveRecordList,
  RowActionsMenu,
  SectionHeader,
  StaleDataIndicator,
  WorkspaceHeader,
  type ColumnDef,
  type FilterOption,
} from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import { getTaskBoardMetrics } from "@/lib/sales-workspace";
import { invalidateLinkedCompanyWorkspaceMutation } from "@/lib/company-workspace/invalidation";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getDerivedStatusLabel, getStatusLabel, isOverdue } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import { getTasks, createTask, updateTask } from "@/server-functions/tasks";
import type { Task, TaskStatus } from "@/lib/types";

/**
 * `view` is a search param, not component state.
 *
 * A board and a list are two readings of the same queue, and which one a person is looking
 * at is part of what they would send a colleague. Held in `useState` it survives neither a
 * refresh nor the Back button; held here it does both, and it stays out of `loaderDeps`
 * because it changes no server request.
 */
const taskSearchSchema = z.object({
  view: z.enum(["board", "list"]).default("board").catch("board"),
  priority: z.enum(["all", "high", "medium", "low"]).default("all").catch("all"),
  assignee: z.string().default("all").catch("all"),
});

type TaskSearch = z.infer<typeof taskSearchSchema>;

const getTaskReadInput = (filters: { priority: TaskSearch["priority"]; assignee: string }) => ({
  priority: filters.priority === "all" ? undefined : filters.priority,
  assigned_to: filters.assignee === "all" ? undefined : filters.assignee,
});

export const Route = createFileRoute("/tasks")({
  validateSearch: taskSearchSchema,
  // `view` is deliberately not a dep: it changes what is drawn, never what is fetched.
  loaderDeps: ({ search }) => ({
    priority: search.priority,
    assignee: search.assignee,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.tasks.list(deps),
        queryFn: () => getTasks({ data: getTaskReadInput(deps) }),
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

const replaceOnlyTaskStatus = (tasks: Task[], id: string, status: TaskStatus) =>
  tasks.map((task) => (task.id === id ? { ...task, status } : task));

function TasksBoard() {
  const loaderTasks = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const today = getBusinessDateKey();
  const tasksQueryKey = crmQueryKeys.tasks.list({
    priority: filters.priority,
    assignee: filters.assignee,
  });
  const tasksQuery = useQuery({
    ...routeQueryOptions({
      queryKey: tasksQueryKey,
      queryFn: () => getTasks({ data: getTaskReadInput(filters) }),
    }),
    initialData: loaderTasks,
  });
  const rows = tasksQuery.data;
  const [dragging, setDragging] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const pendingTaskIdsRef = useRef(new Set<string>());
  const [query, setQuery] = useState("");

  const setFilters = (patch: Partial<TaskSearch>) =>
    navigate({
      search: (current) => ({ ...current, ...patch }),
      replace: true,
    });

  /**
   * A real filter, not the identity memo this replaced.
   *
   * `const filtered = useMemo(() => rows, [rows])` made `${filtered.length} of ${rows.length}`
   * two names for one number, so the header could only ever read "N of N tasks" while
   * presenting a filter relationship that did not exist. `listTasks` is unpaginated, so
   * `rows` is the whole server-filtered set and searching it is a search over everything
   * that matched — the count below is therefore true rather than page-scoped.
   */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return rows;
    return rows.filter((task) =>
      `${task.title} ${task.description ?? ""}`.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const metrics = getTaskBoardMetrics(rows, today);

  /**
   * Owner options are built from the ids on real rows, never from a fixture roster.
   *
   * The Select here used to be filled from `APP_USERS` — five hardcoded placeholder UUIDs
   * that appear in no migration and no seed. `tasks.assigned_to` is `text references
   * profiles(id)`, so picking any of them sent an id that could match nothing and emptied
   * the board. Deriving the list from `assigned_to` values actually present guarantees
   * every option can return rows. The active value stays listed even when the current
   * result set no longer contains it, otherwise the Select renders blank against a URL the
   * reader can still see.
   */
  const assigneeOptions: FilterOption[] = useMemo(() => {
    const present = new Set<string>();
    for (const task of rows) {
      if (task.assigned_to) present.add(task.assigned_to);
    }
    if (filters.assignee !== "all") present.add(filters.assignee);
    return [
      { value: "all", label: "All owners" },
      ...[...present].sort().map((value) => ({ value, label: value })),
    ];
  }, [rows, filters.assignee]);

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
    const previousStatus = movedTask?.status;
    if (!previousStatus || previousStatus === status) return;

    markPending(id);
    await queryClient.cancelQueries({ queryKey: crmQueryKeys.tasks.lists() });
    queryClient.setQueriesData<Task[]>({ queryKey: crmQueryKeys.tasks.lists() }, (current) =>
      current ? replaceOnlyTaskStatus(current, id, status) : current,
    );

    try {
      await updateTask({ data: { id, updates: { status } } });
    } catch {
      queryClient.setQueriesData<Task[]>({ queryKey: crmQueryKeys.tasks.lists() }, (current) =>
        current ? replaceOnlyTaskStatus(current, id, previousStatus) : current,
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
    const created = await createTask({ data: payload });
    queryClient.setQueryData<Task[]>(tasksQueryKey, (current) => [created, ...(current ?? [])]);
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.tasks.lists() });
    toast.success("Task created");
  };

  const hasActiveFilters =
    filters.priority !== "all" || filters.assignee !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setQuery("");
    setFilters({ priority: "all", assignee: "all" });
  };
  const filterSummary = [
    filters.priority !== "all"
      ? `Priority: ${getStatusLabel("priority", filters.priority).label}`
      : null,
    filters.assignee !== "all" ? `Owner: ${filters.assignee}` : null,
    query.trim() !== "" ? `Search: ${query.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const listColumns: ColumnDef<Task>[] = [
    {
      id: "task",
      header: "Task",
      priority: "primary",
      sticky: true,
      width: "18rem",
      cell: (task) => (
        <div className="min-w-0">
          <span className="font-medium">{task.title}</span>
          {task.description && (
            <span className="block truncate text-xs text-muted-foreground">{task.description}</span>
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
        // The owner id, not a name: there is no assignable-profiles read a salesperson can
        // call, and the fixture roster that used to resolve names here matched nothing, so
        // every genuinely-assigned task rendered blank.
        <span className="truncate text-xs text-muted-foreground">
          {task.assigned_to ?? "Unassigned"}
        </span>
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

  const taskRowActions = (task: Task) => (
    <RowActionsMenu label={`Actions for ${task.title}`}>
      {COLUMNS.filter((column) => column.id !== task.status).map((column) => (
        <DropdownMenuItem
          key={column.id}
          disabled={pendingTaskIds.has(task.id)}
          onSelect={() => void move(task.id, column.id)}
        >
          Move to {column.label.toLowerCase()}
        </DropdownMenuItem>
      ))}
    </RowActionsMenu>
  );

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Task Queue"
        description={
          query.trim() === ""
            ? `${formatCount(rows.length)} tasks across follow-up, renewal and client success work.`
            : `${formatCount(filtered.length)} of ${formatCount(rows.length)} tasks match this search.`
        }
        status={
          <StaleDataIndicator
            updatedAt={new Date(tasksQuery.dataUpdatedAt).toISOString()}
            isRefetching={tasksQuery.isFetching}
          />
        }
        primaryAction={<NewTaskDialog onCreate={createAndRefresh} />}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            { id: "open", label: "Open", value: metrics.open, hint: "not completed" },
            {
              id: "overdue",
              label: OVERDUE_LABEL,
              value: metrics.overdue,
              hint: "past due date",
              tone: metrics.overdue > 0 ? "destructive" : "neutral",
            },
            {
              id: "due-today",
              label: "Due today",
              value: metrics.dueToday,
              hint: "needs action today",
              tone: metrics.dueToday > 0 ? "warning" : "neutral",
            },
            {
              id: "high",
              label: "High priority",
              value: metrics.highPriority,
              hint: "open high priority",
            },
          ]}
          columns={4}
        />

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
            onChange: setQuery,
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
            {
              id: "assignee",
              label: "Owner",
              value: filters.assignee,
              onChange: (assignee) => setFilters({ assignee }),
              options: assigneeOptions,
            },
          ]}
          onClear={clearFilters}
          resultCount={filtered.length}
        />

        <section className="space-y-3">
          <SectionHeader
            title={filters.view === "board" ? "Board" : "List"}
            description={
              filters.view === "board"
                ? "Drag a card between columns, or focus it and press ← / →."
                : "Every matching task in one table. Use the row menu to change a status."
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
            <ResponsiveRecordList
              caption="Tasks"
              columns={listColumns}
              rows={filtered}
              rowKey={(task) => task.id}
              rowActions={taskRowActions}
              renderCard={(task) => (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge domain="tasks" value={task.status} />
                    <StatusBadge domain="priority" value={task.priority} />
                  </div>
                  <p className="text-sm font-medium">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground">{task.description}</p>
                  )}
                  <p
                    className={cn(
                      "text-xs tabular-nums text-muted-foreground",
                      isOverdue(task.due_date, today) &&
                        task.status !== "done" &&
                        "font-medium text-destructive",
                    )}
                  >
                    Due {formatDate(task.due_date)} · {task.assigned_to ?? "Unassigned"}
                  </p>
                </div>
              )}
            />
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
                        return (
                          <Card
                            key={t.id}
                            role="button"
                            tabIndex={isPending ? -1 : 0}
                            aria-label={`${t.title} — ${col.label}. Press left or right arrow to move between columns.`}
                            aria-busy={isPending}
                            aria-disabled={isPending}
                            draggable={!isPending}
                            onDragStart={() => {
                              if (!isPending) setDragging(t.id);
                            }}
                            onDragEnd={() => setDragging(null)}
                            onKeyDown={(e) => {
                              if (isPending) return;
                              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                              e.preventDefault();
                              const idx = COLUMNS.findIndex((c) => c.id === col.id);
                              const target = COLUMNS[e.key === "ArrowLeft" ? idx - 1 : idx + 1];
                              if (target) move(t.id, target.id);
                            }}
                            className={cn(
                              "cursor-grab p-4 transition-shadow hover:shadow-md active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              dragging === t.id && "opacity-50",
                              isPending && "cursor-wait opacity-60",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug">{t.title}</p>
                              <StatusBadge domain="priority" value={t.priority} />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{t.description}</p>
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
                                {t.assigned_to ?? "Unassigned"}
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
  /**
   * Blank by default, which is the bug fix hiding in this input.
   *
   * The Select this replaces defaulted to `APP_USERS[0].id` — a placeholder UUID present in
   * no seed — and `tasks.assigned_to` is `text references profiles(id)`, so every task
   * created from this dialog was writing an id the foreign key could not resolve. Blank
   * means unassigned, which the column allows, and a real owner id can be pasted until
   * there is an assignable-profiles read a salesperson is allowed to call.
   */
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

  const submit = async () => {
    if (saving) return;
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }

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
              onChange={(e) => setTitle(e.target.value)}
            />
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
              <Label htmlFor="new-task-assignee" className="text-xs">
                Owner user ID
              </Label>
              <Input
                id="new-task-assignee"
                name="assignee"
                autoComplete="off"
                spellCheck={false}
                className="mt-1"
                placeholder="Leave blank for unassigned"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
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

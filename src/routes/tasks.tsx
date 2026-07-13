import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";
import { toast } from "sonner";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { formatDate } from "@/lib/format";
import { getBusinessDateKey } from "@/lib/business-date";
import { getTaskBoardMetrics } from "@/lib/sales-workspace";
import { cn } from "@/lib/utils";
import { getTasks, createTask, updateTask } from "@/server-functions/tasks";
import { APP_USERS, userById } from "@/lib/users";
import type { Task, TaskStatus } from "@/lib/types";

export const Route = createFileRoute("/tasks")({
  loader: () => getTasks({}),
  head: () => ({
    meta: [
      { title: "Tasks — Fimmick ClientOps" },
      {
        name: "description",
        content: "Kanban view of all open, in-progress, and completed tasks.",
      },
    ],
  }),
  component: TasksBoard,
});

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

const isTaskOverdue = (task: Task, today: string) => {
  if (!task.due_date || task.status === "done") return false;
  const dueTime = Date.parse(task.due_date);
  const todayTime = Date.parse(today);
  return !Number.isNaN(dueTime) && !Number.isNaN(todayTime) && dueTime < todayTime;
};

function TasksBoard() {
  const loaderTasks = Route.useLoaderData();
  const router = useRouter();
  const today = getBusinessDateKey();
  const [rows, setRows] = useState<Task[]>(loaderTasks);
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [dragging, setDragging] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter((t) => {
        if (priority !== "all" && t.priority !== priority) return false;
        if (assignee !== "all" && t.assigned_to !== assignee) return false;
        return true;
      }),
    [rows, priority, assignee],
  );
  const metrics = getTaskBoardMetrics(rows, today);

  const move = async (id: string, status: TaskStatus) => {
    setRows((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    await updateTask({ data: { id, updates: { status } } });
    router.invalidate();
  };

  return (
    <>
      <CommandHeader
        title="Task Queue"
        status="Retain"
        description={`${filtered.length} of ${rows.length} tasks across follow-up, renewal, and client success work.`}
        actions={
          <NewTaskDialog
            onCreate={async (t) => {
              const created = await createTask({ data: t });
              setRows((prev) => [created, ...prev]);
              router.invalidate();
              toast.success("Task created");
            }}
          />
        }
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            { label: "Open", value: metrics.open, hint: "not completed" },
            { label: "Overdue", value: metrics.overdue, hint: "past due date" },
            { label: "Due today", value: metrics.dueToday, hint: "needs action today" },
            { label: "High priority", value: metrics.highPriority, hint: "open high priority" },
          ]}
        />

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filter tasks by priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Filter tasks by assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {APP_USERS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="ml-auto text-xs text-muted-foreground">
              Tip: drag a card between columns, or focus it and press ← / →.
            </p>
          </div>
        </Card>

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
                  <h2 className="text-sm font-semibold">
                    {col.label}{" "}
                    <span className="ml-1 text-muted-foreground">({colTasks.length})</span>
                  </h2>
                </div>
                <div className="flex min-h-[120px] flex-col gap-3 rounded-md bg-muted/20 p-2">
                  {colTasks.map((t) => {
                    const owner = t.assigned_to ? userById(t.assigned_to) : undefined;
                    const overdue = isTaskOverdue(t, today);
                    return (
                      <Card
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.title} — ${col.label}. Press left or right arrow to move between columns.`}
                        draggable
                        onDragStart={() => setDragging(t.id)}
                        onDragEnd={() => setDragging(null)}
                        onKeyDown={(e) => {
                          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                          e.preventDefault();
                          const idx = COLUMNS.findIndex((c) => c.id === col.id);
                          const target = COLUMNS[e.key === "ArrowLeft" ? idx - 1 : idx + 1];
                          if (target) move(t.id, target.id);
                        }}
                        className={cn(
                          "cursor-grab p-4 transition-shadow hover:shadow-md active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          dragging === t.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{t.title}</p>
                          <StatusBadge value={t.priority} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{t.description}</p>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span
                            className={cn(
                              "text-muted-foreground",
                              overdue && "font-medium text-destructive",
                            )}
                          >
                            Due {formatDate(t.due_date)}
                            {overdue && " · overdue"}
                          </span>
                          <span className="text-muted-foreground">{owner?.name}</span>
                        </div>
                        {t.created_by_agent && (
                          <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                            <Bot className="h-3 w-3" /> {t.created_by_agent}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <WorkSurfaceEmpty
                      title={`No ${col.label.toLowerCase()} tasks`}
                      description="Drop tasks here or create a task when retention work appears."
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
  const [assignee, setAssignee] = useState(APP_USERS[0]?.id ?? "");
  const [due, setDue] = useState(() =>
    getBusinessDateKey(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)),
  );

  const submit = async () => {
    if (!title) {
      toast.error("Title required");
      return;
    }
    await onCreate({
      title,
      description: desc || undefined,
      assigned_to: assignee || undefined,
      due_date: due || undefined,
      priority: pri,
    });
    setOpen(false);
    setTitle("");
    setDesc("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
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
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="new-task-priority" className="text-xs">
                Priority
              </Label>
              <Select value={pri} onValueChange={(v) => setPri(v as Task["priority"])}>
                <SelectTrigger id="new-task-priority" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-task-assignee" className="text-xs">
                Assignee
              </Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="new-task-assignee" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_USERS.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { tasks, userById, type TaskStatus } from "@/lib/mock-data";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Fimmick ClientOps" },
      { name: "description", content: "Kanban view of all open, in-progress, and completed tasks." },
    ],
  }),
  component: TasksBoard,
});

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

function TasksBoard() {
  return (
    <>
      <PageHeader
        title="Task Board"
        description={`${tasks.length} tasks across leads and clients`}
        actions={
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">
                  {col.label}{" "}
                  <span className="ml-1 text-muted-foreground">({colTasks.length})</span>
                </h2>
              </div>
              <div className="flex flex-col gap-3">
                {colTasks.map((t) => {
                  const owner = userById(t.assigned_to);
                  return (
                    <Card key={t.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{t.title}</p>
                        <StatusBadge value={t.priority} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{t.description}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Due {t.due_date}</span>
                        <span>{owner?.name}</span>
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
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Nothing here yet.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

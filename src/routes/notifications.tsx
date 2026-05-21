import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ShieldAlert,
  FileText,
  User,
  Building2,
  MailOpen,
  Filter,
} from "lucide-react";

import { useNotifications } from "@/hooks/use-notifications";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { relativeTime, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

const typeIcon: Record<string, React.ReactNode> = {
  approval: <ShieldAlert className="h-4 w-4" />,
  task: <FileText className="h-4 w-4" />,
  lead: <User className="h-4 w-4" />,
  client: <Building2 className="h-4 w-4" />,
};

const typeColor: Record<string, string> = {
  approval: "text-amber-500 bg-amber-500/10",
  task: "text-blue-500 bg-blue-500/10",
  lead: "text-emerald-500 bg-emerald-500/10",
  client: "text-violet-500 bg-violet-500/10",
};

type FilterTab = "all" | "unread" | "approval" | "task" | "lead" | "client";

function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    let list = [...notifications].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (filter === "unread") list = list.filter((n) => !n.read);
    if (filter !== "all" && filter !== "unread") list = list.filter((n) => n.type === filter);
    return list;
  }, [notifications, filter]);

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", count: unreadCount },
    { key: "approval", label: "Approvals" },
    { key: "task", label: "Tasks" },
    { key: "lead", label: "Leads" },
    { key: "client", label: "Clients" },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Notifications"
        description="Activity across leads, quotes, clients, and approvals."
        actions={
          unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          )
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filter === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1 text-[10px]">
                {t.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-16 text-muted-foreground">
            <MailOpen className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs">You're all caught up.</p>
          </div>
        ) : (
          filtered.map((n) => {
            const isUnread = !n.read;
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-accent/30",
                  isUnread && "bg-accent/20 border-primary/20"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    typeColor[n.type]
                  )}
                >
                  {typeIcon[n.type]}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn("text-sm leading-snug", isUnread && "font-medium")}>
                      {n.message}
                    </p>
                    {isUnread && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(n.created_at)} · {relativeTime(n.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isUnread && (
                    <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)}>
                      <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                      Mark read
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link to={n.link as never}>Open</Link>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

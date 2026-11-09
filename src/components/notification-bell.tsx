import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CheckCheck,
  MailOpen,
  ShieldAlert,
  CalendarClock,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { toSafeErrorMessage } from "@/lib/errors";
import { notificationTarget } from "@/lib/notification-target";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useClientNow } from "@/hooks/use-client-now";
import type { NotificationRecord } from "@/lib/types";

const typeIcon: Record<string, React.ReactNode> = {
  approval_pending: <ShieldAlert className="h-4 w-4" />,
  renewal_window: <CalendarClock className="h-4 w-4" />,
  risk_change: <AlertTriangle className="h-4 w-4" />,
  stale_touchpoint: <Clock className="h-4 w-4" />,
};

const typeColor: Record<string, string> = {
  approval_pending: "text-tone-warning-fg bg-warning/12",
  renewal_window: "text-tone-info-fg bg-info/12",
  risk_change: "text-tone-danger-fg bg-destructive/12",
  stale_touchpoint: "text-tone-neutral-fg bg-muted",
};

export function NotificationBell() {
  const clientNow = useClientNow();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /**
   * One click: mark read, then go where `notificationTarget` says — or nowhere.
   *
   * The local resolver this replaces guessed a path string and cast it to `never`, so a
   * `client`/`lead` row with no object id navigated to `/clients/null` or `/leads/null`, and
   * an unknown type linked the bell back to itself. A null target is a plain, non-navigating
   * row: marking it read is the whole action.
   *
   * `markAsRead` rethrows after rolling its optimistic write back, so a failed write used to
   * flip the row read and silently flip it back. Reporting it and keeping the panel open is
   * what makes the failure visible; navigation waits for the write, so a failed row cannot
   * take the reader away from the message that explains it.
   */
  const openNotification = async (notification: NotificationRecord) => {
    const target = notificationTarget(notification);
    if (!notification.read_at) {
      try {
        await markAsRead(notification.id);
      } catch (error) {
        toast.error(toSafeErrorMessage(error));
        return;
      }
    }

    if (target === null) return;
    setOpen(false);
    switch (target.kind) {
      case "approvals":
        return navigate({ to: "/approvals" });
      case "renewals":
        return navigate({ to: "/renewals" });
      case "client":
        return navigate({ to: "/clients/$id", params: { id: target.id } });
      case "lead":
        return navigate({ to: "/leads/$id", params: { id: target.id } });
    }
  };

  const markEverything = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllRead();
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setMarkingAll(false);
    }
  };

  const visible = notifications.slice(0, 6);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        className="relative"
        onClick={() => setOpen((s) => !s)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void markEverything()}
                disabled={markingAll}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" />
                {markingAll ? "Marking…" : "Mark all read"}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-auto">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <MailOpen className="h-6 w-6 opacity-50" />
                No notifications
              </div>
            ) : (
              visible.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    onClick={() => void openNotification(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                      isUnread && "bg-accent/40",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        typeColor[n.type],
                      )}
                    >
                      {typeIcon[n.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm leading-snug",
                          isUnread ? "font-medium" : "text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {clientNow === null
                          ? formatDateTime(n.created_at)
                          : relativeTime(n.created_at, clientNow)}
                      </p>
                    </div>
                    {isUnread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

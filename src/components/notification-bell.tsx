import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CheckCheck,
  MailOpen,
  ShieldAlert,
  User,
  FileText,
  Building2,
} from "lucide-react";

import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";

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

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
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
                const isUnread = !n.read;
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      markAsRead(n.id);
                      setOpen(false);
                      navigate({ to: n.link as never });
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                      isUnread && "bg-accent/40"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        typeColor[n.type]
                      )}
                    >
                      {typeIcon[n.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm leading-snug",
                          isUnread ? "font-medium" : "text-muted-foreground"
                        )}
                      >
                        {n.message}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {relativeTime(n.created_at)}
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

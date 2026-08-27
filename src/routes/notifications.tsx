import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  Clock,
  MailOpen,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  StaleDataIndicator,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { useClientNow } from "@/hooks/use-client-now";
import { useNotifications } from "@/hooks/use-notifications";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime, relativeTime } from "@/lib/format";
import { notificationTarget } from "@/lib/notification-target";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { cn } from "@/lib/utils";
import { getNotifications } from "@/server-functions/notifications";
import type { NotificationRecord, NotificationType } from "@/lib/types";

/**
 * The signed-in user's notification feed.
 *
 * Another route the plan omitted (PC-1). It had a `validateSearch` schema and a real loader
 * already; what it did not have was any of the shell - no `WorkspaceHeader`, no error
 * boundary, no empty states, and two writes bound straight to `onClick` (IF-E2-51). The hook
 * behind those writes is careful: a token-guarded optimistic update with a real rollback,
 * which it then rethrows into a bare handler. The visible result was a row flipping to read
 * and silently flipping back, which reads as a UI glitch rather than as a failure.
 *
 * Like `/account`, it stays out of navigation: the bell in the shell header is its door.
 */

const NOTIFICATION_TYPES = [
  "approval_pending",
  "renewal_window",
  "risk_change",
  "stale_touchpoint",
] as const satisfies readonly NotificationType[];

const FILTER_VALUES = ["all", "unread", ...NOTIFICATION_TYPES] as const;

type FilterValue = (typeof FILTER_VALUES)[number];

const notificationSearchSchema = z.object({
  filter: z.enum(FILTER_VALUES).default("all").catch("all"),
});

function isFilterValue(value: string): value is FilterValue {
  return (FILTER_VALUES as readonly string[]).includes(value);
}

/**
 * The four values `notifications.type` can hold, plus the two list scopes.
 *
 * Keyed on `NotificationType` so a fifth notification kind is a compile error here rather
 * than a row that renders with no icon and no label.
 */
const TYPE_LABELS: Record<NotificationType, string> = {
  approval_pending: "Approval needed",
  renewal_window: "Renewal window",
  risk_change: "Risk change",
  stale_touchpoint: "Stale touchpoint",
};

const FILTER_LABELS: Record<FilterValue, string> = {
  all: "Everything",
  unread: "Unread only",
  ...TYPE_LABELS,
};

const TYPE_ICON: Record<NotificationType, typeof ShieldAlert> = {
  approval_pending: ShieldAlert,
  renewal_window: CalendarClock,
  risk_change: AlertTriangle,
  stale_touchpoint: Clock,
};

const TYPE_TONE: Record<NotificationType, string> = {
  approval_pending: "text-warning-foreground bg-warning/10",
  renewal_window: "text-info bg-info/10",
  risk_change: "text-destructive bg-destructive/10",
  stale_touchpoint: "text-muted-foreground bg-muted",
};

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

function typeLabel(type: string): string {
  return isNotificationType(type) ? TYPE_LABELS[type] : type.replace(/_/g, " ");
}

export const Route = createFileRoute("/notifications")({
  validateSearch: notificationSearchSchema,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.notifications.list({}),
        queryFn: () => getNotifications(),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Notifications - Fimmick ClientOps" },
      { name: "description", content: "Activity across leads, quotes, clients and approvals." },
    ],
  }),
  errorComponent: NotificationsErrorState,
  component: NotificationsPage,
});

function NotificationsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Notifications did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/notifications" });
        }}
      />
    </div>
  );
}

/**
 * Typed per case rather than one `to={string}`.
 *
 * Every branch is a real router target the type checker can see, which is what the removed
 * `as never` cast was suppressing. The renewals label names the board rather than the
 * engagement, because the board is where the link lands - see `notificationTarget`.
 */
function OpenTargetButton({ notification }: { notification: NotificationRecord }) {
  const target = notificationTarget(notification);
  if (target === null) return null;

  switch (target.kind) {
    case "approvals":
      return (
        <Button variant="outline" size="sm" asChild>
          <Link to="/approvals">Open approvals</Link>
        </Button>
      );
    case "renewals":
      return (
        <Button variant="outline" size="sm" asChild>
          <Link to="/renewals">Open renewals</Link>
        </Button>
      );
    case "client":
      return (
        <Button variant="outline" size="sm" asChild>
          <Link to="/clients/$id" params={{ id: target.id }}>
            Open client
          </Link>
        </Button>
      );
    case "lead":
      return (
        <Button variant="outline" size="sm" asChild>
          <Link to="/leads/$id" params={{ id: target.id }}>
            Open lead
          </Link>
        </Button>
      );
  }
}

function NotificationsPage() {
  const clientNow = useClientNow();
  const { notifications, unreadCount, markAsRead, markAllRead, isFetching, dataUpdatedAt } =
    useNotifications();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [readingIds, setReadingIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [markingAll, setMarkingAll] = useState(false);

  const setFilter = (value: string) => {
    const next: FilterValue = isFilterValue(value) ? value : "all";
    navigate({ search: (current) => ({ ...current, filter: next }), replace: true });
  };

  const sorted = useMemo(
    () =>
      [...notifications].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      ),
    [notifications],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return sorted;
    if (filter === "unread") return sorted.filter((item) => !item.read_at);
    return sorted.filter((item) => item.type === filter);
  }, [sorted, filter]);

  /**
   * The hook rethrows on failure after rolling its optimistic write back. Catching here is
   * what turns that rollback from an unexplained flicker into a reported failure, and the
   * per-row lock is what stops a second click firing a second write against a row that is
   * already being marked.
   */
  const markOne = async (id: string) => {
    if (readingIds.has(id)) return;
    setReadingIds((current) => new Set(current).add(id));
    try {
      await markAsRead(id);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setReadingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const markEverything = async () => {
    if (markingAll || unreadCount === 0) return;
    const count = unreadCount;
    setMarkingAll(true);
    try {
      await markAllRead();
      toast.success(`Marked ${count} notification${count === 1 ? "" : "s"} read`);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setMarkingAll(false);
    }
  };

  const updatedAt = Number.isFinite(dataUpdatedAt) ? new Date(dataUpdatedAt).toISOString() : null;

  const columns: ColumnDef<NotificationRecord>[] = [
    {
      id: "notification",
      header: "Notification",
      priority: "primary",
      sticky: true,
      cell: (notification) => {
        const Icon = isNotificationType(notification.type)
          ? TYPE_ICON[notification.type]
          : MailOpen;
        const unread = !notification.read_at;
        return (
          <span className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                isNotificationType(notification.type)
                  ? TYPE_TONE[notification.type]
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm leading-snug", unread && "font-medium")}>
                {notification.title}
              </span>
              {notification.body && (
                <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                  {notification.body}
                </span>
              )}
              {unread && <span className="sr-only">Unread</span>}
            </span>
          </span>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      priority: "secondary",
      cell: (notification) => (
        <span className="text-xs text-muted-foreground">{typeLabel(notification.type)}</span>
      ),
    },
    {
      id: "received",
      header: "Received",
      priority: "tertiary",
      cell: (notification) => (
        <span className="text-xs text-muted-foreground">
          <time dateTime={notification.created_at}>{formatDateTime(notification.created_at)}</time>
          {clientNow === null ? null : ` (${relativeTime(notification.created_at, clientNow)})`}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      priority: "primary",
      cell: (notification) => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          {!notification.read_at && (
            <Button
              variant="ghost"
              size="sm"
              disabled={readingIds.has(notification.id)}
              onClick={() => void markOne(notification.id)}
            >
              <CheckCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              {readingIds.has(notification.id) ? "Marking..." : "Mark read"}
            </Button>
          )}
          <OpenTargetButton notification={notification} />
        </span>
      ),
    },
  ];

  const renderCard = (notification: NotificationRecord) => {
    const unread = !notification.read_at;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm leading-snug", unread && "font-medium")}>
            {notification.title}
          </span>
          {unread && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              Unread
            </span>
          )}
        </div>
        {notification.body && <p className="text-xs text-muted-foreground">{notification.body}</p>}
        <p className="text-xs text-muted-foreground">
          {typeLabel(notification.type)} ·{" "}
          <time dateTime={notification.created_at}>{formatDateTime(notification.created_at)}</time>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {unread && (
            <Button
              variant="ghost"
              size="sm"
              disabled={readingIds.has(notification.id)}
              onClick={() => void markOne(notification.id)}
            >
              <CheckCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              {readingIds.has(notification.id) ? "Marking..." : "Mark read"}
            </Button>
          )}
          <OpenTargetButton notification={notification} />
        </div>
      </div>
    );
  };

  const filterOptions = FILTER_VALUES.map((value) => ({
    value,
    label: FILTER_LABELS[value],
  }));

  return (
    <>
      <WorkspaceHeader
        context="Personal"
        title="Notifications"
        description="Activity across leads, quotes, clients and approvals, addressed to you."
        status={
          updatedAt === null ? undefined : (
            <StaleDataIndicator updatedAt={updatedAt} isRefetching={isFetching} />
          )
        }
        primaryAction={
          <Button
            variant="outline"
            size="sm"
            disabled={markingAll || unreadCount === 0}
            onClick={() => void markEverything()}
          >
            <CheckCheck aria-hidden="true" className="mr-2 h-4 w-4" />
            {markingAll ? "Marking..." : "Mark all read"}
          </Button>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "unread",
              label: "Unread",
              value: unreadCount,
              // The true count: `countUnreadNotifications` is a server-side count over every
              // row, not over the fifty this page holds.
              hint: "across every notification",
              tone: unreadCount > 0 ? "warning" : "neutral",
            },
            {
              id: "loaded",
              label: "On this page",
              value: sorted.length,
              // `listNotifications` takes `limit = 50`. Presenting this as a workspace total
              // would be the page-scoped-metric defect this branch removed elsewhere.
              hint: "most recent 50",
            },
          ]}
          columns={2}
        />

        {sorted.length === 0 ? (
          <EmptyWorkspaceState
            icon={MailOpen}
            title="No notifications"
            description="Approvals waiting on you, renewal windows, risk changes and stale touchpoints appear here."
          />
        ) : (
          <>
            <FilterToolbar
              filters={[
                {
                  id: "filter",
                  label: "Show",
                  options: filterOptions,
                  value: filter,
                  onChange: setFilter,
                },
              ]}
              onClear={() => setFilter("all")}
              resultCount={filtered.length}
            />

            {filtered.length === 0 ? (
              <FilteredEmptyState
                onClear={() => setFilter("all")}
                filterSummary={`Show: ${FILTER_LABELS[filter]}`}
              />
            ) : (
              <ResponsiveRecordList
                columns={columns}
                rows={filtered}
                rowKey={(notification) => notification.id}
                renderCard={renderCard}
                caption="Your notifications"
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

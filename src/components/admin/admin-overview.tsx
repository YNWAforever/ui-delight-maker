import { Link } from "@tanstack/react-router";
import { Ban, Clock3, KeyRound, ScrollText, ShieldAlert, UsersRound } from "lucide-react";

import {
  EmptyWorkspaceState,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  type SalesMetric,
} from "@/components/sales";
import { Card } from "@/components/ui/card";
import { formatCount, formatDateTime } from "@/lib/format";
import type { AdminAuditLog } from "@/server/repositories/admin-access";

export type AdminOverviewData = {
  activeUsers: number;
  invitedUsers: number;
  suspendedUsers: number;
  deactivatedUsers: number;
  pendingInvitations: number;
  managerlessTeams: number;
  expiringOverrides: number;
  pendingAccessRequests: number;
};

type AdminOverviewProps = {
  overview: AdminOverviewData;
  auditLogs: readonly AdminAuditLog[];
};

/**
 * Every destination on this page is now a `<Link>`, and every one of them carries search
 * params the target route's `validateSearch` actually declares.
 *
 * Both halves were wrong before. The links were raw `<a href>`, so each click was a full
 * document reload that re-ran the root shell fetch and the `/admin` navigation fetch —
 * while `admin-shell.tsx` two panels away used `<Link>` correctly, so the same screen
 * disagreed with itself. And three of the six carried keys no schema declares:
 * `?filter=managerless`, `?filter=expiring` and `?status=pending` were all parsed away
 * silently, so "Managerless teams: 3" landed on the full unfiltered directory. A tile that
 * states a number and then does not take you to it is worse than a tile that is not a link.
 *
 * Where a real filter exists it is used. Where one does not — there is no managerless or
 * expiring filter in `adminOrganizationSearchSchema` or `adminAccessSearchSchema` — the
 * link goes to the workspace that holds the answer and the hint says what it does, rather
 * than inventing a parameter that does nothing.
 */

/** The four numbers that mean someone has work to do. `MetricStrip` caps the strip at four. */
function primaryMetrics(overview: AdminOverviewData): SalesMetric[] {
  return [
    {
      id: "pendingAccessRequests",
      label: "Access requests",
      value: formatCount(overview.pendingAccessRequests),
      hint: "waiting on a decision",
      tone: overview.pendingAccessRequests > 0 ? "warning" : "neutral",
      href: "/admin/access",
      icon: ShieldAlert,
    },
    {
      id: "pendingInvitations",
      label: "Pending invitations",
      value: formatCount(overview.pendingInvitations),
      hint: "sent, not yet accepted",
      tone: overview.pendingInvitations > 0 ? "info" : "neutral",
      href: "/admin/people?status=invited",
      icon: Clock3,
    },
    {
      id: "suspendedUsers",
      label: "Suspended users",
      value: formatCount(overview.suspendedUsers),
      hint: "access removed, profile kept",
      tone: overview.suspendedUsers > 0 ? "warning" : "neutral",
      href: "/admin/people?status=suspended",
      icon: Ban,
    },
    {
      id: "activeUsers",
      label: "Active users",
      value: formatCount(overview.activeUsers),
      hint: "can sign in today",
      href: "/admin/people?status=active",
      icon: UsersRound,
    },
  ];
}

/**
 * The two numbers with no filter behind them.
 *
 * They stay visible because they are real counts from the same read; they are in the
 * supporting row rather than the strip because clicking them cannot narrow anything, and a
 * tile that looks identical to one that filters should not behave differently.
 */
function supportingMetrics(overview: AdminOverviewData): SalesMetric[] {
  return [
    {
      id: "managerlessTeams",
      label: "Managerless teams",
      value: formatCount(overview.managerlessTeams),
      hint: "no filter for this yet — open the directory",
      tone: overview.managerlessTeams > 0 ? "warning" : "neutral",
      href: "/admin/teams",
      icon: UsersRound,
    },
    {
      id: "expiringOverrides",
      label: "Expiring overrides",
      value: formatCount(overview.expiringOverrides),
      hint: "review per profile in Access",
      tone: overview.expiringOverrides > 0 ? "info" : "neutral",
      href: "/admin/access",
      icon: KeyRound,
    },
  ];
}

export function AdminOverview({ overview, auditLogs }: AdminOverviewProps) {
  return (
    <div className="min-w-0 space-y-6 px-4 py-6 md:px-6">
      <MetricStrip
        metrics={primaryMetrics(overview)}
        supporting={supportingMetrics(overview)}
        columns={4}
      />

      <section className="space-y-3">
        <SectionHeader
          title="Recent security events"
          description="Administrative changes, retained with redacted before-and-after snapshots."
          action={
            <Link
              to="/admin/audit"
              search={{ page: 1 }}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ScrollText aria-hidden="true" className="h-4 w-4" />
              Open audit log
            </Link>
          }
        />
        {auditLogs.length > 0 ? (
          <Card className="divide-y divide-border overflow-hidden p-0">
            {auditLogs.map((event) => (
              <Link
                key={event.id}
                to="/admin/audit"
                // `adminAuditSearchSchema` declares `target`, not `targetId`. The old link
                // emitted the latter, so the one navigation that most needs to carry its
                // filter opened the audit log unfiltered.
                search={{ ...(event.target_id ? { target: event.target_id } : {}), page: 1 }}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {event.action}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {event.target_type}
                    {event.target_id ? " · " + event.target_id : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge domain="auditSeverity" value={event.severity} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(event.created_at)}
                  </span>
                </span>
              </Link>
            ))}
          </Card>
        ) : (
          <EmptyWorkspaceState
            icon={ScrollText}
            title="No security events in the recent window"
            description="Role changes, suspensions, overrides and team changes are recorded here as they happen."
          />
        )}
      </section>
    </div>
  );
}

import { ArrowUpRight, Ban, Clock3, KeyRound, ShieldAlert, UsersRound } from "lucide-react";
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

const metricIcons = {
  activeUsers: UsersRound,
  pendingInvitations: Clock3,
  suspendedUsers: Ban,
  managerlessTeams: UsersRound,
  expiringOverrides: KeyRound,
  pendingAccessRequests: ShieldAlert,
} as const;

const metricLinks = [
  { key: "activeUsers", label: "Active users", href: "/admin/people?status=active" },
  { key: "pendingInvitations", label: "Pending invitations", href: "/admin/people?status=invited" },
  { key: "suspendedUsers", label: "Suspended users", href: "/admin/people?status=suspended" },
  { key: "managerlessTeams", label: "Managerless teams", href: "/admin/teams?filter=managerless" },
  { key: "expiringOverrides", label: "Expiring overrides", href: "/admin/access?filter=expiring" },
  {
    key: "pendingAccessRequests",
    label: "Pending access requests",
    href: "/admin/access?status=pending",
  },
] as const;

function MetricLink({
  label,
  href,
  value,
  icon: Icon,
}: {
  label: string;
  href: string;
  value: number;
  icon: typeof UsersRound;
}) {
  return (
    <a
      href={href}
      className="group flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums text-foreground">
        {formatCount(value)}
        <ArrowUpRight
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </span>
    </a>
  );
}

export function AdminOverview({ overview, auditLogs }: AdminOverviewProps) {
  return (
    <div className="min-w-0">
      <header className="border-b border-border px-4 py-5 md:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Admin overview
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Organization health
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the people, access, and security work that needs attention.
            </p>
          </div>
          <a
            href="/admin/audit"
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShieldAlert aria-hidden="true" className="h-4 w-4" />
            Security audit
          </a>
        </div>
      </header>

      <div className="space-y-6 px-4 py-5 md:px-6 md:py-6">
        <section aria-labelledby="admin-metrics-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id="admin-metrics-heading" className="text-sm font-semibold text-foreground">
              Operational signals
            </h3>
            <span className="text-xs text-muted-foreground">Live from ClientOps</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metricLinks.map((metric) => (
              <MetricLink
                key={metric.key}
                label={metric.label}
                href={metric.href}
                value={overview[metric.key]}
                icon={metricIcons[metric.key]}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="security-events-heading" className="border-t border-border pt-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="security-events-heading" className="text-sm font-semibold text-foreground">
                Recent security events
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Administrative changes are retained with redacted snapshots.
              </p>
            </div>
            <a
              href="/admin/audit"
              className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View full audit
            </a>
          </div>
          {auditLogs.length > 0 ? (
            <div className="divide-y divide-border rounded-md border border-border">
              {auditLogs.map((event) => (
                <a
                  key={event.id}
                  href={"/admin/audit?targetId=" + encodeURIComponent(event.target_id ?? "")}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(event.created_at)}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No security events in the recent window.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

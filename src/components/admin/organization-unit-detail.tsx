import { Link } from "@tanstack/react-router";
import { ExternalLink, ScrollText } from "lucide-react";

import { StatusBadge } from "@/components/sales";
import { Button } from "@/components/ui/button";
import type { AdminOrganizationSearch } from "@/lib/admin/schemas";
import { formatCount, formatDateTime } from "@/lib/format";
import type {
  Department,
  OrganizationUnitDetail as OrganizationUnitDetailData,
  Team,
} from "@/server/repositories/admin-teams";
import { TeamMemberTable, type TeamMemberRow, type TeamMemberUser } from "./team-member-table";

/**
 * The tabs this panel actually has data for.
 *
 * `ADMIN_ORGANIZATION_TABS` in `src/lib/admin/schemas.ts` still declares five, and that
 * schema is deliberately untouched — it is the URL contract, and a hand-typed
 * `?tab=permissions` must keep parsing rather than throwing. What changed is that
 * "Permissions" is no longer offered as a destination: its entire body was one sentence of
 * prose with no data source behind it, which is what §16 calls coming-soon presented as
 * active navigation. Scoped overrides are per profile (`getAdminOverridesFn` takes a
 * profileId and nothing else), so there is no unit-scoped read to render here and inventing
 * an empty table would claim a measurement nobody takes.
 *
 * "Activity" survives because it became real: `admin_audit_logs.target_id` holds the
 * department or team id for every write in `admin-teams.ts`, so the tab can link to the
 * audit log genuinely filtered to this unit instead of describing a log it did not link to.
 */
const VISIBLE_TABS = ["overview", "members", "work", "activity"] as const;

type VisibleTab = (typeof VISIBLE_TABS)[number];

const TAB_LABEL: Record<VisibleTab, string> = {
  overview: "Overview",
  members: "Members",
  work: "Work",
  activity: "Activity",
};

function visibleTab(tab: AdminOrganizationSearch["tab"]): VisibleTab {
  return (VISIBLE_TABS as readonly string[]).includes(tab) ? (tab as VisibleTab) : "overview";
}

type OrganizationUnitDetailProps = {
  detail: OrganizationUnitDetailData | null;
  users: readonly TeamMemberUser[];
  activeTab: AdminOrganizationSearch["tab"];
  canManage: boolean;
  /** Renders the link through to `/admin/teams/$id`. Off on the record page itself. */
  showFullRecordLink?: boolean;
  onTabChange: (tab: AdminOrganizationSearch["tab"]) => void;
  onEdit?: (unit: Department | Team) => void;
  onAddMembers?: (
    profileIds: string[],
    startsAt: string | null,
    endsAt: string | null,
  ) => Promise<unknown> | unknown;
  onUpdateMember?: (
    member: TeamMemberRow,
    role: "lead" | "deputy" | "member",
  ) => Promise<unknown> | unknown;
  onEndMember?: (member: TeamMemberRow) => Promise<unknown> | unknown;
};

function displayName(id: string | null | undefined, users: readonly TeamMemberUser[]) {
  if (!id) return "Unassigned";
  const user = users.find((candidate) => candidate.id === id);
  return user?.name || user?.email || id;
}

export function OrganizationUnitDetail({
  detail,
  users,
  activeTab,
  canManage,
  showFullRecordLink = false,
  onTabChange,
  onEdit,
  onAddMembers,
  onUpdateMember,
  onEndMember,
}: OrganizationUnitDetailProps) {
  if (!detail) {
    return (
      <aside className="border-l border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Select a department or working team to review its record.
      </aside>
    );
  }

  const tab = visibleTab(activeTab);
  const isDepartment = detail.kind === "department";
  const unit = detail.unit;
  const openOwnedWorkCount = detail.openOwnedWorkCount;
  const members: TeamMemberRow[] = detail.memberships.map((membership) => {
    const user = users.find((candidate) => candidate.id === membership.profileId);
    return {
      ...membership,
      name: user?.name || user?.email || membership.profileId,
      email: user?.email ?? null,
      profileStatus: user?.status ?? "active",
    };
  });

  return (
    <aside className="min-w-0 border-l border-border bg-muted/10">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isDepartment ? "Department" : "Working team"}
          </p>
          <p className="mt-1 truncate text-base font-semibold text-foreground">{unit.name}</p>
          <span className="mt-2 inline-flex">
            <StatusBadge domain="organizationUnits" value={unit.status} />
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {showFullRecordLink ? (
            <Button size="sm" asChild>
              {/*
                The only inbound link to `/admin/teams/$id` in the product. Before this the
                route was registered, loaded and reachable by typing a URL only — and its own
                "Back to organization" link was therefore dead too.
              */}
              <Link
                to="/admin/teams/$id"
                params={{ id: unit.id }}
                search={{ kind: detail.kind, tab }}
              >
                Open full record
                <ExternalLink aria-hidden="true" className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          {onEdit && canManage ? (
            <Button size="sm" variant="outline" onClick={() => onEdit(unit)}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-border px-4 py-3">
        <div
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Organization detail tabs"
        >
          {VISIBLE_TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tab === entry}
              onClick={() => onTabChange(entry)}
              className={
                "min-h-9 shrink-0 rounded-md px-3 py-2 text-sm font-medium " +
                (tab === entry
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              {TAB_LABEL[entry]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-4 py-5">
        {tab === "overview" ? (
          <section>
            <h3 className="text-base font-medium text-foreground">Overview</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">
                  {isDepartment ? "Description" : "Purpose"}
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {isDepartment
                    ? (unit as Department).description || "No description"
                    : (unit as Team).purpose || "No purpose recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {isDepartment ? "Department head" : "Team lead"}
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {displayName(
                    isDepartment
                      ? (unit as Department).headProfileId
                      : (unit as Team).leadProfileId,
                    users,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Deputy</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {displayName(unit.deputyProfileId, users)}
                </dd>
              </div>
              {!isDepartment ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Default owner</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {displayName((unit as Team).defaultOwnerProfileId, users)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Last updated</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {unit.updatedAt ? formatDateTime(unit.updatedAt) : "Not recorded"}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {tab === "members" ? (
          isDepartment ? (
            <section>
              <h3 className="text-base font-medium text-foreground">Department members</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Department membership is represented through working teams. Review a team to change
                an individual membership.
              </p>
            </section>
          ) : (
            <TeamMemberTable
              members={members}
              availableMembers={users}
              canManage={canManage}
              onAddMembers={onAddMembers ?? (() => undefined)}
              onUpdateMember={onUpdateMember ?? (() => undefined)}
              onEndMember={onEndMember ?? (() => undefined)}
            />
          )
        ) : null}

        {tab === "work" ? (
          <section>
            <h3 className="text-base font-medium text-foreground">Workload signals</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Active members" value={formatCount(members.length)} />
              <Metric label="Open owned work" value={formatCount(openOwnedWorkCount)} />
              <Metric label="Status" value={unit.status === "active" ? "Active" : "Archived"} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Work ownership remains attached to individual profiles and is reviewed before archival
              or lifecycle changes.
            </p>
          </section>
        ) : null}

        {tab === "activity" ? (
          <section>
            <h3 className="text-base font-medium text-foreground">Activity</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {unit.createdAt ? formatDateTime(unit.createdAt) : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last updated</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {unit.updatedAt ? formatDateTime(unit.updatedAt) : "Not recorded"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Every change to this {isDepartment ? "department" : "team"} and its memberships is
              recorded against its id in the administrative audit log.
            </p>
            <div className="mt-3">
              <Button size="sm" variant="outline" asChild>
                <Link to="/admin/audit" search={{ target: unit.id, page: 1 }}>
                  <ScrollText aria-hidden="true" className="mr-2 h-4 w-4" />
                  Open the audit log for this {isDepartment ? "department" : "team"}
                </Link>
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

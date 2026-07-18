import type { AdminOrganizationSearch } from "@/lib/admin/schemas";
import { formatDateTime } from "@/lib/format";
import type {
  Department,
  OrganizationUnitDetail as OrganizationUnitDetailData,
  Team,
} from "@/server/repositories/admin-teams";
import { TeamMemberTable, type TeamMemberRow, type TeamMemberUser } from "./team-member-table";

type OrganizationUnitDetailProps = {
  detail: OrganizationUnitDetailData | null;
  users: readonly TeamMemberUser[];
  activeTab: AdminOrganizationSearch["tab"];
  canManage: boolean;
  onTabChange: (tab: AdminOrganizationSearch["tab"]) => void;
  onEdit?: (unit: Department | Team) => void;
  onAddMembers?: (profileIds: string[], startsAt: string | null, endsAt: string | null) => void;
  onUpdateMember?: (member: TeamMemberRow, role: "lead" | "deputy" | "member") => void;
  onEndMember?: (member: TeamMemberRow) => void;
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
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {isDepartment ? "Department" : "Working team"}
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-foreground">{unit.name}</h2>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{unit.status}</p>
        </div>
        {onEdit && canManage ? (
          <button
            type="button"
            onClick={() => onEdit(unit)}
            className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Edit
          </button>
        ) : null}
      </div>

      <div className="border-b border-border px-4 py-3">
        <div
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Organization detail tabs"
        >
          {(["overview", "members", "work", "permissions", "activity"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => onTabChange(tab)}
              className={
                "min-h-9 shrink-0 rounded-md px-3 py-2 text-sm font-medium capitalize " +
                (activeTab === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-4 py-5">
        {activeTab === "overview" ? (
          <section>
            <h3 className="text-sm font-semibold text-foreground">Overview</h3>
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

        {activeTab === "members" ? (
          isDepartment ? (
            <section>
              <h3 className="text-sm font-semibold text-foreground">Department members</h3>
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

        {activeTab === "work" ? (
          <section>
            <h3 className="text-sm font-semibold text-foreground">Workload signals</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Active members" value={members.length} />
              <Metric label="Open owned work" value={openOwnedWorkCount} />
              <Metric label="Status" value={unit.status} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Work ownership remains attached to individual profiles and is reviewed before archival
              or lifecycle changes.
            </p>
          </section>
        ) : null}

        {activeTab === "permissions" ? (
          <section>
            <h3 className="text-sm font-semibold text-foreground">Scoped permissions</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Team and department scope is evaluated server-side for each protected action. Explicit
              access overrides are reviewed in the Access workspace.
            </p>
          </section>
        ) : null}

        {activeTab === "activity" ? (
          <section>
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Created {unit.createdAt ? formatDateTime(unit.createdAt) : "date not recorded"}.
              Updates are preserved in the administrative audit log.
            </p>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold capitalize tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

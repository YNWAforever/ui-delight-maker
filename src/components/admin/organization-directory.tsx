import { useEffect, useRef, useState } from "react";
import { Building2, Plus, UsersRound } from "lucide-react";

import { EmptyWorkspaceState, StatusBadge } from "@/components/sales";
import { Button } from "@/components/ui/button";
import type { AdminOrganizationSearch } from "@/lib/admin/schemas";
import type { OrganizationDirectory as OrganizationDirectoryData } from "@/server/repositories/admin-teams";

type OrganizationDirectoryProps = {
  data: OrganizationDirectoryData | undefined;
  search: AdminOrganizationSearch;
  selectedUnitId?: string;
  loading?: boolean;
  /** Deny by default: a create control is only offered to a role that holds the capability. */
  canManageDepartment?: boolean;
  canManageTeam?: boolean;
  onSearchChange: (search: AdminOrganizationSearch) => void;
  onSelectUnit: (unit: { kind: "department" | "team"; id: string }) => void;
  onCreate: (kind: "department" | "team") => void;
};

function matchesStatus(status: "active" | "archived", filter: AdminOrganizationSearch["status"]) {
  return filter === "all" || status === filter;
}

function matchesQuery(name: string, query: string | undefined) {
  return !query || name.toLowerCase().includes(query.toLowerCase());
}

/**
 * The department and team directory.
 *
 * The search box now holds a local draft and pushes to the URL on a 250 ms debounce, the
 * same way `PeopleDirectory` does. It used to `.trim()` on every keystroke and navigate
 * immediately while reading its value back from the trimmed URL, so a space was erased as
 * you typed it — "sales ops" was literally unreachable — and every keystroke wrote a history
 * entry. Two sibling directories on the same screen behaving differently is the drift this
 * revision exists to remove.
 *
 * The create control is gated rather than universally rendered. `departments.manage` belongs
 * to Super Admin and Admin and `teams.manage` adds Manager, so a `read_only` actor — who
 * reaches this screen legitimately through `teams.view` — used to see the button, click it,
 * and only then be told the action was outside their scope.
 */
export function OrganizationDirectory({
  data,
  search,
  selectedUnitId,
  loading = false,
  canManageDepartment = false,
  canManageTeam = false,
  onSearchChange,
  onSelectUnit,
  onCreate,
}: OrganizationDirectoryProps) {
  const [draftQuery, setDraftQuery] = useState(search.q ?? "");
  const latestSearch = useRef(search);

  useEffect(() => {
    latestSearch.current = search;
  }, [search]);

  useEffect(() => {
    setDraftQuery(search.q ?? "");
  }, [search.q]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const nextQuery = draftQuery.trim() || undefined;
      if (nextQuery !== latestSearch.current.q) {
        onSearchChange({ ...latestSearch.current, q: nextQuery, unit: undefined });
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [draftQuery, onSearchChange]);

  const departments = (data?.departments ?? []).filter(
    (department) =>
      matchesStatus(department.status, search.status) && matchesQuery(department.name, search.q),
  );
  const teams = (data?.teams ?? []).filter(
    (team) => matchesStatus(team.status, search.status) && matchesQuery(team.name, search.q),
  );

  const canCreateSelectedKind = search.kind === "department" ? canManageDepartment : canManageTeam;

  return (
    <section className="min-w-0">
      <div className="space-y-4 border-b border-border px-4 py-5 md:px-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Search departments and teams"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search departments and teams"
            className="min-h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select
            aria-label="Organization status"
            value={search.status}
            onChange={(event) =>
              onSearchChange({
                ...search,
                status: event.target.value as AdminOrganizationSearch["status"],
                unit: undefined,
              })
            }
            className="min-h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="active">Active</option>
            <option value="all">All statuses</option>
            <option value="archived">Archived</option>
          </select>
          {canCreateSelectedKind ? (
            <Button type="button" size="sm" onClick={() => onCreate(search.kind)}>
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              <span aria-label="Create organization unit">Create organization unit</span>
            </Button>
          ) : null}
        </div>

        <div
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Organization unit type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={search.kind === "department"}
            onClick={() => onSearchChange({ ...search, kind: "department", unit: undefined })}
            className={
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium " +
              (search.kind === "department"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            <Building2 aria-hidden="true" className="h-4 w-4" />
            Departments
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={search.kind === "team"}
            onClick={() => onSearchChange({ ...search, kind: "team", unit: undefined })}
            className={
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium " +
              (search.kind === "team"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            <UsersRound aria-hidden="true" className="h-4 w-4" />
            Working teams
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-4 py-8 text-sm text-muted-foreground md:px-6">Loading organization…</p>
      ) : (
        <div className="grid gap-6 px-4 py-5 md:px-6 lg:grid-cols-2">
          <OrganizationUnitList
            heading="Departments"
            icon={Building2}
            empty="No departments match these filters."
            kind="department"
            units={departments}
            selectedUnitId={selectedUnitId}
            onSelectUnit={onSelectUnit}
          />
          <OrganizationUnitList
            heading="Working teams"
            icon={UsersRound}
            empty="No working teams match these filters."
            kind="team"
            units={teams}
            selectedUnitId={selectedUnitId}
            onSelectUnit={onSelectUnit}
          />
        </div>
      )}
    </section>
  );
}

function OrganizationUnitList({
  heading,
  icon: Icon,
  empty,
  kind,
  units,
  selectedUnitId,
  onSelectUnit,
}: {
  heading: string;
  icon: typeof Building2;
  empty: string;
  kind: "department" | "team";
  units: Array<{ id: string; name: string; status: "active" | "archived" }>;
  selectedUnitId?: string;
  onSelectUnit: (unit: { kind: "department" | "team"; id: string }) => void;
}) {
  return (
    <section aria-labelledby={"organization-" + kind + "-heading"} className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2
          id={"organization-" + kind + "-heading"}
          className="flex items-center gap-2 text-base font-medium text-foreground"
        >
          <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          {heading}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{units.length}</span>
      </div>
      <div className="mt-3">
        {units.length === 0 ? (
          <EmptyWorkspaceState icon={Icon} title={empty} />
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                aria-pressed={selectedUnitId === unit.id}
                onClick={() => onSelectUnit({ kind, id: unit.id })}
                className={
                  "flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring " +
                  (selectedUnitId === unit.id ? "bg-primary/10" : "")
                }
              >
                <span className="min-w-0 truncate font-medium text-foreground">{unit.name}</span>
                <StatusBadge domain="organizationUnits" value={unit.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

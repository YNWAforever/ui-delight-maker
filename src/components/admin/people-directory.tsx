import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, UserRound } from "lucide-react";

import {
  EmptyWorkspaceState,
  FilteredEmptyState,
  LoadingSkeleton,
  ResponsiveRecordList,
  StatusBadge,
  type ColumnDef,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import type { AdminPeopleSearch } from "@/lib/admin/schemas";
import { formatCount, formatDateTime } from "@/lib/format";
import { getUserRoleLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import type { AdminUserSummary, Paginated } from "@/server/repositories/admin-users";

type FilterOption = { id: string; name: string };

export type PeopleDirectoryProps = {
  data: Paginated<AdminUserSummary> | undefined;
  search: AdminPeopleSearch;
  selectedUserId?: string;
  onSearchChange: (search: AdminPeopleSearch) => void;
  onSelectUser: (profileId: string) => void;
  loading?: boolean;
  error?: string | null;
  /** Real department rows from the organization directory. Empty hides the control. */
  departments?: readonly FilterOption[];
  /** Real team rows from the organization directory. Empty hides the control. */
  teams?: readonly FilterOption[];
};

function displayName(user: AdminUserSummary) {
  return user.name?.trim() || user.email || "Unnamed user";
}

function updateFilter(
  search: AdminPeopleSearch,
  onSearchChange: PeopleDirectoryProps["onSearchChange"],
  key: keyof AdminPeopleSearch,
  value: string,
) {
  onSearchChange({
    ...search,
    [key]: value || undefined,
    page: 1,
  });
}

const SELECT_CLASS =
  "min-h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The people list.
 *
 * Two things changed about what it is allowed to offer.
 *
 * **The "Filter by activity" select is gone.** `toUserFilters` never forwarded `activity`
 * and `AdminUserFilters` has no such field, so changing it rewrote the URL and produced an
 * *identical* query key — React Query then served the same cached rows. A filter that
 * visibly does nothing is worse than an absent one, because the reader concludes the data
 * is wrong rather than the control. `sort` and `manager` have the same dead-schema problem
 * and never had a rendered control; they stay uncontrolled. The schema fields are left
 * alone: they are the backend's half of a filter that could exist, and deleting them would
 * throw away the only record of that.
 *
 * **Department and team gained controls.** Those two *are* forwarded to
 * `listAdminUsers`, and the props to feed them were declared here and never destructured —
 * the filter worked end to end and had no way to be used. They render only when the caller
 * actually has the organization directory, so the control appears when it can do something.
 *
 * The inert row-overflow button is also gone. It rendered a "more" icon with
 * `aria-label="Open actions for …"` whose entire behaviour was `stopPropagation`, so
 * assistive technology announced an actions menu that did not exist. Row actions live in
 * the record panel beside the table, where they can be gated on the actor's capabilities.
 */
export function PeopleDirectory({
  data,
  search,
  selectedUserId,
  onSearchChange,
  onSelectUser,
  loading = false,
  error = null,
  departments = [],
  teams = [],
}: PeopleDirectoryProps) {
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
        onSearchChange({
          ...latestSearch.current,
          q: nextQuery,
          page: 1,
        });
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [draftQuery, onSearchChange]);

  const rows = data?.items ?? [];
  const page = data?.page ?? search.page ?? 1;
  const limit = data?.limit ?? 50;
  const total = data?.total ?? 0;
  const hasPrevious = page > 1;
  const hasNext = page * limit < total;

  const hasFilters = Boolean(
    search.q || search.status || search.role || search.department || search.team,
  );

  const clearFilters = () =>
    onSearchChange({
      ...search,
      q: undefined,
      status: undefined,
      role: undefined,
      department: undefined,
      team: undefined,
      page: 1,
    });

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (search.q) parts.push(`Search: ${search.q}`);
    if (search.status) parts.push(`Status: ${search.status}`);
    if (search.role) parts.push(`Role: ${getUserRoleLabel(search.role)}`);
    if (search.department) {
      parts.push(
        `Department: ${departments.find((entry) => entry.id === search.department)?.name ?? search.department}`,
      );
    }
    if (search.team) {
      parts.push(`Team: ${teams.find((entry) => entry.id === search.team)?.name ?? search.team}`);
    }
    return parts.join(" · ");
  }, [departments, search.department, search.q, search.role, search.status, search.team, teams]);

  const nameCell = (user: AdminUserSummary) => (
    <button
      type="button"
      onClick={() => onSelectUser(user.id)}
      aria-current={selectedUserId === user.id ? "true" : undefined}
      className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
        {user.name?.slice(0, 2).toUpperCase() || (
          <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 truncate font-medium text-foreground">{displayName(user)}</span>
    </button>
  );

  const columns: ColumnDef<AdminUserSummary>[] = [
    { id: "name", header: "Name", priority: "primary", cell: nameCell },
    {
      id: "role",
      header: "Role",
      priority: "primary",
      cell: (user) => <span className="text-sm">{getUserRoleLabel(user.role)}</span>,
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (user) => <StatusBadge domain="adminProfiles" value={user.status} />,
    },
    {
      id: "email",
      header: "Email",
      priority: "secondary",
      cell: (user) => (
        <span className="block max-w-[16rem] truncate text-muted-foreground">
          {user.email ?? "No email"}
        </span>
      ),
    },
    {
      id: "lastActive",
      header: "Last active",
      priority: "secondary",
      cell: (user) => (
        <span className="text-xs text-muted-foreground">
          {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "Never active"}
        </span>
      ),
    },
    {
      id: "department",
      header: "Department",
      priority: "tertiary",
      cell: (user) => <span className="text-muted-foreground">{user.departmentName ?? "—"}</span>,
    },
    {
      id: "manager",
      header: "Manager",
      priority: "tertiary",
      cell: (user) => <span className="text-muted-foreground">{user.managerName ?? "—"}</span>,
    },
  ];

  const renderCard = (user: AdminUserSummary) => (
    <button
      type="button"
      onClick={() => onSelectUser(user.id)}
      className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{displayName(user)}</span>
        <StatusBadge domain="adminProfiles" value={user.status} />
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {getUserRoleLabel(user.role)} · {user.email ?? "No email"}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {user.lastActiveAt ? `Last active ${formatDateTime(user.lastActiveAt)}` : "Never active"}
      </span>
    </button>
  );

  return (
    <div className="min-w-0 space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search people</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <input
            aria-label="Search people"
            name="people-search"
            autoComplete="off"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search name, email, or profile"
            className="min-h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <select
          aria-label="Filter by status"
          value={search.status ?? ""}
          onChange={(event) => updateFilter(search, onSearchChange, "status", event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <select
          aria-label="Filter by role"
          value={search.role ?? ""}
          onChange={(event) => updateFilter(search, onSearchChange, "role", event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="sales">Sales</option>
          <option value="client_success">Client Success</option>
          <option value="accounting">Accounting</option>
          <option value="read_only">Read Only</option>
        </select>
        {departments.length > 0 && (
          <select
            aria-label="Filter by department"
            value={search.department ?? ""}
            onChange={(event) =>
              updateFilter(search, onSearchChange, "department", event.target.value)
            }
            className={SELECT_CLASS}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        )}
        {teams.length > 0 && (
          <select
            aria-label="Filter by team"
            value={search.team ?? ""}
            onChange={(event) => updateFilter(search, onSearchChange, "team", event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <LoadingSkeleton
          variant="table"
          label="people"
          priorities={columns.map((column) => column.priority)}
        />
      ) : rows.length === 0 ? (
        hasFilters ? (
          <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
        ) : (
          <EmptyWorkspaceState
            icon={UserRound}
            title="No people yet"
            description="Invited and active users appear here once an invitation is accepted."
          />
        )
      ) : (
        <ResponsiveRecordList
          columns={columns}
          rows={rows}
          rowKey={(user) => user.id}
          renderCard={renderCard}
          breakpoint="lg"
          caption="People in this workspace"
          selectedRowKey={selectedUserId}
        />
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className={cn(total === 0 && "sr-only")}>
          {total === 0
            ? "0 people"
            : `Showing ${formatCount((page - 1) * limit + 1)}–${formatCount(
                Math.min(page * limit, total),
              )} of ${formatCount(total)}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={!hasPrevious}
            onClick={() => onSearchChange({ ...search, page: page - 1 })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={!hasNext}
            onClick={() => onSearchChange({ ...search, page: page + 1 })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

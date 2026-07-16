import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, UserRound } from "lucide-react";
import type { AdminPeopleSearch } from "@/lib/admin/schemas";
import type { AdminUserSummary, Paginated } from "@/server/repositories/admin-users";
import { formatDateTime } from "@/lib/format";

type FilterOption = { id: string; name: string };

export type PeopleDirectoryProps = {
  data: Paginated<AdminUserSummary> | undefined;
  search: AdminPeopleSearch;
  selectedUserId?: string;
  onSearchChange: (search: AdminPeopleSearch) => void;
  onSelectUser: (profileId: string) => void;
  onInvite?: () => void;
  canInvite?: boolean;
  loading?: boolean;
  error?: string | null;
  departments?: readonly FilterOption[];
  teams?: readonly FilterOption[];
  managers?: readonly FilterOption[];
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

export function PeopleDirectory({
  data,
  search,
  selectedUserId,
  onSearchChange,
  onSelectUser,
  onInvite,
  canInvite = false,
  loading = false,
  error = null,
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

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-5 md:px-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Administration
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">People</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Find a user, review access, and keep ownership clear.
          </p>
        </div>
        {canInvite && onInvite ? (
          <button
            type="button"
            onClick={onInvite}
            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Invite users
          </button>
        ) : null}
      </div>

      <div className="space-y-4 px-4 py-4 md:px-6">
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
            className="min-h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="min-h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <select
            aria-label="Filter by activity"
            value={search.activity ?? ""}
            onChange={(event) =>
              updateFilter(search, onSearchChange, "activity", event.target.value)
            }
            className="min-h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Any activity</option>
            <option value="active">Active recently</option>
            <option value="stale">Stale activity</option>
            <option value="never">Never active</option>
          </select>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 font-medium">Manager</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Last active</th>
                <th className="px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    Loading people…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    No people match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((user) => {
                  const active = user.id === selectedUserId;
                  return (
                    <tr
                      key={user.id}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => onSelectUser(user.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectUser(user.id);
                        }
                      }}
                      className={
                        "cursor-pointer outline-none focus-visible:bg-accent " +
                        (active ? "bg-accent/60" : "hover:bg-accent/40")
                      }
                    >
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                            {user.name?.slice(0, 2).toUpperCase() || (
                              <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="max-w-[180px] truncate">{displayName(user)}</span>
                        </span>
                      </td>
                      <td className="max-w-[210px] truncate px-3 py-3 text-muted-foreground">
                        {user.email ?? "—"}
                      </td>
                      <td className="px-3 py-3 capitalize">{user.role.replace("_", " ")}</td>
                      <td className="px-3 py-3">{user.departmentName ?? "—"}</td>
                      <td className="px-3 py-3">{user.managerName ?? "—"}</td>
                      <td className="px-3 py-3 capitalize">{user.status}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "Never active"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          aria-label={"Open actions for " + displayName(user)}
                          title="Open actions"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {total === 0
              ? "0 people"
              : "Showing " +
                ((page - 1) * limit + 1) +
                "–" +
                Math.min(page * limit, total) +
                " of " +
                total}
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
    </div>
  );
}

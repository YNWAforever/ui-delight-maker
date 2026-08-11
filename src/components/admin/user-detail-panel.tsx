import { ExternalLink, KeyRound, UsersRound } from "lucide-react";
import type { AdminUserDetail } from "@/server/repositories/admin-users";
import { formatDateTime } from "@/lib/format";

type UserDetailPanelProps = {
  user: AdminUserDetail | null | undefined;
  loading?: boolean;
  onRoleChange?: () => void;
  onLifecycle?: () => void;
  onEditProfile?: () => void;
  onRevokeSessions?: () => void;
  onDelegateWork?: () => void;
  fullHref?: string;
};

export function UserDetailPanel({
  user,
  loading = false,
  onRoleChange,
  onLifecycle,
  onEditProfile,
  onRevokeSessions,
  onDelegateWork,
  fullHref,
}: UserDetailPanelProps) {
  if (loading)
    return (
      <aside className="border-l border-border px-4 py-5 text-sm text-muted-foreground">
        Loading user record...
      </aside>
    );
  if (!user)
    return (
      <aside className="border-l border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Select a person to review their record.
      </aside>
    );
  const name = user.name || user.email || "Unnamed user";
  return (
    <aside className="min-w-0 border-l border-border bg-muted/10">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Selected user
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-foreground">{name}</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{user.email || "No email"}</p>
        </div>
        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium capitalize text-primary">
          {user.status}
        </span>
      </div>
      <div className="space-y-5 px-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <p className="text-xs text-muted-foreground">Role</p>
            <p className="mt-1 text-sm font-medium capitalize text-foreground">
              {user.role.replace("_", " ")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Department</p>
            <p className="mt-1 text-sm text-foreground">{user.departmentName || "No department"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Manager</p>
            <p className="mt-1 text-sm text-foreground">{user.managerName || "No manager"}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <UsersRound aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{user.teamCount} teams</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{user.openTaskCount} open tasks</span>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "Never active"}
            </span>
          </div>
        </div>
        {user.sessionInvalidBefore ? (
          <div>
            <p className="text-xs text-muted-foreground">Sessions invalidated</p>
            <p className="mt-1 text-sm text-foreground">
              {formatDateTime(user.sessionInvalidBefore)}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {onEditProfile ? (
            <button
              type="button"
              onClick={onEditProfile}
              className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Edit profile
            </button>
          ) : null}
          {onRoleChange ? (
            <button
              type="button"
              onClick={onRoleChange}
              className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Change role
            </button>
          ) : null}
          {onDelegateWork ? (
            <button
              type="button"
              onClick={onDelegateWork}
              className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Delegate work
            </button>
          ) : null}
          {onRevokeSessions ? (
            <button
              type="button"
              onClick={onRevokeSessions}
              className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Force sign-out
            </button>
          ) : null}
          {onLifecycle && user.status !== "deactivated" ? (
            <button
              type="button"
              onClick={onLifecycle}
              className={
                "min-h-9 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (user.status === "suspended"
                  ? "border-border hover:bg-accent"
                  : "border-destructive/50 text-destructive hover:bg-destructive/10")
              }
            >
              {user.status === "suspended" ? "Restore access" : "Manage lifecycle"}
            </button>
          ) : null}
          {fullHref ? (
            <a
              href={fullHref}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open full record
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

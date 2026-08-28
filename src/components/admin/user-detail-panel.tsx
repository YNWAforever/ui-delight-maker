import { Link } from "@tanstack/react-router";
import { ExternalLink, KeyRound, ShieldOff, UserCheck, UsersRound } from "lucide-react";

import { LoadingSkeleton, StatusBadge } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { formatCount, formatDateTime } from "@/lib/format";
import { getUserRoleLabel } from "@/lib/status-labels";
import type { AdminUserDetail } from "@/server/repositories/admin-users";

export type UserDetailPanelProps = {
  user: AdminUserDetail | null | undefined;
  loading?: boolean;
  /** Opens the change-role dialog. Omit when the actor's role cannot manage users. */
  onRoleChange?: () => void;
  /** Opens the suspend/deactivate dialog. Omit when the actor cannot suspend or deactivate. */
  onLifecycle?: () => void;
  /** Restores a suspended user. Omit when the actor cannot manage users. */
  onReactivate?: () => void;
  /** Invalidates every session this user holds. Omit without `sessions.revoke`. */
  onRevokeSessions?: () => void;
  /** True while any of the above is in flight; every control is disabled together. */
  busy?: boolean;
  /** Renders the link through to `/admin/people/$id`. Off on the detail page itself. */
  showFullRecordLink?: boolean;
};

/**
 * The record panel beside the people list, and the Profile tab of the record page.
 *
 * The action row is where the safety rules of this workspace live, so they are stated here
 * rather than left to each caller:
 *
 * - **Every dangerous action is subordinate.** Suspend, deactivate and revoke-sessions are
 *   `variant="outline"` at `size="sm"`; nothing on this panel is a filled destructive
 *   button. A mis-click here removes a colleague's access, so the affordance is deliberately
 *   quieter than the safe actions beside it, and the destructive styling appears only inside
 *   the confirmation dialog where the consequence is written out.
 * - **A control the actor cannot use is not rendered.** The caller passes a handler only
 *   when the actor's capabilities allow it (`src/lib/admin/control-access.ts`). "Change
 *   role" used to be wired unconditionally while Invite and Manage-lifecycle beside it
 *   were gated, so a `read_only` actor — who legitimately reaches this screen through
 *   `users.view` — was offered a dialog, filled in a mandatory reason, submitted, and
 *   only then was refused.
 * - **"Open full record" is a router `Link`.** It was a raw `<a href>`, so it cost a full
 *   document reload and re-ran both the root shell fetch and the `/admin` navigation fetch.
 */
export function UserDetailPanel({
  user,
  loading = false,
  onRoleChange,
  onLifecycle,
  onReactivate,
  onRevokeSessions,
  busy = false,
  showFullRecordLink = false,
}: UserDetailPanelProps) {
  if (loading) {
    return (
      <aside className="border-l border-border px-4 py-5">
        <LoadingSkeleton variant="panel" label="this user record" rows={2} />
      </aside>
    );
  }

  if (!user) {
    return (
      <aside className="border-l border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Select a person to review their record.
      </aside>
    );
  }

  const name = user.name || user.email || "Unnamed user";
  const hasActions = Boolean(onRoleChange || onLifecycle || onReactivate || onRevokeSessions);

  return (
    <aside className="min-w-0 border-l border-border bg-muted/10">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Selected person
          </p>
          <p className="mt-1 truncate text-base font-semibold text-foreground">{name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{user.email || "No email"}</p>
        </div>
        <StatusBadge domain="adminProfiles" value={user.status} />
      </div>

      <div className="space-y-5 px-4 py-5">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <dt className="text-xs text-muted-foreground">Role</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {getUserRoleLabel(user.role)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Department</dt>
            <dd className="mt-1 text-sm text-foreground">
              {user.departmentName || "No department"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Manager</dt>
            <dd className="mt-1 text-sm text-foreground">{user.managerName || "No manager"}</dd>
          </div>
        </dl>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <UsersRound aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {formatCount(user.teamCount)} teams
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {formatCount(user.openTaskCount)} open tasks
            </span>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "Never active"}
            </span>
          </div>
        </div>

        {(hasActions || showFullRecordLink) && (
          <div className="space-y-3 border-t border-border pt-4">
            {hasActions && <p className="sr-only">Manage this person's access</p>}
            <div className="flex flex-wrap gap-2">
              {/* The safe action first and visually strongest of the group. */}
              {showFullRecordLink && (
                <Button size="sm" asChild>
                  <Link to="/admin/people/$id" params={{ id: user.id }}>
                    Open full record
                    <ExternalLink aria-hidden="true" className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
              {onRoleChange && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onRoleChange}>
                  Change role
                </Button>
              )}
              {onReactivate && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onReactivate}>
                  <UserCheck aria-hidden="true" className="mr-2 h-4 w-4" />
                  Reactivate
                </Button>
              )}
              {onRevokeSessions && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onRevokeSessions}>
                  <ShieldOff aria-hidden="true" className="mr-2 h-4 w-4" />
                  Revoke sessions
                </Button>
              )}
              {onLifecycle && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onLifecycle}>
                  Suspend or deactivate
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

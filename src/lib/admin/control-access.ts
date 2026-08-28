import { hasCapability } from "@/lib/admin/capabilities";
import type { Capability } from "@/lib/admin/types";

/**
 * What the admin screens offer, derived from the actor's effective capabilities.
 *
 * This is still advisory, not enforcement — the server decides every one of these questions
 * again inside `requireCapability`. What changed is that it can no longer be wrong in the
 * one direction that mattered. It used to take a `UserRole` and read `ROLE_GRANTS`, so it
 * could not see `permission_overrides` and would hide a control from someone holding an
 * explicit grant for it (BD-12). It now takes the effective set resolved server-side, which
 * already accounts for overrides, expiry and the inactive-actor rule.
 *
 * It exists so that six admin routes cannot disagree about which write controls belong to
 * which capability. It replaced four hardcoded role arrays scattered across those routes —
 * `["super_admin", "admin", "manager"].includes(profile?.role ?? "")` and friends — which
 * happened to agree with the policy on the day they were written and had nothing keeping
 * them agreeing.
 *
 * Reaching one of these screens is not the same as being able to act on it: `read_only`
 * holds `users.view` and `teams.view`, so it arrives legitimately and every write control
 * below is expected to be absent for it. That absence is what this produces.
 *
 * The set is target-independent — see `hasCapability` — so this answers "does this actor
 * hold the capability at all", never "may they do it to this particular record". Manager
 * scope and ownership stay server-side.
 */
export type AdminControlAccess = {
  /** Invite dialog. */
  invite: boolean;
  /** Change-role dialog. `assertCanAssignRole` still vets which role, server-side. */
  manageRole: boolean;
  /** Suspend. */
  suspend: boolean;
  /** Deactivate with reassignment. */
  deactivate: boolean;
  /** Revoke every active session for another user. */
  revokeSessions: boolean;
  /** Create and archive departments. */
  manageDepartment: boolean;
  /** Create and archive teams, and change memberships. */
  manageTeam: boolean;
  /** Create and revoke permission overrides. Super Admin only, by construction. */
  overridePermissions: boolean;
  /** Decide access requests. Managers are further limited to team requests, server-side. */
  decideAccessRequests: boolean;
  /** Download the audit history. */
  exportAudit: boolean;
};

export function adminControlAccess(
  capabilities: readonly Capability[] | undefined,
): AdminControlAccess {
  // Fail closed on a missing set, matching how the shell read degrades: a disabled control
  // a reload fixes, never an offered action the server then refuses.
  const allows = (capability: Capability) => hasCapability(capabilities ?? [], capability);

  return {
    invite: allows("users.invite"),
    manageRole: allows("users.manage"),
    suspend: allows("users.suspend"),
    deactivate: allows("users.deactivate"),
    revokeSessions: allows("sessions.revoke"),
    manageDepartment: allows("departments.manage"),
    manageTeam: allows("teams.manage"),
    overridePermissions: allows("permissions.override"),
    decideAccessRequests: allows("access_requests.decide"),
    exportAudit: allows("audit.export"),
  };
}

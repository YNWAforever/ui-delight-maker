import { ROLE_GRANTS } from "@/lib/admin/policy";
import type { Capability, UserRole } from "@/lib/admin/types";

/**
 * What the admin screens *offer*, derived from the role baseline the client can see.
 *
 * This is advisory, not enforcement, and the distinction is the whole point. The server
 * decides every one of these questions again inside `requireCapability`, which also reads
 * `permission_overrides` — a table the client never sees (BD-12). So this module can be
 * wrong in exactly one direction and must only ever be wrong in that direction: it may hide
 * a control from someone who holds an explicit override for it, and it must never show a
 * control as enabled and then have the write refused for a reason the screen could have
 * known.
 *
 * It replaces four hardcoded role arrays that were scattered across the admin routes —
 * `["super_admin", "admin", "manager"].includes(profile?.role ?? "")` and friends. Those
 * arrays happened to agree with `ROLE_GRANTS` on the day they were written and nothing kept
 * them agreeing: `ROLE_GRANTS` is the map the server actually evaluates, so reading it is
 * both shorter and the only version that cannot drift. Nothing here modifies the policy;
 * it is a read of `ROLE_GRANTS` and nothing else.
 *
 * `read_only` holds `users.view` and `teams.view`, so it reaches these screens legitimately.
 * Every write control below is therefore expected to be absent for it, and that absence is
 * what these helpers exist to produce.
 */

const EMPTY: ReadonlySet<Capability> = new Set<Capability>();

/** The baseline grant for a role, or an empty set when the actor has no profile yet. */
function grantsFor(role: UserRole | null | undefined): ReadonlySet<Capability> {
  if (!role) return EMPTY;
  return Object.hasOwn(ROLE_GRANTS, role) ? ROLE_GRANTS[role] : EMPTY;
}

/**
 * Whether the role's baseline includes a capability.
 *
 * Named `roleAllows` rather than `can` because the answer is about the role, not about this
 * actor: an override can widen it server-side, and a scope check can narrow it.
 */
export function roleAllows(role: UserRole | null | undefined, capability: Capability): boolean {
  return grantsFor(role).has(capability);
}

/** The write controls each admin surface offers, in one place so no two screens disagree. */
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

export function adminControlAccess(role: UserRole | null | undefined): AdminControlAccess {
  const allows = (capability: Capability) => roleAllows(role, capability);

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

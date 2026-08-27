import { describe, expect, it } from "vitest";

import { adminControlAccess, roleAllows } from "../admin-capabilities";
import { ROLE_GRANTS } from "../admin/policy";
import { USER_ROLES, type Capability, type UserRole } from "../admin/types";

/**
 * The admin screens decide what to *offer* from the role baseline. The server decides what
 * is *allowed*, again, on every call.
 *
 * These tests pin two things.
 *
 * First, the mapping is a read of `ROLE_GRANTS` and never a second opinion about it. The
 * four role arrays this module replaced — `["super_admin", "admin", "manager"]` and friends,
 * spelled out in three route files — agreed with the policy on the day they were written and
 * nothing kept them agreeing. Asserting against `ROLE_GRANTS` itself means a future change to
 * the policy cannot leave a screen offering a control the server now refuses.
 *
 * Second, the direction of any possible error. `permission_overrides` is invisible to the
 * client (BD-12), so this can under-offer for someone holding an exception and must never
 * over-offer. Every assertion below is therefore of the form "the role baseline says no, so
 * the control is not offered" — never "the control is offered, therefore the write will
 * succeed".
 */

const CONTROL_CAPABILITY: Record<keyof ReturnType<typeof adminControlAccess>, Capability> = {
  invite: "users.invite",
  manageRole: "users.manage",
  suspend: "users.suspend",
  deactivate: "users.deactivate",
  revokeSessions: "sessions.revoke",
  manageDepartment: "departments.manage",
  manageTeam: "teams.manage",
  overridePermissions: "permissions.override",
  decideAccessRequests: "access_requests.decide",
  exportAudit: "audit.export",
};

describe("adminControlAccess", () => {
  it("answers exactly what ROLE_GRANTS says, for every role and every control", () => {
    for (const role of USER_ROLES) {
      const access = adminControlAccess(role);
      for (const [control, capability] of Object.entries(CONTROL_CAPABILITY)) {
        expect({ role, control, offered: access[control as keyof typeof access] }).toEqual({
          role,
          control,
          offered: ROLE_GRANTS[role].has(capability),
        });
      }
    }
  });

  it("preserves the role sets the routes used to hardcode", () => {
    // These four lists are what `admin.people.tsx` and `admin.teams.tsx` contained inline.
    // They must not have changed meaning when the source of truth moved.
    const rolesWith = (control: keyof ReturnType<typeof adminControlAccess>) =>
      USER_ROLES.filter((role) => adminControlAccess(role)[control]);

    expect(rolesWith("invite")).toEqual(["super_admin", "admin", "manager"]);
    expect(rolesWith("suspend")).toEqual(["super_admin", "admin"]);
    expect(rolesWith("deactivate")).toEqual(["super_admin", "admin"]);
    expect(rolesWith("manageDepartment")).toEqual(["super_admin", "admin"]);
    expect(rolesWith("manageTeam")).toEqual(["super_admin", "admin", "manager"]);
  });

  it("offers a read_only actor no write control at all", () => {
    // `read_only` holds `users.view` and `teams.view`, so it legitimately reaches these
    // screens. Every control on them is a write, and none of them may be offered.
    const access = adminControlAccess("read_only");
    expect(Object.values(access).some(Boolean)).toBe(false);
  });

  it("keeps permission overrides to Super Admin", () => {
    // `admin` is granted every capability except `permissions.override`, deliberately, and an
    // approved access request cannot mint it either. The client gate must match.
    expect(adminControlAccess("super_admin").overridePermissions).toBe(true);
    expect(adminControlAccess("admin").overridePermissions).toBe(false);
  });

  it("offers nothing at all when there is no profile yet", () => {
    const access = adminControlAccess(undefined);
    expect(Object.values(access).some(Boolean)).toBe(false);
    expect(adminControlAccess(null).invite).toBe(false);
  });

  it("does not resolve an unknown role through the prototype chain", () => {
    // A bare `ROLE_GRANTS[role]` read answers `constructor` with a function, which has no
    // `.has` — the page would throw rather than deny.
    for (const key of ["constructor", "toString", "__proto__", "wizard"]) {
      expect(roleAllows(key as UserRole, "users.manage")).toBe(false);
    }
  });
});

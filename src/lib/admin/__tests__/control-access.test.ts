import { describe, expect, it } from "vitest";

import { adminControlAccess } from "../control-access";
import { effectiveCapabilities } from "../capabilities";
import { ROLE_GRANTS } from "../policy";
import {
  USER_ROLES,
  type ActorAccessContext,
  type Capability,
  type PermissionOverride,
} from "../types";

/**
 * The admin screens decide what to *offer*. The server decides what is *allowed*, again, on
 * every call.
 *
 * These tests pin three things.
 *
 * First, the mapping is a read of the policy and never a second opinion about it. The four
 * role arrays this module replaced — `["super_admin", "admin", "manager"]` and friends,
 * spelled out inline in three route files — agreed with the policy on the day they were
 * written and nothing kept them agreeing.
 *
 * Second, the direction of any possible error. This is advisory; it may under-offer, and it
 * must never over-offer a control the server will then refuse.
 *
 * Third — and this is what changed — an override now reaches the screen. This module used to
 * take a `UserRole` and read `ROLE_GRANTS`, so it could not see `permission_overrides` and
 * would hide a control from someone holding an explicit grant for it (BD-12). It now takes
 * the effective set, so it cannot.
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

const actorFor = (role: (typeof USER_ROLES)[number]): ActorAccessContext => ({
  profileId: "profile-1",
  role,
  status: "active",
  departmentId: null,
  managedDepartmentIds: [],
  managedTeamIds: [],
  directReportIds: [],
});

const baselineFor = (role: (typeof USER_ROLES)[number]) =>
  effectiveCapabilities(actorFor(role), []);

describe("adminControlAccess", () => {
  it("answers exactly what the policy says, for every role and every control", () => {
    for (const role of USER_ROLES) {
      const access = adminControlAccess(baselineFor(role));
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
    // These lists are what `admin.people.tsx` and `admin.teams.tsx` contained inline. They
    // must not have changed meaning when the source of truth moved, twice.
    const rolesWith = (control: keyof ReturnType<typeof adminControlAccess>) =>
      USER_ROLES.filter((role) => adminControlAccess(baselineFor(role))[control]);

    expect(rolesWith("invite")).toEqual(["super_admin", "admin", "manager"]);
    expect(rolesWith("suspend")).toEqual(["super_admin", "admin"]);
    expect(rolesWith("deactivate")).toEqual(["super_admin", "admin"]);
    expect(rolesWith("manageDepartment")).toEqual(["super_admin", "admin"]);
    expect(rolesWith("manageTeam")).toEqual(["super_admin", "admin", "manager"]);
  });

  it("offers a read_only actor no write control at all", () => {
    // `read_only` holds `users.view` and `teams.view`, so it legitimately reaches these
    // screens. Every control on them is a write, and none of them may be offered.
    const access = adminControlAccess(baselineFor("read_only"));
    expect(Object.values(access).some(Boolean)).toBe(false);
  });

  it("offers a control the role denies when an override grants it", () => {
    // The reason this module changed hands. Under the old role-baseline read this actor saw
    // a screen with the invite control hidden, clicked nothing, and had no way to discover
    // that the exception granted to them was real.
    const override: PermissionOverride = {
      profileId: "profile-1",
      capability: "users.invite",
      effect: "allow",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
    };

    expect(adminControlAccess(baselineFor("read_only")).invite).toBe(false);
    expect(
      adminControlAccess(effectiveCapabilities(actorFor("read_only"), [override])).invite,
    ).toBe(true);
  });

  it("withdraws a control the role grants when an override denies it", () => {
    const override: PermissionOverride = {
      profileId: "profile-1",
      capability: "users.invite",
      effect: "deny",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
    };

    expect(adminControlAccess(baselineFor("manager")).invite).toBe(true);
    expect(adminControlAccess(effectiveCapabilities(actorFor("manager"), [override])).invite).toBe(
      false,
    );
  });

  it("keeps permission overrides to Super Admin", () => {
    // `admin` is granted every capability except `permissions.override`, deliberately, and an
    // approved access request cannot mint it either. The client gate must match.
    expect(adminControlAccess(baselineFor("super_admin")).overridePermissions).toBe(true);
    expect(adminControlAccess(baselineFor("admin")).overridePermissions).toBe(false);
  });

  it("offers nothing at all before the capability set has resolved", () => {
    // The shell read fails closed to an empty set, and the context field is optional until
    // `beforeLoad` has run. Both must land on "offer nothing", never on "offer everything".
    expect(Object.values(adminControlAccess(undefined)).some(Boolean)).toBe(false);
    expect(Object.values(adminControlAccess([])).some(Boolean)).toBe(false);
  });

  it("does not enable a control from a junk entry in the set", () => {
    // The old `ROLE_GRANTS[role]` object read answered `constructor` with a function, which
    // has no `.has`, so an unknown role threw rather than denying. A set membership test
    // cannot do that — this pins that the replacement kept the property.
    for (const key of ["constructor", "toString", "__proto__", "wizard"]) {
      expect(Object.values(adminControlAccess([key as Capability])).some(Boolean)).toBe(false);
    }
  });
});

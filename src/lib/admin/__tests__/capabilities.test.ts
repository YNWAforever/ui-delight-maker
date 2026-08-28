import { describe, expect, it } from "vitest";

import { CAPABILITIES, USER_ROLES } from "../types";
import type { ActorAccessContext, PermissionOverride } from "../types";
import { effectiveCapabilities, hasCapability } from "../capabilities";
import { evaluateAuthorization } from "../policy";

const actorFor = (role: (typeof USER_ROLES)[number]): ActorAccessContext => ({
  profileId: "profile-1",
  role,
  status: "active",
  departmentId: null,
  managedDepartmentIds: [],
  managedTeamIds: [],
  directReportIds: [],
});

describe("effectiveCapabilities", () => {
  it("agrees with evaluateAuthorization for every capability and every role", () => {
    // The test that stops the contract drifting from enforcement. If someone makes a
    // decision target-dependent, the two sides disagree here rather than the UI lying.
    for (const role of USER_ROLES) {
      const actor = actorFor(role);
      const granted = new Set(effectiveCapabilities(actor, []));

      for (const capability of CAPABILITIES) {
        const expected = evaluateAuthorization({ actor, capability, target: {} }).allowed;
        expect(granted.has(capability), `${role} / ${capability}`).toBe(expected);
      }
    }
  });

  it("gives an inactive actor nothing at all", () => {
    const suspended = { ...actorFor("admin"), status: "suspended" as const };
    expect(effectiveCapabilities(suspended, [])).toEqual([]);
  });

  it("honours an allow override the role baseline denies", () => {
    // read_only holds no write capability. An exception granted to one person must show
    // up, or the UI would disable a control that person is genuinely allowed to use.
    const actor = actorFor("read_only");
    const override: PermissionOverride = {
      profileId: "profile-1",
      capability: "quotes.create",
      effect: "allow",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
    };

    expect(hasCapability(effectiveCapabilities(actor, []), "quotes.create")).toBe(false);
    expect(hasCapability(effectiveCapabilities(actor, [override]), "quotes.create")).toBe(true);
  });

  it("honours a deny override against a capability the role grants", () => {
    const actor = actorFor("sales");
    const override: PermissionOverride = {
      profileId: "profile-1",
      capability: "quotes.create",
      effect: "deny",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
    };

    expect(hasCapability(effectiveCapabilities(actor, []), "quotes.create")).toBe(true);
    expect(hasCapability(effectiveCapabilities(actor, [override]), "quotes.create")).toBe(false);
  });

  it("ignores an expired override", () => {
    const actor = actorFor("read_only");
    const expired: PermissionOverride = {
      profileId: "profile-1",
      capability: "quotes.create",
      effect: "allow",
      departmentId: null,
      teamId: null,
      resourceType: null,
      resourceId: null,
      expiresAt: "2020-01-01T00:00:00.000Z",
    };

    const now = new Date("2026-08-28T00:00:00.000Z");
    expect(hasCapability(effectiveCapabilities(actor, [expired], now), "quotes.create")).toBe(
      false,
    );
  });
});

describe("hasCapability", () => {
  it("answers from the set it is given", () => {
    expect(hasCapability(["quotes.create"], "quotes.create")).toBe(true);
    expect(hasCapability(["quotes.view"], "quotes.create")).toBe(false);
    expect(hasCapability([], "quotes.create")).toBe(false);
  });
});

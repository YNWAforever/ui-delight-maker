import { describe, expect, it } from "vitest";

import { CAPABILITIES, USER_ROLES } from "../types";
import type { ActorAccessContext } from "../types";
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
});

describe("hasCapability", () => {
  it("answers from the set it is given", () => {
    expect(hasCapability(["quotes.create"], "quotes.create")).toBe(true);
    expect(hasCapability(["quotes.view"], "quotes.create")).toBe(false);
    expect(hasCapability([], "quotes.create")).toBe(false);
  });
});

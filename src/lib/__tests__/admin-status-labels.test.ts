import { describe, expect, it } from "vitest";

import { PROFILE_STATUSES, USER_ROLES } from "../admin/types";
import {
  KNOWN_STATUS_VALUES,
  STATUS_TONE_CLASS,
  getStatusLabel,
  getUserRoleLabel,
} from "../status-labels";

/**
 * The administration vocabularies.
 *
 * Admin is the one workspace where the same word means several things — `active` is a live
 * person, a live team and a live agent; `pending` is an access request and an approval — and
 * every one of these used to be spelled inline in a route or a component. `{user.status}`
 * under a `capitalize` class and a hardcoded amber "Pending" pill are what that produced.
 *
 * The additions are also required not to disturb the domainless lookup, which more than
 * forty existing call sites use without a `domain`. That is what the last test here pins.
 */

describe("administration status domains", () => {
  it("names every stored profile status", () => {
    const labels = PROFILE_STATUSES.map((status) => getStatusLabel("adminProfiles", status).label);
    expect(labels).toEqual(["Invited", "Active", "Suspended", "Deactivated"]);
  });

  it("separates a reversible suspension from a permanent deactivation by tone", () => {
    // They must not read the same: one is undone with a click, the other reassigns work.
    expect(getStatusLabel("adminProfiles", "suspended").tone).toBe("warning");
    expect(getStatusLabel("adminProfiles", "deactivated").tone).toBe("neutral");
    expect(getStatusLabel("adminProfiles", "active").tone).toBe("success");
  });

  it("names the two organization unit states", () => {
    expect(getStatusLabel("organizationUnits", "active").label).toBe("Active");
    expect(getStatusLabel("organizationUnits", "archived").label).toBe("Archived");
  });

  it("calls a waiting access request exactly what the approvals queue calls one", () => {
    // §7.5 forbids two labels for one state, and a request waiting on a decision is the same
    // state to a reader as a quote send waiting on one.
    expect(getStatusLabel("accessRequests", "pending").label).toBe(
      getStatusLabel("approvals", "pending").label,
    );
    expect(getStatusLabel("accessRequests", "cancelled").label).toBe("Cancelled");
  });

  it("names audit severities and keeps critical distinct from warning", () => {
    expect(getStatusLabel("auditSeverity", "info").tone).toBe("neutral");
    expect(getStatusLabel("auditSeverity", "warning").tone).toBe("warning");
    expect(getStatusLabel("auditSeverity", "critical").tone).toBe("destructive");
  });

  it("gives every admin value a label and a tone that has a class", () => {
    const values = [
      ...PROFILE_STATUSES,
      "active",
      "archived",
      "pending",
      "approved",
      "rejected",
      "cancelled",
      "info",
      "warning",
      "critical",
    ];
    for (const value of values) {
      for (const domain of [
        "adminProfiles",
        "organizationUnits",
        "accessRequests",
        "auditSeverity",
      ] as const) {
        const result = getStatusLabel(domain, value);
        expect(result.label.length).toBeGreaterThan(0);
        expect(STATUS_TONE_CLASS[result.tone]).toBeTruthy();
      }
    }
  });

  it("leaves the domainless lookup exactly as it was", () => {
    // The admin maps are deliberately not merged into the flat map: `KNOWN_STATUS_VALUES` is
    // an enumerated contract two other suites assert against, and `invited`, `deactivated`
    // and `cancelled` must not start resolving for callers that never asked about admin.
    for (const value of ["invited", "deactivated", "archived", "cancelled"]) {
      expect(KNOWN_STATUS_VALUES).not.toContain(value);
      expect(getStatusLabel(null, value).tone).toBe("neutral");
    }
  });
});

describe("getUserRoleLabel", () => {
  it("names every role in USER_ROLES", () => {
    for (const role of USER_ROLES) {
      const label = getUserRoleLabel(role);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("_");
    }
    expect(getUserRoleLabel("super_admin")).toBe("Super Admin");
    expect(getUserRoleLabel("client_success")).toBe("Client Success");
    expect(getUserRoleLabel("read_only")).toBe("Read Only");
  });

  it("does not resolve inherited object properties", () => {
    for (const key of ["constructor", "toString", "__proto__"]) {
      expect(getUserRoleLabel(key)).toBe(key.replace(/_/g, " "));
    }
  });

  it("never throws on a missing role", () => {
    expect(getUserRoleLabel(null)).toBe("Unknown");
    expect(getUserRoleLabel(undefined)).toBe("Unknown");
    expect(getUserRoleLabel("   ")).toBe("Unknown");
  });
});

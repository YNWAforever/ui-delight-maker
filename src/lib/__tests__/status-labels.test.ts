import { describe, expect, it } from "vitest";

import {
  AT_RISK_SCORE_THRESHOLD,
  KNOWN_STATUS_VALUES,
  STATUS_TONE_CLASS,
  STUCK_AFTER_DAYS,
  getDerivedStatusLabel,
  getLifecycleLabel,
  getStatusLabel,
  isAtRisk,
  isOverdue,
  isStuck,
  type DerivedStatus,
  type StatusDomain,
} from "../status-labels";

const DOMAINS: StatusDomain[] = [
  "leads",
  "quotes",
  "tasks",
  "approvals",
  "agentRuns",
  "agents",
  "priority",
];

describe("getStatusLabel", () => {
  it("resolves the domain's own vocabulary first", () => {
    expect(getStatusLabel("approvals", "pending").label).toBe("Waiting approval");
    expect(getStatusLabel("approvals", "pending").tone).toBe("warning");
  });

  it("falls back across domains so narrowing never removes an answer", () => {
    // `approved` lives in the leads vocabulary but reaches approval screens through shared
    // read models. A domain that does not own the word must still render it.
    expect(getStatusLabel("approvals", "approved").label).toBe("Approved");
    expect(getStatusLabel(null, "approved").label).toBe("Approved");
  });

  it("gives an unknown value its own text back, in neutral tone", () => {
    const result = getStatusLabel("leads", "awaiting_legal_review");
    expect(result.label).toBe("awaiting legal review");
    expect(result.tone).toBe("neutral");
    expect(result.icon).toBeUndefined();
  });

  it("treats nullish and blank values as unknown rather than throwing", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(getStatusLabel("tasks", value).label).toBe("Unknown");
      expect(getStatusLabel("tasks", value).tone).toBe("neutral");
    }
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(getStatusLabel("tasks", "  in_progress  ").label).toBe("In progress");
  });

  it("does not resolve inherited object properties", () => {
    // A bare `map[key]` read answers "constructor" and "toString" from the prototype chain.
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(getStatusLabel(null, key).label).toBe(key.replace(/_/g, " "));
      expect(getStatusLabel(null, key).tone).toBe("neutral");
    }
  });

  it("always produces a label and a tone that has a class", () => {
    for (const value of KNOWN_STATUS_VALUES) {
      const result = getStatusLabel(null, value);
      expect(result.label.length).toBeGreaterThan(0);
      expect(STATUS_TONE_CLASS[result.tone]).toBeTruthy();
    }
  });

  it("keeps every raw value owned by exactly one domain", () => {
    // The domainless merge in status-labels.ts is only safe while this holds. When it stops
    // holding, this fails first and the fix is for callers to pass `domain` — not to rename
    // a stored value.
    const owners = new Map<string, StatusDomain[]>();
    for (const domain of DOMAINS) {
      for (const value of KNOWN_STATUS_VALUES) {
        const scoped = getStatusLabel(domain, value);
        const unscoped = getStatusLabel(null, value);
        if (scoped.label !== unscoped.label || scoped.tone !== unscoped.tone) {
          owners.set(value, [...(owners.get(value) ?? []), domain]);
        }
      }
    }
    expect([...owners.keys()]).toEqual([]);
  });
});

describe("getLifecycleLabel", () => {
  it("labels the stages the accounts check constraint allows", () => {
    expect(getLifecycleLabel("active_client").label).toBe("Active client");
    expect(getLifecycleLabel("churned").label).toBe("Churned");
    expect(getLifecycleLabel("vendor").label).toBe("Vendor");
  });

  it("stays out of the shared status map", () => {
    // Merging lifecycle into the domainless lookup would retone `at_risk` for every caller
    // that never asked about accounts.
    expect(KNOWN_STATUS_VALUES).not.toContain("at_risk");
    expect(KNOWN_STATUS_VALUES).not.toContain("active_client");
    expect(getStatusLabel(null, "at_risk").tone).toBe("neutral");
    expect(getLifecycleLabel("at_risk").tone).toBe("warning");
  });
});

describe("derived states", () => {
  const DERIVED: DerivedStatus[] = ["stuck", "at_risk", "overdue"];

  it("has no stored raw value behind any of the three", () => {
    // The point of the whole file: "Stuck", "At risk" and "Overdue" are computed. If one of
    // these labels ever becomes reachable through getStatusLabel, someone has added a phantom
    // enum member to a status column to satisfy the vocabulary.
    const derivedLabels = DERIVED.map((key) => getDerivedStatusLabel(key).label);
    const storedLabels = KNOWN_STATUS_VALUES.map((value) => getStatusLabel(null, value).label);
    for (const label of derivedLabels) {
      expect(storedLabels).not.toContain(label);
    }
  });

  it("carries both a word and an icon, never colour alone", () => {
    for (const key of DERIVED) {
      const presentation = getDerivedStatusLabel(key);
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.icon).toBeDefined();
    }
  });
});

describe("isOverdue", () => {
  it("compares whole days, so a task due today is not overdue", () => {
    expect(isOverdue("2026-08-27", "2026-08-27")).toBe(false);
    expect(isOverdue("2026-08-26", "2026-08-27")).toBe(true);
    expect(isOverdue("2026-08-28", "2026-08-27")).toBe(false);
  });

  it("does not shift a bare ISO date into the previous day", () => {
    // `new Date("2026-08-27")` is UTC midnight, which prints as the 26th anywhere west of
    // Greenwich. Taking the string as written is what keeps a task due today out of the
    // overdue queue on a machine in New York.
    expect(isOverdue("2026-08-27", "2026-08-27T00:30:00+08:00")).toBe(false);
  });

  it("reads the same on a server and a client in different timezones", () => {
    const dueDate = "2026-08-26";
    const instant = new Date("2026-08-27T02:00:00Z");
    expect(isOverdue(dueDate, instant)).toBe(true);
  });

  it("treats a record with no deadline as not overdue", () => {
    expect(isOverdue(null, "2026-08-27")).toBe(false);
    expect(isOverdue(undefined, "2026-08-27")).toBe(false);
    expect(isOverdue("not a date", "2026-08-27")).toBe(false);
    expect(isOverdue(new Date("nope"), "2026-08-27")).toBe(false);
  });

  it("does not fall over on an unusable now", () => {
    expect(isOverdue("2026-08-26", "not a date")).toBe(false);
  });
});

describe("isStuck", () => {
  it("fires at the threshold, not past it", () => {
    expect(isStuck("2026-08-20", "2026-08-27")).toBe(true);
    expect(isStuck("2026-08-21", "2026-08-27")).toBe(false);
    expect(STUCK_AFTER_DAYS).toBe(7);
  });

  it("lets a caller set its own cadence", () => {
    expect(isStuck("2026-08-25", "2026-08-27", 2)).toBe(true);
    expect(isStuck("2026-08-25", "2026-08-27", 30)).toBe(false);
  });

  it("treats a record that never moved as not stuck", () => {
    expect(isStuck(null, "2026-08-27")).toBe(false);
  });
});

describe("isAtRisk", () => {
  it("agrees with the renewal risk model rather than inventing a second threshold", () => {
    expect(AT_RISK_SCORE_THRESHOLD).toBe(40);
    expect(isAtRisk(39)).toBe(true);
    expect(isAtRisk(40)).toBe(false);
    expect(isAtRisk(0)).toBe(true);
  });

  it("treats an unscored account as unscored, not as at risk", () => {
    expect(isAtRisk(null)).toBe(false);
    expect(isAtRisk(undefined)).toBe(false);
    expect(isAtRisk(Number.NaN)).toBe(false);
  });

  it("lets a caller set its own threshold", () => {
    expect(isAtRisk(60, 65)).toBe(true);
  });
});

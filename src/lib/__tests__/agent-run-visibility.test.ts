import { describe, expect, it, vi } from "vitest";
import {
  AGENT_SUBJECT_VIEW_CAPABILITIES,
  AGENT_SUBJECT_VIEW_CAPABILITY,
  AGENT_SUBJECT_VISIBILITY,
  canReadAgentRunInput,
  decideAgentSubjects,
  subjectViewCapability,
} from "@/lib/agent-run-visibility";
import { CAPABILITIES } from "@/lib/admin/types";
import { NEON_OWNED_RESOURCE_TYPES } from "@/server/auth/resource-ownership";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

/**
 * A stubbed `RowAuthorizer` whose `allow` answers from a fixed id -> verdict map, defaulting to
 * `false` for any id not named — so a test only has to spell out the ids it cares about.
 */
function stubRows(verdicts: Record<string, boolean> = {}): RowAuthorizer & {
  allow: ReturnType<typeof vi.fn>;
} {
  const allow = vi.fn(
    async (_capability: string, _resourceType: string, ids: readonly string[]) => {
      const decided = new Map<string, boolean>();
      for (const id of ids) decided.set(id, verdicts[id] ?? false);
      return decided;
    },
  );
  return { allow };
}

describe("agent run subject visibility", () => {
  it("names a capability for every subject_type the database can store", () => {
    // The eight values permitted by the agent_runs check constraint, as widened in
    // neon/migrations/003_client_relationship_360.sql:182. Deliberately not derived from
    // SubjectType, which names only four of them.
    const storable = [
      "lead",
      "quote",
      "client",
      "task",
      "approval",
      "engagement",
      "account",
      "campaign",
    ];
    for (const subjectType of storable) {
      expect(subjectViewCapability(subjectType)).not.toBeNull();
    }
  });

  it("only names capabilities the authorization layer actually has", () => {
    // A capability outside CAPABILITIES is answered with unknown_capability, which denies
    // everyone including super_admin — so a typo here is a total outage for that subject type.
    for (const capability of Object.values(AGENT_SUBJECT_VIEW_CAPABILITY)) {
      expect(CAPABILITIES).toContain(capability);
    }
  });

  it("maps client to accounts.view, because there is no clients.view", () => {
    expect(subjectViewCapability("client")).toBe("accounts.view");
  });

  it("maps task and approval to their view capabilities, not their write ones", () => {
    expect(subjectViewCapability("task")).toBe("tasks.view");
    expect(subjectViewCapability("approval")).toBe("approvals.view");
  });

  it("returns null for a subject_type the table does not name", () => {
    expect(subjectViewCapability("job_sheet")).toBeNull();
    expect(subjectViewCapability("")).toBeNull();
  });

  it("returns null for prototype-chain keys instead of leaking an inherited member", () => {
    // A bare index read (`table[subjectType]`) returns a truthy function from
    // Object.prototype for these keys, which would defeat the `?? null` fallback.
    expect(subjectViewCapability("__proto__")).toBeNull();
    expect(subjectViewCapability("constructor")).toBeNull();
    expect(subjectViewCapability("toString")).toBeNull();
  });

  it("offers each distinct capability exactly once for the optional list", () => {
    expect(AGENT_SUBJECT_VIEW_CAPABILITIES).toHaveLength(
      new Set(AGENT_SUBJECT_VIEW_CAPABILITIES).size,
    );
    expect(AGENT_SUBJECT_VIEW_CAPABILITIES).toContain("accounts.view");
  });

  it("refuses input on an unmapped subject_type even when the actor holds everything", () => {
    const everything = Object.fromEntries(CAPABILITIES.map((capability) => [capability, true]));
    expect(canReadAgentRunInput("job_sheet", everything)).toBe(false);
  });

  it("grants input only when the row's own subject capability is held", () => {
    const leadsOnly = { "leads.view": true, "accounts.view": false };
    expect(canReadAgentRunInput("lead", leadsOnly)).toBe(true);
    expect(canReadAgentRunInput("account", leadsOnly)).toBe(false);
    expect(canReadAgentRunInput("client", leadsOnly)).toBe(false);
  });

  it("treats a capability the actor was never asked about as not held", () => {
    expect(canReadAgentRunInput("lead", {})).toBe(false);
  });

  it("resolves every resourceType under a key Neon ownership actually resolves", () => {
    // A resourceType outside NEON_OWNED_RESOURCE_TYPES resolves no owner, which denies every
    // manager on every run of that subject type and makes a resource-scoped deny override
    // never match — the exact failure mode `approval` -> `human_approval` exists to avoid.
    for (const entry of Object.values(AGENT_SUBJECT_VISIBILITY)) {
      expect(NEON_OWNED_RESOURCE_TYPES).toContain(entry.resourceType);
    }
  });
});

describe("decideAgentSubjects", () => {
  it("calls rows.allow once per distinct subject type, not once per row", async () => {
    const rows = stubRows({ "lead-1": true, "lead-2": true, "campaign-1": true });
    await decideAgentSubjects(rows, [
      { subject_type: "lead", subject_id: "lead-1" },
      { subject_type: "lead", subject_id: "lead-2" },
      { subject_type: "campaign", subject_id: "campaign-1" },
    ]);

    expect(rows.allow).toHaveBeenCalledTimes(2);
    expect(rows.allow).toHaveBeenCalledWith(
      "leads.view",
      "lead",
      expect.arrayContaining(["lead-1", "lead-2"]),
    );
    expect(rows.allow).toHaveBeenCalledWith("campaigns.view", "campaign", ["campaign-1"]);
  });

  it("sends one id per subject even when two runs share the same subject", async () => {
    const rows = stubRows({ "lead-1": true });
    await decideAgentSubjects(rows, [
      { subject_type: "lead", subject_id: "lead-1" },
      { subject_type: "lead", subject_id: "lead-1" },
    ]);

    expect(rows.allow).toHaveBeenCalledTimes(1);
    const [, , ids] = rows.allow.mock.calls[0] as [string, string, readonly string[]];
    expect(ids).toEqual(["lead-1"]);
  });

  it("refuses an unmapped subject_type without ever calling rows.allow", async () => {
    const rows = stubRows();
    const decide = await decideAgentSubjects(rows, [
      { subject_type: "job_sheet", subject_id: "js-1" },
    ]);

    expect(rows.allow).not.toHaveBeenCalled();
    expect(decide("job_sheet", "js-1")).toBe(false);
  });

  it("resolves an approval subject's ownership under human_approval, not approval", async () => {
    const rows = stubRows({ "approval-1": true });
    await decideAgentSubjects(rows, [{ subject_type: "approval", subject_id: "approval-1" }]);

    expect(rows.allow).toHaveBeenCalledWith("approvals.view", "human_approval", ["approval-1"]);
  });

  it("returns the authorizer's own verdict per subject, denied and allowed alike", async () => {
    const rows = stubRows({ "lead-allow": true, "lead-deny": false });
    const decide = await decideAgentSubjects(rows, [
      { subject_type: "lead", subject_id: "lead-allow" },
      { subject_type: "lead", subject_id: "lead-deny" },
    ]);

    expect(decide("lead", "lead-allow")).toBe(true);
    expect(decide("lead", "lead-deny")).toBe(false);
  });
});

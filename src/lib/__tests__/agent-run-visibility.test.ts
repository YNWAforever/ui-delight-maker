import { describe, expect, it } from "vitest";
import {
  AGENT_SUBJECT_VIEW_CAPABILITIES,
  AGENT_SUBJECT_VIEW_CAPABILITY,
  canReadAgentRunInput,
  subjectViewCapability,
} from "@/lib/agent-run-visibility";
import { CAPABILITIES } from "@/lib/admin/types";

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
});

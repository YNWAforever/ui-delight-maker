import { describe, expect, it } from "vitest";

import { AGENT_DEFINITIONS, resolveDispatchableAgent, type AgentPolicy } from "@/lib/agents";
import type { AgentWorkflowType } from "@/lib/agents";

describe("resolveDispatchableAgent", () => {
  it("returns the definition for an active agent", () => {
    const active = AGENT_DEFINITIONS.find((a) => a.status === "active");
    if (!active) throw new Error("fixture: no active agent in the catalogue");

    const result = resolveDispatchableAgent(active.workflow_type, new Map());
    expect(result.dispatchable).toBe(true);
    if (!result.dispatchable) return;
    expect(result.agent.name).toBe(active.name);
  });

  it("refuses an inactive agent with the agent_inactive reason", () => {
    // Inactive is currently hypothetical — every catalogue entry is active — so the guard is
    // exercised against an injected policy override rather than a live entry. That is the
    // point: deactivating must already work on the day someone first deactivates something.
    //
    // `AgentDefinition.status` is `"active" | "inactive"` and the badge renders "Inactive", so
    // the sentinel is named for the state it reports rather than inventing a second word.
    const policies = new Map<AgentWorkflowType, AgentPolicy>([
      ["qualify_lead", { status: "inactive", humanApproval: false }],
    ]);
    const result = resolveDispatchableAgent("qualify_lead", policies);
    expect(result).toEqual({ dispatchable: false, reason: "agent_inactive" });
  });

  it("throws for an unknown workflow type", () => {
    // A programming error, not a runtime state — the same contract `agentNameFor` has.
    expect(() => resolveDispatchableAgent("not_a_workflow" as never, new Map())).toThrow();
  });

  it("falls back to the catalogue's own status when the policy map has no entry for the workflow", () => {
    // `loadAgentPolicies` always seeds every catalogue entry, so in production the map is
    // never missing a workflow — this exercises the fallback a caller with a partial or empty
    // map (a test, or some future caller) would otherwise silently bypass. Every catalogue
    // entry is active today, so the fallback path is walked by flipping one entry in place —
    // the same "guard by mutation" style `agents-catalogue.test.ts` uses — rather than through
    // a synthetic catalogue parameter, which `resolveDispatchableAgent` no longer accepts.
    const target = AGENT_DEFINITIONS.find((a) => a.workflow_type === "qualify_lead");
    if (!target) throw new Error("fixture: qualify_lead missing from the catalogue");
    const originalStatus = target.status;
    target.status = "inactive";
    try {
      const result = resolveDispatchableAgent("qualify_lead", new Map());
      expect(result).toEqual({ dispatchable: false, reason: "agent_inactive" });
    } finally {
      target.status = originalStatus;
    }
  });
});

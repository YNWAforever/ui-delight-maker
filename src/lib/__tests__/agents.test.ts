import { describe, expect, it } from "vitest";

import { AGENT_DEFINITIONS, resolveDispatchableAgent } from "@/lib/agents";

describe("resolveDispatchableAgent", () => {
  it("returns the definition for an active agent", () => {
    const active = AGENT_DEFINITIONS.find((a) => a.status === "active");
    if (!active) throw new Error("fixture: no active agent in the catalogue");

    const result = resolveDispatchableAgent(active.workflow_type);
    expect(result.dispatchable).toBe(true);
    if (!result.dispatchable) return;
    expect(result.agent.name).toBe(active.name);
  });

  it("refuses an inactive agent with the agent_inactive reason", () => {
    // Inactive is currently hypothetical — every catalogue entry is active — so the guard is
    // exercised against an injected definition rather than a live entry. That is the point:
    // deactivating must already work on the day someone first deactivates something.
    //
    // `AgentDefinition.status` is `"active" | "inactive"` and the badge renders "Inactive", so
    // the sentinel is named for the state it reports rather than inventing a second word.
    const result = resolveDispatchableAgent("qualify_lead", [
      { ...AGENT_DEFINITIONS[0], workflow_type: "qualify_lead", status: "inactive" },
    ]);
    expect(result).toEqual({ dispatchable: false, reason: "agent_inactive" });
  });

  it("throws for an unknown workflow type", () => {
    // A programming error, not a runtime state — the same contract `agentNameFor` has.
    expect(() => resolveDispatchableAgent("not_a_workflow" as never)).toThrow();
  });
});

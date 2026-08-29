import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_DEFINITIONS } from "@/lib/agents";

const { mockLoadAgentPolicies } = vi.hoisted(() => ({ mockLoadAgentPolicies: vi.fn() }));

vi.mock("@/server/repositories/agent-policy", () => ({
  loadAgentPolicies: mockLoadAgentPolicies,
}));

const { loadEffectiveAgentCatalogue } = await import("../agent-catalogue");

describe("loadEffectiveAgentCatalogue", () => {
  beforeEach(() => {
    mockLoadAgentPolicies.mockReset();
  });

  it("returns the code catalogue unchanged when nothing is overridden", async () => {
    // The starting state of every environment. If this is wrong, this slice has changed
    // behaviour it was meant to leave alone.
    mockLoadAgentPolicies.mockResolvedValue(
      new Map(
        AGENT_DEFINITIONS.map((agent) => [
          agent.workflow_type,
          { status: agent.status, humanApproval: agent.human_approval },
        ]),
      ),
    );

    const agents = await loadEffectiveAgentCatalogue();

    expect(agents).toEqual(AGENT_DEFINITIONS);
  });

  it("replaces status and human_approval with the stored policy", async () => {
    mockLoadAgentPolicies.mockResolvedValue(
      new Map([["qualify_lead", { status: "inactive", humanApproval: true }]]),
    );

    const agents = await loadEffectiveAgentCatalogue();
    const qualify = agents.find((a) => a.workflow_type === "qualify_lead");

    expect(qualify?.status).toBe("inactive");
    expect(qualify?.human_approval).toBe(true);
  });

  it("leaves every other field identical to the catalogue", async () => {
    // Only status and human_approval are policy. Identity and descriptive fields must come
    // through untouched - display_name in particular must keep equalling agent_runs.agent_name.
    mockLoadAgentPolicies.mockResolvedValue(
      new Map([["qualify_lead", { status: "inactive", humanApproval: true }]]),
    );

    const agents = await loadEffectiveAgentCatalogue();
    const qualify = agents.find((a) => a.workflow_type === "qualify_lead");
    const source = AGENT_DEFINITIONS.find((a) => a.workflow_type === "qualify_lead");

    expect(qualify).toEqual({ ...source, status: "inactive", human_approval: true });
  });

  it("does not mutate AGENT_DEFINITIONS", async () => {
    // The catalogue is a module-level array shared by every importer. Merging in place would
    // leak one request's override into every later reader in the same process.
    const before = AGENT_DEFINITIONS.find((a) => a.workflow_type === "qualify_lead")?.status;
    mockLoadAgentPolicies.mockResolvedValue(
      new Map([["qualify_lead", { status: "inactive", humanApproval: true }]]),
    );

    await loadEffectiveAgentCatalogue();

    expect(AGENT_DEFINITIONS.find((a) => a.workflow_type === "qualify_lead")?.status).toBe(before);
  });
});

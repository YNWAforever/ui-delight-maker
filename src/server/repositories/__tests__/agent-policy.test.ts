import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkflowType } from "@/lib/agents";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

const { loadAgentPolicies } = await import("../agent-policy");

describe("loadAgentPolicies", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("falls back to the code default for a workflow with no row", async () => {
    // The starting state of every environment. If this is wrong, the whole slice has
    // changed behaviour it was meant to leave alone.
    mockQuery.mockResolvedValue([]);

    const policies = await loadAgentPolicies();

    expect(policies.get("qualify_lead")).toEqual({ status: "active", humanApproval: false });
  });

  it("lets a stored row override the code default", async () => {
    mockQuery.mockResolvedValue([
      { workflow_type: "qualify_lead", status: "inactive", human_approval: true },
    ]);

    const policies = await loadAgentPolicies();

    expect(policies.get("qualify_lead")).toEqual({ status: "inactive", humanApproval: true });
  });

  it("ignores a row for a workflow the catalogue no longer has", async () => {
    // A renamed or removed agent must not break dispatch for every other one. A constraint
    // cannot prevent this, because the catalogue is code rather than a table.
    mockQuery.mockResolvedValue([
      { workflow_type: "deleted_workflow", status: "inactive", human_approval: true },
    ]);

    const policies = await loadAgentPolicies();

    expect(policies.has("deleted_workflow" as AgentWorkflowType)).toBe(false);
    expect(policies.get("qualify_lead")).toEqual({ status: "active", humanApproval: false });
  });

  it("issues exactly one query", async () => {
    // Dispatch calls this. One query per dispatch is the budget; a per-agent fan-out
    // would be five.
    mockQuery.mockResolvedValue([]);
    await loadAgentPolicies();
    expect(mockQuery).toHaveBeenCalledOnce();
  });
});

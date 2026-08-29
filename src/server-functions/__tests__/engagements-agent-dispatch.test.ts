import { beforeEach, describe, expect, it, vi } from "vitest";

/** See leads-agent-dispatch.test.ts for why `resolveDispatchableAgent` is mocked. */
const {
  requireCapabilityMock,
  requireNeonAuthSessionMock,
  findActiveRunMock,
  createAgentRunMock,
  updateAgentRunResultMock,
  getN8nDispatchConfigMock,
  triggerN8nMock,
  buildScoreRenewalRiskPayloadMock,
  serializeAgentRunMock,
  resolveDispatchableAgentMock,
  loadAgentPoliciesMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    requireCapabilityMock: vi.fn(),
    requireNeonAuthSessionMock: vi.fn(),
    findActiveRunMock: vi.fn(),
    createAgentRunMock: vi.fn(),
    updateAgentRunResultMock: vi.fn(),
    getN8nDispatchConfigMock: vi.fn(),
    triggerN8nMock: vi.fn(),
    buildScoreRenewalRiskPayloadMock: vi.fn(),
    serializeAgentRunMock: vi.fn((run) => run),
    resolveDispatchableAgentMock: vi.fn(),
    loadAgentPoliciesMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents")>();
  return { ...actual, resolveDispatchableAgent: resolveDispatchableAgentMock };
});

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/lib/n8n", () => ({
  getN8nDispatchConfig: getN8nDispatchConfigMock,
  triggerN8n: triggerN8nMock,
}));

vi.mock("@/lib/workflows/payloads", () => ({
  buildScoreRenewalRiskPayload: buildScoreRenewalRiskPayloadMock,
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: createAgentRunMock,
  findActiveRun: findActiveRunMock,
  updateAgentRunResult: updateAgentRunResultMock,
}));

vi.mock("@/server/repositories/engagements", () => ({
  createEngagement: vi.fn(),
  listEngagementsByClient: vi.fn(),
  listEngagementsForRenewals: vi.fn(),
  markEngagementEnded: vi.fn(),
  markEngagementRenewed: vi.fn(),
}));

vi.mock("@/server/repositories/agent-policy", () => ({
  loadAgentPolicies: loadAgentPoliciesMock,
}));

vi.mock("@/lib/serializable", () => ({
  serializeAgentRun: serializeAgentRunMock,
}));

describe("renewal risk dispatch honours the catalogue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL = "https://n8n.example/webhook";

    const actual = await vi.importActual<typeof import("@/lib/agents")>("@/lib/agents");
    resolveDispatchableAgentMock.mockImplementation(actual.resolveDispatchableAgent);
    // An empty map, like an empty `agent_policy_versions` table: `resolveDispatchableAgent`
    // then falls through to the catalogue's own `status` for every workflow.
    loadAgentPoliciesMock.mockResolvedValue(new Map());

    requireCapabilityMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    findActiveRunMock.mockResolvedValue(null);
    getN8nDispatchConfigMock.mockReturnValue({
      webhookUrl: "https://n8n.example/webhook",
      workflowToken: "token",
    });
    createAgentRunMock.mockResolvedValue({ created: true, run: { id: "run-1" } });
  });

  it("dispatches under the catalogue's display name while the agent is active", async () => {
    const { triggerRiskScoreAgent } = await import("../engagements");

    const result = await triggerRiskScoreAgent({ data: { engagementId: "eng-1" } });

    expect(createAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "Renewal Risk Agent",
        workflow_type: "score_renewal_risk",
      }),
    );
    expect(result).toEqual({ triggered: true, run: { id: "run-1" } });
  });

  it("refuses to dispatch an inactive agent, and writes no run", async () => {
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerRiskScoreAgent } = await import("../engagements");

    const result = await triggerRiskScoreAgent({ data: { engagementId: "eng-1" } });

    expect(result).toEqual({ triggered: false, reason: "agent_inactive" });
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(triggerN8nMock).not.toHaveBeenCalled();
  });

  it("refuses an unauthorised caller for being unauthorised, not for an inactive agent", async () => {
    requireCapabilityMock.mockRejectedValue(new Error("Missing capability: agents.run"));
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerRiskScoreAgent } = await import("../engagements");

    await expect(triggerRiskScoreAgent({ data: { engagementId: "eng-1" } })).rejects.toThrow(
      "Missing capability: agents.run",
    );
    expect(resolveDispatchableAgentMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
  });
});

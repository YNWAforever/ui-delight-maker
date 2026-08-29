import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  requireNeonAuthSessionMock,
  findActiveRunMock,
  createAgentRunMock,
  updateAgentRunResultMock,
  getN8nDispatchConfigMock,
  triggerN8nMock,
  buildRelationshipIntelligencePayloadMock,
  serializeAgentRunMock,
  getAccountWorkspaceDataMock,
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
    buildRelationshipIntelligencePayloadMock: vi.fn(),
    serializeAgentRunMock: vi.fn((run) => run),
    getAccountWorkspaceDataMock: vi.fn(),
    resolveDispatchableAgentMock: vi.fn(),
    loadAgentPoliciesMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

/**
 * Every catalogue entry is `active`, so the refusal path cannot be reached through the real
 * catalogue. The mock defaults to the real implementation in beforeEach, which is why the
 * dispatch case below still asserts the real "Relationship Intelligence Agent" display name.
 */
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
  buildRelationshipIntelligencePayload: buildRelationshipIntelligencePayloadMock,
}));

vi.mock("@/server/repositories/accounts", () => ({
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  getAccountWorkspaceData: getAccountWorkspaceDataMock,
  listAccounts: vi.fn(),
  updateAccount: vi.fn(),
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: createAgentRunMock,
  findActiveRun: findActiveRunMock,
  updateAgentRunResult: updateAgentRunResultMock,
}));

vi.mock("@/server/repositories/agent-policy", () => ({
  loadAgentPolicies: loadAgentPoliciesMock,
}));

vi.mock("@/lib/serializable", () => ({
  serializeAgentRun: serializeAgentRunMock,
}));

describe("accounts server functions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL = "https://n8n.example/webhook";

    const actualAgents = await vi.importActual<typeof import("@/lib/agents")>("@/lib/agents");
    resolveDispatchableAgentMock.mockImplementation(actualAgents.resolveDispatchableAgent);
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
    createAgentRunMock.mockResolvedValue({
      created: true,
      run: { id: "run-1", status: "running" },
    });
    buildRelationshipIntelligencePayloadMock.mockReturnValue({
      trigger: "account.relationship_intelligence_requested",
      account_id: "account-1",
      agent_run_id: "run-1",
    });
  });

  it("returns a clear non-triggered result when the relationship intelligence webhook is missing", async () => {
    getN8nDispatchConfigMock.mockReturnValue(null);
    const { triggerRelationshipIntelligence } = await import("../accounts");

    const result = await triggerRelationshipIntelligence({
      data: { accountId: "account-1" },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();

    expect(requireCapabilityMock).toHaveBeenCalledWith("agents.run", {
      resourceType: "account",

      resourceId: "account-1",
    });

    expect(findActiveRunMock).toHaveBeenCalledWith(
      "account-1",
      "relationship_intelligence",
      "account",
    );
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(result).toEqual({ triggered: false, reason: "missing_webhook" });
  });

  it("creates an account-scoped relationship intelligence run and dispatches n8n", async () => {
    const { triggerRelationshipIntelligence } = await import("../accounts");

    const result = await triggerRelationshipIntelligence({
      data: { accountId: "account-1" },
    });

    expect(createAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "Relationship Intelligence Agent",
        workflow_type: "relationship_intelligence",
        subject_type: "account",
        subject_id: "account-1",
        input_data: { account_id: "account-1" },
        created_by: "user-1",
      }),
    );
    expect(buildRelationshipIntelligencePayloadMock).toHaveBeenCalledWith({
      accountId: "account-1",
      agentRunId: "run-1",
    });
    expect(triggerN8nMock).toHaveBeenCalled();
    expect(result).toEqual({ triggered: true, run: { id: "run-1", status: "running" } });
  });

  it("refuses to dispatch an inactive agent, and writes no run", async () => {
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerRelationshipIntelligence } = await import("../accounts");

    const result = await triggerRelationshipIntelligence({ data: { accountId: "account-1" } });

    expect(result).toEqual({ triggered: false, reason: "agent_inactive" });
    // Asserted on the write, not only the return value: a sentinel returned after a row was
    // created would still be a lie about what happened.
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(triggerN8nMock).not.toHaveBeenCalled();
  });

  it("refuses an unauthorised caller for being unauthorised, not for an inactive agent", async () => {
    // The guard sits after requireCapability so someone who may not run agents is told that,
    // and never which agents this deployment has switched off. Both conditions hold here at
    // once, so only the ordering decides the answer.
    requireCapabilityMock.mockRejectedValue(new Error("Missing capability: agents.run"));
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerRelationshipIntelligence } = await import("../accounts");

    await expect(
      triggerRelationshipIntelligence({ data: { accountId: "account-1" } }),
    ).rejects.toThrow("Missing capability: agents.run");
    expect(resolveDispatchableAgentMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
  });

  it("loads an Account workspace behind the existing auth guard", async () => {
    getAccountWorkspaceDataMock.mockResolvedValue({ summary: { id: "account-1" } });
    const { getAccountWorkspace } = await import("../accounts");

    await expect(getAccountWorkspace({ data: { id: "account-1" } })).resolves.toEqual({
      summary: { id: "account-1" },
    });
    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(getAccountWorkspaceDataMock).toHaveBeenCalledWith("account-1");
  });
});

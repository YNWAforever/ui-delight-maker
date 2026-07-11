import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  findActiveRunMock,
  createAgentRunMock,
  updateAgentRunResultMock,
  getN8nDispatchConfigMock,
  triggerN8nMock,
  buildRelationshipIntelligencePayloadMock,
  serializeAgentRunMock,
  getAccountWorkspaceDataMock,
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
    requireNeonAuthSessionMock: vi.fn(),
    findActiveRunMock: vi.fn(),
    createAgentRunMock: vi.fn(),
    updateAgentRunResultMock: vi.fn(),
    getN8nDispatchConfigMock: vi.fn(),
    triggerN8nMock: vi.fn(),
    buildRelationshipIntelligencePayloadMock: vi.fn(),
    serializeAgentRunMock: vi.fn((run) => run),
    getAccountWorkspaceDataMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
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

vi.mock("@/server-functions/serializers", () => ({
  serializeAgentRun: serializeAgentRunMock,
}));

describe("accounts server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL = "https://n8n.example/webhook";
    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
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

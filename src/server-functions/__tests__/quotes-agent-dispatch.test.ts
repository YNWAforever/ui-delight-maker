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
  buildQuoteDraftPayloadMock,
  serializeAgentRunMock,
  resolveDispatchableAgentMock,
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
    buildQuoteDraftPayloadMock: vi.fn(),
    serializeAgentRunMock: vi.fn((run) => run),
    resolveDispatchableAgentMock: vi.fn(),
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
  requireCapabilitySet: vi.fn(),
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/lib/n8n", () => ({
  getN8nDispatchConfig: getN8nDispatchConfigMock,
  triggerN8n: triggerN8nMock,
}));

vi.mock("@/lib/workflows/payloads", () => ({
  buildQuoteDraftPayload: buildQuoteDraftPayloadMock,
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: createAgentRunMock,
  findActiveRun: findActiveRunMock,
  updateAgentRunResult: updateAgentRunResultMock,
}));

vi.mock("@/server/repositories/job-sheets", () => ({
  createJobSheetFromAcceptedQuote: vi.fn(),
}));

vi.mock("@/server/repositories/quote-templates", () => ({
  listPdfTemplates: vi.fn(),
  listQuoteTemplates: vi.fn(),
}));

vi.mock("@/server/repositories/quote-versions", () => ({
  createQuoteVersion: vi.fn(),
  listQuoteVersions: vi.fn(),
}));

vi.mock("@/server/repositories/approvals", () => ({
  createApproval: vi.fn(),
  decideApproval: vi.fn(),
  findPendingApprovalForQuote: vi.fn(),
  getApproval: vi.fn(),
}));

vi.mock("@/server/repositories/quotes", () => ({
  createQuote: vi.fn(),
  getQuote: vi.fn(),
  listActivePricingTemplates: vi.fn(),
  listQuoteLineItems: vi.fn(),
  listQuotes: vi.fn(),
  listQuotesPage: vi.fn(),
  updateQuote: vi.fn(),
  updateQuoteLifecycle: vi.fn(),
}));

vi.mock("@/lib/serializable", () => ({
  serializeAgentRun: serializeAgentRunMock,
  serializeHumanApproval: vi.fn((approval) => approval),
}));

vi.mock("@/server/db/neon.server", () => ({ transaction: vi.fn() }));

describe("quote draft dispatch honours the catalogue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.N8N_DRAFT_QUOTE_WEBHOOK_URL = "https://n8n.example/webhook";

    const actual = await vi.importActual<typeof import("@/lib/agents")>("@/lib/agents");
    resolveDispatchableAgentMock.mockImplementation(actual.resolveDispatchableAgent);

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
    const { triggerQuoteAgent } = await import("../quotes");

    const result = await triggerQuoteAgent({ data: { leadId: "lead-1" } });

    expect(createAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_type: "draft_quote" }),
    );
    expect(result).toEqual({ triggered: true, run: { id: "run-1" } });
  });

  it("refuses to dispatch an inactive agent, and writes no run", async () => {
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerQuoteAgent } = await import("../quotes");

    const result = await triggerQuoteAgent({ data: { leadId: "lead-1" } });

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
    const { triggerQuoteAgent } = await import("../quotes");

    await expect(triggerQuoteAgent({ data: { leadId: "lead-1" } })).rejects.toThrow(
      "Missing capability: agents.run",
    );
    expect(resolveDispatchableAgentMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
  });
});

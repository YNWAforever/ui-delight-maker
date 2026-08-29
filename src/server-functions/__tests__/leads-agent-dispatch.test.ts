import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The catalogue's `status` governs dispatch from the lead screens.
 *
 * Every entry in `AGENT_DEFINITIONS` is `active` today, so the refusal path cannot be reached
 * through the real catalogue. `resolveDispatchableAgent` is therefore mocked — defaulting to
 * the real implementation, so the happy paths still assert the real `display_name` — and
 * overridden per test to inject the inactive state.
 */
const {
  requireCapabilityMock,
  requireNeonAuthSessionMock,
  findActiveRunMock,
  createAgentRunMock,
  updateAgentRunResultMock,
  getN8nDispatchConfigMock,
  triggerN8nMock,
  buildQualificationPayloadMock,
  buildReplyDraftPayloadMock,
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
    buildQualificationPayloadMock: vi.fn(),
    buildReplyDraftPayloadMock: vi.fn(),
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
  buildQualificationPayload: buildQualificationPayloadMock,
  buildReplyDraftPayload: buildReplyDraftPayloadMock,
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: createAgentRunMock,
  findActiveRun: findActiveRunMock,
  updateAgentRunResult: updateAgentRunResultMock,
}));

vi.mock("@/server/repositories/leads", () => ({
  convertWonLeadToEngagement: vi.fn(),
  createLead: vi.fn(),
  getLeadWithActivity: vi.fn(),
  listLeads: vi.fn(),
  listLeadsPage: vi.fn(),
  moveLeadStage: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/server/read-models/lead-timeline", () => ({
  summariseLeadTimeline: vi.fn(),
}));

vi.mock("@/server/repositories/agent-policy", () => ({
  loadAgentPolicies: loadAgentPoliciesMock,
}));

vi.mock("@/lib/serializable", () => ({
  serializeActivityLog: vi.fn((log) => log),
  serializeAgentRun: serializeAgentRunMock,
}));

describe("lead agent dispatch honours the catalogue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.N8N_QUALIFY_LEAD_WEBHOOK_URL = "https://n8n.example/webhook";
    process.env.N8N_DRAFT_REPLY_WEBHOOK_URL = "https://n8n.example/webhook";

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

  it("dispatches qualify_lead under the catalogue's display name while the agent is active", async () => {
    const { triggerLeadAgent } = await import("../leads");

    const result = await triggerLeadAgent({ data: { leadId: "lead-1" } });

    expect(createAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "Lead Qualification Agent",
        workflow_type: "qualify_lead",
      }),
    );
    expect(result).toEqual({ triggered: true, run: { id: "run-1" } });
  });

  it("refuses to dispatch an inactive agent, and writes no run", async () => {
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerLeadAgent } = await import("../leads");

    const result = await triggerLeadAgent({ data: { leadId: "lead-1" } });

    expect(result).toEqual({ triggered: false, reason: "agent_inactive" });
    // Asserted on the write, not only the return value: a sentinel returned after a row was
    // created would still be a lie about what happened.
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(triggerN8nMock).not.toHaveBeenCalled();
  });

  it("refuses to dispatch an inactive draft_reply agent, and writes no run", async () => {
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerLeadReplyDraft } = await import("../leads");

    const result = await triggerLeadReplyDraft({ data: { leadId: "lead-1" } });

    expect(result).toEqual({ triggered: false, reason: "agent_inactive" });
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(triggerN8nMock).not.toHaveBeenCalled();
  });

  it("refuses an unauthorised caller for being unauthorised, not for an inactive agent", async () => {
    // The one ordering here with a security dimension, and it is invisible in normal use.
    // The guard must sit AFTER requireCapability: someone who may not run agents learns only
    // that they may not run agents, never which agents this deployment has switched off.
    //
    // Both conditions hold at once — the caller lacks the capability AND the agent is
    // inactive — so only the ordering decides the answer. Move the guard above
    // requireCapability and this returns the agent_inactive sentinel instead of throwing.
    requireCapabilityMock.mockRejectedValue(new Error("Missing capability: agents.run"));
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { triggerLeadAgent } = await import("../leads");

    await expect(triggerLeadAgent({ data: { leadId: "lead-1" } })).rejects.toThrow(
      "Missing capability: agents.run",
    );
    expect(resolveDispatchableAgentMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
  });
});

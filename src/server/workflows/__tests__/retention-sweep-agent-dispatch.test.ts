import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The retention sweep is a scheduled job, not a server function: its caller
 * (`src/routes/api/workflows/retention-sweep.ts`) has no per-engagement error handling and
 * simply spreads the returned counts into a 200 response. A thrown sweep would therefore
 * abandon every engagement after the first inactive-agent hit and surface as a 500, so an
 * inactive agent is a *skipped item* here — exactly like a missing webhook or an
 * already-running run already are.
 */
const {
  queryMock,
  createNotificationMock,
  createAgentRunMock,
  findActiveRunMock,
  updateAgentRunResultMock,
  getN8nDispatchConfigMock,
  triggerN8nMock,
  buildScoreRenewalRiskPayloadMock,
  resolveDispatchableAgentMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  createNotificationMock: vi.fn(),
  createAgentRunMock: vi.fn(),
  findActiveRunMock: vi.fn(),
  updateAgentRunResultMock: vi.fn(),
  getN8nDispatchConfigMock: vi.fn(),
  triggerN8nMock: vi.fn(),
  buildScoreRenewalRiskPayloadMock: vi.fn(),
  resolveDispatchableAgentMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));

vi.mock("@/server/repositories/notifications", () => ({
  createNotification: createNotificationMock,
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: createAgentRunMock,
  findActiveRun: findActiveRunMock,
  updateAgentRunResult: updateAgentRunResultMock,
}));

vi.mock("@/lib/n8n", () => ({
  getN8nDispatchConfig: getN8nDispatchConfigMock,
  triggerN8n: triggerN8nMock,
}));

vi.mock("@/lib/workflows/payloads", () => ({
  buildScoreRenewalRiskPayload: buildScoreRenewalRiskPayloadMock,
}));

vi.mock("@/lib/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents")>();
  return { ...actual, resolveDispatchableAgent: resolveDispatchableAgentMock };
});

const TODAY = "2026-01-01";

/** Two engagements, both inside the 30-day renewal window, so both reach the dispatch branch. */
const ENGAGEMENTS = [
  {
    id: "eng-1",
    client_id: "client-1",
    owner: "user-1",
    renewal_date: "2026-01-20",
    last_touch_at: "2025-12-28",
    start_date: "2025-01-01",
    client_company_name: "Acme",
  },
  {
    id: "eng-2",
    client_id: "client-2",
    owner: "user-2",
    renewal_date: "2026-01-25",
    last_touch_at: "2025-12-28",
    start_date: "2025-01-01",
    client_company_name: "Globex",
  },
];

describe("retention sweep honours the catalogue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL = "https://n8n.example/webhook";

    const actual = await vi.importActual<typeof import("@/lib/agents")>("@/lib/agents");
    resolveDispatchableAgentMock.mockImplementation(actual.resolveDispatchableAgent);

    // First query lists the engagements; second lists fallback admins.
    queryMock.mockResolvedValueOnce(ENGAGEMENTS).mockResolvedValueOnce([{ id: "admin-1" }]);
    createNotificationMock.mockResolvedValue(true);
    findActiveRunMock.mockResolvedValue(null);
    getN8nDispatchConfigMock.mockReturnValue({
      webhookUrl: "https://n8n.example/webhook",
      workflowToken: "token",
    });
    createAgentRunMock.mockResolvedValue({ created: true, run: { id: "run-1" } });
  });

  it("dispatches a re-score for each engagement while the agent is active", async () => {
    const { runRetentionSweep } = await import("../retention-sweep.server");

    const result = await runRetentionSweep(TODAY);

    expect(createAgentRunMock).toHaveBeenCalledTimes(2);
    expect(createAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "Renewal Risk Agent",
        workflow_type: "score_renewal_risk",
        trigger_type: "schedule",
      }),
    );
    expect(result.rescoreDispatched).toBe(2);
  });

  it("skips the re-score when the agent is inactive, without writing a run or throwing", async () => {
    resolveDispatchableAgentMock.mockReturnValue({
      dispatchable: false,
      reason: "agent_inactive",
    });
    const { runRetentionSweep } = await import("../retention-sweep.server");

    const result = await runRetentionSweep(TODAY);

    // Asserted on the write, not only the count: a run row for a dispatch that never happened
    // would leave a permanently "running" row and a stuck-run alert.
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(triggerN8nMock).not.toHaveBeenCalled();
    expect(result.rescoreDispatched).toBe(0);

    // The rest of the sweep is untouched: every engagement is still scanned and still notified.
    expect(result.engagementsScanned).toBe(2);
    expect(result.renewalNotified).toBe(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The same writebacks as `writebacks.test.ts`, run against a catalogue whose `human_approval`
 * flags are all inverted.
 *
 * `writebacks.test.ts` pins what each writeback does with the real catalogue, and those pins
 * pass whether the flag is read or ignored — which is exactly the failure mode this file
 * exists to close. A gate that is read and then discarded would leave every other test green.
 * Here the definitions are injected rather than the helper stubbed, so the production lookup
 * runs for real and only the value it finds is different.
 */
const mocks = vi.hoisted(() => {
  const fakeDb = {
    query: vi.fn(),
  };

  return {
    fakeDb,
    transactionMock: vi.fn(async (work: (db: typeof fakeDb) => Promise<unknown>) => work(fakeDb)),
    // `loadAgentPolicies` reads through this pooled `query`, not the transaction's `db`
    // client. Resolving `[]` means no stored override exists, so the effective policy this
    // test's writebacks see comes entirely from the `AGENT_DEFINITIONS` mocked below — the
    // real merge in `loadAgentPolicies` still runs, only the catalogue under it is flipped.
    poolQueryMock: vi.fn().mockResolvedValue([]),
    assertLeadExistsMock: vi.fn(),
    getAgentRunForUpdateMock: vi.fn(),
    getEngagementMock: vi.fn(),
    updateAgentRunResultMock: vi.fn(),
    createActivityLogMock: vi.fn(),
    createApprovalMock: vi.fn(),
    createQuoteMock: vi.fn(),
    applyEngagementScoreMock: vi.fn(),
  };
});

vi.mock("@/lib/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents")>();

  return {
    ...actual,
    AGENT_DEFINITIONS: actual.AGENT_DEFINITIONS.map((agent) => ({
      ...agent,
      human_approval: !agent.human_approval,
    })),
  };
});

vi.mock("@/server/db/neon.server", () => ({
  transaction: mocks.transactionMock,
  query: mocks.poolQueryMock,
}));

vi.mock("@/server/repositories/leads", () => ({
  assertLeadExists: mocks.assertLeadExistsMock,
  updateLead: vi.fn(),
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  getAgentRunForUpdate: mocks.getAgentRunForUpdateMock,
  updateAgentRunResult: mocks.updateAgentRunResultMock,
}));

vi.mock("@/server/repositories/activity-logs", () => ({
  createActivityLog: mocks.createActivityLogMock,
}));

vi.mock("@/server/repositories/approvals", () => ({
  createApproval: mocks.createApprovalMock,
}));

vi.mock("@/server/repositories/quotes", () => ({
  createQuote: mocks.createQuoteMock,
}));

vi.mock("@/server/repositories/engagements", () => ({
  applyEngagementScore: mocks.applyEngagementScoreMock,
  getEngagement: mocks.getEngagementMock,
}));

vi.mock("@/server/repositories/accounts", () => ({
  updateAccount: vi.fn(),
}));

vi.mock("@/server/repositories/relationship-signals", () => ({
  upsertRelationshipSignals: vi.fn(),
}));

import {
  writeQuoteDraftResult,
  writeReplyDraftResult,
  writeScoreRenewalRiskResult,
} from "@/server/workflows/writebacks";

const QUOTE = {
  currency: "HKD",
  total_value: 20000,
  line_items: [
    {
      id: "line-1",
      service: "Retainer",
      description: "Monthly support",
      qty: 1,
      unit_price: 20000,
    },
  ],
};

describe("human_approval decides whether a writeback parks a run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fakeDb.query.mockReset();
    mocks.createApprovalMock.mockResolvedValue({ id: "approval-x" });
    mocks.createQuoteMock.mockResolvedValue({ id: "quote-x" });
  });

  it("completes a reply draft instead of parking it when the flag says no approval", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-f1",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-f1",
    });

    const approvalId = await writeReplyDraftResult({
      lead_id: "lead-f1",
      agent_run_id: "run-f1",
      draft_message: "Here is a draft reply",
      context_summary: "Review before sending",
      confidence_score: 0.61,
    });

    expect(
      approvalId,
      "draft_reply.human_approval is false in this catalogue, so no approval should exist",
    ).toBeNull();
    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-f1",
      expect.objectContaining({ status: "completed", human_review_required: false }),
      mocks.fakeDb,
    );
  });

  it("completes a quote draft the payload asked to park, when the flag says no approval", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-f2",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-f2",
    });

    // `create_send_approval: true` is the writeback's own condition and it fires. The flag is
    // the gate above it, so nothing parks.
    await expect(
      writeQuoteDraftResult({
        lead_id: "lead-f2",
        agent_run_id: "run-f2",
        quote: QUOTE,
        create_send_approval: true,
        confidence_score: 0.73,
      }),
    ).resolves.toEqual({ quoteId: "quote-x", approvalId: null });

    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-f2",
      expect.objectContaining({ status: "completed", human_review_required: false }),
      mocks.fakeDb,
    );
  });

  it("applies a raise to high risk directly when the flag says no approval", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-f3",
      status: "running",
      output_data: null,
      subject_type: "engagement",
      subject_id: "engagement-f3",
    });
    mocks.getEngagementMock.mockResolvedValue({ id: "engagement-f3", renewal_risk: "medium" });

    await expect(
      writeScoreRenewalRiskResult({
        engagement_id: "engagement-f3",
        agent_run_id: "run-f3",
        health_score: 42,
        renewal_risk: "high",
        risk_reasoning: "Usage collapsed",
        suggested_next_action: "Escalate to CS lead",
        confidence: 0.8,
        output_summary: "High risk",
      }),
    ).resolves.toEqual({ applied: true });

    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
    // Withholding the score is the whole cost of parking; without the flag it is not withheld.
    expect(mocks.applyEngagementScoreMock).toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-f3",
      expect.objectContaining({ status: "completed", human_review_required: false }),
      mocks.fakeDb,
    );
  });
});

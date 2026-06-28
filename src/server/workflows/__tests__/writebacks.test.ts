import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fakeDb = {
    query: vi.fn(),
  };

  return {
    fakeDb,
    transactionMock: vi.fn(async (work: (db: typeof fakeDb) => Promise<unknown>) => work(fakeDb)),
    assertLeadExistsMock: vi.fn(),
    updateLeadMock: vi.fn(),
    updateAgentRunResultMock: vi.fn(),
    createActivityLogMock: vi.fn(),
    createApprovalMock: vi.fn(),
    createQuoteMock: vi.fn(),
  };
});

vi.mock("@/server/db/neon.server", () => ({
  transaction: mocks.transactionMock,
}));

vi.mock("@/server/repositories/leads", () => ({
  assertLeadExists: mocks.assertLeadExistsMock,
  updateLead: mocks.updateLeadMock,
}));

vi.mock("@/server/repositories/agent-runs", () => ({
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

import {
  writeQualificationResult,
  writeQuoteDraftResult,
  writeReplyDraftResult,
} from "@/server/workflows/writebacks";

describe("workflow writebacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fakeDb.query.mockReset();
  });

  it("wraps qualification writebacks in one transaction client", async () => {
    await writeQualificationResult({
      lead_id: "lead-1",
      agent_run_id: "run-1",
      qualification_data: {
        urgency_score: 7,
        fit_score: 8,
        qualification_score: 78,
        service_interest: ["SEO"],
        budget_range: "HKD 50k-200k",
        next_action: "Schedule discovery call",
        reason: "Strong fit",
        confidence: 0.84,
        human_review_required: false,
      },
      lead_score: 78,
      output_summary: "Qualified lead",
      confidence_score: 0.84,
      duration_ms: 1250,
      tokens_used: 330,
      model_used: "model-x",
    });

    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateLeadMock).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({ lead_score: 78 }),
      mocks.fakeDb,
    );
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "completed", human_review_required: false }),
      mocks.fakeDb,
    );
    expect(mocks.createActivityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ object_id: "lead-1", action: "qualified lead" }),
      mocks.fakeDb,
    );
  });

  it("creates reply approvals atomically and returns the approval id", async () => {
    mocks.createApprovalMock.mockResolvedValue({ id: "approval-1" });

    await expect(
      writeReplyDraftResult({
        lead_id: "lead-2",
        agent_run_id: "run-2",
        draft_message: "Here is a draft reply",
        context_summary: "Review before sending",
        confidence_score: 0.61,
        risk_notes: ["Needs approval"],
      }),
    ).resolves.toBe("approval-1");

    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.assertLeadExistsMock).toHaveBeenCalledWith("lead-2", mocks.fakeDb);
    expect(mocks.createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({ approval_type: "message_send" }),
      mocks.fakeDb,
    );
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-2",
      expect.objectContaining({
        status: "waiting_approval",
        output_data: expect.objectContaining({ approval_id: "approval-1" }),
      }),
      mocks.fakeDb,
    );
    expect(mocks.createActivityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ object_id: "lead-2", diff_data: { approval_id: "approval-1" } }),
      mocks.fakeDb,
    );
  });

  it("skips quote approvals when send approval is not requested", async () => {
    mocks.createQuoteMock.mockResolvedValue({ id: "quote-1" });

    await expect(
      writeQuoteDraftResult({
        lead_id: "lead-3",
        agent_run_id: "run-3",
        quote: {
          number: "Q-001",
          currency: "HKD",
          total_value: 20000,
          valid_until: "2026-07-31",
          line_items: [
            {
              id: "line-1",
              service: "Retainer",
              description: "Monthly support",
              qty: 1,
              unit_price: 20000,
            },
          ],
        },
        create_send_approval: false,
        context_summary: "Draft quote created.",
        confidence_score: 0.73,
      }),
    ).resolves.toEqual({
      quoteId: "quote-1",
      approvalId: null,
    });

    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.assertLeadExistsMock).toHaveBeenCalledWith("lead-3", mocks.fakeDb);
    expect(mocks.createQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: "lead-3", total_value: 20000 }),
      mocks.fakeDb,
    );
    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-3",
      expect.objectContaining({
        status: "completed",
        human_review_required: false,
        output_data: { quote_id: "quote-1", approval_id: null },
      }),
      mocks.fakeDb,
    );
    expect(mocks.createActivityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ object_id: "quote-1", object_type: "quote" }),
      mocks.fakeDb,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fakeDb = {
    query: vi.fn(),
  };

  return {
    fakeDb,
    transactionMock: vi.fn(async (work: (db: typeof fakeDb) => Promise<unknown>) => work(fakeDb)),
    assertLeadExistsMock: vi.fn(),
    getAgentRunForUpdateMock: vi.fn(),
    getEngagementMock: vi.fn(),
    updateLeadMock: vi.fn(),
    updateAccountMock: vi.fn(),
    updateAgentRunResultMock: vi.fn(),
    createActivityLogMock: vi.fn(),
    createApprovalMock: vi.fn(),
    createQuoteMock: vi.fn(),
    applyEngagementScoreMock: vi.fn(),
    upsertRelationshipSignalsMock: vi.fn(),
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
  updateAccount: mocks.updateAccountMock,
}));

vi.mock("@/server/repositories/relationship-signals", () => ({
  upsertRelationshipSignals: mocks.upsertRelationshipSignalsMock,
}));

import {
  writeQualificationResult,
  writeRelationshipIntelligenceResult,
  writeQuoteDraftResult,
  writeReplyDraftResult,
  writeScoreRenewalRiskResult,
} from "@/server/workflows/writebacks";

describe("workflow writebacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fakeDb.query.mockReset();
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-default",
      status: "running",
      output_data: null,
      subject_type: "account",
      subject_id: "account-9",
    });
    mocks.getEngagementMock.mockResolvedValue({
      id: "engagement-default",
      renewal_risk: "medium",
    });
    mocks.upsertRelationshipSignalsMock.mockResolvedValue([]);
  });

  it("wraps qualification writebacks in one transaction client", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-1",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-1",
    });

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
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-2",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-2",
    });

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

  it("reuses an existing reply approval for retried writebacks", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-2",
      status: "waiting_approval",
      output_data: { approval_id: "approval-1" },
      subject_type: "lead",
      subject_id: "lead-2",
    });

    await expect(
      writeReplyDraftResult({
        lead_id: "lead-2",
        agent_run_id: "run-2",
        draft_message: "Here is a draft reply",
        context_summary: "Review before sending",
        confidence_score: 0.61,
      }),
    ).resolves.toBe("approval-1");

    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).not.toHaveBeenCalled();
    expect(mocks.createActivityLogMock).not.toHaveBeenCalled();
  });

  it("skips quote approvals when send approval is not requested", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-3",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-3",
    });

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

  it("reuses an existing quote draft result for retried writebacks", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-3",
      status: "completed",
      output_data: { quote_id: "quote-1", approval_id: "approval-2" },
      subject_type: "lead",
      subject_id: "lead-3",
    });

    await expect(
      writeQuoteDraftResult({
        lead_id: "lead-3",
        agent_run_id: "run-3",
        quote: {
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
        },
        create_send_approval: true,
        confidence_score: 0.73,
      }),
    ).resolves.toEqual({
      quoteId: "quote-1",
      approvalId: "approval-2",
    });

    expect(mocks.createQuoteMock).not.toHaveBeenCalled();
    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).not.toHaveBeenCalled();
    expect(mocks.createActivityLogMock).not.toHaveBeenCalled();
  });

  it("writes relationship intelligence results atomically and records signal output", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-9",
      status: "running",
      output_data: null,
      subject_type: "account",
      subject_id: "account-9",
    });
    mocks.upsertRelationshipSignalsMock.mockResolvedValue([
      {
        id: "signal-1",
        account_id: "account-9",
        signal_type: "missing_decision_maker",
        severity: "high",
        title: "Decision maker missing",
        reason: "No decision maker is mapped.",
        suggested_action: "Identify one.",
        source: "ai",
        dedupe_key: "missing-decision-maker",
      },
    ]);

    await expect(
      writeRelationshipIntelligenceResult({
        account_id: "account-9",
        agent_run_id: "run-9",
        output_summary: "Analyzed relationship health.",
        next_action: "Book an executive alignment call.",
        signals: [
          {
            signal_type: "missing_decision_maker",
            severity: "high",
            title: "Decision maker missing",
            reason: "No decision maker is mapped.",
            suggested_action: "Identify one.",
            dedupe_key: "missing-decision-maker",
          },
        ],
        confidence_score: 0.81,
        model_used: "model-y",
      }),
    ).resolves.toEqual({
      applied: true,
      signalCount: 1,
    });

    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateAccountMock).toHaveBeenCalledWith(
      "account-9",
      expect.objectContaining({
        next_action: "Book an executive alignment call.",
        last_activity_at: expect.any(String),
      }),
      mocks.fakeDb,
    );
    expect(mocks.upsertRelationshipSignalsMock).toHaveBeenCalledWith(
      "account-9",
      [
        expect.objectContaining({
          account_id: "account-9",
          source: "ai",
          signal_type: "missing_decision_maker",
        }),
      ],
      mocks.fakeDb,
    );
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-9",
      expect.objectContaining({
        status: "completed",
        output_summary: "Analyzed relationship health.",
        confidence_score: 0.81,
        human_review_required: false,
        model_used: "model-y",
        output_data: {
          next_action: "Book an executive alignment call.",
          signals: expect.any(Array),
        },
      }),
      mocks.fakeDb,
    );
    expect(mocks.createActivityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_name: "Relationship Intelligence Agent",
        object_type: "account",
        object_id: "account-9",
        action: "analyzed account relationship",
      }),
      mocks.fakeDb,
    );
  });

  it("treats completed relationship intelligence writebacks as idempotent", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-9",
      status: "completed",
      output_data: { signals: [] },
      subject_type: "account",
      subject_id: "account-9",
    });

    await expect(
      writeRelationshipIntelligenceResult({
        account_id: "account-9",
        agent_run_id: "run-9",
        output_summary: "Analyzed relationship health.",
        next_action: null,
        signals: [],
        confidence_score: 0.81,
      }),
    ).resolves.toEqual({
      applied: true,
    });

    expect(mocks.updateAccountMock).not.toHaveBeenCalled();
    expect(mocks.upsertRelationshipSignalsMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).not.toHaveBeenCalled();
    expect(mocks.createActivityLogMock).not.toHaveBeenCalled();
  });

  it("rejects relationship intelligence writebacks for a mismatched account run before writes", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-9",
      status: "running",
      output_data: null,
      subject_type: "account",
      subject_id: "account-22",
    });

    await expect(
      writeRelationshipIntelligenceResult({
        account_id: "account-9",
        agent_run_id: "run-9",
        output_summary: "Analyzed relationship health.",
        next_action: "Book an executive alignment call.",
        signals: [],
        confidence_score: 0.81,
      }),
    ).rejects.toThrow("Agent run does not belong to this account");

    expect(mocks.updateAccountMock).not.toHaveBeenCalled();
    expect(mocks.upsertRelationshipSignalsMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).not.toHaveBeenCalled();
    expect(mocks.createActivityLogMock).not.toHaveBeenCalled();
  });

  // n8n supplies the run id and the subject id as two independent fields. Only the
  // relationship-intelligence writeback used to check that they agree, so a mis-wired workflow
  // could write one lead's qualification onto another lead's record.
  // The workflow relays whatever the model returned, so what lands in the column has to be
  // coerced here rather than trusted — the lead Insights tab reads `.service_interest.map(...)`
  // off it directly.
  it("stores a renderable qualification even when the model returned an unrelated object", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-1",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-1",
    });

    await writeQualificationResult({
      lead_id: "lead-1",
      agent_run_id: "run-1",
      qualification_data: { notes: "looks good" },
      lead_score: 60,
      output_summary: "Model went off-script",
      confidence_score: 0.9,
    });

    const [, updates] = mocks.updateLeadMock.mock.calls[0]!;
    expect(updates.qualification_data).toMatchObject({
      service_interest: [],
      budget_range: "unknown",
      next_action: "Request more info",
      human_review_required: true,
    });
    expect(Number.isFinite(updates.qualification_data.confidence)).toBe(true);

    // The agent run records the same normalized object, not the raw payload, so the two cannot
    // disagree about what the agent decided.
    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ output_data: updates.qualification_data }),
      mocks.fakeDb,
    );
  });

  it("rejects a qualification writeback whose run belongs to a different lead", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-1",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-999",
    });

    await expect(
      writeQualificationResult({
        lead_id: "lead-1",
        agent_run_id: "run-1",
        qualification_data: { fit: "high" },
        lead_score: 82,
        output_summary: "Strong fit",
        confidence_score: 0.9,
      }),
    ).rejects.toThrow("Agent run does not belong to this lead");

    expect(mocks.updateLeadMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).not.toHaveBeenCalled();
  });

  it("rejects a reply draft writeback whose run belongs to a different lead", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-2",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-999",
    });

    await expect(
      writeReplyDraftResult({
        lead_id: "lead-2",
        agent_run_id: "run-2",
        draft_message: "Here is a draft reply",
        context_summary: "Review before sending",
        confidence_score: 0.61,
      }),
    ).rejects.toThrow("Agent run does not belong to this lead");

    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
  });

  it("rejects a quote draft writeback whose run belongs to a different lead", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-3",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-999",
    });

    await expect(
      writeQuoteDraftResult({
        lead_id: "lead-3",
        agent_run_id: "run-3",
        quote: { currency: "HKD", total_value: 20000, line_items: [] },
        create_send_approval: false,
        confidence_score: 0.73,
      }),
    ).rejects.toThrow("Agent run does not belong to this lead");

    expect(mocks.createQuoteMock).not.toHaveBeenCalled();
  });

  it("rejects a renewal risk writeback whose run belongs to a different engagement", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-4",
      status: "running",
      output_data: null,
      subject_type: "engagement",
      subject_id: "engagement-999",
    });

    await expect(
      writeScoreRenewalRiskResult({
        engagement_id: "engagement-4",
        agent_run_id: "run-4",
        health_score: 42,
        renewal_risk: "high",
        risk_reasoning: "Usage collapsed",
        suggested_next_action: "Escalate to CS lead",
        confidence: 0.8,
        output_summary: "High risk",
      }),
    ).rejects.toThrow("Agent run does not belong to this engagement");

    expect(mocks.applyEngagementScoreMock).not.toHaveBeenCalled();
    expect(mocks.createApprovalMock).not.toHaveBeenCalled();
  });

  it("replays a completed qualification writeback without touching the lead", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-1",
      status: "completed",
      output_data: { fit: "high" },
      subject_type: "lead",
      subject_id: "lead-1",
    });

    await writeQualificationResult({
      lead_id: "lead-1",
      agent_run_id: "run-1",
      qualification_data: { fit: "low" },
      lead_score: 10,
      output_summary: "Replayed",
      confidence_score: 0.2,
    });

    expect(mocks.updateLeadMock).not.toHaveBeenCalled();
    expect(mocks.updateAgentRunResultMock).not.toHaveBeenCalled();
    expect(mocks.createActivityLogMock).not.toHaveBeenCalled();
  });

  // `qualification_data` is model output relayed by n8n, so it may raise the review bar but
  // never lower it below what the confidence threshold already demands.
  it("keeps human review required when the model asks to skip it below the confidence floor", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-1",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-1",
    });

    await writeQualificationResult({
      lead_id: "lead-1",
      agent_run_id: "run-1",
      qualification_data: { human_review_required: false },
      lead_score: 40,
      output_summary: "Model says no review needed",
      confidence_score: 0.2,
    });

    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ human_review_required: true }),
      mocks.fakeDb,
    );
  });

  it("still lets the model raise the review bar above the confidence floor", async () => {
    mocks.getAgentRunForUpdateMock.mockResolvedValue({
      id: "run-1",
      status: "running",
      output_data: null,
      subject_type: "lead",
      subject_id: "lead-1",
    });

    await writeQualificationResult({
      lead_id: "lead-1",
      agent_run_id: "run-1",
      qualification_data: { human_review_required: true },
      lead_score: 95,
      output_summary: "Confident but wants a look",
      confidence_score: 0.99,
    });

    expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ human_review_required: true }),
      mocks.fakeDb,
    );
  });

  // Pinned before `human_approval` became the gate on parking. Every assertion below is true of
  // the code as it stood beforehand, so the refactor that makes the catalogue flag load-bearing
  // is provably invisible: these pass unchanged on both sides of it. A failure here means
  // behaviour moved, not that the pin was wrong.
  describe("which writebacks park a run in waiting_approval", () => {
    it("completes a qualification run outright and never parks it", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p1",
        status: "running",
        output_data: null,
        subject_type: "lead",
        subject_id: "lead-p1",
      });

      await writeQualificationResult({
        lead_id: "lead-p1",
        agent_run_id: "run-p1",
        qualification_data: { confidence: 0.9 },
        lead_score: 80,
        output_summary: "Qualified",
        confidence_score: 0.9,
      });

      expect(mocks.createApprovalMock).not.toHaveBeenCalled();
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p1",
        expect.objectContaining({ status: "completed" }),
        mocks.fakeDb,
      );
    });

    // Confidence sits at the ceiling on purpose: the reply draft parks on nothing but the fact
    // that it is a reply draft.
    it("parks every reply draft run, whatever the confidence", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p2",
        status: "running",
        output_data: null,
        subject_type: "lead",
        subject_id: "lead-p2",
      });
      mocks.createApprovalMock.mockResolvedValue({ id: "approval-p2" });

      await expect(
        writeReplyDraftResult({
          lead_id: "lead-p2",
          agent_run_id: "run-p2",
          draft_message: "Here is a draft reply",
          context_summary: "Review before sending",
          confidence_score: 0.99,
        }),
      ).resolves.toBe("approval-p2");

      expect(mocks.createApprovalMock).toHaveBeenCalledWith(
        expect.objectContaining({ approval_type: "message_send" }),
        mocks.fakeDb,
      );
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p2",
        expect.objectContaining({ status: "waiting_approval", human_review_required: true }),
        mocks.fakeDb,
      );
    });

    it("parks a quote draft run when the draft asks for a send approval", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p3",
        status: "running",
        output_data: null,
        subject_type: "lead",
        subject_id: "lead-p3",
      });
      mocks.createQuoteMock.mockResolvedValue({ id: "quote-p3" });
      mocks.createApprovalMock.mockResolvedValue({ id: "approval-p3" });

      await expect(
        writeQuoteDraftResult({
          lead_id: "lead-p3",
          agent_run_id: "run-p3",
          quote: {
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
          },
          create_send_approval: true,
          confidence_score: 0.73,
        }),
      ).resolves.toEqual({ quoteId: "quote-p3", approvalId: "approval-p3" });

      expect(mocks.createApprovalMock).toHaveBeenCalledWith(
        expect.objectContaining({ approval_type: "quote_send" }),
        mocks.fakeDb,
      );
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p3",
        expect.objectContaining({ status: "waiting_approval", human_review_required: true }),
        mocks.fakeDb,
      );
    });

    it("completes a quote draft run when no send approval is asked for", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p4",
        status: "running",
        output_data: null,
        subject_type: "lead",
        subject_id: "lead-p4",
      });
      mocks.createQuoteMock.mockResolvedValue({ id: "quote-p4" });

      await expect(
        writeQuoteDraftResult({
          lead_id: "lead-p4",
          agent_run_id: "run-p4",
          quote: {
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
          },
          create_send_approval: false,
          confidence_score: 0.73,
        }),
      ).resolves.toEqual({ quoteId: "quote-p4", approvalId: null });

      expect(mocks.createApprovalMock).not.toHaveBeenCalled();
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p4",
        expect.objectContaining({ status: "completed", human_review_required: false }),
        mocks.fakeDb,
      );
    });

    it("parks a renewal risk run only when it raises the risk to high", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p5",
        status: "running",
        output_data: null,
        subject_type: "engagement",
        subject_id: "engagement-p5",
      });
      mocks.getEngagementMock.mockResolvedValue({ id: "engagement-p5", renewal_risk: "medium" });
      mocks.createApprovalMock.mockResolvedValue({ id: "approval-p5" });

      await expect(
        writeScoreRenewalRiskResult({
          engagement_id: "engagement-p5",
          agent_run_id: "run-p5",
          health_score: 42,
          renewal_risk: "high",
          risk_reasoning: "Usage collapsed",
          suggested_next_action: "Escalate to CS lead",
          confidence: 0.8,
          output_summary: "High risk",
        }),
      ).resolves.toEqual({ applied: false, approvalId: "approval-p5" });

      expect(mocks.createApprovalMock).toHaveBeenCalledWith(
        expect.objectContaining({ approval_type: "cs_risk_review" }),
        mocks.fakeDb,
      );
      // The score is withheld until a human agrees, which is the point of parking.
      expect(mocks.applyEngagementScoreMock).not.toHaveBeenCalled();
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p5",
        expect.objectContaining({ status: "waiting_approval", human_review_required: true }),
        mocks.fakeDb,
      );
    });

    it("completes a renewal risk run that does not raise the risk to high", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p6",
        status: "running",
        output_data: null,
        subject_type: "engagement",
        subject_id: "engagement-p6",
      });
      mocks.getEngagementMock.mockResolvedValue({ id: "engagement-p6", renewal_risk: "high" });

      await expect(
        writeScoreRenewalRiskResult({
          engagement_id: "engagement-p6",
          agent_run_id: "run-p6",
          health_score: 42,
          renewal_risk: "high",
          risk_reasoning: "Still bad, already known",
          suggested_next_action: "Keep the weekly check-in",
          confidence: 0.8,
          output_summary: "High risk, unchanged",
        }),
      ).resolves.toEqual({ applied: true });

      expect(mocks.createApprovalMock).not.toHaveBeenCalled();
      expect(mocks.applyEngagementScoreMock).toHaveBeenCalled();
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p6",
        expect.objectContaining({ status: "completed", human_review_required: false }),
        mocks.fakeDb,
      );
    });

    it("completes a relationship intelligence run and never parks it", async () => {
      mocks.getAgentRunForUpdateMock.mockResolvedValue({
        id: "run-p7",
        status: "running",
        output_data: null,
        subject_type: "account",
        subject_id: "account-p7",
      });
      mocks.upsertRelationshipSignalsMock.mockResolvedValue([]);

      await expect(
        writeRelationshipIntelligenceResult({
          account_id: "account-p7",
          agent_run_id: "run-p7",
          output_summary: "Analyzed relationship health.",
          next_action: "Book an executive alignment call.",
          signals: [],
          confidence_score: 0.81,
        }),
      ).resolves.toEqual({ applied: true, signalCount: 0 });

      expect(mocks.createApprovalMock).not.toHaveBeenCalled();
      expect(mocks.updateAgentRunResultMock).toHaveBeenCalledWith(
        "run-p7",
        expect.objectContaining({ status: "completed", human_review_required: false }),
        mocks.fakeDb,
      );
    });
  });
});

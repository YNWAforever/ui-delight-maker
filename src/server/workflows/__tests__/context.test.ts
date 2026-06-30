import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mocks.queryMock,
  queryOne: mocks.queryOneMock,
}));

import { getLeadWorkflowContext } from "@/server/workflows/context.server";

describe("workflow lead context", () => {
  const lead = {
    id: "lead-1",
    company_name: "Acme Limited",
    contact_name: "Ada Wong",
    contact_email: "ada@example.com",
    contact_phone: "+852 5555 0000",
    source: "website",
    status: "new",
    assigned_to: "sales-1",
    lead_score: 82,
    qualification_data: { fit_score: 8 },
    enquiry_text: "Need CRM support",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
  };

  const agentRun = {
    id: "run-1",
    agent_name: "Lead Qualification Agent",
    workflow_type: "qualify_lead",
    subject_type: "lead",
    subject_id: "lead-1",
    input_data: { lead_id: "lead-1" },
    output_data: null,
    output_summary: null,
    status: "running",
    model_used: "model-x",
    confidence_score: null,
    human_review_required: false,
    created_at: "2026-06-03T00:00:00.000Z",
  };

  const pricingTemplates = [
    {
      id: "template-1",
      service: "CRM Setup",
      description: "Initial implementation",
      category: "CRM",
      unit_price: 20000,
      currency: "HKD",
      active: true,
    },
  ];

  const recentActivity = [
    {
      actor_type: "agent",
      actor_name: "Lead Qualification Agent",
      action: "qualified lead",
      object_type: "lead",
      object_id: "lead-1",
      diff_data: { lead_score: 82 },
      created_at: "2026-06-04T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryMock.mockReset();
    mocks.queryOneMock.mockReset();
  });

  it("throws when the lead is missing", async () => {
    mocks.queryOneMock.mockResolvedValueOnce(null);

    await expect(
      getLeadWorkflowContext({ leadId: "missing-lead", agentRunId: "run-1" }),
    ).rejects.toThrow("Lead not found");
  });

  it("throws when the agent run is missing", async () => {
    mocks.queryOneMock.mockResolvedValueOnce(lead).mockResolvedValueOnce(null);

    await expect(
      getLeadWorkflowContext({ leadId: "lead-1", agentRunId: "missing-run" }),
    ).rejects.toThrow("Agent run not found");
  });

  it("throws when the agent run does not belong to the lead", async () => {
    mocks.queryOneMock
      .mockResolvedValueOnce(lead)
      .mockResolvedValueOnce({ ...agentRun, subject_id: "lead-2" });

    await expect(getLeadWorkflowContext({ leadId: "lead-1", agentRunId: "run-1" })).rejects.toThrow(
      "Agent run does not belong to lead",
    );
  });

  it("returns lead context with active pricing templates and recent activity", async () => {
    mocks.queryOneMock.mockResolvedValueOnce(lead).mockResolvedValueOnce(agentRun);
    mocks.queryMock.mockResolvedValueOnce(pricingTemplates).mockResolvedValueOnce(recentActivity);

    await expect(
      getLeadWorkflowContext({ leadId: "lead-1", agentRunId: "run-1" }),
    ).resolves.toEqual({
      lead,
      agent_run: agentRun,
      pricing_templates: pricingTemplates,
      recent_activity: recentActivity,
    });

    expect(mocks.queryOneMock).toHaveBeenCalledTimes(2);
    expect(mocks.queryMock).toHaveBeenCalledTimes(2);
    expect(mocks.queryOneMock).toHaveBeenNthCalledWith(1, expect.stringContaining("from leads"), [
      "lead-1",
    ]);
    expect(mocks.queryOneMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from agent_runs"),
      ["run-1"],
    );
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("from pricing_templates"),
    );
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from activity_logs"),
      ["lead-1"],
    );
  });
});

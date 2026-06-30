import { describe, expect, it } from "vitest";
import type { HumanApproval, Lead, Quote, Task } from "../types";
import {
  LEAD_PIPELINE_STAGES,
  filterPipelineLeads,
  getLeadAiState,
  getLeadNextAction,
  getLeadSlaState,
  getPipelineSummary,
  groupLeadsByPipelineStage,
} from "../pipeline";

const baseLead = (overrides: Partial<Lead>): Lead => ({
  id: "lead-1",
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  company_name: "Aurora Retail Group",
  contact_name: "Jonathan Cheung",
  contact_email: "jonathan@example.com",
  contact_phone: "+852 9123 4567",
  source: "website",
  status: "new",
  assigned_to: "user-1",
  lead_score: 82,
  qualification_data: null,
  enquiry_text: "Need CRM and AI assistant support.",
  created_at: "2026-06-28T01:00:00Z",
  updated_at: "2026-06-28T01:00:00Z",
  ...overrides,
});

const task = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  title: "Follow up",
  description: null,
  assigned_to: "user-1",
  lead_id: "lead-1",
  client_id: null,
  contact_id: null,
  account_id: null,
  deal_id: null,
  project_id: null,
  due_date: "2026-06-28",
  priority: "high",
  status: "open",
  created_by_agent: null,
  created_at: "2026-06-28T01:00:00Z",
  ...overrides,
});

const quote = (overrides: Partial<Quote>): Quote => ({
  id: "quote-1",
  number: "QT-001",
  lead_id: "lead-1",
  client_id: null,
  contact_id: null,
  account_id: null,
  deal_id: null,
  status: "draft",
  total_value: 48000,
  currency: "HKD",
  valid_until: "2026-07-28",
  line_items: [],
  pdf_url: null,
  created_by: null,
  approved_by: null,
  created_at: "2026-06-28T01:00:00Z",
  updated_at: "2026-06-28T01:00:00Z",
  ...overrides,
});

const approval = (overrides: Partial<HumanApproval>): HumanApproval => ({
  id: "approval-1",
  agent_run_id: null,
  approval_type: "quote_send",
  requested_by: "Quotation Agent",
  assigned_to: null,
  status: "pending",
  context_data: {},
  context_summary: "Review quote",
  reviewer_notes: null,
  decided_at: null,
  created_at: "2026-06-28T01:00:00Z",
  ...overrides,
});

describe("LEAD_PIPELINE_STAGES", () => {
  it("uses the approved mini CRM stage order", () => {
    expect(LEAD_PIPELINE_STAGES.map((stage) => stage.id)).toEqual([
      "new",
      "qualified",
      "quoted",
      "follow_up",
      "closed",
    ]);
  });
});

describe("groupLeadsByPipelineStage", () => {
  it("maps existing lead statuses into the approved stage columns", () => {
    const leads = [
      baseLead({ id: "new", status: "new" }),
      baseLead({ id: "qualified", status: "qualified" }),
      baseLead({ id: "quoted", status: "quoted" }),
      baseLead({ id: "replied", status: "replied" }),
      baseLead({ id: "approved", status: "approved" }),
      baseLead({ id: "won", status: "won" }),
      baseLead({ id: "lost", status: "lost" }),
    ];

    const grouped = groupLeadsByPipelineStage(leads);

    expect(grouped.new.map((lead) => lead.id)).toEqual(["new"]);
    expect(grouped.qualified.map((lead) => lead.id)).toEqual(["qualified"]);
    expect(grouped.quoted.map((lead) => lead.id)).toEqual(["quoted", "approved"]);
    expect(grouped.follow_up.map((lead) => lead.id)).toEqual(["replied"]);
    expect(grouped.closed.map((lead) => lead.id)).toEqual(["won", "lost"]);
  });
});

describe("getLeadSlaState", () => {
  it("returns overdue when an open task due date is before today", () => {
    expect(
      getLeadSlaState(baseLead({ id: "lead-1" }), [task({ due_date: "2026-06-27" })], "2026-06-28"),
    ).toEqual({ state: "overdue", label: "Overdue" });
  });

  it("returns due_today when an open task is due today", () => {
    expect(
      getLeadSlaState(baseLead({ id: "lead-1" }), [task({ due_date: "2026-06-28" })], "2026-06-28"),
    ).toEqual({ state: "due_today", label: "Due today" });
  });

  it("returns clear when there are no open lead tasks", () => {
    expect(getLeadSlaState(baseLead({ id: "lead-1" }), [], "2026-06-28")).toEqual({
      state: "clear",
      label: "No SLA risk",
    });
  });
});

describe("getLeadAiState", () => {
  it("prioritizes pending approvals", () => {
    expect(
      getLeadAiState(baseLead({ id: "lead-1" }), [
        approval({ context_data: { lead_id: "lead-1" } }),
      ]),
    ).toEqual({ state: "ready_for_review", label: "Approval ready" });
  });

  it("shows qualified when qualification data exists", () => {
    const lead = baseLead({
      qualification_data: {
        urgency_score: 8,
        fit_score: 7,
        qualification_score: 82,
        service_interest: ["CRM"],
        budget_range: "HKD 50k-100k",
        next_action: "Schedule discovery call",
        reason: "Strong fit",
        confidence: 0.88,
        human_review_required: false,
      },
    });

    expect(getLeadAiState(lead, [])).toEqual({ state: "approved", label: "Qualified" });
  });
});

describe("getLeadNextAction", () => {
  it("prefers the first open task", () => {
    expect(getLeadNextAction(baseLead({ id: "lead-1" }), [task({ title: "Call today" })])).toBe(
      "Call today",
    );
  });

  it("falls back to qualification recommendation", () => {
    const lead = baseLead({
      qualification_data: {
        urgency_score: 8,
        fit_score: 7,
        qualification_score: 82,
        service_interest: ["CRM"],
        budget_range: "HKD 50k-100k",
        next_action: "Send intro deck",
        reason: "Needs nurture",
        confidence: 0.73,
        human_review_required: false,
      },
    });

    expect(getLeadNextAction(lead, [])).toBe("Send intro deck");
  });
});

describe("filterPipelineLeads", () => {
  it("filters by search, source, owner, urgency, and AI status", () => {
    const leads = [
      baseLead({ id: "lead-1", company_name: "Aurora Retail Group", source: "website" }),
      baseLead({ id: "lead-2", company_name: "Nimbus Logistics", source: "linkedin" }),
    ];
    const tasks = [task({ lead_id: "lead-1", due_date: "2026-06-27" })];
    const approvals = [approval({ context_data: { lead_id: "lead-1" } })];

    const result = filterPipelineLeads({
      leads,
      tasks,
      approvals,
      today: "2026-06-28",
      filters: {
        search: "aurora",
        source: "website",
        owner: "user-1",
        urgency: "overdue",
        aiState: "ready_for_review",
      },
    });

    expect(result.map((lead) => lead.id)).toEqual(["lead-1"]);
  });
});

describe("getPipelineSummary", () => {
  it("counts overdue, due today, high score, and pending approvals", () => {
    const leads = [
      baseLead({ id: "lead-1", lead_score: 82 }),
      baseLead({ id: "lead-2", lead_score: 40 }),
    ];
    const tasks = [
      task({ id: "task-1", lead_id: "lead-1", due_date: "2026-06-27" }),
      task({ id: "task-2", lead_id: "lead-2", due_date: "2026-06-28" }),
    ];
    const approvals = [approval({ context_data: { lead_id: "lead-1" } })];

    expect(getPipelineSummary({ leads, tasks, approvals, today: "2026-06-28" })).toEqual({
      overdue: 1,
      dueToday: 1,
      highScore: 1,
      pendingApproval: 1,
    });
  });
});

describe("quote values", () => {
  it("exposes quote value for cards through related quotes", () => {
    const q = quote({ total_value: 120000, status: "pending_approval" });
    expect(q.total_value).toBe(120000);
  });
});

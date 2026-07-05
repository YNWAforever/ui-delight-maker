import { describe, expect, it } from "vitest";
import type { AgentRun, Client, HumanApproval, Lead, Quote, Task } from "../types";
import {
  buildRevenueActions,
  getClientPortfolioMetrics,
  getQuoteDeskMetrics,
  getSalesDisplayDate,
  getTaskBoardMetrics,
} from "../sales-workspace";

const lead = (overrides: Partial<Lead>): Lead => ({
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
  enquiry_text: "Need CRM and AI follow-up support.",
  created_at: "2026-06-28T01:00:00Z",
  updated_at: "2026-06-28T01:00:00Z",
  ...overrides,
});

const task = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  title: "Call Aurora Retail",
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
  number: "QT-2026-001",
  lead_id: "lead-1",
  client_id: null,
  contact_id: null,
  account_id: null,
  deal_id: null,
  status: "pending_approval",
  total_value: 420000,
  currency: "HKD",
  valid_until: "2026-07-28",
  line_items: [],
  pdf_url: null,
  created_by: "user-1",
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
  assigned_to: "user-2",
  status: "pending",
  context_data: { lead_id: "lead-1", quote_id: "quote-1" },
  context_summary: "Approve QT-2026-001 before sending.",
  reviewer_notes: null,
  decided_at: null,
  created_at: "2026-06-28T03:00:00Z",
  ...overrides,
});

const agentRun = (overrides: Partial<AgentRun>): AgentRun => ({
  id: "run-1",
  agent_name: "Qualification Agent",
  trigger_type: "manual",
  input_data: { lead_id: "lead-1" },
  output_data: null,
  output_summary: "Qualified lead",
  status: "waiting_approval",
  duration_ms: 1200,
  tokens_used: 800,
  model_used: "anthropic/claude-sonnet-4-6",
  confidence_score: 0.68,
  human_review_required: true,
  created_at: "2026-06-28T02:00:00Z",
  ...overrides,
});

const client = (overrides: Partial<Client>): Client => ({
  id: "client-1",
  account_id: null,
  primary_contact_id: null,
  company_name: "Apex CRM",
  industry: "Software",
  tier: "mid-market",
  account_owner: "user-1",
  health_score: 48,
  onboarding_status: "live",
  renewal_date: "2026-07-12",
  arr: 360000,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-06-28T00:00:00Z",
  ...overrides,
});

describe("buildRevenueActions", () => {
  it("prioritizes overdue tasks, pending approvals, hot leads, and renewal risks", () => {
    const actions = buildRevenueActions({
      leads: [
        lead({ id: "lead-hot", lead_score: 91, company_name: "Hot Lead Co" }),
        lead({ id: "lead-cold", lead_score: 40, company_name: "Cold Lead Co" }),
      ],
      tasks: [
        task({ id: "task-overdue", lead_id: "lead-hot", due_date: "2026-06-27" }),
        task({ id: "task-done", status: "done", due_date: "2026-06-27" }),
      ],
      quotes: [quote({ id: "quote-approval", lead_id: "lead-hot" })],
      approvals: [approval({ id: "approval-quote", context_data: { lead_id: "lead-hot" } })],
      clients: [client({ id: "client-risk", renewal_date: "2026-07-08", health_score: 42 })],
      agentRuns: [agentRun({ input_data: { lead_id: "lead-hot" } })],
      today: "2026-06-28",
    });

    expect(actions.map((action) => action.kind)).toEqual([
      "overdue_task",
      "pending_approval",
      "renewal_risk",
      "hot_lead",
    ]);
    expect(actions[0]).toMatchObject({
      title: "Call Aurora Retail",
      accountName: "Hot Lead Co",
      urgency: "critical",
    });
  });
});

describe("sales metrics", () => {
  it("calculates quote desk metrics", () => {
    expect(
      getQuoteDeskMetrics([
        quote({ status: "pending_approval", total_value: 420000 }),
        quote({ status: "sent", total_value: 100000 }),
        quote({ status: "accepted", total_value: 80000 }),
        quote({ status: "draft", total_value: 50000 }),
      ]),
    ).toEqual({
      activeValue: 520000,
      acceptedValue: 80000,
      draftValue: 50000,
      pendingApproval: 1,
    });
  });

  it("calculates client portfolio metrics", () => {
    expect(
      getClientPortfolioMetrics(
        [
          client({ health_score: 48, renewal_date: "2026-07-12", arr: 360000 }),
          client({ id: "client-2", health_score: 92, renewal_date: "2026-12-01", arr: 120000 }),
        ],
        "2026-06-28",
      ),
    ).toEqual({
      totalArr: 480000,
      averageHealth: 70,
      renewalsNext90Days: 1,
      atRiskAccounts: 1,
    });
  });

  it("calculates task board metrics", () => {
    expect(
      getTaskBoardMetrics(
        [
          task({ id: "overdue", due_date: "2026-06-27", priority: "high" }),
          task({ id: "today", due_date: "2026-06-28", priority: "medium" }),
          task({ id: "done", status: "done", due_date: "2026-06-27", priority: "high" }),
        ],
        "2026-06-28",
      ),
    ).toEqual({
      open: 2,
      overdue: 1,
      dueToday: 1,
      highPriority: 1,
    });
  });
});

describe("getSalesDisplayDate", () => {
  it("formats valid dates and returns a safe dash for nullish values", () => {
    expect(getSalesDisplayDate("2026-07-28")).toBe("28 Jul 2026");
    expect(getSalesDisplayDate(null)).toBe("—");
  });
});

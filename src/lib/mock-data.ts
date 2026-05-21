// Mock data for ClientOps frontend prototype.
// Shapes mirror the spec §6 schema so swapping to a real API is trivial.

export type LeadStatus = "new" | "qualified" | "replied" | "quoted" | "approved" | "won" | "lost";
export type LeadSource = "website" | "whatsapp" | "email" | "linkedin" | "csv" | "event";
export type QuoteStatus = "draft" | "pending_approval" | "approved" | "sent" | "viewed" | "accepted" | "rejected";
export type TaskStatus = "open" | "in_progress" | "done";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "escalated";
export type AgentRunStatus = "running" | "completed" | "failed" | "waiting_approval";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "sales" | "cs";
}

export interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: LeadSource;
  status: LeadStatus;
  assigned_to: string;
  lead_score: number;
  qualification_data: {
    lead_type: string;
    urgency: "high" | "medium" | "low";
    estimated_budget_range: string;
    service_interest: string[];
    qualification_score: number;
    missing_information: string[];
    recommended_next_action: string;
    confidence: number;
    human_review_required: boolean;
  } | null;
  enquiry_text: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteLineItem {
  id: string;
  service: string;
  description: string;
  qty: number;
  unit_price: number;
}

export interface Quote {
  id: string;
  number: string;
  lead_id: string;
  client_id: string | null;
  status: QuoteStatus;
  total_value: number;
  currency: string;
  valid_until: string;
  line_items: QuoteLineItem[];
  created_by: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  industry: string;
  tier: "SME" | "mid-market" | "enterprise";
  account_owner: string;
  health_score: number;
  onboarding_status: "not_started" | "in_progress" | "completed";
  renewal_date: string;
  arr: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  lead_id: string | null;
  client_id: string | null;
  due_date: string;
  priority: "low" | "medium" | "high";
  status: TaskStatus;
  created_by_agent: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  agent_run_id: string;
  agent_name: string;
  approval_type: "quote_send" | "message_send" | "discount" | "scope_change";
  requested_by: string;
  status: ApprovalStatus;
  context_summary: string;
  confidence: number;
  payload_preview: string;
  created_at: string;
}

export interface ToolCall {
  id: string;
  tool_name: string;
  input_params: Record<string, unknown>;
  output_result: Record<string, unknown>;
  success: boolean;
  called_at: string;
}

export interface AgentRun {
  id: string;
  agent_name: string;
  trigger_type: "manual" | "webhook" | "schedule" | "orchestrator";
  status: AgentRunStatus;
  duration_ms: number;
  tokens_used: number;
  model_used: string;
  confidence_score: number;
  human_review_required: boolean;
  input_summary: string;
  output_summary: string;
  tool_calls: ToolCall[];
  created_at: string;
}

export interface ActivityLog {
  id: string;
  actor_type: "agent" | "user";
  actor_name: string;
  action: string;
  object_type: "lead" | "quote" | "client" | "task";
  object_id: string;
  created_at: string;
}

export interface AgentConfig {
  name: string;
  display_name: string;
  role: string;
  human_approval: boolean;
  model: string;
  avg_confidence: number;
  runs_24h: number;
  status: "active" | "paused";
}

// ────────────────────────────────────────────────────────────────────────────
// Users
// ────────────────────────────────────────────────────────────────────────────
export const users: User[] = [
  { id: "u1", name: "Ada Wong", email: "ada@fimmick.com", role: "admin" },
  { id: "u2", name: "Marcus Lee", email: "marcus@fimmick.com", role: "manager" },
  { id: "u3", name: "Priya Shah", email: "priya@fimmick.com", role: "sales" },
  { id: "u4", name: "Kenji Tan", email: "kenji@fimmick.com", role: "sales" },
  { id: "u5", name: "Sara Lin", email: "sara@fimmick.com", role: "cs" },
];

export const userById = (id: string) => users.find((u) => u.id === id);

// ────────────────────────────────────────────────────────────────────────────
// Leads
// ────────────────────────────────────────────────────────────────────────────
export const leads: Lead[] = [
  {
    id: "L-1042",
    company_name: "Aurora Retail Group",
    contact_name: "Jonathan Cheung",
    contact_email: "j.cheung@auroraretail.hk",
    contact_phone: "+852 9123 4567",
    source: "website",
    status: "qualified",
    assigned_to: "u3",
    lead_score: 82,
    enquiry_text:
      "We're looking to roll out a unified CRM across our 14 retail stores in HK and Macau. Need integration with our existing POS and an AI assistant for store managers.",
    qualification_data: {
      lead_type: "CRM",
      urgency: "high",
      estimated_budget_range: "200K–500K",
      service_interest: ["CRM implementation", "AI transformation"],
      qualification_score: 82,
      missing_information: ["timeline", "decision_committee"],
      recommended_next_action: "schedule_discovery_call",
      confidence: 0.88,
      human_review_required: false,
    },
    created_at: "2026-05-18T09:12:00Z",
    updated_at: "2026-05-18T09:48:00Z",
  },
  {
    id: "L-1041",
    company_name: "Nimbus Logistics",
    contact_name: "Sandra Wu",
    contact_email: "sandra@nimbuslogi.com",
    contact_phone: "+852 6543 2211",
    source: "whatsapp",
    status: "quoted",
    assigned_to: "u4",
    lead_score: 71,
    enquiry_text:
      "Interested in a data reporting platform that consolidates fleet telematics and delivery SLAs. Quarterly board reporting use case.",
    qualification_data: {
      lead_type: "data",
      urgency: "medium",
      estimated_budget_range: "50K–200K",
      service_interest: ["data/reporting"],
      qualification_score: 71,
      missing_information: [],
      recommended_next_action: "send_case_study",
      confidence: 0.81,
      human_review_required: false,
    },
    created_at: "2026-05-17T14:02:00Z",
    updated_at: "2026-05-19T10:21:00Z",
  },
  {
    id: "L-1040",
    company_name: "Pearl Beauty Co.",
    contact_name: "Iris Mak",
    contact_email: "iris@pearlbeauty.com",
    contact_phone: "+852 9876 1122",
    source: "linkedin",
    status: "replied",
    assigned_to: "u3",
    lead_score: 64,
    enquiry_text:
      "Need a KOC/influencer campaign for our new sunscreen launch across HK, TW, and SG in Q3.",
    qualification_data: {
      lead_type: "KOC",
      urgency: "high",
      estimated_budget_range: "200K–500K",
      service_interest: ["KOC/influencer", "campaign"],
      qualification_score: 64,
      missing_information: ["budget_confirmation"],
      recommended_next_action: "schedule_discovery_call",
      confidence: 0.74,
      human_review_required: false,
    },
    created_at: "2026-05-17T08:30:00Z",
    updated_at: "2026-05-18T11:05:00Z",
  },
  {
    id: "L-1039",
    company_name: "Greenleaf F&B",
    contact_name: "Daniel Ng",
    contact_email: "daniel@greenleaf.hk",
    contact_phone: "+852 9112 8855",
    source: "email",
    status: "new",
    assigned_to: "u4",
    lead_score: 0,
    enquiry_text: "Hi — can you help us with marketing automation? We have ~30k subscribers.",
    qualification_data: null,
    created_at: "2026-05-19T07:55:00Z",
    updated_at: "2026-05-19T07:55:00Z",
  },
  {
    id: "L-1038",
    company_name: "Helix Biotech",
    contact_name: "Dr. Lillian Park",
    contact_email: "lpark@helixbio.com",
    contact_phone: "+852 9234 5678",
    source: "event",
    status: "won",
    assigned_to: "u3",
    lead_score: 91,
    enquiry_text:
      "Met at AI Summit HK. Want a full AI transformation roadmap for R&D ops, 12-month engagement.",
    qualification_data: {
      lead_type: "AI transformation",
      urgency: "medium",
      estimated_budget_range: "500K+",
      service_interest: ["AI transformation"],
      qualification_score: 91,
      missing_information: [],
      recommended_next_action: "assign_enterprise_sales",
      confidence: 0.93,
      human_review_required: false,
    },
    created_at: "2026-05-10T16:40:00Z",
    updated_at: "2026-05-16T09:00:00Z",
  },
  {
    id: "L-1037",
    company_name: "Skyline Property",
    contact_name: "Ricky Lam",
    contact_email: "ricky@skylineproperty.hk",
    contact_phone: "+852 9445 7782",
    source: "csv",
    status: "lost",
    assigned_to: "u4",
    lead_score: 38,
    enquiry_text: "Imported from broker list. Looking for a CRM but budget is unclear.",
    qualification_data: {
      lead_type: "CRM",
      urgency: "low",
      estimated_budget_range: "< HKD 50K",
      service_interest: ["CRM"],
      qualification_score: 38,
      missing_information: ["budget", "decision_maker"],
      recommended_next_action: "request_budget",
      confidence: 0.52,
      human_review_required: true,
    },
    created_at: "2026-05-08T12:00:00Z",
    updated_at: "2026-05-14T15:00:00Z",
  },
  {
    id: "L-1036",
    company_name: "Vector Studios",
    contact_name: "Mei Chan",
    contact_email: "mei@vectorstudios.io",
    contact_phone: "+852 9001 2233",
    source: "website",
    status: "approved",
    assigned_to: "u3",
    lead_score: 77,
    enquiry_text:
      "We need a custom Slack-integrated agent for client briefs intake. Already shortlisted 3 vendors.",
    qualification_data: {
      lead_type: "custom",
      urgency: "high",
      estimated_budget_range: "50K–200K",
      service_interest: ["custom", "AI transformation"],
      qualification_score: 77,
      missing_information: [],
      recommended_next_action: "send_case_study",
      confidence: 0.85,
      human_review_required: false,
    },
    created_at: "2026-05-12T10:10:00Z",
    updated_at: "2026-05-18T16:30:00Z",
  },
];

export const leadById = (id: string) => leads.find((l) => l.id === id);

// ────────────────────────────────────────────────────────────────────────────
// Quotes
// ────────────────────────────────────────────────────────────────────────────
export const quotes: Quote[] = [
  {
    id: "Q-2031",
    number: "FIM-Q-2031",
    lead_id: "L-1041",
    client_id: null,
    status: "sent",
    total_value: 184000,
    currency: "HKD",
    valid_until: "2026-06-30",
    line_items: [
      { id: "li1", service: "Data Hub setup", description: "Telematics + SLA pipeline", qty: 1, unit_price: 95000 },
      { id: "li2", service: "Dashboard templates", description: "Board-ready reporting pack ×4", qty: 4, unit_price: 12000 },
      { id: "li3", service: "Training & enablement", description: "2 sessions, hybrid", qty: 1, unit_price: 41000 },
    ],
    created_by: "u4",
    approved_by: "u2",
    created_at: "2026-05-18T11:00:00Z",
    updated_at: "2026-05-19T10:21:00Z",
  },
  {
    id: "Q-2030",
    number: "FIM-Q-2030",
    lead_id: "L-1036",
    client_id: null,
    status: "approved",
    total_value: 92000,
    currency: "HKD",
    valid_until: "2026-06-15",
    line_items: [
      { id: "li1", service: "Custom agent build", description: "Slack intake agent", qty: 1, unit_price: 72000 },
      { id: "li2", service: "Maintenance retainer", description: "3 months", qty: 3, unit_price: 6667 },
    ],
    created_by: "u3",
    approved_by: "u2",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-18T16:30:00Z",
  },
  {
    id: "Q-2029",
    number: "FIM-Q-2029",
    lead_id: "L-1042",
    client_id: null,
    status: "pending_approval",
    total_value: 412000,
    currency: "HKD",
    valid_until: "2026-07-01",
    line_items: [
      { id: "li1", service: "CRM rollout", description: "14-store implementation", qty: 1, unit_price: 320000 },
      { id: "li2", service: "AI store-manager assistant", description: "Pilot in 3 stores", qty: 1, unit_price: 92000 },
    ],
    created_by: "u3",
    approved_by: null,
    created_at: "2026-05-19T08:00:00Z",
    updated_at: "2026-05-19T08:30:00Z",
  },
  {
    id: "Q-2028",
    number: "FIM-Q-2028",
    lead_id: "L-1040",
    client_id: null,
    status: "draft",
    total_value: 215000,
    currency: "HKD",
    valid_until: "2026-06-20",
    line_items: [
      { id: "li1", service: "KOC campaign", description: "60 creators × 3 markets", qty: 60, unit_price: 2800 },
      { id: "li2", service: "Campaign reporting", description: "Weekly insight reports", qty: 1, unit_price: 47000 },
    ],
    created_by: "u3",
    approved_by: null,
    created_at: "2026-05-18T13:20:00Z",
    updated_at: "2026-05-19T09:11:00Z",
  },
  {
    id: "Q-2027",
    number: "FIM-Q-2027",
    lead_id: "L-1038",
    client_id: "C-501",
    status: "accepted",
    total_value: 680000,
    currency: "HKD",
    valid_until: "2026-05-30",
    line_items: [
      { id: "li1", service: "AI transformation roadmap", description: "12-month engagement", qty: 1, unit_price: 680000 },
    ],
    created_by: "u3",
    approved_by: "u1",
    created_at: "2026-05-12T10:00:00Z",
    updated_at: "2026-05-16T09:00:00Z",
  },
];

export const quoteById = (id: string) => quotes.find((q) => q.id === id);

// ────────────────────────────────────────────────────────────────────────────
// Clients
// ────────────────────────────────────────────────────────────────────────────
export const clients: Client[] = [
  {
    id: "C-501",
    company_name: "Helix Biotech",
    industry: "Biotech / R&D",
    tier: "enterprise",
    account_owner: "u3",
    health_score: 84,
    onboarding_status: "in_progress",
    renewal_date: "2027-05-15",
    arr: 680000,
    created_at: "2026-05-16T09:00:00Z",
  },
  {
    id: "C-502",
    company_name: "Northwind Apparel",
    industry: "Retail / Fashion",
    tier: "mid-market",
    account_owner: "u4",
    health_score: 71,
    onboarding_status: "completed",
    renewal_date: "2026-09-01",
    arr: 240000,
    created_at: "2025-09-01T09:00:00Z",
  },
  {
    id: "C-503",
    company_name: "Lumen Education",
    industry: "EdTech",
    tier: "SME",
    account_owner: "u5",
    health_score: 58,
    onboarding_status: "completed",
    renewal_date: "2026-07-12",
    arr: 96000,
    created_at: "2025-07-12T09:00:00Z",
  },
  {
    id: "C-504",
    company_name: "Tessera Bank",
    industry: "Financial Services",
    tier: "enterprise",
    account_owner: "u2",
    health_score: 92,
    onboarding_status: "completed",
    renewal_date: "2026-12-01",
    arr: 1250000,
    created_at: "2024-12-01T09:00:00Z",
  },
  {
    id: "C-505",
    company_name: "Coral Foodworks",
    industry: "F&B",
    tier: "SME",
    account_owner: "u5",
    health_score: 41,
    onboarding_status: "completed",
    renewal_date: "2026-06-05",
    arr: 72000,
    created_at: "2025-06-05T09:00:00Z",
  },
];

export const clientById = (id: string) => clients.find((c) => c.id === id);

// ────────────────────────────────────────────────────────────────────────────
// Tasks
// ────────────────────────────────────────────────────────────────────────────
export const tasks: Task[] = [
  {
    id: "T-9001",
    title: "Schedule discovery call with Aurora Retail",
    description: "60-min call, include solutions architect.",
    assigned_to: "u3",
    lead_id: "L-1042",
    client_id: null,
    due_date: "2026-05-21",
    priority: "high",
    status: "open",
    created_by_agent: "Qualification Agent",
    created_at: "2026-05-19T09:50:00Z",
  },
  {
    id: "T-9002",
    title: "Send case study to Pearl Beauty",
    description: "Beauty / cross-market KOC case study deck.",
    assigned_to: "u3",
    lead_id: "L-1040",
    client_id: null,
    due_date: "2026-05-20",
    priority: "medium",
    status: "in_progress",
    created_by_agent: "Sales Reply Agent",
    created_at: "2026-05-18T11:10:00Z",
  },
  {
    id: "T-9003",
    title: "Approve Aurora Retail quote",
    description: "Quote value above HKD 400K threshold.",
    assigned_to: "u2",
    lead_id: "L-1042",
    client_id: null,
    due_date: "2026-05-20",
    priority: "high",
    status: "open",
    created_by_agent: "Approval Agent",
    created_at: "2026-05-19T08:30:00Z",
  },
  {
    id: "T-9004",
    title: "Helix Biotech onboarding kickoff",
    description: "Coordinate kickoff with R&D ops lead.",
    assigned_to: "u5",
    lead_id: null,
    client_id: "C-501",
    due_date: "2026-05-22",
    priority: "high",
    status: "in_progress",
    created_by_agent: "Client Success Agent",
    created_at: "2026-05-17T10:00:00Z",
  },
  {
    id: "T-9005",
    title: "Renewal check-in: Lumen Education",
    description: "Health score dipped to 58 — schedule QBR.",
    assigned_to: "u5",
    lead_id: null,
    client_id: "C-503",
    due_date: "2026-05-25",
    priority: "medium",
    status: "open",
    created_by_agent: "Client Success Agent",
    created_at: "2026-05-19T07:00:00Z",
  },
  {
    id: "T-9006",
    title: "Send Vector Studios contract",
    description: "Quote approved — proceed to e-sign.",
    assigned_to: "u3",
    lead_id: "L-1036",
    client_id: null,
    due_date: "2026-05-19",
    priority: "high",
    status: "done",
    created_by_agent: null,
    created_at: "2026-05-18T17:00:00Z",
  },
  {
    id: "T-9007",
    title: "CSV reconciliation for Skyline list",
    description: "Dedupe against existing leads.",
    assigned_to: "u4",
    lead_id: "L-1037",
    client_id: null,
    due_date: "2026-05-14",
    priority: "low",
    status: "done",
    created_by_agent: "Lead Intake Agent",
    created_at: "2026-05-08T13:00:00Z",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Approvals
// ────────────────────────────────────────────────────────────────────────────
export const approvals: Approval[] = [
  {
    id: "A-7001",
    agent_run_id: "AR-001",
    agent_name: "Quotation Agent",
    approval_type: "quote_send",
    requested_by: "Quotation Agent",
    status: "pending",
    context_summary:
      "Quote FIM-Q-2029 for Aurora Retail Group (HKD 412,000) ready to send to client.",
    confidence: 0.91,
    payload_preview:
      "Subject: Your Fimmick CRM proposal — Aurora Retail\n\nDear Jonathan,\n\nThank you for the discovery session…",
    created_at: "2026-05-19T08:32:00Z",
  },
  {
    id: "A-7002",
    agent_run_id: "AR-002",
    agent_name: "Approval Agent",
    approval_type: "discount",
    requested_by: "Approval Agent",
    status: "pending",
    context_summary:
      "12% discount requested on FIM-Q-2028 (Pearl Beauty) — exceeds 10% manager threshold.",
    confidence: 0.78,
    payload_preview:
      'Reason: "Multi-market campaign, repeat prospect, competing vendor at -10%." Requested approver: Marcus Lee',
    created_at: "2026-05-19T09:05:00Z",
  },
  {
    id: "A-7003",
    agent_run_id: "AR-003",
    agent_name: "Sales Reply Agent",
    approval_type: "message_send",
    requested_by: "Sales Reply Agent",
    status: "pending",
    context_summary:
      "Draft email reply to Greenleaf F&B introducing marketing automation services.",
    confidence: 0.84,
    payload_preview:
      "Hi Daniel,\n\nThanks for reaching out — happy to share how Fimmick has helped F&B brands automate lifecycle journeys for 20k+ subscriber lists…",
    created_at: "2026-05-19T07:58:00Z",
  },
  {
    id: "A-7004",
    agent_run_id: "AR-010",
    agent_name: "Quotation Agent",
    approval_type: "quote_send",
    requested_by: "Quotation Agent",
    status: "approved",
    context_summary: "Vector Studios quote FIM-Q-2030 (HKD 92,000) approved and sent.",
    confidence: 0.88,
    payload_preview: "Quote sent on 2026-05-18 by Marcus Lee.",
    created_at: "2026-05-18T16:25:00Z",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Agent runs
// ────────────────────────────────────────────────────────────────────────────
export const agentRuns: AgentRun[] = [
  {
    id: "AR-001",
    agent_name: "Quotation Agent",
    trigger_type: "orchestrator",
    status: "waiting_approval",
    duration_ms: 4120,
    tokens_used: 2840,
    model_used: "claude-sonnet-4",
    confidence_score: 0.91,
    human_review_required: true,
    input_summary: "Lead L-1042 (Aurora Retail) — qualified, ready for proposal.",
    output_summary: "Draft quote FIM-Q-2029 created, HKD 412,000, 2 line items.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "quotes.create_draft",
        input_params: { lead_id: "L-1042", template: "crm_enterprise" },
        output_result: { quote_id: "Q-2029", status: "draft" },
        success: true,
        called_at: "2026-05-19T08:31:10Z",
      },
      {
        id: "tc2",
        tool_name: "quotes.request_approval",
        input_params: { quote_id: "Q-2029", approver: "u2" },
        output_result: { approval_id: "A-7001" },
        success: true,
        called_at: "2026-05-19T08:31:55Z",
      },
    ],
    created_at: "2026-05-19T08:31:00Z",
  },
  {
    id: "AR-002",
    agent_name: "Qualification Agent",
    trigger_type: "webhook",
    status: "completed",
    duration_ms: 1980,
    tokens_used: 1120,
    model_used: "claude-sonnet-4",
    confidence_score: 0.88,
    human_review_required: false,
    input_summary: "Lead L-1042 — initial enquiry from website form.",
    output_summary: "Classified as CRM / high urgency / 200K–500K budget. Score 82.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "crm.qualify_lead",
        input_params: { lead_id: "L-1042" },
        output_result: { lead_score: 82, lead_type: "CRM" },
        success: true,
        called_at: "2026-05-18T09:47:00Z",
      },
    ],
    created_at: "2026-05-18T09:47:00Z",
  },
  {
    id: "AR-003",
    agent_name: "Sales Reply Agent",
    trigger_type: "orchestrator",
    status: "waiting_approval",
    duration_ms: 3210,
    tokens_used: 1740,
    model_used: "claude-sonnet-4",
    confidence_score: 0.84,
    human_review_required: true,
    input_summary: "Lead L-1039 — Greenleaf F&B, new email enquiry.",
    output_summary: "Drafted intro reply referencing F&B lifecycle automation case study.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "messaging.draft_email",
        input_params: { lead_id: "L-1039", tone: "warm_consultative" },
        output_result: { draft_id: "D-501" },
        success: true,
        called_at: "2026-05-19T07:57:30Z",
      },
    ],
    created_at: "2026-05-19T07:57:00Z",
  },
  {
    id: "AR-004",
    agent_name: "Lead Intake Agent",
    trigger_type: "webhook",
    status: "completed",
    duration_ms: 740,
    tokens_used: 420,
    model_used: "gpt-4o-mini",
    confidence_score: 0.97,
    human_review_required: false,
    input_summary: "New website form submission from Greenleaf F&B.",
    output_summary: "Lead L-1039 created. No duplicate detected.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "crm.create_lead",
        input_params: { source: "email", company_name: "Greenleaf F&B" },
        output_result: { lead_id: "L-1039" },
        success: true,
        called_at: "2026-05-19T07:55:10Z",
      },
    ],
    created_at: "2026-05-19T07:55:00Z",
  },
  {
    id: "AR-005",
    agent_name: "Orchestrator Agent",
    trigger_type: "schedule",
    status: "completed",
    duration_ms: 5200,
    tokens_used: 3100,
    model_used: "claude-sonnet-4",
    confidence_score: 0.93,
    human_review_required: false,
    input_summary: "Hourly pipeline sweep — 7 active leads.",
    output_summary: "Routed 3 leads to follow-up, 1 quote draft, 1 onboarding kickoff.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "agents.run",
        input_params: { agent: "follow_up", lead_id: "L-1040" },
        output_result: { run_id: "AR-006" },
        success: true,
        called_at: "2026-05-19T09:00:30Z",
      },
    ],
    created_at: "2026-05-19T09:00:00Z",
  },
  {
    id: "AR-006",
    agent_name: "Client Success Agent",
    trigger_type: "orchestrator",
    status: "completed",
    duration_ms: 2100,
    tokens_used: 980,
    model_used: "claude-sonnet-4",
    confidence_score: 0.9,
    human_review_required: false,
    input_summary: "Helix Biotech onboarding stage transition.",
    output_summary: "Created 4 onboarding tasks across R&D + ops tracks.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "tasks.create",
        input_params: { client_id: "C-501", title: "R&D kickoff" },
        output_result: { task_id: "T-9004" },
        success: true,
        called_at: "2026-05-17T10:01:00Z",
      },
    ],
    created_at: "2026-05-17T10:00:00Z",
  },
  {
    id: "AR-007",
    agent_name: "Reporting Agent",
    trigger_type: "schedule",
    status: "failed",
    duration_ms: 12000,
    tokens_used: 0,
    model_used: "claude-sonnet-4",
    confidence_score: 0,
    human_review_required: true,
    input_summary: "Weekly pipeline report generation.",
    output_summary: "Data Hub query timeout. Retrying on next schedule.",
    tool_calls: [
      {
        id: "tc1",
        tool_name: "reports.pipeline",
        input_params: { range: "last_7d" },
        output_result: { error: "timeout" },
        success: false,
        called_at: "2026-05-19T06:00:00Z",
      },
    ],
    created_at: "2026-05-19T06:00:00Z",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Activity log
// ────────────────────────────────────────────────────────────────────────────
export const activityLogs: ActivityLog[] = [
  { id: "AL-1", actor_type: "agent", actor_name: "Quotation Agent", action: "Drafted quote FIM-Q-2029", object_type: "quote", object_id: "Q-2029", created_at: "2026-05-19T08:31:00Z" },
  { id: "AL-2", actor_type: "agent", actor_name: "Qualification Agent", action: "Qualified lead — score 82", object_type: "lead", object_id: "L-1042", created_at: "2026-05-18T09:48:00Z" },
  { id: "AL-3", actor_type: "user", actor_name: "Marcus Lee", action: "Approved quote FIM-Q-2030", object_type: "quote", object_id: "Q-2030", created_at: "2026-05-18T16:25:00Z" },
  { id: "AL-4", actor_type: "agent", actor_name: "Lead Intake Agent", action: "Created lead from email", object_type: "lead", object_id: "L-1039", created_at: "2026-05-19T07:55:00Z" },
  { id: "AL-5", actor_type: "agent", actor_name: "Sales Reply Agent", action: "Drafted email reply", object_type: "lead", object_id: "L-1039", created_at: "2026-05-19T07:57:00Z" },
  { id: "AL-6", actor_type: "user", actor_name: "Priya Shah", action: "Assigned lead to herself", object_type: "lead", object_id: "L-1042", created_at: "2026-05-18T09:15:00Z" },
  { id: "AL-7", actor_type: "agent", actor_name: "Client Success Agent", action: "Created 4 onboarding tasks", object_type: "client", object_id: "C-501", created_at: "2026-05-17T10:00:00Z" },
];

// ────────────────────────────────────────────────────────────────────────────
// Agent registry
// ────────────────────────────────────────────────────────────────────────────
export const agents: AgentConfig[] = [
  { name: "orchestrator", display_name: "Orchestrator Agent", role: "Owns workflow, assigns tasks, checks state", human_approval: true, model: "claude-sonnet-4", avg_confidence: 0.92, runs_24h: 24, status: "active" },
  { name: "lead-intake", display_name: "Lead Intake Agent", role: "Captures and cleans new leads", human_approval: false, model: "gpt-4o-mini", avg_confidence: 0.96, runs_24h: 41, status: "active" },
  { name: "qualification", display_name: "Qualification Agent", role: "Scores lead, identifies need", human_approval: false, model: "claude-sonnet-4", avg_confidence: 0.86, runs_24h: 37, status: "active" },
  { name: "sales-reply", display_name: "Sales Reply Agent", role: "Drafts first reply and meeting follow-up", human_approval: true, model: "claude-sonnet-4", avg_confidence: 0.83, runs_24h: 22, status: "active" },
  { name: "quotation", display_name: "Quotation Agent", role: "Builds quote draft from package templates", human_approval: true, model: "claude-sonnet-4", avg_confidence: 0.89, runs_24h: 12, status: "active" },
  { name: "approval", display_name: "Approval Agent", role: "Checks discount, margin, risk, terms", human_approval: true, model: "claude-sonnet-4", avg_confidence: 0.91, runs_24h: 9, status: "active" },
  { name: "client-success", display_name: "Client Success Agent", role: "Creates onboarding and renewal tasks", human_approval: false, model: "claude-sonnet-4", avg_confidence: 0.9, runs_24h: 14, status: "active" },
  { name: "reporting", display_name: "Reporting Agent", role: "Produces pipeline and performance reports", human_approval: false, model: "claude-sonnet-4", avg_confidence: 0.94, runs_24h: 6, status: "paused" },
];

export const agentByName = (name: string) => agents.find((a) => a.name === name);

// ────────────────────────────────────────────────────────────────────────────
// Service templates (for quote builder)
// ────────────────────────────────────────────────────────────────────────────
export const serviceTemplates = [
  { id: "tpl-crm", name: "CRM Implementation", base_price: 250000, description: "Multi-store CRM rollout with POS integration" },
  { id: "tpl-koc", name: "KOC / Influencer Campaign", base_price: 180000, description: "Cross-market creator activation" },
  { id: "tpl-ai", name: "AI Transformation Roadmap", base_price: 480000, description: "12-month strategic engagement" },
  { id: "tpl-data", name: "Data Hub & Reporting", base_price: 140000, description: "Unified data pipeline + dashboards" },
  { id: "tpl-custom", name: "Custom Agent Build", base_price: 90000, description: "Bespoke agent for a specific workflow" },
];

// ────────────────────────────────────────────────────────────────────────────
// Reporting series
// ────────────────────────────────────────────────────────────────────────────
export const pipelineFunnel = [
  { stage: "New", count: 38 },
  { stage: "Qualified", count: 27 },
  { stage: "Replied", count: 21 },
  { stage: "Quoted", count: 14 },
  { stage: "Approved", count: 9 },
  { stage: "Won", count: 6 },
];

export const conversionTrend = [
  { week: "W14", leads: 42, won: 4 },
  { week: "W15", leads: 51, won: 6 },
  { week: "W16", leads: 38, won: 5 },
  { week: "W17", leads: 47, won: 7 },
  { week: "W18", leads: 55, won: 8 },
  { week: "W19", leads: 49, won: 9 },
  { week: "W20", leads: 61, won: 11 },
];

export const agentActivity = [
  { day: "Mon", runs: 84, approvals: 12 },
  { day: "Tue", runs: 92, approvals: 14 },
  { day: "Wed", runs: 78, approvals: 9 },
  { day: "Thu", runs: 101, approvals: 17 },
  { day: "Fri", runs: 88, approvals: 11 },
  { day: "Sat", runs: 32, approvals: 3 },
  { day: "Sun", runs: 21, approvals: 1 },
];

export const quotePerformance = [
  { month: "Jan", sent: 18, accepted: 9 },
  { month: "Feb", sent: 22, accepted: 12 },
  { month: "Mar", sent: 27, accepted: 14 },
  { month: "Apr", sent: 31, accepted: 18 },
  { month: "May", sent: 24, accepted: 15 },
];

// ────────────────────────────────────────────────────────────────────────────
// Additional reporting series
// ────────────────────────────────────────────────────────────────────────────
export const revenueTrend = [
  { week: "W14", revenue: 420 },
  { week: "W15", revenue: 580 },
  { week: "W16", revenue: 510 },
  { week: "W17", revenue: 690 },
  { week: "W18", revenue: 760 },
  { week: "W19", revenue: 840 },
  { week: "W20", revenue: 920 },
];

export const agentLeaderboard = [
  { name: "Qualification", runs: 37, success: 96 },
  { name: "Lead Intake", runs: 41, success: 99 },
  { name: "Sales Reply", runs: 22, success: 88 },
  { name: "Quotation", runs: 12, success: 92 },
  { name: "Approval", runs: 9, success: 95 },
  { name: "Client Success", runs: 14, success: 94 },
  { name: "Orchestrator", runs: 24, success: 98 },
];

export const taskThroughput = [
  { day: "Mon", created: 14, completed: 10 },
  { day: "Tue", created: 18, completed: 16 },
  { day: "Wed", created: 12, completed: 14 },
  { day: "Thu", created: 22, completed: 17 },
  { day: "Fri", created: 16, completed: 19 },
  { day: "Sat", created: 4, completed: 6 },
  { day: "Sun", created: 2, completed: 3 },
];

// ────────────────────────────────────────────────────────────────────────────
// Notifications
// ────────────────────────────────────────────────────────────────────────────
export interface Notification {
  id: string;
  type: "approval" | "task" | "lead" | "client";
  message: string;
  link: string;
  created_at: string;
  read: boolean;
}

export const notifications: Notification[] = [
  { id: "N-1", type: "approval", message: "Quotation Agent waiting on FIM-Q-2029 approval", link: "/approvals", created_at: "2026-05-19T08:32:00Z", read: false },
  { id: "N-2", type: "lead", message: "New high-score lead: Aurora Retail (82)", link: "/leads/L-1042", created_at: "2026-05-18T09:48:00Z", read: false },
  { id: "N-3", type: "task", message: "3 tasks overdue", link: "/tasks", created_at: "2026-05-19T07:00:00Z", read: true },
  { id: "N-4", type: "client", message: "Lumen Education health score dropped to 58", link: "/clients/C-503", created_at: "2026-05-19T07:00:00Z", read: false },
];

// ────────────────────────────────────────────────────────────────────────────
// Pricing rules (for Settings)
// ────────────────────────────────────────────────────────────────────────────
export interface PricingRule {
  id: string;
  name: string;
  threshold: number;
  unit: "%" | "HKD";
  description: string;
}

export const pricingRules: PricingRule[] = [
  { id: "pr-1", name: "Max discount without approval", threshold: 10, unit: "%", description: "Sales can apply up to this discount without manager sign-off." },
  { id: "pr-2", name: "Manager approval threshold", threshold: 400000, unit: "HKD", description: "Quotes above this value require manager approval." },
  { id: "pr-3", name: "Director approval threshold", threshold: 1000000, unit: "HKD", description: "Quotes above this value require director approval." },
  { id: "pr-4", name: "Min margin", threshold: 25, unit: "%", description: "Quotes below this margin are flagged for review." },
];

// ────────────────────────────────────────────────────────────────────────────
// Client contacts & files (mock)
// ────────────────────────────────────────────────────────────────────────────
export interface Contact {
  id: string;
  client_id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

export const contacts: Contact[] = [
  { id: "CT-1", client_id: "C-501", name: "Dr. Lillian Park", title: "Head of R&D Ops", email: "lpark@helixbio.com", phone: "+852 9234 5678", is_primary: true },
  { id: "CT-2", client_id: "C-501", name: "Marco Wei", title: "CFO", email: "mwei@helixbio.com", phone: "+852 9111 2222", is_primary: false },
  { id: "CT-3", client_id: "C-502", name: "Joanna Tse", title: "Brand Director", email: "jtse@northwindapparel.com", phone: "+852 9001 7766", is_primary: true },
  { id: "CT-4", client_id: "C-503", name: "Edwin Ho", title: "VP Product", email: "edwin@lumen.edu", phone: "+852 9087 1234", is_primary: true },
  { id: "CT-5", client_id: "C-504", name: "Annette Kwok", title: "COO", email: "akwok@tesserabank.com", phone: "+852 9555 0001", is_primary: true },
];

export interface FileAsset {
  id: string;
  client_id: string;
  name: string;
  size: string;
  uploaded_at: string;
  uploaded_by: string;
}

export const clientFiles: FileAsset[] = [
  { id: "F-1", client_id: "C-501", name: "MSA_Helix_v3.pdf", size: "412 KB", uploaded_at: "2026-05-12T10:00:00Z", uploaded_by: "Priya Shah" },
  { id: "F-2", client_id: "C-501", name: "Discovery_notes.docx", size: "84 KB", uploaded_at: "2026-05-10T14:00:00Z", uploaded_by: "Priya Shah" },
  { id: "F-3", client_id: "C-502", name: "Brand_guidelines.pdf", size: "2.1 MB", uploaded_at: "2025-09-01T09:00:00Z", uploaded_by: "Kenji Tan" },
  { id: "F-4", client_id: "C-504", name: "SOC2_report_2026.pdf", size: "1.4 MB", uploaded_at: "2026-03-12T11:00:00Z", uploaded_by: "Marcus Lee" },
];

// ────────────────────────────────────────────────────────────────────────────
// Quote comments / version history
// ────────────────────────────────────────────────────────────────────────────
export interface Comment {
  id: string;
  quote_id: string;
  author: string;
  body: string;
  created_at: string;
}

export const quoteComments: Comment[] = [
  { id: "QC-1", quote_id: "Q-2029", author: "Marcus Lee", body: "Looks good — please double-check the AI pilot scope before sending.", created_at: "2026-05-19T09:00:00Z" },
  { id: "QC-2", quote_id: "Q-2029", author: "Quotation Agent", body: "Pilot scope verified against template tpl-crm and lead requirements.", created_at: "2026-05-19T09:05:00Z" },
  { id: "QC-3", quote_id: "Q-2030", author: "Ada Wong", body: "Approved — proceed.", created_at: "2026-05-18T16:20:00Z" },
];

export interface QuoteVersion {
  version: number;
  quote_id: string;
  changed_by: string;
  summary: string;
  created_at: string;
}

export const quoteVersions: QuoteVersion[] = [
  { version: 1, quote_id: "Q-2029", changed_by: "Quotation Agent", summary: "Initial draft from template", created_at: "2026-05-19T08:30:00Z" },
  { version: 2, quote_id: "Q-2029", changed_by: "Priya Shah", summary: "Added AI pilot line item", created_at: "2026-05-19T08:55:00Z" },
];

// ────────────────────────────────────────────────────────────────────────────
// Lead notes
// ────────────────────────────────────────────────────────────────────────────
export interface Note {
  id: string;
  lead_id: string;
  author: string;
  body: string;
  created_at: string;
}

export const leadNotes: Note[] = [
  { id: "LN-1", lead_id: "L-1042", author: "Priya Shah", body: "Spoke with Jonathan. Decision committee includes COO + Head of Retail Tech.", created_at: "2026-05-18T11:00:00Z" },
  { id: "LN-2", lead_id: "L-1042", author: "Qualification Agent", body: "Cross-checked LinkedIn — confirmed 14 stores, ~120 store managers.", created_at: "2026-05-18T09:50:00Z" },
  { id: "LN-3", lead_id: "L-1040", author: "Priya Shah", body: "Iris asked for case study in Traditional Chinese.", created_at: "2026-05-18T11:30:00Z" },
];

// ────────────────────────────────────────────────────────────────────────────
// Lead & quote scoped files / comments
// ────────────────────────────────────────────────────────────────────────────
export interface LeadFile {
  id: string;
  lead_id: string;
  name: string;
  size: string;
  kind: "pdf" | "docx" | "image" | "email" | "deck";
  uploaded_at: string;
  uploaded_by: string;
}

export const leadFiles: LeadFile[] = [
  { id: "LF-1", lead_id: "L-1042", name: "Aurora_RFP_v2.pdf", size: "1.2 MB", kind: "pdf", uploaded_at: "2026-05-18T09:20:00Z", uploaded_by: "Jonathan Cheung" },
  { id: "LF-2", lead_id: "L-1042", name: "Store_list_HK_Macau.xlsx", size: "84 KB", kind: "docx", uploaded_at: "2026-05-18T09:45:00Z", uploaded_by: "Priya Shah" },
  { id: "LF-3", lead_id: "L-1042", name: "Discovery_intro_email.eml", size: "12 KB", kind: "email", uploaded_at: "2026-05-18T10:01:00Z", uploaded_by: "Priya Shah" },
  { id: "LF-4", lead_id: "L-1041", name: "Nimbus_fleet_brief.pdf", size: "640 KB", kind: "pdf", uploaded_at: "2026-05-17T14:30:00Z", uploaded_by: "Sandra Wu" },
  { id: "LF-5", lead_id: "L-1040", name: "Sunscreen_campaign_deck.pdf", size: "3.4 MB", kind: "deck", uploaded_at: "2026-05-17T09:10:00Z", uploaded_by: "Iris Mak" },
  { id: "LF-6", lead_id: "L-1038", name: "Helix_AI_roadmap_signed.pdf", size: "2.1 MB", kind: "pdf", uploaded_at: "2026-05-16T09:00:00Z", uploaded_by: "Dr. Lillian Park" },
];

export interface LeadComment {
  id: string;
  lead_id: string;
  author: string;
  body: string;
  created_at: string;
}

export const leadComments: LeadComment[] = [
  { id: "LC-1", lead_id: "L-1042", author: "Marcus Lee", body: "Looped in Ada — she'll review the AI pilot scope before we quote.", created_at: "2026-05-18T10:15:00Z" },
  { id: "LC-2", lead_id: "L-1042", author: "Priya Shah", body: "Sent calendar invite for discovery call on Thursday.", created_at: "2026-05-18T11:10:00Z" },
  { id: "LC-3", lead_id: "L-1041", author: "Kenji Tan", body: "They want quarterly board reporting — pull the Tessera case study.", created_at: "2026-05-17T15:00:00Z" },
  { id: "LC-4", lead_id: "L-1040", author: "Outreach Agent", body: "Drafted reply in zh-HK pending human review.", created_at: "2026-05-18T11:45:00Z" },
];

export interface QuoteFile {
  id: string;
  quote_id: string;
  name: string;
  size: string;
  kind: "pdf" | "docx" | "image" | "email";
  uploaded_at: string;
  uploaded_by: string;
}

export const quoteFiles: QuoteFile[] = [
  { id: "QF-1", quote_id: "Q-2029", name: "FIM-Q-2029_draft.pdf", size: "320 KB", kind: "pdf", uploaded_at: "2026-05-19T08:31:00Z", uploaded_by: "Quotation Agent" },
  { id: "QF-2", quote_id: "Q-2029", name: "Pilot_scope_addendum.docx", size: "48 KB", kind: "docx", uploaded_at: "2026-05-19T08:56:00Z", uploaded_by: "Priya Shah" },
  { id: "QF-3", quote_id: "Q-2030", name: "FIM-Q-2030_signed.pdf", size: "412 KB", kind: "pdf", uploaded_at: "2026-05-18T16:35:00Z", uploaded_by: "Ada Wong" },
  { id: "QF-4", quote_id: "Q-2031", name: "Nimbus_quote_cover_email.eml", size: "9 KB", kind: "email", uploaded_at: "2026-05-19T10:22:00Z", uploaded_by: "Kenji Tan" },
  { id: "QF-5", quote_id: "Q-2027", name: "Helix_AI_roadmap_MSA.pdf", size: "1.8 MB", kind: "pdf", uploaded_at: "2026-05-16T09:00:00Z", uploaded_by: "Ada Wong" },
];



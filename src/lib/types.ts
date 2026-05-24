// src/lib/types.ts
// Canonical types matching the Supabase schema.
// mock-data.ts types are kept for backward compat during migration but will be removed.

export type LeadStatus = "new" | "qualified" | "replied" | "quoted" | "approved" | "won" | "lost";
export type LeadSource = "website" | "whatsapp" | "email" | "linkedin" | "csv" | "event";
export type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected";
export type TaskStatus = "open" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "escalated";
export type ApprovalType = "quote_send" | "message_send" | "discount" | "qualification_review";
export type AgentRunStatus = "running" | "completed" | "failed" | "waiting_approval";
export type UserRole = "admin" | "manager" | "sales" | "cs";

export type PricingCategory = "AI transformation" | "CRM" | "KOC" | "campaign" | "data" | "custom";

export interface Profile {
  id: string;
  name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface QualificationData {
  lead_type: string;
  urgency: "high" | "medium" | "low";
  estimated_budget_range: string;
  service_interest: string[];
  qualification_score: number;
  missing_information: string[];
  recommended_next_action: string;
  confidence: number;
  human_review_required: boolean;
}

export interface Lead {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source: LeadSource | null;
  status: LeadStatus;
  assigned_to: string | null;
  lead_score: number;
  qualification_data: QualificationData | null;
  enquiry_text: string | null;
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
  number: string | null;
  lead_id: string | null;
  client_id: string | null;
  status: QuoteStatus;
  total_value: number | null;
  currency: string;
  valid_until: string | null;
  line_items: QuoteLineItem[];
  pdf_url: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  industry: string | null;
  tier: "SME" | "mid-market" | "enterprise" | null;
  account_owner: string | null;
  health_score: number;
  onboarding_status: string;
  renewal_date: string | null;
  arr: number | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  lead_id: string | null;
  client_id: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_by_agent: string | null;
  created_at: string;
}

export interface AgentRun {
  id: string;
  agent_name: string;
  trigger_type: string | null;
  input_data: unknown;
  output_data: unknown;
  output_summary: string | null;
  status: AgentRunStatus;
  duration_ms: number | null;
  tokens_used: number | null;
  model_used: string;
  confidence_score: number | null;
  human_review_required: boolean;
  created_at: string;
}

export interface AgentToolCall {
  id: string;
  agent_run_id: string;
  tool_name: string;
  input_params: unknown;
  output_result: unknown;
  success: boolean | null;
  error_message: string | null;
  called_at: string;
}

export interface HumanApproval {
  id: string;
  agent_run_id: string | null;
  approval_type: ApprovalType | null;
  requested_by: string | null;
  assigned_to: string | null;
  status: ApprovalStatus;
  context_data: unknown;
  context_summary: string | null;
  reviewer_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  actor_type: "agent" | "user" | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  diff_data: unknown;
  created_at: string;
}

export interface PricingTemplate {
  id: string;
  service: string;
  description: string | null;
  category: PricingCategory | null;
  unit_price: number | null;
  currency: string;
  active: boolean;
}

export interface DashboardStats {
  openLeads: number;
  pendingQuoteValue: number;
  pendingApprovals: number;
  runs24h: number;
}

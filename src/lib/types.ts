// src/lib/types.ts
// Canonical types matching the Supabase schema.
// mock-data.ts types are kept for backward compat during migration but will be removed.

export type LeadStatus = "new" | "qualified" | "replied" | "quoted" | "approved" | "won" | "lost";
export type LeadSource = "website" | "whatsapp" | "email" | "linkedin" | "csv" | "event" | "manual";
export type LifecycleChannel = LeadSource;
export type CampaignChannel = LifecycleChannel | "omnichannel";
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
export type ApprovalType =
  | "quote_send"
  | "message_send"
  | "discount"
  | "qualification_review"
  | "campaign_send"
  | "forecast_review"
  | "cs_risk_review";
export type AgentRunStatus = "running" | "completed" | "failed" | "waiting_approval";
export type UserRole = "admin" | "manager" | "sales" | "cs";

export type PricingCategory = "AI transformation" | "CRM" | "KOC" | "campaign" | "data" | "custom";
export type AccountLifecycleStage = "prospect" | "active_client" | "at_risk" | "churned";
export type ContactLifecycleStage =
  | "subscriber"
  | "lead"
  | "marketing_qualified"
  | "sales_qualified"
  | "customer"
  | "evangelist"
  | "unsubscribed";
export type ConsentStatus = "unknown" | "opted_in" | "opted_out";
export type EngagementDirection = "inbound" | "outbound" | "internal";
export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed";
export type CampaignMemberStatus =
  | "queued"
  | "sent"
  | "opened"
  | "clicked"
  | "replied"
  | "converted"
  | "unsubscribed"
  | "failed";
export type AutomationTriggerType =
  | "manual"
  | "engagement_event"
  | "lead_created"
  | "deal_stage_changed"
  | "renewal_risk"
  | "schedule";
export type AutomationPlaybookStatus = "draft" | "active" | "paused" | "archived";
export type AutomationRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type DealStage =
  | "new"
  | "discovery"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";
export type DealStatus = "open" | "won" | "lost";
export type ProjectStatus =
  | "not_started"
  | "onboarding"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";
export type OnboardingStatus = "not_started" | "onboarding" | "live" | "stalled";
export type RenewalRisk = "low" | "medium" | "high";
export type TouchpointType =
  | "onboarding"
  | "check_in"
  | "qbr"
  | "renewal"
  | "support"
  | "expansion"
  | "other";
export type TouchpointSentiment = "positive" | "neutral" | "negative";

export interface Profile {
  id: string;
  name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export type QualificationNextAction =
  | "Schedule discovery call"
  | "Send intro deck"
  | "Request more info"
  | "Disqualify";

export interface QualificationData {
  urgency_score: number; // 0–10
  fit_score: number; // 0–10
  qualification_score: number; // 0–100
  service_interest: string[];
  budget_range: string; // "HKD 50k–200k" or "unknown"
  next_action: QualificationNextAction;
  reason: string; // max 120 chars
  confidence: number; // 0.0–1.0
  human_review_required: boolean;
}

export interface Lead {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  source_campaign_id: string | null;
  campaign_member_id: string | null;
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
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
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
  account_id: string | null;
  primary_contact_id: string | null;
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
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
  project_id: string | null;
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
  product_id: string | null;
}

export interface DashboardStats {
  openLeads: number;
  pendingQuoteValue: number;
  pendingApprovals: number;
  runs24h: number;
  openPipeline: number;
  weightedForecast: number;
  campaignSourcedRevenue: number;
  averageAccountHealth: number;
  renewalsDue30: number;
  highRiskAccounts: number;
}

export interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  tier: "SME" | "mid-market" | "enterprise" | null;
  account_owner: string | null;
  lifecycle_stage: AccountLifecycleStage;
  health_score: number;
  renewal_date: string | null;
  arr: number | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  owner: string | null;
  lifecycle_stage: ContactLifecycleStage;
  source: LifecycleChannel | null;
  consent_status: ConsentStatus;
  created_at: string;
  updated_at: string;
}

export interface ChannelIdentity {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  channel: LifecycleChannel;
  external_id: string | null;
  handle: string | null;
  is_primary: boolean;
  last_seen_at: string | null;
  metadata: unknown;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  objective: string | null;
  audience_filter: unknown;
  scheduled_at: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignMember {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  account_id: string | null;
  status: CampaignMemberStatus;
  joined_at: string;
  last_event_at: string | null;
  metadata: unknown;
}

export interface EngagementEvent {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  campaign_id: string | null;
  campaign_member_id: string | null;
  deal_id: string | null;
  project_id: string | null;
  channel: LifecycleChannel;
  direction: EngagementDirection;
  event_type: string;
  subject: string | null;
  body_preview: string | null;
  occurred_at: string;
  created_by: string | null;
  created_by_agent: string | null;
  metadata: unknown;
  created_at: string;
}

export interface AutomationPlaybook {
  id: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  status: AutomationPlaybookStatus;
  steps: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: string;
  playbook_id: string | null;
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
  project_id: string | null;
  trigger_event_id: string | null;
  status: AutomationRunStatus;
  context_data: unknown;
  output_data: unknown;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  quote_id: string | null;
  source_campaign_id: string | null;
  name: string;
  stage: DealStage;
  status: DealStatus;
  probability: number;
  value: number | null;
  currency: string;
  expected_close_date: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  quote_id: string | null;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  target_end_date: string | null;
  owner: string | null;
  value: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerSuccessProfile {
  id: string;
  account_id: string;
  primary_contact_id: string | null;
  project_id: string | null;
  cs_owner: string | null;
  health_score: number;
  onboarding_status: OnboardingStatus;
  renewal_date: string | null;
  renewal_risk: RenewalRisk;
  next_best_action: string | null;
  expansion_signal: string | null;
  last_touch_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuccessTouchpoint {
  id: string;
  account_id: string;
  contact_id: string | null;
  project_id: string | null;
  touchpoint_type: TouchpointType;
  sentiment: TouchpointSentiment;
  notes: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export type ProductCategory = PricingCategory;
export type ProductBillingType = "retainer" | "one_off" | "usage";
export type EngagementBillingPeriod = "monthly" | "quarterly" | "annual" | "one_off";
export type EngagementStatus = "active" | "paused" | "ended";
export type TouchpointNewType =
  | "check_in"
  | "qbr"
  | "meeting"
  | "call"
  | "whatsapp"
  | "email"
  | "note";
export type TouchpointNewSentiment = "positive" | "neutral" | "negative";
export type NotificationType =
  | "renewal_window"
  | "risk_change"
  | "stale_touchpoint"
  | "approval_pending";
export type RenewalWindowBucket = "overdue" | "30" | "60" | "90" | "later";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory | null;
  billing_type: ProductBillingType;
  default_term_months: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Engagement {
  id: string;
  client_id: string;
  product_id: string;
  owner: string | null;
  value: number | null;
  billing_period: EngagementBillingPeriod;
  start_date: string;
  renewal_date: string | null;
  status: EngagementStatus;
  health_score: number;
  renewal_risk: RenewalRisk;
  risk_reasoning: string | null;
  next_action: string | null;
  last_touch_at: string | null;
  end_reason: string | null;
  lead_id: string | null;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TouchpointRecord {
  id: string;
  client_id: string;
  engagement_id: string | null;
  contact_id: string | null;
  type: TouchpointNewType;
  sentiment: TouchpointNewSentiment;
  notes: string | null;
  occurred_at: string;
  logged_by: string | null;
  created_by_agent: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  object_type: string | null;
  object_id: string | null;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
}

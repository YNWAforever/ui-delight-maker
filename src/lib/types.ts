// src/lib/types.ts
// Canonical types matching the Supabase schema.
// mock-data.ts types are kept for backward compat during migration but will be removed.

import type { RelationshipSignalDraft } from "@/lib/relationship/types";

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
  | "rejected"
  | "expired"
  | "revised";
export type QuoteVersionReason = "issued" | "revised" | "accepted" | "change_order";
export type PdfDocumentType = "quote" | "job_sheet";
export type JobSheetStatus =
  | "draft"
  | "accounting_review"
  | "accepted"
  | "change_required"
  | "cancelled";
export type JobSheetBillingType =
  | "deposit"
  | "progress"
  | "milestone"
  | "monthly"
  | "final"
  | "other";
export type JobSheetPortionStatus = "planned" | "entered_in_xero" | "cancelled";
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
export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "sales"
  | "client_success"
  | "accounting"
  | "read_only";

export type PricingCategory = "AI transformation" | "CRM" | "KOC" | "campaign" | "data" | "custom";
export type AccountLifecycleStage =
  | "prospect"
  | "active_client"
  | "at_risk"
  | "churned"
  | "partner"
  | "vendor";
export type ContactLifecycleStage =
  | "subscriber"
  | "lead"
  | "marketing_qualified"
  | "sales_qualified"
  | "customer"
  | "evangelist"
  | "unsubscribed";
export type PreferredChannel = "email" | "phone" | "whatsapp" | "linkedin" | "event" | "unknown";
export type RelationshipRole =
  | "decision_maker"
  | "buyer"
  | "champion"
  | "daily_user"
  | "influencer"
  | "finance_procurement"
  | "blocker"
  | "agency_partner"
  | "event_attendee"
  | "other";
export type InfluenceLevel = "low" | "medium" | "high";
export type StakeholderSentiment = "positive" | "neutral" | "negative" | "unknown";
export type RelationshipStrength = "weak" | "developing" | "strong";
export type ConsentStatus = "unknown" | "opted_in" | "opted_out";
export type EngagementDirection = "inbound" | "outbound" | "internal";
export type CampaignType =
  | "campaign"
  | "webinar"
  | "workshop"
  | "activation"
  | "outbound"
  | "client_event";
export type CampaignStatus = "draft" | "planned" | "active" | "completed" | "archived";
export type AttendeeStatus = "attended" | "met" | "high_intent" | "unknown";
export type FollowUpStatus =
  | "not_started"
  | "task_created"
  | "in_progress"
  | "completed"
  | "dismissed";
export type ConversionOutcome = "none" | "lead" | "quote" | "engagement" | "client_activity";
export type AutomationTriggerType =
  | "manual"
  | "engagement_event"
  | "lead_created"
  | "deal_stage_changed"
  | "renewal_risk"
  | "schedule";
export type AutomationPlaybookStatus = "draft" | "active" | "paused" | "archived";
export type AutomationRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
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
  quote_template_id: string | null;
  accepted_version_id: string | null;
  issued_version_id: string | null;
  document_sections: JsonValue;
  cover_text: string | null;
  assumptions: string | null;
  payment_terms: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  parent_quote_id: string | null;
  change_order_reason: string | null;
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

export interface QuoteTemplate {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  default_cover_text: string | null;
  default_scope_sections: JsonValue;
  default_assumptions: string | null;
  default_payment_terms: string | null;
  default_validity_days: number;
  starter_line_items: JsonValue;
  default_pdf_template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdfTemplate {
  id: string;
  name: string;
  document_type: PdfDocumentType;
  active: boolean;
  brand_settings: JsonValue;
  sections: JsonValue;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteLineItemRecord extends QuoteLineItem {
  quote_id: string;
  pricing_template_id: string | null;
  product_id: string | null;
  section_label: string | null;
  total: number;
  taxable: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteVersion {
  id: string;
  quote_id: string;
  version_number: number;
  reason: QuoteVersionReason;
  snapshot: JsonValue;
  pdf_template_id: string | null;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JobSheet {
  id: string;
  number: string;
  quote_id: string;
  accepted_quote_version_id: string;
  account_id: string | null;
  client_id: string | null;
  contact_id: string | null;
  sales_owner: string | null;
  accounting_owner: string | null;
  status: JobSheetStatus;
  accepted_scope_summary: string | null;
  po_number: string | null;
  client_order_number: string | null;
  xero_customer_reference: string | null;
  accounting_notes: string | null;
  special_billing_instructions: string | null;
  total_amount: number;
  currency: string;
  accepted_at: string | null;
  accepted_by: string | null;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobSheetPortion {
  id: string;
  job_sheet_id: string;
  name: string;
  source_quote_line_item_ids: string[];
  description: string | null;
  amount: number;
  currency: string;
  target_invoice_date: string | null;
  billing_type: JobSheetBillingType;
  status: JobSheetPortionStatus;
  xero_invoice_number: string | null;
  xero_invoice_reference: string | null;
  xero_invoice_date: string | null;
  xero_notes: string | null;
  internal_note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JobSheetActivity {
  id: string;
  job_sheet_id: string;
  actor_id: string | null;
  action: string;
  note: string | null;
  diff_data: unknown;
  created_at: string;
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
  website?: string | null;
  domain: string | null;
  industry: string | null;
  region?: string | null;
  tier: "SME" | "mid-market" | "enterprise" | null;
  account_owner: string | null;
  lifecycle_stage: AccountLifecycleStage;
  cs_owner?: string | null;
  source?: string | null;
  tags?: string[];
  notes?: string | null;
  relationship_health?: number;
  last_activity_at?: string | null;
  next_action?: string | null;
  health_score?: number;
  renewal_date?: string | null;
  arr?: number | null;
  created_at: string;
  updated_at: string;
}

export type WorkspaceObject = "account" | "relationship";

export type WorkspaceViewConfig = {
  filters: Partial<Pick<Account, "lifecycle_stage" | "account_owner" | "cs_owner">>;
  columns: Array<
    "name" | "lifecycle_stage" | "relationship_health" | "last_activity_at" | "next_action"
  >;
  sort: {
    field: "last_activity_at" | "name" | "relationship_health";
    direction: "asc" | "desc";
  };
};

export type WorkspaceView = {
  id: string;
  profile_id: string;
  object_type: WorkspaceObject;
  name: string;
  config: WorkspaceViewConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkspaceFavorite = {
  id: string;
  profile_id: string;
  kind: "view" | "account" | "search";
  label: string;
  href: string;
  view_id: string | null;
  account_id: string | null;
  created_at: string;
};

export interface AccountContact {
  id: string;
  account_id: string;
  name: string;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  preferred_channel: PreferredChannel | null;
  relationship_role: RelationshipRole;
  influence_level: InfluenceLevel;
  sentiment: StakeholderSentiment;
  relationship_strength: RelationshipStrength;
  is_primary: boolean;
  active: boolean;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string | null;
  name?: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department?: string | null;
  whatsapp?: string | null;
  linkedin_url?: string | null;
  title: string | null;
  owner: string | null;
  lifecycle_stage: ContactLifecycleStage;
  source: LifecycleChannel | null;
  consent_status: ConsentStatus;
  preferred_channel?: PreferredChannel | null;
  relationship_role?: RelationshipRole;
  influence_level?: InfluenceLevel;
  sentiment?: StakeholderSentiment;
  relationship_strength?: RelationshipStrength;
  is_primary?: boolean;
  active?: boolean;
  notes?: string | null;
  last_contacted_at?: string | null;
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
  metadata: JsonValue;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  channel?: CampaignChannel | null;
  status: CampaignStatus;
  objective: string | null;
  audience_filter?: JsonValue;
  scheduled_at?: string | null;
  owner: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignMember {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  account_id: string | null;
  raw_company_name?: string | null;
  raw_contact_name?: string | null;
  raw_email?: string | null;
  raw_phone?: string | null;
  attendee_status: AttendeeStatus;
  interests?: string[];
  follow_up_owner?: string | null;
  follow_up_status: FollowUpStatus;
  conversion_outcome?: ConversionOutcome;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  // Legacy compatibility fields retained until data-access layers move to the new schema.
  status?: AttendeeStatus;
  joined_at?: string;
  last_event_at?: string | null;
  metadata?: JsonValue;
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
  metadata: JsonValue;
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

export interface RelationshipSignal extends RelationshipSignalDraft {
  id: string;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismissal_reason: string | null;
  created_at: string;
  updated_at: string;
}

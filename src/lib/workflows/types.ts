import type { ActivityLog, AgentRun, Engagement, Lead, PricingTemplate, TouchpointRecord } from "@/lib/types";

export type WorkflowTrigger =
  | "lead.qualify_requested"
  | "lead.reply_draft_requested"
  | "quote.draft_requested"
  | "engagement.score_renewal_risk_requested";

export type WorkflowContextRequestPayload = {
  lead_id: string;
  agent_run_id: string;
};

export type WorkflowContextAgentRun = Pick<
  AgentRun,
  | "id"
  | "agent_name"
  | "input_data"
  | "output_data"
  | "output_summary"
  | "status"
  | "model_used"
  | "confidence_score"
  | "human_review_required"
  | "created_at"
> & {
  workflow_type: "qualify_lead" | "draft_reply" | "draft_quote";
  subject_type: "lead";
  subject_id: string;
};

export type WorkflowContextResponse = {
  lead: Pick<
    Lead,
    | "id"
    | "company_name"
    | "contact_name"
    | "contact_email"
    | "contact_phone"
    | "source"
    | "status"
    | "assigned_to"
    | "lead_score"
    | "qualification_data"
    | "enquiry_text"
    | "created_at"
    | "updated_at"
  >;
  agent_run: WorkflowContextAgentRun;
  pricing_templates: Array<
    Pick<
      PricingTemplate,
      "id" | "service" | "description" | "category" | "unit_price" | "currency" | "active"
    >
  >;
  recent_activity: Array<
    Pick<
      ActivityLog,
      | "actor_type"
      | "actor_name"
      | "action"
      | "object_type"
      | "object_id"
      | "diff_data"
      | "created_at"
    >
  >;
};

export type WorkflowRequestPayload = {
  trigger: WorkflowTrigger;
  lead_id: string;
  agent_run_id: string;
};

export type QualificationWritebackPayload = {
  lead_id: string;
  agent_run_id: string;
  qualification_data: unknown;
  lead_score: number;
  output_summary: string;
  confidence_score: number;
  duration_ms?: number;
  tokens_used?: number;
  model_used?: string;
};

export type ReplyDraftWritebackPayload = {
  lead_id: string;
  agent_run_id: string;
  draft_message: string;
  context_summary: string;
  confidence_score: number;
  risk_notes?: string[];
};

export type QuoteDraftWritebackPayload = {
  lead_id: string;
  agent_run_id: string;
  quote: {
    number?: string | null;
    currency: string;
    total_value: number;
    valid_until?: string | null;
    line_items: Array<{
      id: string;
      service: string;
      description: string;
      qty: number;
      unit_price: number;
    }>;
  };
  create_send_approval: boolean;
  context_summary?: string | null;
  confidence_score: number;
};

export type EngagementWorkflowContextRequestPayload = {
  engagement_id: string;
  agent_run_id: string;
};

export type EngagementWorkflowContextResponse = {
  engagement: Pick<
    Engagement,
    | "id"
    | "client_id"
    | "product_id"
    | "renewal_date"
    | "last_touch_at"
    | "health_score"
    | "renewal_risk"
    | "created_at"
  >;
  recent_touchpoints: Array<Pick<TouchpointRecord, "type" | "sentiment" | "notes" | "occurred_at">>;
  open_overdue_task_count: number;
  agent_run: Pick<
    AgentRun,
    "id" | "agent_name" | "input_data" | "status" | "model_used" | "created_at"
  > & { workflow_type: "score_renewal_risk"; subject_type: "engagement"; subject_id: string };
};

export type EngagementWorkflowRequestPayload = {
  trigger: "engagement.score_renewal_risk_requested";
  engagement_id: string;
  agent_run_id: string;
};

export type ScoreRenewalRiskWritebackPayload = {
  engagement_id: string;
  agent_run_id: string;
  health_score: number;
  renewal_risk: "low" | "medium" | "high";
  risk_reasoning: string;
  suggested_next_action: string;
  confidence: number;
  output_summary: string;
  model_used?: string;
};

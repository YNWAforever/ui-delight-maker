export type WorkflowTrigger =
  | "lead.qualify_requested"
  | "lead.reply_draft_requested"
  | "quote.draft_requested";

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

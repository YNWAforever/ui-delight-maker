import type {
  AccountWorkflowRequestPayload,
  EngagementWorkflowRequestPayload,
  WorkflowRequestPayload,
} from "./types";

function basePayload(input: { leadId: string; agentRunId: string }) {
  return {
    lead_id: input.leadId,
    agent_run_id: input.agentRunId,
  };
}

export function buildQualificationPayload(input: {
  leadId: string;
  agentRunId: string;
}): WorkflowRequestPayload {
  return {
    trigger: "lead.qualify_requested",
    ...basePayload(input),
  };
}

export function buildReplyDraftPayload(input: {
  leadId: string;
  agentRunId: string;
}): WorkflowRequestPayload {
  return {
    trigger: "lead.reply_draft_requested",
    ...basePayload(input),
  };
}

export function buildQuoteDraftPayload(input: {
  leadId: string;
  agentRunId: string;
}): WorkflowRequestPayload {
  return {
    trigger: "quote.draft_requested",
    ...basePayload(input),
  };
}

export function buildScoreRenewalRiskPayload(input: {
  engagementId: string;
  agentRunId: string;
}): EngagementWorkflowRequestPayload {
  return {
    trigger: "engagement.score_renewal_risk_requested",
    engagement_id: input.engagementId,
    agent_run_id: input.agentRunId,
  };
}

export function buildRelationshipIntelligencePayload(input: {
  accountId: string;
  agentRunId: string;
}): AccountWorkflowRequestPayload {
  return {
    trigger: "account.relationship_intelligence_requested",
    account_id: input.accountId,
    agent_run_id: input.agentRunId,
  };
}

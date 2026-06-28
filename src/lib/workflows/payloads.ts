import type { WorkflowRequestPayload } from "./types";

function getWorkflowToken() {
  const token = process.env.N8N_WORKFLOW_TOKEN;
  if (!token) {
    throw new Error("Missing required env var: N8N_WORKFLOW_TOKEN");
  }
  return token;
}

function basePayload(input: { leadId: string; agentRunId: string }) {
  return {
    lead_id: input.leadId,
    agent_run_id: input.agentRunId,
    workflow_token: getWorkflowToken(),
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

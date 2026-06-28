import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { triggerN8n } from "@/lib/n8n";
import { findActiveRun, createAgentRun } from "@/server/repositories/agent-runs";
import {
  createLead as createLeadInNeon,
  getLeadWithActivity,
  listLeads,
  moveLeadStage as moveLeadStageInNeon,
  updateLead as updateLeadInNeon,
} from "@/server/repositories/leads";
import { serializeActivityLog, serializeAgentRun } from "@/server-functions/serializers";
import type { Lead, LeadStatus } from "@/lib/types";

type GetLeadsInput = {
  status?: string;
  source?: string;
  assigned_to?: string;
  contact_id?: string;
  account_id?: string;
  source_campaign_id?: string;
};

type CreateLeadInput = Pick<Lead, "company_name" | "source"> & {
  enquiry_text?: string | null;
} & Partial<
    Pick<
      Lead,
      | "contact_name"
      | "contact_email"
      | "contact_phone"
      | "assigned_to"
      | "contact_id"
      | "account_id"
      | "source_campaign_id"
      | "campaign_member_id"
    >
  >;

type UpdateLeadInput = Partial<
  Pick<
    Lead,
    | "status"
    | "assigned_to"
    | "lead_score"
    | "qualification_data"
    | "contact_id"
    | "account_id"
    | "source_campaign_id"
    | "campaign_member_id"
  >
>;

export const getLeads = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetLeadsInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listLeads(data);
  });

export const getLead = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const result = await getLeadWithActivity(data.id);
    return {
      lead: result.lead,
      activityLogs: result.activityLogs.map(serializeActivityLog),
    };
  });

export const createLead = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateLeadInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createLeadInNeon(data);
  });

export const updateLead = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: UpdateLeadInput })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateLeadInNeon(data.id, data.updates);
  });

export const moveLeadStage = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; status: LeadStatus; reason?: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return moveLeadStageInNeon({
      id: data.id,
      status: data.status,
      reason: data.reason,
      actorId: session.user.id,
    });
  });

export const triggerLeadAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const existingRun = await findActiveRun(data.leadId, "qualify_lead");
    if (existingRun) {
      return {
        triggered: false,
        run: serializeAgentRun(existingRun),
        reason: "already_running" as const,
      };
    }

    const run = await createAgentRun({
      agent_name: "Lead Qualification Agent",
      workflow_type: "qualify_lead",
      subject_id: data.leadId,
      input_data: { lead_id: data.leadId },
      created_by: session.user.id,
    });

    const webhookUrl = process.env.N8N_QUALIFY_LEAD_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        triggered: false,
        run: serializeAgentRun(run),
        reason: "missing_webhook" as const,
      };
    }

    const workflowToken = process.env.N8N_WORKFLOW_TOKEN;
    await triggerN8n(webhookUrl, {
      trigger: "lead.retrigger",
      lead_id: data.leadId,
      agent_run_id: run.id,
      ...(workflowToken ? { workflow_token: workflowToken } : {}),
      payload: {},
    });
    return { triggered: true, run: serializeAgentRun(run) };
  });

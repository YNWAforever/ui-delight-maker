import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildQualificationPayload, buildReplyDraftPayload } from "@/lib/workflows/payloads";
import {
  createAgentRun,
  findActiveRun,
  updateAgentRunResult,
} from "@/server/repositories/agent-runs";
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

    const dispatchConfig = getN8nDispatchConfig(process.env.N8N_QUALIFY_LEAD_WEBHOOK_URL);
    if (!dispatchConfig) {
      return {
        triggered: false,
        reason: "missing_webhook" as const,
      };
    }

    const { run, created } = await createAgentRun({
      agent_name: "Lead Qualification Agent",
      workflow_type: "qualify_lead",
      subject_id: data.leadId,
      input_data: { lead_id: data.leadId },
      created_by: session.user.id,
    });

    if (!created) {
      return {
        triggered: false,
        run: serializeAgentRun(run),
        reason: "already_running" as const,
      };
    }

    try {
      await triggerN8n(
        dispatchConfig,
        buildQualificationPayload({ leadId: data.leadId, agentRunId: run.id }),
      );
    } catch (error) {
      await updateAgentRunResult(run.id, {
        status: "failed",
        output_data: {
          dispatch_error: error instanceof Error ? error.message : "Unknown n8n dispatch error",
        },
        output_summary: "Failed to dispatch lead qualification workflow.",
      });
      throw error;
    }

    return { triggered: true, run: serializeAgentRun(run) };
  });

export const triggerLeadReplyDraft = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const existingRun = await findActiveRun(data.leadId, "draft_reply");
    if (existingRun) {
      return {
        triggered: false,
        run: serializeAgentRun(existingRun),
        reason: "already_running" as const,
      };
    }

    const dispatchConfig = getN8nDispatchConfig(process.env.N8N_DRAFT_REPLY_WEBHOOK_URL);
    if (!dispatchConfig) {
      return {
        triggered: false,
        reason: "missing_webhook" as const,
      };
    }

    const { run, created } = await createAgentRun({
      agent_name: "Reply Draft Agent",
      workflow_type: "draft_reply",
      subject_id: data.leadId,
      input_data: { lead_id: data.leadId },
      created_by: session.user.id,
    });

    if (!created) {
      return {
        triggered: false,
        run: serializeAgentRun(run),
        reason: "already_running" as const,
      };
    }

    try {
      await triggerN8n(
        dispatchConfig,
        buildReplyDraftPayload({ leadId: data.leadId, agentRunId: run.id }),
      );
    } catch (error) {
      await updateAgentRunResult(run.id, {
        status: "failed",
        output_data: {
          dispatch_error: error instanceof Error ? error.message : "Unknown n8n dispatch error",
        },
        output_summary: "Failed to dispatch reply draft workflow.",
      });
      throw error;
    }

    return { triggered: true, run: serializeAgentRun(run) };
  });

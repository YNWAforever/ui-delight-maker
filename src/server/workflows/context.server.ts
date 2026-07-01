import type { WorkflowContextResponse } from "@/lib/workflows/types";
import { query, queryOne } from "@/server/db/neon.server";

type LeadContextInput = {
  leadId: string;
  agentRunId: string;
};

export async function getLeadWorkflowContext({
  leadId,
  agentRunId,
}: LeadContextInput): Promise<WorkflowContextResponse> {
  const lead = await queryOne<WorkflowContextResponse["lead"]>(
    `
      select
        id,
        company_name,
        contact_name,
        contact_email,
        contact_phone,
        source,
        status,
        assigned_to,
        lead_score,
        qualification_data,
        enquiry_text,
        created_at,
        updated_at
      from leads
      where id = $1
    `,
    [leadId],
  );

  if (!lead) {
    throw new Error("Lead not found");
  }

  const agentRun = await queryOne<WorkflowContextResponse["agent_run"]>(
    `
      select
        id,
        agent_name,
        workflow_type,
        subject_type,
        subject_id,
        input_data,
        output_data,
        output_summary,
        status,
        model_used,
        confidence_score,
        human_review_required,
        created_at
      from agent_runs
      where id = $1
    `,
    [agentRunId],
  );

  if (!agentRun) {
    throw new Error("Agent run not found");
  }

  if (agentRun.subject_type !== "lead" || agentRun.subject_id !== leadId) {
    throw new Error("Agent run does not belong to lead");
  }

  const pricingTemplates = await query<WorkflowContextResponse["pricing_templates"][number]>(
    `
      select
        id,
        service,
        description,
        category,
        unit_price,
        currency,
        active
      from pricing_templates
      where active = true
      order by category nulls last, unit_price nulls last, service
      limit 20
    `,
  );

  const recentActivity = await query<WorkflowContextResponse["recent_activity"][number]>(
    `
      select
        actor_type,
        actor_name,
        action,
        object_type,
        object_id,
        diff_data,
        created_at
      from activity_logs
      where object_type = 'lead'
        and object_id = $1
      order by created_at desc
      limit 10
    `,
    [leadId],
  );

  return {
    lead,
    agent_run: agentRun,
    pricing_templates: pricingTemplates,
    recent_activity: recentActivity,
  };
}

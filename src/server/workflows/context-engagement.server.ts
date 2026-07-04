// src/server/workflows/context-engagement.server.ts
import { getAgentRunWithCalls, type SubjectType } from "@/server/repositories/agent-runs";
import { getEngagement } from "@/server/repositories/engagements";
import { query } from "@/server/db/neon.server";
import type { EngagementWorkflowContextResponse } from "@/lib/workflows/types";
import type { AgentRun, TouchpointRecord } from "@/lib/types";

// `agent_runs` has subject_type/subject_id columns (see agent-runs.ts repository
// and getLeadWorkflowContext's explicit column list), but the shared `AgentRun`
// type in lib/types.ts doesn't declare them since `getAgentRunWithCalls` selects `*`.
type AgentRunWithSubject = AgentRun & { subject_type: SubjectType; subject_id: string };

export async function getEngagementWorkflowContext(input: {
  engagementId: string;
  agentRunId: string;
}): Promise<EngagementWorkflowContextResponse> {
  const engagement = await getEngagement(input.engagementId);
  const { run: runResult } = await getAgentRunWithCalls(input.agentRunId);
  const run = runResult as AgentRunWithSubject;

  if (run.subject_type !== "engagement" || run.subject_id !== input.engagementId) {
    throw new Error("Agent run does not belong to this engagement");
  }

  const touchpoints = await query<TouchpointRecord>(
    `
      select * from touchpoints
      where client_id = $1
      order by occurred_at desc
      limit 5
    `,
    [engagement.client_id],
  );

  const overdueTasksResult = await query<{ count: string }>(
    `
      select count(*)::text as count
      from tasks
      where client_id = $1 and status <> 'done' and due_date < current_date
    `,
    [engagement.client_id],
  );

  return {
    engagement: {
      id: engagement.id,
      client_id: engagement.client_id,
      product_id: engagement.product_id,
      renewal_date: engagement.renewal_date,
      last_touch_at: engagement.last_touch_at,
      health_score: engagement.health_score,
      renewal_risk: engagement.renewal_risk,
      created_at: engagement.created_at,
    },
    recent_touchpoints: touchpoints.map((t) => ({
      type: t.type,
      sentiment: t.sentiment,
      notes: t.notes,
      occurred_at: t.occurred_at,
    })),
    open_overdue_task_count: Number(overdueTasksResult[0]?.count ?? "0"),
    agent_run: {
      id: run.id,
      agent_name: run.agent_name,
      input_data: run.input_data,
      status: run.status,
      model_used: run.model_used,
      created_at: run.created_at,
      workflow_type: "score_renewal_risk",
      subject_type: "engagement",
      subject_id: input.engagementId,
    },
  };
}

import { query, queryOne } from "@/server/db/neon.server";
import type { AgentRun, AgentToolCall } from "@/lib/types";

export type WorkflowType = "qualify_lead" | "draft_reply" | "draft_quote";

export async function listAgentRuns(input: { agent?: string; status?: string } = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];

  if (input.agent) {
    values.push(input.agent);
    clauses.push(`agent_name = $${values.length}`);
  }

  if (input.status) {
    values.push(input.status);
    clauses.push(`status = $${values.length}`);
  }

  return query<AgentRun>(
    `
      select *
      from agent_runs
      ${clauses.length > 0 ? `where ${clauses.join(" and ")}` : ""}
      order by created_at desc
      limit 200
    `,
    values,
  );
}

export async function listRecentAgentRuns(limit = 50) {
  return query<AgentRun>(
    "select * from agent_runs order by created_at desc limit $1",
    [limit],
  );
}

export async function getAgentRunWithCalls(id: string) {
  const [run, toolCalls] = await Promise.all([
    queryOne<AgentRun>("select * from agent_runs where id = $1", [id]),
    query<AgentToolCall>(
      "select * from agent_tool_calls where agent_run_id = $1 order by called_at",
      [id],
    ),
  ]);

  if (!run) throw new Error("Agent run not found");
  return { run, toolCalls };
}

export async function findActiveRun(subjectId: string, workflowType: WorkflowType) {
  return queryOne<AgentRun>(
    `
      select *
      from agent_runs
      where subject_type = 'lead'
        and subject_id = $1
        and workflow_type = $2
        and status in ('running','waiting_approval')
      order by created_at desc
      limit 1
    `,
    [subjectId, workflowType],
  );
}

export async function createAgentRun(input: {
  agent_name: string;
  workflow_type: WorkflowType;
  subject_id: string;
  input_data: unknown;
  created_by: string;
}) {
  const run = await queryOne<AgentRun>(
    `
      insert into agent_runs
        (agent_name, workflow_type, trigger_type, subject_type, subject_id, input_data, status, created_by)
      values ($1, $2, 'manual', 'lead', $3, $4::jsonb, 'running', $5)
      on conflict (subject_type, subject_id, workflow_type)
        where status in ('running','waiting_approval')
        do nothing
      returning *
    `,
    [
      input.agent_name,
      input.workflow_type,
      input.subject_id,
      JSON.stringify(input.input_data),
      input.created_by,
    ],
  );

  if (run) return run;

  const activeRun = await findActiveRun(input.subject_id, input.workflow_type);
  if (activeRun) return activeRun;

  throw new Error("Failed to create agent run");
}

export async function updateAgentRunResult(
  id: string,
  input: {
    status: "completed" | "failed" | "waiting_approval";
    output_data?: unknown;
    output_summary?: string | null;
    confidence_score?: number | null;
    human_review_required?: boolean;
    duration_ms?: number | null;
    tokens_used?: number | null;
    model_used?: string | null;
  },
) {
  const run = await queryOne<AgentRun>(
    `
      update agent_runs set
        status = $2,
        output_data = coalesce($3::jsonb, output_data),
        output_summary = $4,
        confidence_score = $5,
        human_review_required = $6,
        duration_ms = $7,
        tokens_used = $8,
        model_used = coalesce($9, model_used)
      where id = $1
      returning *
    `,
    [
      id,
      input.status,
      input.output_data === undefined ? null : JSON.stringify(input.output_data),
      input.output_summary ?? null,
      input.confidence_score ?? null,
      input.human_review_required ?? false,
      input.duration_ms ?? null,
      input.tokens_used ?? null,
      input.model_used ?? null,
    ],
  );

  if (!run) throw new Error("Agent run not found");
  return run;
}

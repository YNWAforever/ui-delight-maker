import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { AgentRun, AgentToolCall } from "@/lib/types";

export type WorkflowType =
  | "qualify_lead"
  | "draft_reply"
  | "draft_quote"
  | "score_renewal_risk"
  | "relationship_intelligence";

export type SubjectType = "lead" | "engagement" | "account" | "campaign";

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
  return query<AgentRun>("select * from agent_runs order by created_at desc limit $1", [limit]);
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

export async function findActiveRun(
  subjectId: string,
  workflowType: WorkflowType,
  subjectType: SubjectType = "lead",
) {
  return queryOne<AgentRun>(
    `
      select *
      from agent_runs
      where subject_type = $1
        and subject_id = $2
        and workflow_type = $3
        and status in ('running','waiting_approval')
      order by created_at desc
      limit 1
    `,
    [subjectType, subjectId, workflowType],
  );
}

export async function getAgentRunForUpdate(id: string, db: Queryable) {
  return queryOne<AgentRun>("select * from agent_runs where id = $1 for update", [id], db);
}

export async function createAgentRun(input: {
  agent_name: string;
  workflow_type: WorkflowType;
  subject_id: string;
  subject_type?: SubjectType;
  trigger_type?: "manual" | "webhook" | "schedule" | "orchestrator";
  input_data: unknown;
  created_by: string | null;
}) {
  const subjectType = input.subject_type ?? "lead";
  const triggerType = input.trigger_type ?? "manual";
  const run = await queryOne<AgentRun>(
    `
      insert into agent_runs
        (agent_name, workflow_type, trigger_type, subject_type, subject_id, input_data, status, created_by)
      values ($1, $2, $3, $4, $5, $6::jsonb, 'running', $7)
      on conflict (subject_type, subject_id, workflow_type)
        where status in ('running','waiting_approval')
        do nothing
      returning *
    `,
    [
      input.agent_name,
      input.workflow_type,
      triggerType,
      subjectType,
      input.subject_id,
      JSON.stringify(input.input_data),
      input.created_by,
    ],
  );

  if (run) {
    return { run, created: true as const };
  }

  const activeRun = await findActiveRun(input.subject_id, input.workflow_type, subjectType);
  if (activeRun) {
    return { run: activeRun, created: false as const };
  }

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
    tokens_used?: number | null;
    model_used?: string | null;
  },
  db?: Queryable,
) {
  const run = await queryOne<AgentRun>(
    `
      update agent_runs set
        status = $2,
        output_data = coalesce($3::jsonb, output_data),
        output_summary = $4,
        confidence_score = $5,
        human_review_required = $6,
        -- Wall-clock from dispatch to callback: queue time, model time and network together.
        -- Deliberately NOT n8n's execution time, and deliberately now() rather than the
        -- per-statement wall-clock function: now() is transaction-start, which is the moment
        -- this callback began processing, while the per-statement function samples the live
        -- clock and would fold this transaction's own earlier work into the agent's measured
        -- time. Computed here, not passed in, because four of the five writebacks used to
        -- forget it and a missing duration is indistinguishable from a run that never called
        -- back.
        duration_ms = greatest(0, round(extract(epoch from (now() - created_at)) * 1000))::integer,
        tokens_used = $7,
        model_used = coalesce($8, model_used)
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
      input.tokens_used ?? null,
      input.model_used ?? null,
    ],
    db,
  );

  if (!run) throw new Error("Agent run not found");
  return run;
}

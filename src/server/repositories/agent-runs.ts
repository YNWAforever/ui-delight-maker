import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import { AdminError } from "@/lib/admin/errors";
import type { AgentRun, AgentToolCall } from "@/lib/types";
import type { AIUsage } from "@/server/workflows/ai-invocation.server";
import {
  normalizeAIExecutionProvenance,
  type AIExecutionProvenance,
} from "@/lib/workflows/provenance";

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

export async function createAgentRun(
  input: {
    agent_name: string;
    workflow_type: WorkflowType;
    subject_id: string;
    subject_type?: SubjectType;
    trigger_type?: "manual" | "webhook" | "schedule" | "orchestrator";
    input_data: unknown;
    created_by: string | null;
  },
  existingDb?: Queryable,
) {
  const subjectType = input.subject_type ?? "lead";
  const triggerType = input.trigger_type ?? "manual";
  const work = async (db: Queryable) => {
    // A retry request is only a local recovery marker. The existing dispatch caller
    // creates this new attempt after checking its webhook and policy.
    const retry = (
      await db.query<{ id: string }>(
        `select old.id from agent_runs old
         where old.subject_type=$1 and old.subject_id=$2 and old.workflow_type=$3
           and old.status='failed' and old.outcome_code='retry_requested'
           and not exists (select 1 from agent_runs child where child.retry_of=old.id)
         order by old.recovered_at desc,old.id desc
         limit 1 for update of old`,
        [subjectType, input.subject_id, input.workflow_type],
      )
    ).rows[0];
    const inserted = (
      await db.query<AgentRun>(
        `insert into agent_runs
           (agent_name,workflow_type,trigger_type,subject_type,subject_id,input_data,status,created_by,retry_of,model_used)
         values ($1,$2,$3,$4,$5,$6::jsonb,'running',$7,$8,null)
         on conflict (subject_type,subject_id,workflow_type)
           where status in ('running','waiting_approval')
           do nothing
         returning *`,
        [
          input.agent_name,
          input.workflow_type,
          triggerType,
          subjectType,
          input.subject_id,
          JSON.stringify(input.input_data),
          input.created_by,
          retry?.id ?? null,
        ],
      )
    ).rows[0];
    if (inserted && retry) {
      await db.query(
        "update agent_runs set outcome_code='superseded' where id=$1 and outcome_code='retry_requested'",
        [retry.id],
      );
    }
    return inserted;
  };
  const run = await (existingDb ? work(existingDb) : transaction(work));

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
    usage_data?: AIUsage | null;
    outcome_code?: string | null;
    model_used?: string | null;
    execution_metadata?: AIExecutionProvenance | null;
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
        model_used = coalesce($8, model_used),
        usage_data = coalesce($9::jsonb, usage_data),
        outcome_code = coalesce($10, outcome_code),
        execution_metadata = coalesce($11::jsonb, execution_metadata)
      where id = $1 and status in ('running','waiting_approval')
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
      input.usage_data ? JSON.stringify(input.usage_data) : null,
      input.outcome_code ?? null,
      input.execution_metadata
        ? JSON.stringify(normalizeAIExecutionProvenance(input.execution_metadata))
        : null,
    ],
    db,
  );

  if (!run) {
    const existing = await queryOne<{ status: string }>(
      "select status from agent_runs where id=$1",
      [id],
      db,
    );
    if (existing) throw new AdminError("CONFLICT", "Agent run is no longer active");
    throw new Error("Agent run not found");
  }
  return run;
}

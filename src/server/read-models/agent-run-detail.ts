import { decideAgentSubjects } from "@/lib/agent-run-visibility";
import {
  AGENT_TRACE_PAGE_SIZE,
  type AgentRunDetailInput,
  type AgentRunDetailMetadata,
  type AgentRunDetailRead,
  type AgentTraceEvent,
} from "@/lib/agent-run-detail";
import type { RequestAuthorization, RowAuthorizer } from "@/server/auth/authorization.server";
import { query, queryOne } from "@/server/db/neon.server";

type RunRow = AgentRunDetailMetadata & {
  subject_type: string;
  subject_id: string;
  created_by: string | null;
};

/** Caller requires agents.view first. Every page rechecks the current subject/actor verdict. */
export async function loadAgentRunDetail(
  input: AgentRunDetailInput,
  context: RequestAuthorization,
  rows: RowAuthorizer,
): Promise<AgentRunDetailRead> {
  const actorId = context.actor.profileId;
  const unavailable = { available: false as const, actorId };
  if (context.actor.status !== "active") return unavailable;
  const run = await queryOne<RunRow>(
    `select id,agent_name,workflow_type,status,trigger_type,created_at,updated_at,
            duration_ms,model_used,outcome_code,attempt_id,subject_type,subject_id,created_by
     from agent_runs where id=$1`,
    [input.runId],
  );
  if (!run) return unavailable;
  const allowed =
    run.workflow_type === "note_tidy"
      ? run.subject_type === "note" && run.created_by === actorId
      : (await decideAgentSubjects(rows, [run]))(run.subject_type, run.subject_id);
  // The same data-free result for a missing, unknown-subject or inaccessible run. No trace
  // query (including count/cursor metadata) is permitted before this verdict.
  if (!allowed) return unavailable;
  const found = await query<AgentTraceEvent>(
    `select c.id,c.tool_name,c.source,c.status,c.duration_ms,c.error_code,c.args_digest,c.args_keys,
            to_char(c.called_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as called_at
     from agent_tool_calls c
     where c.agent_run_id=$1
       ${input.cursor ? "and (c.called_at,c.id)<($2::timestamptz,$3::uuid)" : ""}
     order by c.called_at desc,c.id desc limit $${input.cursor ? 4 : 2}`,
    input.cursor
      ? [run.id, input.cursor.calledAt, input.cursor.id, AGENT_TRACE_PAGE_SIZE + 1]
      : [run.id, AGENT_TRACE_PAGE_SIZE + 1],
  );
  const events = found.slice(0, AGENT_TRACE_PAGE_SIZE).map(
    (event): AgentTraceEvent => ({
      id: event.id,
      called_at: event.called_at,
      tool_name: event.tool_name,
      source: event.source,
      status: event.status,
      duration_ms: event.duration_ms,
      error_code: event.error_code,
      args_digest: event.args_digest,
      args_keys: event.args_keys,
    }),
  );
  const last = events.at(-1);
  // Strip all ownership inputs rather than spreading a database row into the response.
  const metadata: AgentRunDetailMetadata = {
    id: run.id,
    agent_name: run.agent_name,
    workflow_type: run.workflow_type,
    status: run.status,
    trigger_type: run.trigger_type,
    created_at: run.created_at,
    updated_at: run.updated_at,
    duration_ms: run.duration_ms,
    model_used: run.model_used,
    outcome_code: run.outcome_code,
    attempt_id: run.attempt_id,
  };
  return {
    available: true,
    actorId,
    run: metadata,
    events,
    nextCursor:
      found.length > AGENT_TRACE_PAGE_SIZE && last
        ? { calledAt: last.called_at, id: last.id }
        : null,
  };
}

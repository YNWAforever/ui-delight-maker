import { createHash } from "node:crypto";
import { z } from "zod";
import { agentQueueSchema } from "@/lib/agent-queue-input";
import { OperationError, parseOperationInput } from "@/lib/operations/errors";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { decideAgentSubjects } from "@/lib/agent-run-visibility";
import { serializeHumanApproval } from "@/lib/serializable";
import type { HumanApproval } from "@/lib/types";
import { query } from "@/server/db/neon.server";
import type { RequestAuthorization, RowAuthorizer } from "@/server/auth/authorization.server";
import {
  buildSubjectVisibility,
  buildVisibilityScope,
} from "@/server/auth/visibility-scope.server";
import {
  redactDirectoryRun,
  type AgentRunSummary,
  type AiReviewApproval,
} from "./agent-workspaces";
const shift = (sql: string, offset: number) =>
  sql.replace(/\$(\d+)/g, (_, index: string) => "$" + (Number(index) + offset));
const cursorSchema = z
  .object({
    v: z.literal(1),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
    asOf: z.string().datetime(),
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict();
const demo =
  "case when r.input_data->'demo'='true'::jsonb then true when r.input_data->'demo'='false'::jsonb then false else null end";
type ApprovalRow = HumanApproval & {
  subject_type: string | null;
  subject_id: string | null;
  is_demo: boolean | null;
};
/** Counts and pages use exactly the same parameterized authorization/filter predicate. */
export async function loadAgentQueue(
  rawInput: unknown,
  context: RequestAuthorization,
  rows: RowAuthorizer,
) {
  const input = parseOperationInput(agentQueueSchema, rawInput);
  const { cursor: cursorText, ...filters } = input;
  const order = input.queue === "approvals" ? "asc" : "desc",
    alias = input.queue === "approvals" ? "a" : "r";
  const signature = createHash("sha256")
    .update(JSON.stringify({ actor: context.actor.profileId, filters, order }))
    .digest("hex");
  let after: z.infer<typeof cursorSchema> | null = null;
  if (cursorText) {
    try {
      after = cursorSchema.parse(JSON.parse(Buffer.from(cursorText, "base64url").toString("utf8")));
      if (after.signature !== signature || Date.parse(after.asOf) > context.now.getTime())
        throw new Error("Cursor mismatch");
    } catch {
      throw new OperationError(
        "INVALID_INPUT",
        "Queue cursor does not match this query. Refresh the queue.",
      );
    }
  }
  const asOf = after?.asOf ?? context.now.toISOString(),
    values: unknown[] = [],
    clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return "$" + values.length;
  };
  const appendScope = (scope: { sql: string; values: readonly unknown[] }) => {
    const sql = shift(scope.sql, values.length);
    values.push(...scope.values);
    return sql;
  };
  if (input.queue === "approvals")
    clauses.push(appendScope(buildVisibilityScope(context, "human_approval", "a")));
  else {
    const visibleSubjects = [
      appendScope(buildSubjectVisibility(context, "r", "subject_type", "subject_id", "membership")),
    ];
    // The common polymorphic builder covers lead/quote/client/task/approval. Add the three
    // other real run subjects here with the same established scope builder.
    for (const { type, table, name } of [
      { type: "account", table: "accounts", name: "aq" },
      { type: "campaign", table: "campaigns", name: "cq" },
      { type: "engagement", table: "engagements", name: "eq" },
    ]) {
      const scope = appendScope(
        buildVisibilityScope(context, type, name, { overrideFormat: "arrays" }),
      );
      visibleSubjects.push(
        `(r.subject_type='${type}' and r.subject_id in (select ${name}.id from ${table} ${name} where ${scope}))`,
      );
    }
    visibleSubjects.push(
      `(r.subject_type='note' and r.workflow_type='note_tidy' and r.created_by=${bind(context.actor.profileId)})`,
    );
    clauses.push(
      `${bind(context.actor.status === "active")}::boolean and (${visibleSubjects.join(" or ")})`,
    );
  }
  clauses.push(`${alias}.created_at<=${bind(asOf)}::timestamptz`);
  if (input.workflowType === "unknown")
    clauses.push(
      `coalesce(r.workflow_type,'')<>all(${bind([...AGENT_DEFINITIONS.map((a) => a.workflow_type), "note_tidy"])}::text[])`,
    );
  else if (input.workflowType) clauses.push(`r.workflow_type=${bind(input.workflowType)}`);
  if (input.runId) clauses.push(`r.id=${bind(input.runId)}::uuid`);
  if (input.status) clauses.push(`${alias}.status=${bind(input.status)}`);
  else if (input.queue === "approvals") clauses.push("a.status in ('pending','escalated')");
  if (input.attention && input.queue === "runs")
    clauses.push(
      `(r.status='waiting_approval' or (r.status='failed' and r.created_at>=${bind(asOf)}::timestamptz-interval '7 days') or (r.status='running' and r.created_at<=${bind(asOf)}::timestamptz-interval '60 minutes'))`,
    );
  if (input.from) clauses.push(`${alias}.created_at>=${bind(input.from)}::timestamptz`);
  if (input.to) clauses.push(`${alias}.created_at<=${bind(input.to)}::timestamptz`);
  if (input.origin !== "all")
    clauses.push(
      input.origin === "unknown"
        ? `(${demo}) is null`
        : `(${demo})=${input.origin === "demo" ? "true" : "false"}`,
    );
  const from =
    input.queue === "approvals"
      ? "human_approvals a left join agent_runs r on r.id=a.agent_run_id"
      : "agent_runs r";
  const where = clauses.join(" and ");
  const counted = await query<{ count: string }>(
    `select count(*)::text as count from ${from} where ${where}`,
    values,
  );
  const totalMatching = Number(counted[0]?.count ?? 0);
  const pageClauses = [...clauses];
  if (after)
    pageClauses.push(
      `(${alias}.created_at,${alias}.id) ${order === "asc" ? ">" : "<"} (${bind(after.createdAt)}::timestamptz,${bind(after.id)}::uuid)`,
    );
  const pageLimit = bind(input.limit + 1);
  const timestamp = `to_char(${alias}.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at`;
  const runColumns = `r.id,r.agent_name,r.workflow_type,r.trigger_type,r.subject_type,r.subject_id,r.output_summary,r.status,r.duration_ms,r.tokens_used,r.usage_data,r.execution_metadata,r.confidence_score,r.human_review_required,r.updated_at,${timestamp},${demo} as is_demo`;
  const approvalColumns = `a.id,a.agent_run_id,a.approval_type,a.requested_by,a.assigned_to,a.status,a.row_version,a.context_data,a.context_summary,a.reviewer_notes,a.decided_at,r.subject_type,r.subject_id,${timestamp},${demo} as is_demo`;
  const found = await query<AgentRunSummary | ApprovalRow>(
    `select ${input.queue === "runs" ? runColumns : approvalColumns} from ${from} where ${pageClauses.join(" and ")} order by ${alias}.created_at ${order},${alias}.id ${order} limit ${pageLimit}`,
    values,
  );
  const page = found.slice(0, input.limit),
    last = page.at(-1);
  const nextCursor =
    found.length > input.limit && last
      ? Buffer.from(
          JSON.stringify({ v: 1, signature, asOf, createdAt: last.created_at, id: last.id }),
        ).toString("base64url")
      : null;
  const decide = await decideAgentSubjects(
    rows,
    page.filter(
      (r): r is typeof r & { subject_type: string; subject_id: string } =>
        !!r.subject_type && !!r.subject_id,
    ),
  );
  const common = { totalMatching, nextCursor, asOf, limit: input.limit };
  if (input.queue === "approvals")
    return {
      ...common,
      queue: "approvals" as const,
      items: (page as ApprovalRow[]).map((row): AiReviewApproval => {
        const { subject_type, subject_id, ...approval } = row;
        const allowed = !!subject_type && !!subject_id && decide(subject_type, subject_id);
        return {
          ...serializeHumanApproval(
            allowed
              ? approval
              : { ...approval, context_data: null, context_summary: null, reviewer_notes: null },
          ),
          subject_restricted: !allowed,
        };
      }),
    };
  return {
    ...common,
    queue: "runs" as const,
    items: (page as AgentRunSummary[]).map((run) => redactDirectoryRun(run, decide)),
  };
}

/** Linked run summaries for one approval page; one query and one batched authorization. */
export async function loadAiReviewQueueRead(
  rawInput: unknown,
  context: RequestAuthorization,
  rows: RowAuthorizer,
) {
  const input = parseOperationInput(agentQueueSchema, {
    ...((rawInput as Record<string, unknown>) ?? {}),
    queue: "approvals",
  });
  const page = await loadAgentQueue(input, context, rows);
  if (page.queue !== "approvals") throw new Error("Approval queue required");
  const ids = [
    ...new Set(page.items.map((a) => a.agent_run_id).filter((id): id is string => !!id)),
  ];
  const runs = ids.length
    ? await query<AgentRunSummary>(
        `select id,agent_name,workflow_type,trigger_type,subject_type,subject_id,output_summary,status,duration_ms,tokens_used,confidence_score,human_review_required,created_at,updated_at,${demo} as is_demo from agent_runs r where id=any($1::uuid[])`,
        [ids],
      )
    : [];
  const decide = await decideAgentSubjects(rows, runs);
  return {
    approvals: page.items,
    humanReviewRuns: runs.map((r) => redactDirectoryRun(r, decide)),
    pagination: {
      totalMatching: page.totalMatching,
      nextCursor: page.nextCursor,
      asOf: page.asOf,
      limit: page.limit,
    },
  };
}

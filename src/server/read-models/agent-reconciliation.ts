import { AGENT_DEFINITIONS, AUXILIARY_AI_WORKFLOW_TYPES } from "../../lib/agents";

export type ReconciliationRow = {
  run_id: string;
  workflow_type: string;
  legacy_name: string;
  status: string;
  is_demo: boolean | null;
  subject_exists: boolean | null;
  approval_statuses: string[];
  human_review_required: boolean;
  created_by: string | null;
  outcome_code: string | null;
};
type Anomaly =
  | "valid"
  | "demo"
  | "missing_subject"
  | "missing_approval"
  | "escalated"
  | "terminal_mismatch"
  | "unknown";
export type AgentReconciliationItem = {
  runId: string;
  workflowType: string;
  legacyName: string;
  isDemo: boolean | null;
  subjectExists: boolean | null;
  approvalStatus: string | null;
  anomalyCodes: Anomaly[];
  suggestedOwner: string | null;
};
export type ReconciliationQuery = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export function classifyAgentRun(row: ReconciliationRow): AgentReconciliationItem {
  const anomalyCodes: Anomaly[] = [];
  const statuses = row.approval_statuses ?? [];
  const open = statuses.some((status) => status === "pending" || status === "escalated");
  if (row.is_demo === true) anomalyCodes.push("demo");
  if (row.subject_exists === false) anomalyCodes.push("missing_subject");
  if (row.status === "waiting_approval" && statuses.length === 0)
    anomalyCodes.push("missing_approval");
  if (statuses.includes("escalated")) anomalyCodes.push("escalated");
  if (
    statuses.length > 1 ||
    (open && ["completed", "failed"].includes(row.status)) ||
    (row.status === "waiting_approval" && statuses.length > 0 && !open)
  )
    anomalyCodes.push("terminal_mismatch");
  const knownWorkflow =
    AGENT_DEFINITIONS.some((agent) => agent.workflow_type === row.workflow_type) ||
    (AUXILIARY_AI_WORKFLOW_TYPES as readonly string[]).includes(row.workflow_type);
  if (
    !knownWorkflow ||
    row.subject_exists == null ||
    !["running", "waiting_approval", "completed", "failed"].includes(row.status) ||
    statuses.some((status) => !["pending", "escalated", "approved", "rejected"].includes(status))
  )
    anomalyCodes.push("unknown");
  return {
    runId: row.run_id,
    workflowType: row.workflow_type,
    legacyName: row.legacy_name,
    isDemo: row.is_demo ?? null,
    subjectExists: row.subject_exists ?? null,
    approvalStatus: statuses.length === 0 ? null : statuses.join(","),
    anomalyCodes: anomalyCodes.length ? anomalyCodes : ["valid"],
    suggestedOwner: row.created_by ?? null,
  };
}

/** Metadata only. No prompts, summaries, commercial data, inferred dates or repair commands. */
export async function loadAgentReconciliation(db: ReconciliationQuery) {
  const { rows } = await db.query<ReconciliationRow>(`
    select r.id as run_id, r.workflow_type, r.agent_name as legacy_name, r.status,
      case when r.input_data -> 'demo' = 'true'::jsonb then true
           when r.input_data -> 'demo' = 'false'::jsonb then false else null end as is_demo,
      case r.subject_type
        when 'lead' then exists(select 1 from leads s where s.id = r.subject_id)
        when 'account' then exists(select 1 from accounts s where s.id = r.subject_id)
        when 'client' then exists(select 1 from clients s where s.id = r.subject_id)
        when 'campaign' then exists(select 1 from campaigns s where s.id = r.subject_id)
        when 'quote' then exists(select 1 from quotes s where s.id = r.subject_id)
        when 'engagement' then exists(select 1 from engagements s where s.id = r.subject_id)
        when 'task' then exists(select 1 from tasks s where s.id = r.subject_id)
        when 'approval' then exists(select 1 from human_approvals s where s.id = r.subject_id)
        else null end as subject_exists,
      array(select a.status from human_approvals a where a.agent_run_id = r.id order by a.created_at, a.id) as approval_statuses,
      r.human_review_required, r.created_by, r.outcome_code
    from agent_runs r order by r.created_at, r.id
  `);
  return rows.map(classifyAgentRun);
}

export async function withAgentReconciliationRead<T>(
  db: ReconciliationQuery,
  work: () => Promise<T>,
) {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout = '30s'");
    const { rows } = await db.query<{ read_only: string }>(
      "SELECT current_setting('transaction_read_only') AS read_only",
    );
    if (rows[0]?.read_only !== "on") throw new Error("Read-only reconciliation required");
    return await work();
  } finally {
    await db.query("ROLLBACK");
  }
}

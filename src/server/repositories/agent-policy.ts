import { query, queryOne } from "@/server/db/neon.server";
import { AGENT_DEFINITIONS, type AgentPolicy, type AgentWorkflowType } from "@/lib/agents";

type PolicyRow = {
  workflow_type: string;
  status: "active" | "inactive";
  human_approval: boolean;
};

/** The full row shape `insert ... returning *` yields, matching migration 009's columns. */
type AgentPolicyVersionRow = {
  id: string;
  workflow_type: string;
  status: "active" | "inactive";
  human_approval: boolean;
  changed_by: string;
  reason: string | null;
  created_at: string;
  version_seq: string;
};

/**
 * The effective policy for every agent: stored overrides laid over the code catalogue.
 *
 * A workflow with no row uses its `AGENT_DEFINITIONS` value, so an empty table behaves
 * exactly as the code did before this table existed. That is why there is no seed
 * migration — absence is a meaningful state, not an unfinished one.
 *
 * `distinct on` takes the newest row per workflow in one pass, which keeps this to a
 * single query on a dispatch path that already loads an authorization context.
 */
export async function loadAgentPolicies(): Promise<Map<AgentWorkflowType, AgentPolicy>> {
  const rows = await query<PolicyRow>(
    `
      select distinct on (workflow_type) workflow_type, status, human_approval
        from agent_policy_versions
       -- created_at is the real ordering: the newest policy change governs. version_seq is
       -- only a tiebreak — rows written in the same transaction share a created_at, because
       -- Postgres's now() is transaction-start time, not statement time. version_seq is a
       -- generated identity column, so it is strictly increasing and resolves that tie to
       -- true insertion order. Do not put it ahead of created_at.
       --
       -- Deleting this third key would not currently change any observed result, which is
       -- exactly why it must stay. agent_policy_versions_current_idx is a btree on
       -- (workflow_type, created_at desc, version_seq desc), and a btree scan returns rows
       -- in full index-key order however few of those keys the ORDER BY names - so the
       -- index supplies the tiebreak today whether or not this clause asks for it. The
       -- clause is the guarantee; the index is an implementation detail that agrees with
       -- it. Drop the index, or let the planner choose a seq scan, and this clause is all
       -- that stands between a same-created_at tie and a silently stale policy.
       order by workflow_type, created_at desc, version_seq desc
    `,
  );

  const known = new Set<string>(AGENT_DEFINITIONS.map((a) => a.workflow_type));
  const policies = new Map<AgentWorkflowType, AgentPolicy>();

  for (const agent of AGENT_DEFINITIONS) {
    policies.set(agent.workflow_type, {
      status: agent.status,
      humanApproval: agent.human_approval,
    });
  }

  for (const row of rows) {
    // A row for a workflow the catalogue no longer has is ignored, not fatal.
    if (!known.has(row.workflow_type)) {
      console.warn("Ignoring agent policy for unknown workflow", row.workflow_type);
      continue;
    }
    policies.set(row.workflow_type as AgentWorkflowType, {
      status: row.status,
      humanApproval: row.human_approval,
    });
  }

  return policies;
}

/**
 * Append a policy version. Never updates, never deletes.
 *
 * A mistaken change is corrected by appending a corrected version; the mistake stays in
 * the history. That is the difference between an audit log and a settings row.
 */
export async function setAgentPolicy(input: {
  workflowType: AgentWorkflowType;
  status: "active" | "inactive";
  humanApproval: boolean;
  reason?: string | null;
  changedBy: string;
}): Promise<AgentPolicyVersionRow | null> {
  const known = AGENT_DEFINITIONS.some((a) => a.workflow_type === input.workflowType);
  if (!known) throw new Error(`No agent definition for workflow type "${input.workflowType}"`);

  return queryOne<AgentPolicyVersionRow>(
    `
      insert into agent_policy_versions
        (workflow_type, status, human_approval, changed_by, reason)
      values ($1, $2, $3, $4, nullif($5, ''))
      returning *
    `,
    [input.workflowType, input.status, input.humanApproval, input.changedBy, input.reason ?? ""],
  );
}

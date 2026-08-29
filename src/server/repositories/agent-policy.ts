import { query } from "@/server/db/neon.server";
import { AGENT_DEFINITIONS, type AgentWorkflowType } from "@/lib/agents";

export type AgentPolicy = { status: "active" | "inactive"; humanApproval: boolean };

type PolicyRow = {
  workflow_type: string;
  status: "active" | "inactive";
  human_approval: boolean;
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
       -- true insertion order. Do not drop it and do not put it ahead of created_at.
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

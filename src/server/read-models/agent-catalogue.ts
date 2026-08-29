import { AGENT_DEFINITIONS, type AgentDefinition } from "@/lib/agents";
import { loadAgentPolicies } from "@/server/repositories/agent-policy";

/**
 * The agent catalogue as it actually governs: code definitions with `status` and
 * `human_approval` replaced by stored policy.
 *
 * This exists because those two fields stopped being catalogue facts when the policy store
 * shipped. A route that reads `AGENT_DEFINITIONS` directly renders what the code says, not what
 * the dispatch path obeys - so pausing an agent left three pages still showing "Active". Nothing
 * yet stops a route importing `AGENT_DEFINITIONS` directly instead of calling this - that guard
 * is a later slice - so this is the correct source for status and human_approval today, not yet
 * the only one a route can reach.
 *
 * Every other field comes through untouched. Only these two are policy; the rest are identity
 * or descriptive prose, and `display_name` in particular must keep equalling
 * `agent_runs.agent_name` or `ai-review.tsx` loses its mapping to historical runs.
 *
 * One query - the same one every dispatch site already runs.
 */
export async function loadEffectiveAgentCatalogue(): Promise<AgentDefinition[]> {
  const policies = await loadAgentPolicies();

  // A new object per agent: AGENT_DEFINITIONS is module-level and shared, so merging in place
  // would leak one request's override into every later reader in the process.
  return AGENT_DEFINITIONS.map((agent) => {
    const policy = policies.get(agent.workflow_type);
    if (!policy) return { ...agent };
    return { ...agent, status: policy.status, human_approval: policy.humanApproval };
  });
}

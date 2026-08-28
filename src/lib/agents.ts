/**
 * The agents this product can actually dispatch.
 *
 * `workflow_type` is the identity, not a label. It is the value the `agent_runs` check
 * constraint enumerates (`neon/migrations/003_client_relationship_360.sql`), the suffix of the
 * inbound writeback route (`/api/workflows/<slug>`), and what the n8n webhook env var is named
 * after. `__tests__/agents-catalogue.test.ts` asserts this list against the migration, so an
 * agent cannot exist in one place and not the other.
 *
 * `display_name` MUST equal the `agent_name` the dispatch path writes into `agent_runs` — that
 * is the column the Agents directory and every agent's run history join on. It drifted once,
 * and because nothing checked it the whole Agents section read zero: four cards showing "0
 * runs" and four permanently empty history pages, sitting next to a Recent Runs list naming
 * five agents that had just run. Dispatch now takes the name from `agentNameFor` rather than
 * repeating a literal, so the two cannot diverge again.
 */
export type AgentWorkflowType =
  | "qualify_lead"
  | "draft_reply"
  | "draft_quote"
  | "score_renewal_risk"
  | "relationship_intelligence";

export interface AgentDefinition {
  id: string;
  /** URL slug — the `$name` param of /agents/$name. */
  name: string;
  /** Must equal the `agent_runs.agent_name` written by the dispatch path. */
  display_name: string;
  /** Identity. One of the agent_runs workflow_type check constraint values. */
  workflow_type: AgentWorkflowType;
  description: string;
  status: "active" | "inactive";
  capabilities: readonly string[];
  role: string;
  model: string;
  /** True when a completed run can land in `waiting_approval` for a human to decide. */
  human_approval: boolean;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "qualify-lead",
    name: "qualify-lead",
    display_name: "Lead Qualification Agent",
    workflow_type: "qualify_lead",
    description: "Scores and qualifies leads using ICP criteria and conversation analysis",
    status: "active",
    capabilities: [
      "ICP scoring",
      "Budget detection",
      "Timeline analysis",
      "Decision maker identification",
    ],
    role: "qualification",
    model: "claude-sonnet-4-6",
    // writeQualificationResult completes the run outright; the score is advisory.
    human_approval: false,
  },
  {
    id: "draft-reply",
    name: "draft-reply",
    display_name: "Reply Draft Agent",
    workflow_type: "draft_reply",
    description: "Drafts a reply to an inbound lead for a salesperson to review and send",
    status: "active",
    capabilities: [
      "Thread summarisation",
      "Tone matching",
      "Next-step suggestion",
      "Draft generation",
    ],
    role: "sales_reply",
    model: "claude-sonnet-4-6",
    // writeReplyDraftResult always parks the run in waiting_approval — nothing is sent
    // without a human.
    human_approval: true,
  },
  {
    id: "draft-quote",
    name: "draft-quote",
    display_name: "Quote Draft Agent",
    workflow_type: "draft_quote",
    description: "Generates a customised quote from client requirements and pricing rules",
    status: "active",
    capabilities: [
      "Pricing calculation",
      "Template selection",
      "Discount rules",
      "Proposal generation",
    ],
    role: "quotation",
    model: "claude-sonnet-4-6",
    // writeQuoteDraftResult raises an approval when the draft needs one.
    human_approval: true,
  },
  {
    id: "score-renewal-risk",
    name: "score-renewal-risk",
    display_name: "Renewal Risk Agent",
    workflow_type: "score_renewal_risk",
    description: "Scores renewal risk for an engagement, on demand or from the retention sweep",
    status: "active",
    capabilities: [
      "Health score analysis",
      "Touchpoint recency",
      "Risk band assignment",
      "Scheduled sweeps",
    ],
    role: "client_success",
    model: "claude-sonnet-4-6",
    // writeScoreRenewalRiskResult asks for approval only when it raises risk to high.
    human_approval: true,
  },
  {
    id: "relationship-intelligence",
    name: "relationship-intelligence",
    display_name: "Relationship Intelligence Agent",
    workflow_type: "relationship_intelligence",
    description: "Surfaces relationship signals and suggested actions for an account",
    status: "active",
    capabilities: [
      "Signal detection",
      "Stakeholder coverage",
      "Suggested actions",
      "Account summarisation",
    ],
    role: "intelligence",
    model: "claude-sonnet-4-6",
    human_approval: false,
  },
];

export const agentByName = (name: string): AgentDefinition | undefined =>
  AGENT_DEFINITIONS.find((a) => a.name === name);

/**
 * The `agent_name` to record for a workflow. Dispatch paths call this instead of repeating a
 * string literal — repeating it is what let the catalogue and the runs table drift apart.
 */
export function agentNameFor(workflowType: AgentWorkflowType): string {
  const agent = AGENT_DEFINITIONS.find((a) => a.workflow_type === workflowType);
  if (!agent) throw new Error(`No agent definition for workflow type "${workflowType}"`);
  return agent.display_name;
}

export type DispatchableAgent =
  | { dispatchable: true; agent: AgentDefinition }
  | { dispatchable: false; reason: "agent_inactive" };

/**
 * Whether this workflow's agent may be dispatched, and its definition if so.
 *
 * `agentNameFor` returns a string and so cannot carry a refusal, which is why this is a
 * sibling rather than a change to it. Until this existed, `status` was inert: deactivating
 * an agent changed the badge on `/agents/$name` and stopped nothing, while that page
 * described the catalogue as "the values the dispatch path reads".
 *
 * The refusal is named after the state it reports: `status` is `"active" | "inactive"` and
 * the badge renders "Inactive", so the sentinel says `agent_inactive` and nothing else.
 *
 * The second parameter exists for tests. Every catalogue entry is `active` today, so
 * without it the refusal path could not be exercised until the day it first mattered.
 */
export function resolveDispatchableAgent(
  workflowType: AgentWorkflowType,
  catalogue: AgentDefinition[] = AGENT_DEFINITIONS,
): DispatchableAgent {
  const agent = catalogue.find((a) => a.workflow_type === workflowType);
  if (!agent) throw new Error(`No agent definition for workflow type "${workflowType}"`);
  if (agent.status !== "active") return { dispatchable: false, reason: "agent_inactive" };
  return { dispatchable: true, agent };
}

/**
 * How long a run may sit in `running` before it reads as stuck.
 *
 * `agent_runs.status` has four values (`neon/migrations/001_clientops_runtime.sql:111`) and
 * none of them is "stuck" — a dispatch that never calls back simply stays `running` forever.
 * "Stuck" is therefore a *derived* state, exactly like `Stuck`, `At risk` and `Overdue` in
 * `src/lib/status-labels.ts`, and it is defined here so the SQL that counts stuck runs and
 * the UI that lists them cannot disagree about the threshold.
 *
 * Sixty minutes: every workflow in `n8n/workflows/` is a single model call plus a writeback,
 * so an hour is well past any legitimate completion and short enough that a wedged run is
 * noticed the same working day.
 */
export const AGENT_RUN_STUCK_MINUTES = 60;

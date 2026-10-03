import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import { AGENT_DEFINITIONS, type AgentPolicy, type AgentWorkflowType } from "@/lib/agents";
import { AdminError } from "@/lib/admin/errors";
import {
  agentPolicyCursorSchema,
  type AgentPolicyChangeInput,
  type AgentPolicyRollbackInput,
  type AgentPolicyHistoryInput,
} from "@/lib/agent-policy-input";

type PolicyRow = {
  workflow_type: string;
  status: "active" | "inactive";
  human_approval: boolean;
};

/** The full row shape `insert ... returning *` yields, matching migration 009's columns. */
export type AgentPolicyVersionRow = {
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
export async function setAgentPolicy(
  input: {
    workflowType: AgentWorkflowType;
    status: "active" | "inactive";
    humanApproval: boolean;
    reason?: string | null;
    changedBy: string;
  },
  db?: Queryable,
): Promise<AgentPolicyVersionRow | null> {
  const known = AGENT_DEFINITIONS.some((a) => a.workflow_type === input.workflowType);
  if (!known) throw new Error(`No agent definition for workflow type "${input.workflowType}"`);

  return queryOne<AgentPolicyVersionRow>(
    `
      insert into agent_policy_versions
        (workflow_type, status, human_approval, changed_by, reason, created_at)
      values ($1, $2, $3, $4, nullif($5, ''), clock_timestamp())
      returning *
    `,
    [input.workflowType, input.status, input.humanApproval, input.changedBy, input.reason ?? ""],
    db,
  );
}

function defaultPolicy(workflowType: AgentWorkflowType): AgentPolicy {
  const definition = AGENT_DEFINITIONS.find((agent) => agent.workflow_type === workflowType);
  if (!definition) throw new AdminError("VALIDATION_FAILED", "Unknown governed workflow");
  return { status: definition.status, humanApproval: definition.human_approval };
}

const versionColumns = `id,workflow_type,status,human_approval,changed_by,reason,
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
  version_seq::text`;

/** One workflow lock covers the empty-table race as well as existing-version CAS. */
async function appendStatusVersion(
  input: (AgentPolicyChangeInput | AgentPolicyRollbackInput) & { changedBy: string },
) {
  return transaction(async (db) => {
    await db.query(
      "select pg_advisory_xact_lock(hashtextextended('clientops-agent-policy:' || $1::text,0))",
      [input.workflowType],
    );
    const current = await queryOne<AgentPolicyVersionRow>(
      `select ${versionColumns} from agent_policy_versions where workflow_type=$1 order by agent_policy_versions.created_at desc,agent_policy_versions.version_seq desc limit 1`,
      [input.workflowType],
      db,
    );
    if ((current?.id ?? null) !== input.expectedVersionId)
      throw new AdminError("CONFLICT", "Policy changed. Reload and review the current version.");
    const effective = current
      ? { status: current.status, humanApproval: current.human_approval }
      : defaultPolicy(input.workflowType);
    let status: "active" | "inactive";
    if ("versionId" in input) {
      const historical = await queryOne<Pick<AgentPolicyVersionRow, "status">>(
        "select status from agent_policy_versions where id=$1 and workflow_type=$2",
        [input.versionId, input.workflowType],
        db,
      );
      if (!historical)
        throw new AdminError(
          "CONFLICT",
          "Selected policy version is not available for this workflow.",
        );
      status = historical.status;
    } else status = input.status;
    // Approval comes from the effective row under lock, including rollback. Clock is read
    // after the lock: transaction-start timestamps must not backdate a queued writer.
    const appended = await setAgentPolicy(
      {
        workflowType: input.workflowType,
        status,
        humanApproval: effective.humanApproval,
        changedBy: input.changedBy,
        reason: input.reason,
      },
      db,
    );
    if (!appended) throw new Error("Policy version was not persisted");
    return {
      versionId: appended.id,
      status: appended.status,
      humanApproval: appended.human_approval,
    };
  });
}
export const setAgentPolicyStatus = (input: AgentPolicyChangeInput & { changedBy: string }) =>
  appendStatusVersion(input);
export const rollbackAgentPolicyStatus = (
  input: AgentPolicyRollbackInput & { changedBy: string },
) => appendStatusVersion(input);

/** Safe policy metadata only; preserve microseconds in both cursor ordering columns. */
export async function readAgentPolicyHistory(input: AgentPolicyHistoryInput) {
  let cursor: { createdAt: string; versionSeq: string } | null = null;
  if (input.cursor) {
    try {
      const decoded = agentPolicyCursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      );
      if (decoded.workflowType !== input.workflowType) throw new Error("Cursor workflow mismatch");
      cursor = decoded;
    } catch {
      throw new AdminError("VALIDATION_FAILED", "Invalid policy history cursor");
    }
  }
  return transaction(async (db) => {
    const current = await queryOne<AgentPolicyVersionRow>(
      `select ${versionColumns} from agent_policy_versions where workflow_type=$1 order by agent_policy_versions.created_at desc,agent_policy_versions.version_seq desc limit 1`,
      [input.workflowType],
      db,
    );
    const history = await query<AgentPolicyVersionRow>(
      `select ${versionColumns} from agent_policy_versions
      where workflow_type=$1 and ($2::timestamptz is null or (created_at,version_seq)<($2::timestamptz,$3::bigint))
      order by agent_policy_versions.created_at desc,agent_policy_versions.version_seq desc limit $4`,
      [input.workflowType, cursor?.createdAt ?? null, cursor?.versionSeq ?? null, input.limit + 1],
      db,
    );
    const items = history.slice(0, input.limit),
      last = items.at(-1);
    const nextCursor =
      history.length > input.limit && last
        ? Buffer.from(
            JSON.stringify({
              workflowType: input.workflowType,
              createdAt: last.created_at,
              versionSeq: last.version_seq,
            }),
          ).toString("base64url")
        : null;
    return {
      items,
      nextCursor,
      effectiveVersionId: current?.id ?? null,
      effectivePolicy: current
        ? { status: current.status, humanApproval: current.human_approval }
        : defaultPolicy(input.workflowType),
    };
  });
}

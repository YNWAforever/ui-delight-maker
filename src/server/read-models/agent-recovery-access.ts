import { evaluateAuthorization } from "@/lib/admin/policy";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import type { AgentRun } from "@/lib/types";
import type { RequestAuthorization, RowAuthorizer } from "@/server/auth/authorization.server";
import {
  NEON_OWNED_RESOURCE_TYPES,
  neonOwnershipQuery,
  type NeonOwnedResourceType,
} from "@/server/auth/resource-ownership";
import { query } from "@/server/db/neon.server";

type RecoveryRun = Pick<AgentRun, "id" | "subject_type" | "subject_id" | "status" | "created_at">;
export type AgentRecoveryAccess = { cancel: boolean; expire: boolean; retry: boolean };
type OpenApproval = { id: string; agent_run_id: string; assigned_to: string | null };

/** Read-only hints for one bounded history page. The command rechecks under its locks. */
export async function loadAgentRecoveryAccess(
  context: RequestAuthorization,
  runs: readonly RecoveryRun[],
  rows?: Pick<RowAuthorizer, "owners">,
): Promise<Map<string, AgentRecoveryAccess>> {
  const result = new Map<string, AgentRecoveryAccess>();
  const active = runs.filter(
    (run) => run.status === "running" || run.status === "waiting_approval",
  );
  for (const run of runs) result.set(run.id, { cancel: false, expire: false, retry: false });
  if (!active.length || context.actor.status !== "active") return result;

  const byType = new Map<NeonOwnedResourceType, Set<string>>();
  for (const run of active) {
    const type = run.subject_type as NeonOwnedResourceType;
    if (!NEON_OWNED_RESOURCE_TYPES.includes(type) || !run.subject_id) continue;
    const ids = byType.get(type) ?? new Set<string>();
    ids.add(run.subject_id);
    byType.set(type, ids);
  }
  const owners = new Map<string, string>();
  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      const facts = rows?.owners
        ? await rows.owners(type, [...ids])
        : new Map(
            (
              await query<{ id: string; owner_profile_id: string | null }>(
                neonOwnershipQuery(type),
                [[...ids]],
              )
            ).map((row) => [row.id, row.owner_profile_id]),
          );
      for (const [id, owner] of facts) {
        if (owner) owners.set(`${type}:${id}`, owner);
      }
    }),
  );
  const approvals = await query<OpenApproval>(
    `select id, agent_run_id, assigned_to from human_approvals
     where agent_run_id = any($1::uuid[]) and status in ('pending','escalated')`,
    [active.map((run) => run.id)],
  );
  const byRun = new Map<string, OpenApproval[]>();
  for (const approval of approvals) {
    const linked = byRun.get(approval.agent_run_id) ?? [];
    linked.push(approval);
    byRun.set(approval.agent_run_id, linked);
  }
  const now = new Date();
  for (const run of active) {
    const owner = owners.get(`${run.subject_type}:${run.subject_id}`);
    const linked = byRun.get(run.id) ?? [];
    if (!owner || linked.length > 1 || (linked.length && run.status !== "waiting_approval"))
      continue;
    const permitted = evaluateAuthorization({
      actor: context.actor,
      capability: "agents.run",
      target: { resourceType: run.subject_type, resourceId: run.subject_id, ownerProfileId: owner },
      overrides: context.overrides,
      now,
    }).allowed;
    if (!permitted) continue;
    const approval = linked[0];
    if (
      approval &&
      !evaluateAuthorization({
        actor: context.actor,
        capability: "approvals.decide",
        target: {
          resourceType: "human_approval",
          resourceId: approval.id,
          ownerProfileId: approval.assigned_to ?? owner,
        },
        overrides: context.overrides,
        now,
      }).allowed
    )
      continue;
    const oldEnough =
      now.getTime() - new Date(run.created_at).getTime() >= AGENT_RUN_STUCK_MINUTES * 60_000;
    result.set(run.id, { cancel: true, expire: oldEnough, retry: oldEnough && !approval });
  }
  return result;
}

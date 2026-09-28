import { evaluateAuthorization } from "@/lib/admin/policy";
import type { Capability, UserRole } from "@/lib/admin/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { Queryable } from "@/server/db/neon.server";

type ResourceType = "lead" | "client" | "account" | "account_contact" | "campaign";
export type ImportWriteEffect = {
  capability: Capability;
  resource?: { type: ResourceType; id: string };
};
export type ImportRowPlan = { effects: readonly ImportWriteEffect[] };
export type RowAuthorizationResult =
  | { allowed: true }
  | {
      allowed: false;
      reasonCode: "actor_inactive" | "actor_changed" | "target_missing" | "capability_denied";
    };

// The relation and owner columns are fixed here; CSV data cannot supply SQL identifiers.
const OWNER_LOOKUP: Record<ResourceType, string> = {
  lead: "select assigned_to as owner_profile_id from leads where id = $1 for share",
  client: "select account_owner as owner_profile_id from clients where id = $1 for share",
  account: "select account_owner as owner_profile_id from accounts where id = $1 for share",
  account_contact:
    "select a.account_owner as owner_profile_id from account_contacts c join accounts a on a.id = c.account_id where c.id = $1 for share of c, a",
  campaign: "select owner as owner_profile_id from campaigns where id = $1 for share",
};

/** Evaluate every planned side effect against the locked, current database target. */
export async function authorizeImportRow(
  ctx: RequestAuthorization,
  rowPlan: ImportRowPlan,
  db: Queryable,
): Promise<RowAuthorizationResult> {
  const actor = (
    await db.query<{ role: UserRole; status: string }>(
      "select role, status from profiles where id = $1 for share",
      [ctx.actor.profileId],
    )
  ).rows[0];
  if (!actor || actor.status !== "active") return { allowed: false, reasonCode: "actor_inactive" };
  if (actor.role !== ctx.actor.role) return { allowed: false, reasonCode: "actor_changed" };

  for (const effect of rowPlan.effects) {
    let target = {};
    if (effect.resource) {
      const owner = (
        await db.query<{ owner_profile_id: string | null }>(OWNER_LOOKUP[effect.resource.type], [
          effect.resource.id,
        ])
      ).rows[0];
      if (!owner) return { allowed: false, reasonCode: "target_missing" };
      target = {
        resourceType: effect.resource.type,
        resourceId: effect.resource.id,
        ...(owner.owner_profile_id ? { ownerProfileId: owner.owner_profile_id } : {}),
      };
    }
    const decision = evaluateAuthorization({
      actor: ctx.actor,
      capability: effect.capability,
      target,
      overrides: ctx.overrides,
      now: new Date(),
    });
    if (!decision.allowed) return { allowed: false, reasonCode: "capability_denied" };
  }
  return { allowed: true };
}

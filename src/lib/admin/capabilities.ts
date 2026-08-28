import { CAPABILITIES } from "./types";
import type { ActorAccessContext, Capability, PermissionOverride } from "./types";
import { evaluateAuthorization } from "./policy";

/**
 * What this actor may do INDEPENDENT OF ANY TARGET.
 *
 * Derived through the same `evaluateAuthorization` the server enforces with, so role
 * grants, active overrides, expiry and the inactive-actor rule all come along for free
 * and the two cannot disagree.
 *
 * This answers "could this actor ever do X?", not "can they do X to this record?".
 * `managerCanTarget` passes on an empty target by design — policy.ts documents that the
 * empty-checks pass exists for target-less list reads — so a manager's set contains
 * `leads.update` while the server may still deny them a specific lead outside their
 * scope. The set is therefore PERMISSIVE relative to some real targets: safe for
 * enabling a control, wrong for authorising an action.
 *
 * This is the only client-side answer to "may this actor do X". `admin/control-access.ts`
 * consumes it to decide which admin write controls to offer; it used to read `ROLE_GRANTS`
 * directly and so could hide a control from someone holding an override for it.
 */
export function effectiveCapabilities(
  actor: ActorAccessContext,
  overrides: readonly PermissionOverride[],
  now?: Date,
): readonly Capability[] {
  return CAPABILITIES.filter(
    (capability) =>
      evaluateAuthorization({ actor, capability, target: {}, overrides, now }).allowed,
  );
}

/**
 * Deliberately takes no target. There is nothing to pass, so there is no way to mistake
 * this for a per-record decision — that one belongs to the server.
 */
export function hasCapability(
  capabilities: readonly Capability[],
  capability: Capability,
): boolean {
  return capabilities.includes(capability);
}

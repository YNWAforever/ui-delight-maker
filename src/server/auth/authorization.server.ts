import { effectiveCapabilities } from "@/lib/admin/capabilities";
import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type {
  ActorAccessContext,
  AuthorizationDecision,
  AuthorizationTarget,
  Capability,
  PermissionOverride,
} from "@/lib/admin/types";
import { requireNeonAuthSession, type AppSession } from "@/lib/auth/neon-auth.server";
import { resolveOwnerProfileId } from "@/server/auth/resource-ownership";
import { query } from "@/server/db/neon.server";

type IdRow = { id: string };

type PermissionOverrideRow = {
  profile_id: string;
  capability: Capability;
  effect: "allow" | "deny";
  department_id: string | null;
  team_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type CapabilityCheck = {
  capability: Capability;
  target?: AuthorizationTarget;
};

type AuthorizationContext = {
  session: AppSession;
  actor: ActorAccessContext;
  overrides: PermissionOverride[];
};

async function loadAuthorizationContext(): Promise<AuthorizationContext> {
  const session = await requireNeonAuthSession();
  const actorId = session.profile.id;
  const [departments, teams, reports, overrideRows] = await Promise.all([
    query<IdRow>(
      `
        select id
        from departments
        where status = 'active'
          and (head_profile_id = $1 or deputy_profile_id = $1)
      `,
      [actorId],
    ),
    query<IdRow>(
      `
        select id
        from teams
        where status = 'active'
          and (lead_profile_id = $1 or deputy_profile_id = $1)
      `,
      [actorId],
    ),
    query<IdRow>(
      `
        select id
        from profiles
        where manager_profile_id = $1
      `,
      [actorId],
    ),
    query<PermissionOverrideRow>(
      `
        select
          profile_id, capability, effect, department_id, team_id,
          resource_type, resource_id, expires_at, revoked_at
        from permission_overrides
        where profile_id = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
      `,
      [actorId],
    ),
  ]);

  return {
    session,
    actor: {
      profileId: actorId,
      role: session.profile.role,
      status: session.profile.status,
      departmentId: session.profile.primary_department_id,
      managedDepartmentIds: departments.map(({ id }) => id),
      managedTeamIds: teams.map(({ id }) => id),
      directReportIds: reports.map(({ id }) => id),
    },
    overrides: overrideRows.map((override) => ({
      profileId: override.profile_id,
      capability: override.capability,
      effect: override.effect,
      departmentId: override.department_id,
      teamId: override.team_id,
      resourceType: override.resource_type,
      resourceId: override.resource_id,
      expiresAt: override.expires_at,
      revokedAt: override.revoked_at,
    })),
  };
}

function decisionError(decision: AuthorizationDecision) {
  if (!decision.allowed && decision.reason === "outside_scope") {
    return new AdminError("OUTSIDE_SCOPE", "Target is outside your management scope");
  }
  return new AdminError("FORBIDDEN", "You do not have this capability");
}

/**
 * Widens a target with its owning profile so the policy can answer manager-scope questions.
 *
 * Which store holds that owner — Neon, or the quarantined Supabase project — is not this
 * module's concern; `@/server/auth/resource-ownership` owns that decision, and owns the
 * queries. This file is left with the decision itself.
 */
async function resolveAuthorizationTarget(
  target: AuthorizationTarget,
): Promise<AuthorizationTarget> {
  if (!target.resourceType || !target.resourceId) return target;
  const ownerProfileId = await resolveOwnerProfileId(target.resourceType, target.resourceId);
  return ownerProfileId ? { ...target, ownerProfileId } : target;
}

function evaluate(
  context: AuthorizationContext,
  capability: Capability,
  target: AuthorizationTarget,
) {
  return evaluateAuthorization({
    actor: context.actor,
    capability,
    target,
    overrides: context.overrides,
  });
}

export async function requireCapabilityChecks(
  checks: readonly CapabilityCheck[],
): Promise<AppSession> {
  const context = await loadAuthorizationContext();
  const resolvedTargets = await Promise.all(
    checks.map(({ target = {} }) => resolveAuthorizationTarget(target)),
  );

  checks.forEach(({ capability }, index) => {
    const decision = evaluate(context, capability, resolvedTargets[index]);
    if (!decision.allowed) throw decisionError(decision);
  });

  return context.session;
}

/**
 * The same evaluation `requireCapabilityChecks` performs, reported instead of thrown.
 *
 * Some reads are allowed to degrade: a quote the actor may see can carry a lead they may
 * not, and the honest answer is a quote without a lead block, not a failed request. This
 * runs one context load and the same target resolution, so it cannot disagree with the
 * throwing path about what is permitted.
 */
export async function evaluateCapabilityChecks(
  checks: readonly CapabilityCheck[],
): Promise<boolean[]> {
  if (checks.length === 0) return [];
  const context = await loadAuthorizationContext();
  const resolvedTargets = await Promise.all(
    checks.map(({ target = {} }) => resolveAuthorizationTarget(target)),
  );

  return checks.map(
    ({ capability }, index) => evaluate(context, capability, resolvedTargets[index]).allowed,
  );
}

/**
 * The actor's target-independent capability set, for the app shell.
 *
 * See `src/lib/admin/capabilities.ts` for what this set does and does not answer.
 */
export async function resolveEffectiveCapabilities(): Promise<readonly Capability[]> {
  const context = await loadAuthorizationContext();
  return effectiveCapabilities(context.actor, context.overrides);
}

export async function requireCapability(
  capability: Capability,
  target: AuthorizationTarget = {},
): Promise<AppSession> {
  const context = await loadAuthorizationContext();
  const resolvedTarget = await resolveAuthorizationTarget(target);
  const decision = evaluate(context, capability, resolvedTarget);
  if (!decision.allowed) throw decisionError(decision);
  return context.session;
}

export async function requireCapabilitySet(
  required: readonly Capability[],
  options: {
    optional?: readonly Capability[];
    target?: AuthorizationTarget;
  } = {},
): Promise<Partial<Record<Capability, boolean>>> {
  const context = await loadAuthorizationContext();
  const resolvedTarget = await resolveAuthorizationTarget(options.target ?? {});
  const access: Partial<Record<Capability, boolean>> = {};

  for (const capability of required) {
    const decision = evaluate(context, capability, resolvedTarget);
    if (!decision.allowed) throw decisionError(decision);
    access[capability] = true;
  }

  for (const capability of options.optional ?? []) {
    access[capability] = evaluate(context, capability, resolvedTarget).allowed;
  }

  return access;
}
export async function requireAnyCapability(
  capabilities: readonly Capability[],
  target: AuthorizationTarget = {},
): Promise<AppSession> {
  const context = await loadAuthorizationContext();
  let outsideScopeDecision: AuthorizationDecision | null = null;

  const resolvedTarget = await resolveAuthorizationTarget(target);
  for (const capability of capabilities) {
    const decision = evaluate(context, capability, resolvedTarget);
    if (decision.allowed) return context.session;
    if (decision.reason === "outside_scope") outsideScopeDecision = decision;
  }

  throw decisionError(outsideScopeDecision ?? { allowed: false, reason: "role_denied" });
}

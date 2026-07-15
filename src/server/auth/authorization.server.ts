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

export async function requireCapability(
  capability: Capability,
  target: AuthorizationTarget = {},
): Promise<AppSession> {
  const context = await loadAuthorizationContext();
  const decision = evaluate(context, capability, target);
  if (!decision.allowed) throw decisionError(decision);
  return context.session;
}

export async function requireAnyCapability(
  capabilities: readonly Capability[],
  target: AuthorizationTarget = {},
): Promise<AppSession> {
  const context = await loadAuthorizationContext();
  let outsideScopeDecision: AuthorizationDecision | null = null;

  for (const capability of capabilities) {
    const decision = evaluate(context, capability, target);
    if (decision.allowed) return context.session;
    if (decision.reason === "outside_scope") outsideScopeDecision = decision;
  }

  throw decisionError(outsideScopeDecision ?? { allowed: false, reason: "role_denied" });
}

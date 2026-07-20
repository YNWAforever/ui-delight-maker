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
import { createSupabaseServerClient } from "@/legacy-supabase/server";
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

type ScopeRow = {
  owner_profile_id: string | null;
};

function scopeQuery(resourceType: string) {
  switch (resourceType) {
    case "account":
      return "select account_owner as owner_profile_id from accounts where id = $1";
    case "client":
      return "select account_owner as owner_profile_id from clients where id = $1";
    case "lead":
      return "select assigned_to as owner_profile_id from leads where id = $1";
    case "campaign":
      return "select owner as owner_profile_id from campaigns where id = $1";
    case "deal":
      return "select owner as owner_profile_id from deals where id = $1";
    case "project":
      return "select owner as owner_profile_id from projects where id = $1";
    case "task":
      return "select assigned_to as owner_profile_id from tasks where id = $1";
    case "engagement":
      return "select owner as owner_profile_id from engagements where id = $1";
    case "quote":
      return "select coalesce(q.created_by, a.account_owner) as owner_profile_id from quotes q left join accounts a on a.id = q.account_id where q.id = $1";
    case "job_sheet":
      return "select coalesce(sales_owner, accounting_owner) as owner_profile_id from job_sheets where id = $1";
    case "job_sheet_portion":
      return "select coalesce(js.sales_owner, js.accounting_owner) as owner_profile_id from job_sheet_portions p join job_sheets js on js.id = p.job_sheet_id where p.id = $1";
    case "automation_playbook":
      return "select created_by as owner_profile_id from automation_playbooks where id = $1";
    case "automation_run":
      return "select coalesce(ap.created_by, a.account_owner) as owner_profile_id from automation_runs r left join automation_playbooks ap on ap.id = r.playbook_id left join accounts a on a.id = r.account_id where r.id = $1";
    case "customer_success_profile":
      return "select coalesce(c.cs_owner, a.account_owner) as owner_profile_id from customer_success_profiles c left join accounts a on a.id = c.account_id where c.id = $1";
    case "engagement_event":
      return "select coalesce(e.created_by, a.account_owner) as owner_profile_id from engagement_events e left join accounts a on a.id = e.account_id where e.id = $1";
    case "human_approval":
      return "select assigned_to as owner_profile_id from human_approvals where id = $1";
    case "contact":
      return "select coalesce(a.account_owner, c.owner) as owner_profile_id from contacts c left join accounts a on a.id = c.account_id where c.id = $1";
    case "channel_identity":
      return "select coalesce(a.account_owner, c.owner) as owner_profile_id from channel_identities ci left join contacts c on c.id = ci.contact_id left join accounts a on a.id = coalesce(ci.account_id, c.account_id) where ci.id = $1";
    case "account_contact":
      return "select a.account_owner as owner_profile_id from account_contacts c join accounts a on a.id = c.account_id where c.id = $1";
    case "client_contact":
      return "select c.account_owner as owner_profile_id from client_contacts cc join clients c on c.id = cc.client_id where cc.id = $1";
    case "touchpoint":
      return "select c.account_owner as owner_profile_id from touchpoints t join clients c on c.id = t.client_id where t.id = $1";
    case "relationship_signal":
      return "select a.account_owner as owner_profile_id from relationship_signals s join accounts a on a.id = s.account_id where s.id = $1";
    default:
      return null;
  }
}

const SUPABASE_RESOURCE_TYPES = new Set([
  "automation_playbook",
  "automation_run",
  "customer_success_profile",
  "engagement_event",
  "contact",
  "channel_identity",
  "deal",
  "project",
]);

async function supabaseAccountOwner(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  accountId: string | null | undefined,
): Promise<string | null> {
  if (!accountId) return null;
  const { data, error } = await supabase
    .from("accounts")
    .select("account_owner")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.account_owner as string | null | undefined) ?? null;
}

async function supabaseOwnerProfileId(
  resourceType: string,
  resourceId: string,
): Promise<string | null | undefined> {
  const supabase = createSupabaseServerClient();

  if (resourceType === "automation_playbook") {
    const { data, error } = await supabase
      .from("automation_playbooks")
      .select("created_by")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.created_by as string | null | undefined) ?? null;
  }

  if (resourceType === "automation_run") {
    const { data, error } = await supabase
      .from("automation_runs")
      .select("account_id, playbook_id")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const accountOwner = await supabaseAccountOwner(supabase, data.account_id as string | null);
    if (accountOwner) return accountOwner;
    if (!data.playbook_id) return null;
    const { data: playbook, error: playbookError } = await supabase
      .from("automation_playbooks")
      .select("created_by")
      .eq("id", data.playbook_id)
      .maybeSingle();
    if (playbookError) throw new Error(playbookError.message);
    return (playbook?.created_by as string | null | undefined) ?? null;
  }

  if (resourceType === "customer_success_profile") {
    const { data, error } = await supabase
      .from("customer_success_profiles")
      .select("account_id, cs_owner")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (
      (await supabaseAccountOwner(supabase, data.account_id as string | null)) ??
      (data.cs_owner as string | null | undefined) ??
      null
    );
  }

  if (resourceType === "engagement_event") {
    const { data, error } = await supabase
      .from("engagement_events")
      .select("account_id, created_by")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (
      (data.created_by as string | null | undefined) ??
      (await supabaseAccountOwner(supabase, data.account_id as string | null))
    );
  }

  if (resourceType === "contact" || resourceType === "channel_identity") {
    const table = resourceType === "contact" ? "contacts" : "channel_identities";
    const select = resourceType === "contact" ? "account_id, owner" : "account_id, contact_id";
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as {
      account_id?: string | null;
      contact_id?: string | null;
      owner?: string | null;
    };
    if (row.account_id) {
      return await supabaseAccountOwner(supabase, row.account_id);
    }
    if (resourceType === "channel_identity" && row.contact_id) {
      return await supabaseOwnerProfileId("contact", row.contact_id);
    }
    return row.owner ?? null;
  }

  if (resourceType === "deal" || resourceType === "project") {
    const { data, error } = await supabase
      .from(resourceType === "deal" ? "deals" : "projects")
      .select("account_id, owner")
      .eq("id", resourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (
      (await supabaseAccountOwner(supabase, data.account_id as string | null)) ??
      (data.owner as string | null | undefined) ??
      null
    );
  }

  return undefined;
}
async function resolveAuthorizationTarget(
  target: AuthorizationTarget,
): Promise<AuthorizationTarget> {
  if (!target.resourceType || !target.resourceId) return target;
  if (SUPABASE_RESOURCE_TYPES.has(target.resourceType)) {
    const ownerProfileId = await supabaseOwnerProfileId(target.resourceType, target.resourceId);
    return ownerProfileId ? { ...target, ownerProfileId } : target;
  }

  const sql = scopeQuery(target.resourceType);
  if (!sql) return target;
  const rows = await query<ScopeRow>(sql, [target.resourceId]);
  const ownerProfileId = rows[0]?.owner_profile_id;
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

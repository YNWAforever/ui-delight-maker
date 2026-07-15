import {
  CAPABILITIES,
  type ActorAccessContext,
  type AuthorizationDecision,
  type AuthorizationInput,
  type AuthorizationTarget,
  type Capability,
  type PermissionOverride,
  type UserRole,
} from "./types";

const set = (...capabilities: Capability[]) => new Set<Capability>(capabilities);

const CRM_VIEW_CAPABILITIES: Capability[] = [
  "accounts.view",
  "leads.view",
  "contacts.view",
  "campaigns.view",
  "tasks.view",
  "quotes.view",
  "approvals.view",
  "engagements.view",
  "job_sheets.view",
  "reports.view",
  "agents.view",
  "products.view",
];

export const ROLE_GRANTS: Record<UserRole, ReadonlySet<Capability>> = {
  super_admin: new Set(CAPABILITIES),
  admin: set(...CAPABILITIES.filter((capability) => capability !== "permissions.override")),
  manager: set(
    "users.view",
    "users.manage",
    "teams.view",
    "teams.manage",
    "permissions.view",
    "accounts.view",
    "accounts.create",
    "accounts.update",
    "leads.view",
    "leads.create",
    "leads.update",
    "leads.convert",
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "campaigns.view",
    "campaigns.manage",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "quotes.view",
    "quotes.create",
    "quotes.update",
    "quotes.request_approval",
    "quotes.approve",
    "approvals.view",
    "approvals.decide",
    "engagements.view",
    "engagements.create",
    "engagements.update",
    "job_sheets.view",
    "reports.view",
    "agents.view",
    "agents.run",
    "products.view",
  ),
  sales: set(
    "accounts.view",
    "accounts.create",
    "accounts.update",
    "leads.view",
    "leads.create",
    "leads.update",
    "leads.convert",
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "campaigns.view",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "quotes.view",
    "quotes.create",
    "quotes.update",
    "quotes.request_approval",
    "approvals.view",
    "engagements.view",
    "job_sheets.view",
    "reports.view",
    "agents.view",
    "agents.run",
    "products.view",
  ),
  client_success: set(
    "accounts.view",
    "accounts.update",
    "leads.view",
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "campaigns.view",
    "campaigns.manage",
    "campaigns.import",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "quotes.view",
    "approvals.view",
    "engagements.view",
    "engagements.create",
    "engagements.update",
    "job_sheets.view",
    "reports.view",
    "agents.view",
    "agents.run",
    "products.view",
  ),
  accounting: set(
    "accounts.view",
    "contacts.view",
    "tasks.view",
    "tasks.update",
    "quotes.view",
    "approvals.view",
    "engagements.view",
    "job_sheets.view",
    "job_sheets.accept",
    "job_sheets.update_billing",
    "reports.view",
    "products.view",
  ),
  read_only: set("users.view", "teams.view", ...CRM_VIEW_CAPABILITIES),
};

function overrideIsActive(
  override: PermissionOverride,
  target: AuthorizationTarget,
  now: Date,
): boolean {
  if (override.revokedAt) return false;
  if (override.expiresAt && new Date(override.expiresAt).getTime() <= now.getTime()) return false;
  if (override.departmentId && override.departmentId !== target.departmentId) return false;
  if (override.teamId && override.teamId !== target.teamId) return false;
  if (override.resourceType && override.resourceType !== target.resourceType) return false;
  if (override.resourceId && override.resourceId !== target.resourceId) return false;
  return true;
}

function managerCanTarget(actor: ActorAccessContext, target: AuthorizationTarget): boolean {
  const checks: boolean[] = [];
  if (target.profileId) checks.push(actor.directReportIds.includes(target.profileId));
  if (target.departmentId) {
    checks.push(
      actor.departmentId === target.departmentId ||
        actor.managedDepartmentIds.includes(target.departmentId),
    );
  }
  if (target.teamId) checks.push(actor.managedTeamIds.includes(target.teamId));
  if (target.ownerProfileId) {
    checks.push(
      target.ownerProfileId === actor.profileId ||
        actor.directReportIds.includes(target.ownerProfileId),
    );
  }
  return checks.length === 0 || checks.every(Boolean);
}

export function evaluateAuthorization(input: AuthorizationInput): AuthorizationDecision {
  const { actor, capability, target } = input;
  if (actor.status !== "active") {
    return { allowed: false, reason: "inactive_actor" };
  }

  if (!CAPABILITIES.includes(capability)) {
    return { allowed: false, reason: "unknown_capability" };
  }

  if (
    actor.role === "manager" &&
    target.role &&
    (target.role === "admin" || target.role === "super_admin")
  ) {
    return { allowed: false, reason: "protected_role" };
  }

  const activeOverrides = (input.overrides ?? []).filter(
    (override) =>
      override.capability === capability &&
      overrideIsActive(override, target, input.now ?? new Date()),
  );

  if (activeOverrides.some((override) => override.effect === "deny")) {
    return { allowed: false, reason: "explicit_deny" };
  }
  if (activeOverrides.some((override) => override.effect === "allow")) {
    return { allowed: true, reason: "explicit_allow" };
  }
  if (!ROLE_GRANTS[actor.role].has(capability)) {
    return { allowed: false, reason: "role_denied" };
  }
  if (actor.role === "manager" && !managerCanTarget(actor, target)) {
    return { allowed: false, reason: "outside_scope" };
  }
  return { allowed: true, reason: "role_grant" };
}

export const USER_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "sales",
  "client_success",
  "accounting",
  "read_only",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PROFILE_STATUSES = ["invited", "active", "suspended", "deactivated"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const CAPABILITIES = [
  "users.view",
  "users.invite",
  "users.manage",
  "users.suspend",
  "users.deactivate",
  "teams.view",
  "teams.manage",
  "departments.manage",
  "permissions.view",
  "permissions.override",
  "access_requests.decide",
  "sessions.revoke",
  "audit.view",
  "audit.export",
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
  "contacts.delete",
  "campaigns.view",
  "campaigns.manage",
  "campaigns.import",
  "tasks.view",
  "tasks.create",
  "tasks.update",
  "quotes.view",
  "quotes.create",
  "quotes.update",
  "quotes.request_approval",
  "quotes.approve",
  "quotes.issue",
  "approvals.view",
  "approvals.decide",
  "engagements.view",
  "engagements.create",
  "engagements.update",
  "job_sheets.view",
  "job_sheets.accept",
  "job_sheets.update_billing",
  "reports.view",
  "agents.view",
  "agents.run",
  "agents.configure",
  "products.view",
  "products.manage",
  "api_keys.manage",
  "automation.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type AdminNavigationItem = {
  key: "overview" | "people" | "teams" | "access" | "audit";
  label: string;
  capability: Capability;
  href: string;
};
export type ActorAccessContext = {
  profileId: string;
  role: UserRole;
  status: ProfileStatus;
  departmentId?: string | null;
  managedDepartmentIds: readonly string[];
  managedTeamIds: readonly string[];
  directReportIds: readonly string[];
};

export type AuthorizationTarget = {
  profileId?: string;
  role?: UserRole;
  departmentId?: string;
  teamId?: string;
  ownerProfileId?: string;
  resourceType?: string;
  resourceId?: string;
};

export type PermissionOverride = {
  profileId: string;
  capability: Capability;
  effect: "allow" | "deny";
  departmentId?: string | null;
  teamId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
};

export type AuthorizationReason =
  | "inactive_actor"
  | "protected_role"
  | "invalid_target"
  | "explicit_deny"
  | "explicit_allow"
  | "role_grant"
  | "outside_scope"
  | "role_denied"
  | "unknown_capability";

export type AuthorizationDecision =
  | { allowed: true; reason: "explicit_allow" | "role_grant" }
  | {
      allowed: false;
      reason: Exclude<AuthorizationReason, "explicit_allow" | "role_grant">;
    };

export type AuthorizationInput = {
  actor: ActorAccessContext;
  capability: Capability;
  target: AuthorizationTarget;
  overrides?: readonly PermissionOverride[];
  now?: Date;
};

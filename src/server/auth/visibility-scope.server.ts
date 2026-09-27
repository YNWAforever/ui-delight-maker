import { ROLE_GRANTS } from "@/lib/admin/policy";
import type { Capability, PermissionOverride } from "@/lib/admin/types";
import type { RequestAuthorization } from "./authorization.server";

/**
 * The resource and alias are server-owned, never request parameters. An unknown resource
 * produces FALSE so a new list cannot silently fall back to an unscoped read.
 */
const VIEW_CAPABILITY = {
  account: "accounts.view",
  client: "accounts.view",
  lead: "leads.view",
  campaign: "campaigns.view",
  task: "tasks.view",
  engagement: "engagements.view",
  human_approval: "approvals.view",
  quote: "quotes.view",
  job_sheet: "job_sheets.view",
  job_sheet_portion: "job_sheets.view",
  account_contact: "contacts.view",
  client_contact: "contacts.view",
  touchpoint: "engagements.view",
  relationship_signal: "accounts.view",
} as const satisfies Record<string, Capability>;

export type VisibleResourceType = keyof typeof VIEW_CAPABILITY;

/** Whether a query can return any row for this actor; SQL still decides every row. */
export function hasPotentialVisibility(
  context: RequestAuthorization,
  resourceType: string,
): boolean {
  if (!(resourceType in VIEW_CAPABILITY) || context.actor.status !== "active") return false;
  const type = resourceType as VisibleResourceType;
  const capability = VIEW_CAPABILITY[type];
  return (
    ROLE_GRANTS[context.actor.role].has(capability) ||
    activeRowOverrides(context, type, capability).some((override) => override.effect === "allow")
  );
}

function ownerExpression(resourceType: VisibleResourceType, alias: string): string {
  switch (resourceType) {
    case "account":
      return `${alias}.account_owner`;
    case "client":
      return `${alias}.account_owner`;
    case "lead":
      return `${alias}.assigned_to`;
    case "campaign":
      return `${alias}.owner`;
    case "task":
      return `${alias}.assigned_to`;
    case "engagement":
      return `${alias}.owner`;
    case "human_approval":
      return `${alias}.assigned_to`;
    case "quote":
      return `coalesce(${alias}.created_by, (select a.account_owner from accounts a where a.id = ${alias}.account_id))`;
    case "job_sheet":
      return `coalesce(${alias}.sales_owner, ${alias}.accounting_owner)`;
    case "job_sheet_portion":
      return `(select coalesce(js.sales_owner, js.accounting_owner) from job_sheets js where js.id = ${alias}.job_sheet_id)`;
    case "account_contact":
      return `(select a.account_owner from accounts a where a.id = ${alias}.account_id)`;
    case "client_contact":
    case "touchpoint":
      return `(select c.account_owner from clients c where c.id = ${alias}.client_id)`;
    case "relationship_signal":
      return `(select a.account_owner from accounts a where a.id = ${alias}.account_id)`;
  }
}

function activeRowOverrides(
  context: RequestAuthorization,
  resourceType: VisibleResourceType,
  capability: Capability,
): Array<Pick<PermissionOverride, "effect" | "resourceId">> {
  return context.overrides
    .filter((override) => {
      if (override.profileId !== context.actor.profileId || override.capability !== capability)
        return false;
      if (override.revokedAt || override.departmentId || override.teamId) return false;
      if (override.resourceType && override.resourceType !== resourceType) return false;
      if (!override.expiresAt) return true;
      const expiry = Date.parse(override.expiresAt);
      return Number.isFinite(expiry) && expiry > context.now.getTime();
    })
    .map(({ effect, resourceId }) => ({ effect, resourceId }));
}

/**
 * Returns a parameterized predicate for a row with the given alias. Bind the returned values
 * before any later query parameters; callers embedding in a query with existing parameters
 * must shift its placeholders. Deny wins over allow, then role/manager ownership is checked.
 */
export function buildVisibilityScope(
  context: RequestAuthorization,
  resourceType: string,
  alias: string,
  options?: { ownerSql?: string; capability?: Capability },
): { sql: string; values: readonly unknown[] } {
  if (!(resourceType in VIEW_CAPABILITY)) return { sql: "FALSE", values: [] };
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw new Error("Invalid visibility alias");

  const type = resourceType as VisibleResourceType;
  const capability = options?.capability ?? VIEW_CAPABILITY[type];
  const owner = options?.ownerSql ?? ownerExpression(type, alias);
  const overrides = activeRowOverrides(context, type, capability);
  const matchesOverride = `((o.value->>'resourceId') is null or (o.value->>'resourceId') = ${alias}.id::text)`;
  const overrideExists = (effect: "allow" | "deny") =>
    `exists (select 1 from jsonb_array_elements($4::jsonb) as o(value) where o.value->>'effect' = '${effect}' and ${matchesOverride})`;

  return {
    sql: `(
      $1::boolean
      and not ${overrideExists("deny")}
      and (
        ${overrideExists("allow")}
        or (
          $2::boolean
          and (
            $3::boolean
            or (${owner} is not null and ${owner}::text = any($5::text[]))
          )
        )
      )
    )`,
    values: [
      context.actor.status === "active",
      ROLE_GRANTS[context.actor.role].has(capability),
      context.actor.role !== "manager",
      JSON.stringify(overrides),
      [context.actor.profileId, ...context.actor.directReportIds],
    ],
  };
}

type SubjectResource = {
  subject: "lead" | "quote" | "client" | "task" | "approval";
  resource: VisibleResourceType;
  table: string;
  alias: string;
};

const SUBJECT_RESOURCES: readonly SubjectResource[] = [
  { subject: "lead", resource: "lead", table: "leads", alias: "l" },
  { subject: "quote", resource: "quote", table: "quotes", alias: "q" },
  { subject: "client", resource: "client", table: "clients", alias: "c" },
  { subject: "task", resource: "task", table: "tasks", alias: "t" },
  { subject: "approval", resource: "human_approval", table: "human_approvals", alias: "ha" },
];

/** Scope polymorphic agent runs or activity logs to their visible subject rows. */
export function buildSubjectVisibility(
  context: RequestAuthorization,
  outerAlias: string,
  kindColumn: "subject_type" | "object_type",
  idColumn: "subject_id" | "object_id",
): { sql: string; values: readonly unknown[] } {
  if (!/^[a-z][a-z0-9_]*$/.test(outerAlias)) throw new Error("Invalid subject alias");
  const values: unknown[] = [];
  const clauses: string[] = [];
  for (const item of SUBJECT_RESOURCES) {
    if (!hasPotentialVisibility(context, item.resource)) continue;
    const scope = buildVisibilityScope(context, item.resource, item.alias);
    const predicate = scope.sql.replace(
      /\$(\d+)/g,
      (_, index: string) => "$" + (Number(index) + values.length),
    );
    clauses.push(
      "(" +
        outerAlias +
        "." +
        kindColumn +
        " = '" +
        item.subject +
        "' and exists (select 1 from " +
        item.table +
        " " +
        item.alias +
        " where " +
        item.alias +
        ".id = " +
        outerAlias +
        "." +
        idColumn +
        " and " +
        predicate +
        "))",
    );
    values.push(...scope.values);
  }
  return { sql: clauses.length ? "(" + clauses.join(" or ") + ")" : "false", values };
}

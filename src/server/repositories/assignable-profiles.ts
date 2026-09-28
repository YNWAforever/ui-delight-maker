import { createHash } from "node:crypto";
import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization, ROLE_GRANTS } from "@/lib/admin/policy";
import type { Capability } from "@/lib/admin/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { buildVisibilityScope } from "@/server/auth/visibility-scope.server";
import { query } from "@/server/db/neon.server";

export type ProfilePurpose =
  | "task_filter"
  | "task_assign"
  | "approval_reviewer"
  | "admin_access"
  | "successor";
export type AssignableProfile = {
  id: string;
  displayName: string;
  isEligible: boolean;
  reason: string | null;
};
export type AssignableProfilesPage = {
  items: AssignableProfile[];
  nextCursor: string | null;
  total: number;
};
export type AssignableProfilesInput = {
  purpose: ProfilePurpose;
  query?: string;
  cursor?: string;
  limit?: number;
  resourceId?: string;
};

function permits(context: RequestAuthorization, capability: Capability): boolean {
  return evaluateAuthorization({
    actor: context.actor,
    capability,
    target: {},
    overrides: context.overrides,
    now: context.now,
  }).allowed;
}
function parseCursor(cursor: string | undefined, signature: string) {
  if (!cursor) return null;
  if (cursor.length > 2048) throw new AdminError("VALIDATION_FAILED", "Invalid people cursor");
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      parsed.v !== 1 ||
      parsed.signature !== signature ||
      typeof parsed.name !== "string" ||
      typeof parsed.id !== "string"
    )
      throw new Error("cursor mismatch");
    return { name: parsed.name, id: parsed.id };
  } catch {
    throw new AdminError("VALIDATION_FAILED", "Invalid people cursor");
  }
}

/** Purpose-specific roster search; no email, phone, or raw profile data leaves this query. */
export async function listAssignableProfiles(
  input: AssignableProfilesInput,
  context: RequestAuthorization,
): Promise<AssignableProfilesPage> {
  const purpose = input.purpose;
  const authorized =
    purpose === "task_filter"
      ? permits(context, "tasks.view")
      : purpose === "task_assign"
        ? permits(context, "tasks.update")
        : purpose === "approval_reviewer"
          ? permits(context, "approvals.decide")
          : purpose === "admin_access"
            ? permits(context, "permissions.override")
            : purpose === "successor"
              ? permits(context, "users.manage")
              : false;
  if (!authorized) throw new AdminError("FORBIDDEN", "People search is not authorized");
  const search = input.query?.trim().toLowerCase() ?? "";
  if (search.length > 200) throw new AdminError("VALIDATION_FAILED", "Search is too long");
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const signature = createHash("sha256")
    .update(
      JSON.stringify({
        actor: context.actor.profileId,
        purpose,
        search,
        resourceId: input.resourceId ?? null,
        sort: "name_asc_id_asc",
      }),
    )
    .digest("hex");
  const after = parseCursor(input.cursor, signature);
  const values: unknown[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return "$" + values.length;
  };
  const clauses = ["p.status='active'"];
  if (purpose === "task_filter") {
    const scope = buildVisibilityScope(context, "task", "t");
    const shifted = scope.sql.replace(
      /\$(\d+)/g,
      (_, index: string) => "$" + (Number(index) + values.length),
    );
    clauses.push("exists (select 1 from tasks t where t.assigned_to=p.id and " + shifted + ")");
    values.push(...scope.values);
  } else if (
    purpose === "task_assign" ||
    purpose === "approval_reviewer" ||
    purpose === "admin_access" ||
    purpose === "successor"
  ) {
    if (purpose === "approval_reviewer") {
      const roles = Object.entries(ROLE_GRANTS)
        .filter(([, capabilities]) => capabilities.has("approvals.decide"))
        .map(([role]) => role);
      clauses.push("p.role=any(" + add(roles) + "::text[])");
    }
    if (context.actor.role === "manager") {
      clauses.push(
        "p.id=any(" +
          add([context.actor.profileId, ...context.actor.directReportIds]) +
          "::text[])",
      );
    } else if (context.actor.role !== "admin" && context.actor.role !== "super_admin") {
      clauses.push("p.id=" + add(context.actor.profileId));
    }
  }
  if (search) {
    clauses.push(
      "position(" +
        add(search) +
        "::text in lower(coalesce(nullif(trim(p.name),''),'Name unavailable'))) > 0",
    );
  }
  const where = "where " + clauses.join(" and ");
  const counts = await query<{ total: number | string }>(
    "select count(*)::int as total from profiles p " + where,
    values,
  );
  const total = Number(counts[0]?.total ?? 0);
  const pageValues = [...values];
  let pageWhere = where;
  if (after) {
    const nameIndex = pageValues.push(after.name);
    const idIndex = pageValues.push(after.id);
    pageWhere +=
      " and (lower(coalesce(nullif(trim(p.name),''),'Name unavailable')),p.id)" +
      " > ($" +
      nameIndex +
      "::text,$" +
      idIndex +
      "::text)";
  }
  const limitIndex = pageValues.push(limit + 1);
  const rows = await query<{ id: string; display_name: string; sort_name: string }>(
    `select p.id,coalesce(nullif(trim(p.name),''),'Name unavailable') as display_name,
            lower(coalesce(nullif(trim(p.name),''),'Name unavailable')) as sort_name
       from profiles p ${pageWhere}
       order by sort_name asc,p.id asc
       limit $${limitIndex}`,
    pageValues,
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(
    (row): AssignableProfile => ({
      id: row.id,
      displayName: row.display_name,
      isEligible: true,
      reason: null,
    }),
  );
  const last = rows[Math.min(rows.length, limit) - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              signature,
              name: last.sort_name,
              id: last.id,
            }),
          ).toString("base64url")
        : null,
    total,
  };
}

/** Resolve a persisted selection without asking the browser to fetch the whole roster. */
export async function resolveAssignableProfile(
  input: { purpose: ProfilePurpose; id: string; resourceId?: string },
  context: RequestAuthorization,
): Promise<AssignableProfile | null> {
  const purpose = input.purpose;
  const authorized =
    purpose === "task_filter"
      ? permits(context, "tasks.view")
      : purpose === "task_assign"
        ? permits(context, "tasks.update")
        : purpose === "approval_reviewer"
          ? permits(context, "approvals.decide")
          : purpose === "admin_access"
            ? permits(context, "permissions.override")
            : purpose === "successor"
              ? permits(context, "users.manage")
              : false;
  if (!authorized) throw new AdminError("FORBIDDEN", "People search is not authorized");
  const values: unknown[] = [input.id];
  const clauses = ["p.id=$1", "p.status='active'"];
  if (purpose === "task_filter") {
    const scope = buildVisibilityScope(context, "task", "t");
    const shifted = scope.sql.replace(
      /\$(\d+)/g,
      (_, index: string) => "$" + (Number(index) + values.length),
    );
    clauses.push("exists (select 1 from tasks t where t.assigned_to=p.id and " + shifted + ")");
    values.push(...scope.values);
  } else {
    if (purpose === "approval_reviewer") {
      const roles = Object.entries(ROLE_GRANTS)
        .filter(([, capabilities]) => capabilities.has("approvals.decide"))
        .map(([role]) => role);
      values.push(roles);
      clauses.push("p.role=any($" + values.length + "::text[])");
    }
    if (context.actor.role === "manager") {
      values.push([context.actor.profileId, ...context.actor.directReportIds]);
      clauses.push("p.id=any($" + values.length + "::text[])");
    } else if (context.actor.role !== "admin" && context.actor.role !== "super_admin") {
      values.push(context.actor.profileId);
      clauses.push("p.id=$" + values.length);
    }
  }
  const rows = await query<{ id: string; display_name: string }>(
    `select p.id,coalesce(nullif(trim(p.name),''),'Name unavailable') as display_name
       from profiles p where ${clauses.join(" and ")} limit 1`,
    values,
  );
  const row = rows[0];
  return row ? { id: row.id, displayName: row.display_name, isEligible: true, reason: null } : null;
}

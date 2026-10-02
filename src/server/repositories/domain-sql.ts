import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import { buildVisibilityScope } from "@/server/auth/visibility-scope.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";

// Tables/columns/order expressions are private server constants, never request input.
const resources = {
  deals: "deal",
  projects: "project",
  engagement_events: "engagement_event",
  channel_identities: "channel_identity",
  automation_playbooks: "automation_playbook",
  automation_runs: "automation_run",
  customer_success_profiles: "customer_success_profile",
  success_touchpoints: "success_touchpoint",
  tasks: "task",
} as const;
export type DomainTable = keyof typeof resources;
const jsonColumns = new Set(["steps", "metadata", "context_data", "output_data"]);

export function pickColumns<T extends object, K extends keyof T>(
  source: T,
  columns: readonly K[],
): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const column of columns) if (source[column] !== undefined) picked[column] = source[column];
  return picked;
}
export function domainOperationFailed(description: string, cause: unknown): Error {
  return new Error(`Could not ${description}`, { cause });
}
export async function domainOperation<T>(description: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    throw domainOperationFailed(description, cause);
  }
}
/** Concurrent reads retain declared error precedence and await every issued query. */
export async function readDomainWorkspace<T extends object>(reads: {
  [K in keyof T]: { description: string; promise: Promise<T[K]> };
}): Promise<T> {
  const entries = Object.entries(reads) as [
    keyof T,
    { description: string; promise: Promise<T[keyof T]> },
  ][];
  const settled = await Promise.allSettled(entries.map(([, read]) => read.promise));
  const values: [keyof T, T[keyof T]][] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "rejected")
      throw domainOperationFailed(entries[i][1].description, result.reason);
    values.push([entries[i][0], result.value]);
  }
  return Object.fromEntries(values) as T;
}
function valuesFor(entries: [string, unknown][]) {
  return entries.map(([column, value]) =>
    jsonColumns.has(column) && value !== null ? JSON.stringify(value) : value,
  );
}
export async function insertDomainRow<T>(
  table: DomainTable,
  row: object,
  db?: Queryable,
  conflict?: {
    columns: readonly string[];
    update: readonly string[];
    context?: RequestAuthorization;
  },
): Promise<T> {
  const entries = Object.entries(row);
  const columns = entries.map(([key]) => key);
  const changes = conflict?.update.filter((key) => columns.includes(key)) ?? [];
  const scope = conflict?.context
    ? buildVisibilityScope(conflict.context, resources[table], "d", {
        capability: "engagements.update",
      })
    : null;
  const predicate = scope?.sql.replace(
    /\$(\d+)/g,
    (_, n: string) => "$" + (Number(n) + entries.length),
  );
  // A no-op conflict update still returns the existing row, avoiding a read-then-insert race.
  const conflictSql = conflict
    ? ` on conflict (${conflict.columns.join(",")}) do update set ${changes.length ? changes.map((key) => `${key}=excluded.${key}`).join(",") : `${conflict.columns[0]}=excluded.${conflict.columns[0]}`}${predicate ? " where " + predicate : ""}`
    : "";
  const sql = entries.length
    ? `insert into ${table} as d (${columns.join(",")}) values (${entries.map((_, i) => `$${i + 1}`).join(",")})`
    : `insert into ${table} as d default values`;
  const result = await queryOne<T>(
    sql + conflictSql + " returning *",
    [...valuesFor(entries), ...(scope?.values ?? [])],
    db,
  );
  if (!result) throw new Error("Write did not return a row");
  return result;
}
export async function updateDomainRow<T>(
  table: DomainTable,
  id: string,
  row: object,
  db?: Queryable,
): Promise<T> {
  const entries = Object.entries(row);
  const timestamp = [
    "deals",
    "projects",
    "customer_success_profiles",
    "automation_playbooks",
  ].includes(table)
    ? ",updated_at=now()"
    : "";
  const sql = entries.length
    ? `update ${table} set ${entries.map(([key], i) => `${key}=$${i + 1}`).join(",")}${timestamp} where id=$${entries.length + 1} returning *`
    : `select * from ${table} where id=$1`;
  const result = await queryOne<T>(sql, [...valuesFor(entries), id], db);
  if (!result) throw new Error("Record not found");
  return result;
}
export async function readDomainRows<T>(
  table: DomainTable,
  filters: object = {},
  context?: RequestAuthorization,
  options: { order?: string; limit?: number; before?: [string, string]; db?: Queryable } = {},
): Promise<T[]> {
  const scope = context
    ? buildVisibilityScope(context, resources[table], "d")
    : { sql: "TRUE", values: [] };
  const values: unknown[] = [...scope.values];
  const predicates = [scope.sql];
  for (const [column, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    values.push(value);
    predicates.push(`d.${column}=$${values.length}`);
  }
  if (options.before) {
    values.push(options.before[1]);
    predicates.push(`d.${options.before[0]}<=$${values.length}`);
  }
  let limit = "";
  if (options.limit !== undefined) {
    values.push(Math.max(1, Math.min(1000, Math.trunc(options.limit) || 100)));
    limit = ` limit $${values.length}`;
  }
  return query<T>(
    `select d.* from ${table} d where ${predicates.join(" and ")} order by ${options.order ?? "d.created_at desc,d.id"}${limit}`,
    values,
    options.db,
  );
}
export async function requireDomainRow<T>(
  table: DomainTable,
  id: string,
  context?: RequestAuthorization,
  db?: Queryable,
): Promise<T> {
  const row = (await readDomainRows<T>(table, { id }, context, { db }))[0];
  if (!row) throw new Error("Record not found");
  return row;
}

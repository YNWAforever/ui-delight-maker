import { createHash } from "node:crypto";

export const RECONCILED_TABLES = [
  "tasks",
  "customer_success_profiles",
  "success_touchpoints",
  "projects",
  "deals",
  "engagement_events",
  "channel_identities",
  "automation_playbooks",
  "automation_runs",
  "permission_overrides",
] as const;
type TableName = (typeof RECONCILED_TABLES)[number];
type Row = Record<string, unknown>;
export type LegacySnapshot = {
  tables: Partial<Record<TableName | "accounts" | "profiles", Row[]>>;
};
type TableResult = {
  status: "matched" | "mismatch" | "missing_snapshot";
  legacyCount: number | null;
  neonCount: number | null;
  legacyHash: string | null;
  neonHash: string | null;
  idMapping: "identity" | "unverified";
  matchedIds: number;
  missingIds: number;
  extraIds: number;
  duplicateIds: number;
  ownerMismatches: number;
  scopeMismatches: number;
  overrideMismatches: number;
};
const OWNER_FIELDS: Partial<Record<TableName, string>> = {
  tasks: "assigned_to",
  customer_success_profiles: "cs_owner",
  projects: "owner",
  deals: "owner",
  engagement_events: "created_by",
  automation_playbooks: "created_by",
};
const SCOPE_FIELDS = ["account_id", "project_id", "deal_id"] as const;
const OVERRIDE_FIELDS = [
  "profile_id",
  "capability",
  "effect",
  "department_id",
  "team_id",
  "resource_type",
  "resource_id",
  "expires_at",
  "revoked_at",
] as const;

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
function digest(rows: Row[]) {
  const normalized = rows
    .map(canonical)
    .sort((a, b) => String((a as Row).id).localeCompare(String((b as Row).id)));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
function index(rows: Row[]) {
  const byId = new Map<string, Row>();
  let duplicates = 0;
  for (const row of rows) {
    if (typeof row.id !== "string" || row.id.length === 0) {
      throw new Error("Snapshot row has no string id");
    }
    if (byId.has(row.id)) duplicates++;
    byId.set(row.id, row);
  }
  return { byId, duplicates };
}
function compareTable(name: TableName, legacy?: Row[], neon?: Row[]): TableResult {
  if (!legacy || !neon)
    return {
      status: "missing_snapshot",
      legacyCount: legacy?.length ?? null,
      neonCount: neon?.length ?? null,
      legacyHash: legacy ? digest(legacy) : null,
      neonHash: neon ? digest(neon) : null,
      idMapping: "unverified",
      matchedIds: 0,
      missingIds: 0,
      extraIds: 0,
      duplicateIds: 0,
      ownerMismatches: 0,
      scopeMismatches: 0,
      overrideMismatches: 0,
    };
  const left = index(legacy);
  const right = index(neon);
  let missingIds = 0;
  let extraIds = 0;
  let ownerMismatches = 0;
  let scopeMismatches = 0;
  let overrideMismatches = 0;
  for (const [id, row] of left.byId) {
    const counterpart = right.byId.get(id);
    if (!counterpart) {
      missingIds++;
      continue;
    }
    const owner = OWNER_FIELDS[name];
    if (owner && canonical(row[owner]) !== canonical(counterpart[owner])) ownerMismatches++;
    if (SCOPE_FIELDS.some((field) => canonical(row[field]) !== canonical(counterpart[field]))) {
      scopeMismatches++;
    }
    if (
      name === "permission_overrides" &&
      OVERRIDE_FIELDS.some((field) => canonical(row[field]) !== canonical(counterpart[field]))
    )
      overrideMismatches++;
  }
  for (const id of right.byId.keys()) if (!left.byId.has(id)) extraIds++;
  const legacyHash = digest(legacy);
  const neonHash = digest(neon);
  return {
    status:
      legacy.length === neon.length &&
      left.duplicates === 0 &&
      right.duplicates === 0 &&
      missingIds === 0 &&
      extraIds === 0 &&
      legacyHash === neonHash
        ? "matched"
        : "mismatch",
    legacyCount: legacy.length,
    neonCount: neon.length,
    legacyHash,
    neonHash,
    idMapping: "identity",
    matchedIds: left.byId.size - missingIds,
    missingIds,
    extraIds,
    duplicateIds: left.duplicates + right.duplicates,
    ownerMismatches,
    scopeMismatches,
    overrideMismatches,
  };
}
function foreignKeyChecks(snapshot: LegacySnapshot) {
  const { profiles, accounts, projects, tasks, permission_overrides } = snapshot.tables;
  if (!profiles || !accounts || !projects || !tasks || !permission_overrides) {
    return { status: "missing_snapshot" as const, violations: null };
  }
  const ids = (rows: Row[]) => new Set(rows.map((row) => row.id));
  const profileIds = ids(profiles);
  const accountIds = ids(accounts);
  const projectIds = ids(projects);
  const taskIds = ids(tasks);
  let violations = 0;
  for (const row of tasks) {
    if (row.assigned_to && !profileIds.has(row.assigned_to)) violations++;
    if (row.account_id && !accountIds.has(row.account_id)) violations++;
    if (row.project_id && !projectIds.has(row.project_id)) violations++;
  }
  for (const row of permission_overrides) {
    if (row.profile_id && !profileIds.has(row.profile_id)) violations++;
    if (row.resource_type === "task" && row.resource_id && !taskIds.has(row.resource_id)) {
      violations++;
    }
  }
  return { status: violations === 0 ? ("matched" as const) : ("mismatch" as const), violations };
}

/** Read-only, deterministic comparison; outputs counts and hashes, never customer rows or IDs. */
export function reconcileLegacySnapshots(legacy: LegacySnapshot, neon: LegacySnapshot) {
  const tables = Object.fromEntries(
    RECONCILED_TABLES.map((name) => [
      name,
      compareTable(name, legacy.tables[name], neon.tables[name]),
    ]),
  ) as Record<TableName, TableResult>;
  const foreignKeys = {
    legacy: foreignKeyChecks(legacy),
    neon: foreignKeyChecks(neon),
  };
  return {
    ready:
      Object.values(tables).every((table) => table.status === "matched") &&
      foreignKeys.legacy.status === "matched" &&
      foreignKeys.neon.status === "matched",
    tables,
    foreignKeys,
  };
}

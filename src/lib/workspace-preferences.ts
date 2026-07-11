import type { WorkspaceViewConfig } from "./types";

export type { WorkspaceViewConfig } from "./types";

const lifecycleStages = new Set<NonNullable<WorkspaceViewConfig["filters"]["lifecycle_stage"]>>([
  "prospect",
  "active_client",
  "at_risk",
  "churned",
  "partner",
  "vendor",
]);

const columns = [
  "name",
  "lifecycle_stage",
  "relationship_health",
  "last_activity_at",
  "next_action",
] as const;
const sortFields = ["last_activity_at", "name", "relationship_health"] as const;

const defaultConfig: WorkspaceViewConfig = {
  filters: {},
  columns: [...columns],
  sort: { field: "last_activity_at", direction: "desc" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeWorkspaceViewConfig(value: unknown): WorkspaceViewConfig {
  if (!isRecord(value)) return defaultConfig;

  const rawFilters = isRecord(value.filters) ? value.filters : {};
  const filters: WorkspaceViewConfig["filters"] = {};
  if (
    typeof rawFilters.lifecycle_stage === "string" &&
    lifecycleStages.has(
      rawFilters.lifecycle_stage as NonNullable<WorkspaceViewConfig["filters"]["lifecycle_stage"]>,
    )
  ) {
    filters.lifecycle_stage =
      rawFilters.lifecycle_stage as WorkspaceViewConfig["filters"]["lifecycle_stage"];
  }
  if (typeof rawFilters.account_owner === "string")
    filters.account_owner = rawFilters.account_owner;
  if (typeof rawFilters.cs_owner === "string") filters.cs_owner = rawFilters.cs_owner;

  const visibleColumns = Array.isArray(value.columns)
    ? value.columns.filter(
        (column): column is WorkspaceViewConfig["columns"][number] =>
          typeof column === "string" && columns.includes(column as (typeof columns)[number]),
      )
    : defaultConfig.columns;
  const rawSort = isRecord(value.sort) ? value.sort : {};
  const field =
    typeof rawSort.field === "string" &&
    sortFields.includes(rawSort.field as (typeof sortFields)[number])
      ? (rawSort.field as WorkspaceViewConfig["sort"]["field"])
      : defaultConfig.sort.field;
  const direction =
    rawSort.direction === "asc" || rawSort.direction === "desc"
      ? rawSort.direction
      : defaultConfig.sort.direction;

  return {
    filters,
    columns: visibleColumns.length > 0 ? visibleColumns : defaultConfig.columns,
    sort: { field, direction },
  };
}

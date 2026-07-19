type QueryFilters = Record<string, unknown>;

function normalizeQueryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeQueryValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as QueryFilters)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeQueryValue(item)]),
    );
  }

  return value;
}

export function normalizeQueryFilters(filters: QueryFilters = {}) {
  return normalizeQueryValue(filters) as QueryFilters;
}

function createRouteQueryKeys(route: string) {
  return {
    all: () => [route] as const,
    list: (filters: QueryFilters = {}) => [route, "list", normalizeQueryFilters(filters)] as const,
    detail: (id: string) => [route, "detail", id] as const,
    section: (id: string, section: string) => [route, "detail", id, "section", section] as const,
  };
}

export const crmQueryKeys = {
  shell: () => ["shell"] as const,
  dashboard: () => ["dashboard"] as const,
  account: createRouteQueryKeys("account"),
  accounts: createRouteQueryKeys("accounts"),
  admin: createRouteQueryKeys("admin"),
  aiReview: createRouteQueryKeys("ai-review"),
  agents: createRouteQueryKeys("agents"),
  approvals: createRouteQueryKeys("approvals"),
  campaigns: createRouteQueryKeys("campaigns"),
  clients: createRouteQueryKeys("clients"),
  contacts: createRouteQueryKeys("contacts"),
  deals: createRouteQueryKeys("deals"),
  engagements: createRouteQueryKeys("engagements"),
  jobSheets: createRouteQueryKeys("job-sheets"),
  leads: createRouteQueryKeys("leads"),
  notifications: createRouteQueryKeys("notifications"),
  pipeline: createRouteQueryKeys("pipeline"),
  products: createRouteQueryKeys("products"),
  projects: createRouteQueryKeys("projects"),
  quotes: createRouteQueryKeys("quotes"),
  relationships: createRouteQueryKeys("relationships"),
  renewals: createRouteQueryKeys("renewals"),
  reports: createRouteQueryKeys("reports"),
  settings: createRouteQueryKeys("settings"),
  tasks: createRouteQueryKeys("tasks"),
  companyWorkspace: {
    all: () => ["company-workspace"] as const,
    list: (filters: QueryFilters = {}) =>
      ["company-workspace", "list", normalizeQueryFilters(filters)] as const,
    detail: (accountId: string) => ["company-workspace", accountId] as const,
    section: (accountId: string, section: string) =>
      ["company-workspace", accountId, section] as const,
  },
};

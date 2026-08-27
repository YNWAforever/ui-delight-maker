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
    lists: () => [route, "list"] as const,
    list: (filters: QueryFilters = {}) => [route, "list", normalizeQueryFilters(filters)] as const,
    detail: (id: string) => [route, "detail", id] as const,
    section: (id: string, section: string, filters?: QueryFilters) =>
      filters
        ? ([route, "detail", id, "section", section, normalizeQueryFilters(filters)] as const)
        : ([route, "detail", id, "section", section] as const),
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
  /**
   * Lead, client, product and pricing-template pickers inside the quote surfaces.
   *
   * Its own namespace, not a filtered `quotes.list`. Under the old key every
   * `invalidateQueries({ queryKey: crmQueryKeys.quotes.lists() })` — one per quote save,
   * approval request, issue and accept — also invalidated the whole reference catalogue,
   * so saving a quote refetched the open service-catalogue sheet underneath the user.
   * Reference data is a catalogue, not a quote, and its cache lifetime is nothing to do
   * with the quote being edited.
   */
  quoteReferences: createRouteQueryKeys("quote-references"),
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

// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.hoisted(() => vi.fn());
const invalidateMock = vi.hoisted(() => vi.fn());
const captures = vi.hoisted(() => ({
  toolbar: null as Record<string, unknown> | null,
  board: null as Record<string, unknown> | null,
  inspector: null as Record<string, unknown> | null,
  viewSwitcher: null as Record<string, unknown> | null,
  preview: null as Record<string, unknown> | null,
  accountRows: [] as string[],
  filterToolbar: null as Record<string, unknown> | null,
  recordList: null as Record<string, unknown> | null,
  tabs: null as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
    useRouteContext: vi.fn(() => ({})),
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
  notFound: vi.fn(),
  useNavigate: vi.fn(() => navigateMock),
  useRouter: vi.fn(() => ({ invalidate: invalidateMock })),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ initialData }: { initialData: unknown }) => ({
    data: initialData,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ getQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));

vi.mock("@/components/pipeline/pipeline-toolbar", () => ({
  PipelineToolbar: (props: Record<string, unknown>) => {
    captures.toolbar = props;
    return null;
  },
}));
vi.mock("@/components/pipeline/pipeline-board", () => ({
  PipelineBoard: (props: Record<string, unknown>) => {
    captures.board = props;
    return null;
  },
}));
vi.mock("@/components/pipeline/lead-preview-panel", () => ({
  LeadPreviewPanel: (props: Record<string, unknown>) => {
    captures.inspector = props;
    return null;
  },
}));
vi.mock("@/components/pipeline/stage-move-dialog", () => ({ StageMoveDialog: () => null }));
vi.mock("@/components/pipeline/won-conversion-dialog", () => ({ WonConversionDialog: () => null }));
vi.mock("@/components/sales", () => ({
  ActivityTimeline: () => null,
  AttentionQueue: () => null,
  CommandHeader: () => null,
  EmptyWorkspaceState: () => null,
  ErrorState: () => null,
  FilteredEmptyState: () => null,
  // FilterToolbar and ResponsiveRecordList render nothing, exactly as before, but record
  // the props they were handed: /accounts drives its URL state through them now, and the
  // handlers are what the URL-state assertions below exercise.
  FilterToolbar: (props: Record<string, unknown>) => {
    captures.filterToolbar = props;
    return null;
  },
  LifecycleBadge: () => null,
  LoadingSkeleton: () => null,
  MetricStrip: () => null,
  ResponsiveRecordList: (props: Record<string, unknown>) => {
    captures.recordList = props;
    captures.accountRows = (props.rows as Array<{ id: string }>).map((row) => row.id);
    return null;
  },
  SectionHeader: ({ action }: { action?: ReactNode }) => <div>{action}</div>,
  StaleDataIndicator: () => null,
  StatusBadge: () => null,
  StickyActionBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  WorkspaceHeader: () => null,
  WorkSurfaceEmpty: () => null,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: (props: Record<string, unknown>) => {
    captures.tabs = props;
    return null;
  },
  TabsContent: () => null,
  TabsList: () => null,
  TabsTrigger: () => null,
}));
vi.mock("@/components/quotes/quote-pdf-preview", () => ({
  QuotePdfPreview: () => null,
  QuotePdfPreviewUnavailable: () => null,
  resolveQuotePdfSource: (quote: unknown) => ({
    state: "live",
    quote,
    lineItems: [],
    sourceVersion: null,
  }),
}));
vi.mock("@/hooks/use-company-workspace-section", () => ({
  COMPANY_WORKSPACE_STALE_TIME_MS: 30_000,
  useCompanyWorkspaceSection: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-route-polling-refresh", () => ({ useRoutePollingRefresh: vi.fn() }));
vi.mock("@/lib/business-date", () => ({ getBusinessDateKey: () => "2026-07-14" }));
vi.mock("@/lib/format", () => ({
  formatCompactHKD: (value: number) => String(value),
  formatCount: (value: number) => String(value),
  formatDate: (value: string) => value,
  formatTime: (value: string) => value,
  formatCurrencyAmount: (value: number) => String(value),
  formatDateTime: (value: string) => value,
  relativeTime: (value: string) => value,
}));
vi.mock("@/lib/pipeline", () => ({
  filterPipelineLeads: ({ leads }: { leads: unknown[] }) => leads,
  getPipelineSummary: () => ({ overdue: 0, dueToday: 0, highScore: 0 }),
}));
vi.mock("@/lib/sales-workspace", () => ({ buildRevenueActions: () => [] }));
vi.mock("@/server-functions/agent-runs", () => ({
  getActivityLogs: vi.fn(),
  getAgentHistoryPage: vi.fn(),
  getAgentRuns: vi.fn(),
}));
vi.mock("@/server-functions/leads", () => ({
  moveLeadStage: vi.fn(),
  triggerLeadAgent: vi.fn(),
  triggerLeadReplyDraft: vi.fn(),
  updateLead: vi.fn(),
}));
vi.mock("@/server-functions/pipeline", () => ({ getPipelineData: vi.fn() }));
vi.mock("@/server-functions/products", () => ({
  createProduct: vi.fn(),
  getProducts: vi.fn(),
  updateProduct: vi.fn(),
}));
vi.mock("@/server-functions/quotes", () => ({
  getQuotes: vi.fn(),
  triggerQuoteAgent: vi.fn(),
}));
vi.mock("@/server-functions/tasks", () => ({ createTask: vi.fn(), getTasks: vi.fn() }));
vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/relationship/account-summary-card", () => ({
  AccountSummaryCard: ({ account }: { account: { id: string; name: string } }) => {
    captures.accountRows.push(account.id);
    return <div>{account.name}</div>;
  },
}));
vi.mock("@/components/relationship/account-preview-panel", () => ({
  AccountPreviewPanel: (props: Record<string, unknown>) => {
    captures.preview = props;
    return null;
  },
}));
vi.mock("@/components/relationship/workspace-view-switcher", () => ({
  WorkspaceViewSwitcher: (props: Record<string, unknown>) => {
    captures.viewSwitcher = props;
    return null;
  },
}));
vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("@/server-functions/accounts", () => ({
  getAccounts: vi.fn(),
  triggerRelationshipIntelligence: vi.fn(),
}));
vi.mock("@/server-functions/clients", () => ({
  getClient: vi.fn(),
  getClients: vi.fn(),
  getClientsPage: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 }),
}));
vi.mock("@/server-functions/relationship-signals", () => ({
  getRelationshipSignals: vi.fn(),
  dismissRelationshipSignalFn: vi.fn(),
}));
vi.mock("@/server-functions/contacts", () => ({
  createAccountContact: vi.fn(),
  updateAccountContact: vi.fn(),
}));
vi.mock("@/server-functions/workspace-preferences", () => ({
  getWorkspacePreferences: vi.fn(),
  togglePersonalWorkspaceFavorite: vi.fn(),
}));
vi.mock("@/server-functions/company-workspace", () => ({
  getCompanyWorkspaceCore: vi.fn(),
  getCompanyWorkspaceRead: vi.fn(),
}));
import { Route } from "../index";
import { Route as AccountsRoute } from "../accounts";
import { Route as QuoteRoute } from "../quotes.$id";
import { Route as AccountDetailRoute } from "../accounts.$id";
import { Route as LeadDetailRoute } from "../leads.$id";
import { Route as ClientDetailRoute } from "../clients.$id";
import { Route as AgentDetailRoute } from "../agents.$name";
import { Route as SettingsRoute } from "../settings";
import { getCompanyWorkspaceCore } from "@/server-functions/company-workspace";

const leads = [
  { id: "lead-1", company_name: "First Company" },
  { id: "lead-2", company_name: "Northstar" },
];
const search = {
  q: "northstar",
  source: "event",
  owner: "user-1",
  urgency: "overdue",
  ai: "ready_for_review",
  lead: "lead-2",
  unrelated: "keep",
};

beforeEach(() => {
  navigateMock.mockReset();
  invalidateMock.mockReset();
  captures.toolbar = null;
  captures.board = null;
  captures.inspector = null;
  captures.viewSwitcher = null;
  captures.preview = null;
  captures.accountRows = [];
  captures.filterToolbar = null;
  captures.recordList = null;
  captures.tabs = null;
  vi.mocked(Route.useLoaderData).mockReturnValue({
    leads,
    quotes: [],
    tasks: [],
    approvals: [],
    agentRuns: [],
    activityLogs: [],
    products: [],
    pipelineTotals: {
      openLeads: 2,
      activeQuoteValue: 0,
      openTasks: 0,
      pendingApprovals: 0,
    },
  } as never);
  vi.mocked(Route.useSearch).mockReturnValue(search as never);
});

afterEach(cleanup);

describe("Revenue Desk URL state", () => {
  it("restores filters and selected lead, then navigates with the intended history semantics", async () => {
    const Component = Route.options.component as ComponentType;
    render(<Component />);

    expect(captures.toolbar?.filters).toEqual({
      search: "northstar",
      source: "event",
      owner: "user-1",
      urgency: "overdue",
      aiState: "ready_for_review",
    });
    await waitFor(() =>
      expect((captures.inspector?.lead as { id: string } | undefined)?.id).toBe("lead-2"),
    );

    act(() => {
      (captures.toolbar?.onFiltersChange as (filters: unknown) => void)({
        search: "",
        source: "all",
        owner: "all",
        urgency: "all",
        aiState: "all",
      });
    });
    const filterNavigation = navigateMock.mock.calls[0][0];
    expect(filterNavigation.replace).toBe(true);
    expect(filterNavigation.search(search)).toEqual({ lead: "lead-2", unrelated: "keep" });

    act(() => {
      (captures.board?.onSelectLead as (lead: unknown) => void)(leads[0]);
    });
    const selectionNavigation = navigateMock.mock.calls[1][0];
    expect(selectionNavigation.replace).toBeUndefined();
    expect(selectionNavigation.search(search)).toEqual({ ...search, lead: "lead-1" });
  });
});

const accounts = [
  {
    id: "account-1",
    name: "First Company",
    lifecycle_stage: "prospect",
    relationship_health: 40,
    last_activity_at: "2026-07-01",
    account_owner: "owner-2",
    cs_owner: "cs-2",
  },
  {
    id: "account-2",
    name: "Northstar Media",
    lifecycle_stage: "active_client",
    relationship_health: 90,
    last_activity_at: "2026-07-10",
    account_owner: "owner-1",
    cs_owner: "cs-1",
  },
  {
    id: "account-3",
    name: "Beta Works",
    lifecycle_stage: "active_client",
    relationship_health: 55,
    last_activity_at: "2026-07-11",
    account_owner: "owner-2",
    cs_owner: "cs-2",
  },
];

describe("Companies URL state", () => {
  beforeEach(() => {
    vi.mocked(AccountsRoute.useLoaderData).mockReturnValue({
      accounts,
      accountCounts: {},
      pagination: { page: 1, limit: 50, total: 3 },
      preferences: { favorites: [], views: [] },
    } as never);
    vi.mocked(AccountsRoute.useSearch).mockReturnValue({
      lifecycle: "active_client",
      sort: "name:asc",
      account: "account-2",
      unrelated: "keep",
    } as never);
  });

  it("keeps the preview selection out of the read the list depends on", () => {
    // `account` only says which side panel is open. While it was a loader dep every
    // preview click minted a new accounts.list cache entry and refetched the whole index.
    const loaderDeps = AccountsRoute.options.loaderDeps as unknown as (args: {
      search: Record<string, unknown>;
    }) => { search: Record<string, unknown> };

    const deps = loaderDeps({
      search: { q: "north", lifecycle: "active_client", sort: "name:asc", account: "account-2" },
    });

    expect(deps.search).not.toHaveProperty("account");
    expect(deps.search).toMatchObject({
      q: "north",
      lifecycle: "active_client",
      sort: "name:asc",
    });
  });

  it("restores lifecycle and sort from the URL and writes both back with page reset", () => {
    const Component = AccountsRoute.options.component as ComponentType;
    render(<Component />);

    const filters = captures.filterToolbar?.filters as Array<{
      id: string;
      value: string;
      onChange: (value: string) => void;
    }>;
    const sort = captures.filterToolbar?.sort as {
      value: string;
      onChange: (value: string) => void;
    };
    expect(filters[0].value).toBe("active_client");
    expect(sort.value).toBe("name:asc");

    act(() => filters[0].onChange("prospect"));
    const lifecycleNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(lifecycleNavigation.replace).toBe(true);
    expect(lifecycleNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "prospect",
      page: 1,
      sort: "name:asc",
      account: "account-2",
      unrelated: "keep",
    });

    // Sorting is a server read now, so changing it has to return to page 1 — page 4 of a
    // "Name A-Z" ordering is not page 4 of "Recent activity".
    act(() => sort.onChange("relationship_health:asc"));
    const sortNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(sortNavigation.replace).toBe(true);
    expect(sortNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "active_client",
      page: 1,
      sort: "relationship_health:asc",
      account: "account-2",
      unrelated: "keep",
    });
  });

  it("renders rows in the order the server returned, without re-sorting the page", () => {
    const Component = AccountsRoute.options.component as ComponentType;
    render(<Component />);

    // The old page sorted `accounts` locally, so "Name A-Z" ordered at most one page and
    // presented the result as the whole workspace.
    expect(captures.accountRows).toEqual(["account-1", "account-2", "account-3"]);
    const rowHref = captures.recordList?.rowHref as (row: { id: string }) => string;
    expect(rowHref(accounts[1])).toBe("/accounts/account-2");
  });

  it("opens the preview from a row action with push semantics", () => {
    const Component = AccountsRoute.options.component as ComponentType;
    render(<Component />);

    const rowActions = captures.recordList?.rowActions as (row: unknown) => {
      props: { onSelect: (event: { preventDefault: () => void }) => void };
    };
    act(() => rowActions(accounts[2]).props.onSelect({ preventDefault: () => {} }));

    const selectionNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(selectionNavigation.replace).toBeUndefined();
    expect(selectionNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "active_client",
      sort: "name:asc",
      account: "account-3",
      unrelated: "keep",
    });
  });

  it("keeps unsupported saved-view fields local and serializes supported fields", () => {
    const Component = AccountsRoute.options.component as ComponentType;
    render(<Component />);
    const savedConfig = {
      filters: { lifecycle_stage: "at_risk", account_owner: "owner-1", cs_owner: "cs-1" },
      columns: ["name", "next_action"],
      sort: { field: "relationship_health", direction: "desc" },
    };

    act(() => {
      (captures.viewSwitcher?.onSelect as (config: unknown) => void)(savedConfig);
    });

    expect((captures.viewSwitcher?.activeConfig as typeof savedConfig).filters).toMatchObject({
      lifecycle_stage: "active_client",
      account_owner: "owner-1",
      cs_owner: "cs-1",
    });
    expect((captures.viewSwitcher?.activeConfig as typeof savedConfig).columns).toEqual([
      "name",
      "next_action",
    ]);
    const savedNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(savedNavigation.replace).toBe(true);
    expect(savedNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "at_risk",
      page: 1,
      sort: "relationship_health:desc",
      account: "account-2",
      unrelated: "keep",
    });
  });

  it("clears every server-backed filter when the saved view is reset to current filters", () => {
    // "Current filters" used to be inert: once a saved view was applied there was no way
    // back to unfiltered from that control.
    const Component = AccountsRoute.options.component as ComponentType;
    render(<Component />);

    act(() => {
      (captures.viewSwitcher?.onClearView as () => void)();
    });

    const clearNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(clearNavigation.replace).toBe(true);
    expect(clearNavigation.search(AccountsRoute.useSearch())).toEqual({
      page: 1,
      account: "account-2",
      unrelated: "keep",
    });
  });

  it("clears and closes the preview when a selected account becomes stale or absent", async () => {
    const Component = AccountsRoute.options.component as ComponentType;
    const view = render(<Component />);

    await waitFor(() =>
      expect((captures.preview?.account as { id: string } | null)?.id).toBe("account-2"),
    );

    vi.mocked(AccountsRoute.useSearch).mockReturnValue({ account: "missing-account" } as never);
    view.rerender(<Component />);
    await waitFor(() => expect(captures.preview?.account).toBeNull());
    expect(captures.preview?.open).toBe(false);

    vi.mocked(AccountsRoute.useSearch).mockReturnValue({} as never);
    view.rerender(<Component />);
    await waitFor(() => expect(captures.preview?.account).toBeNull());
    expect(captures.preview?.open).toBe(false);
  });
});

describe("Quote detail tab URL state", () => {
  it("restores the selected tab and preserves quote edit and approval search on change", () => {
    vi.mocked(QuoteRoute.useLoaderData).mockReturnValue({
      quote: {
        id: "quote-1",
        number: "Q-001",
        status: "sent",
        line_items: [],
        total_value: 0,
        currency: "HKD",
        created_by: null,
        approved_by: null,
        client_id: null,
        lead_id: null,
        valid_until: "2026-08-01",
        created_at: "2026-07-14T00:00:00.000Z",
      },
      templates: [],
      versions: [],
      lead: null,
      client: null,
    } as never);
    const quoteSearch = { edit: true, approvalId: "approval-1", tab: "versions" };
    vi.mocked(QuoteRoute.useSearch).mockReturnValue(quoteSearch as never);

    const Component = QuoteRoute.options.component as ComponentType;
    render(<Component />);

    expect(captures.tabs?.value).toBe("versions");
    act(() => {
      (captures.tabs?.onValueChange as (tab: string) => void)("preview");
    });
    const navigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(navigation.replace).toBe(true);
    expect(navigation.search(quoteSearch)).toEqual({
      edit: true,
      approvalId: "approval-1",
      tab: "preview",
    });
  });
});

describe("Admin detail tab runtime navigation", () => {
  const cases = [
    {
      name: "account",
      route: AccountDetailRoute,
      loader: {
        requestId: "request-account",
        core: {
          company: {
            id: "account-1",
            name: "Northstar",
            lifecycle_stage: "active_client",
            account_owner: null,
            cs_owner: null,
            arr: 0,
            created_at: "2026-07-01",
            updated_at: "2026-07-14",
          },
          ownership: { accountOwnerId: null, csOwnerId: null },
          contacts: [],
        },
        overview: {
          status: "ready",
          data: {
            linkedClientCount: 0,
            activeEngagementCount: 0,
            quoteCount: 0,
            quoteTotals: [],
            openSignalCount: 0,
            openSignals: [],
          },
        },
        sections: {},
        cache: {
          core: { fetchedAt: "2026-07-14", freshForMs: 30_000 },
          overview: { fetchedAt: "2026-07-14", freshForMs: 30_000 },
          sections: {},
        },
      },
      currentTab: "timeline",
      defaultTab: "overview",
    },
    {
      name: "lead",
      route: LeadDetailRoute,
      loader: {
        lead: {
          id: "lead-1",
          company_name: "Northstar",
          status: "new",
          created_at: "2026-07-01",
          enquiry_text: "Campaign enquiry",
          qualification_data: null,
          lead_score: 50,
          source: "event",
          contact_name: "Ada",
          contact_email: "ada@example.com",
          contact_phone: "1234",
          assigned_to: null,
        },
        activityLogs: [],
        quotes: [],
      },
      currentTab: "activity",
      defaultTab: "overview",
    },
    {
      name: "client",
      route: ClientDetailRoute,
      loader: {
        requestId: "request-1",
        identity: {
          id: "client-1",
          accountId: null,
          primaryContactId: null,
          companyName: "Northstar",
          industry: "Technology",
          tier: "A",
          createdAt: "2026-07-01",
        },
        ownership: { accountOwnerId: null },
        relationship: {
          healthScore: 80,
          onboardingStatus: "active",
          renewalDate: null,
          renewalRisk: null,
          arr: 0,
        },
        counts: { contacts: 0, engagements: 0, quotes: 0, jobSheets: 0 },
      },
      currentTab: "contacts",
      defaultTab: "overview",
    },
    {
      name: "agent",
      route: AgentDetailRoute,
      loader: {
        // The whole catalogue shape, because the Governance tab reads `workflow_type` and
        // `capabilities` off it. "memory" and "config" are no longer tabs (M-1, IF-E1-07..12),
        // so the restore/clear pair is exercised against Governance.
        agent: {
          id: "qualify-lead",
          name: "qualify-lead",
          display_name: "Lead Agent",
          workflow_type: "qualify_lead",
          description: "Qualifies leads",
          status: "active",
          capabilities: ["ICP scoring"],
          role: "qualification",
          human_approval: false,
          model: "test-model",
        },
        history: {
          items: [],
          total: 0,
          page: 1,
          limit: 25,
          summary: { runs_24h: 0, avg_confidence: null },
        },
      },
      currentTab: "governance",
      defaultTab: "runs",
    },
    {
      name: "settings",
      route: SettingsRoute,
      loader: [],
      // Five of the seven settings tabs were removed as unpersisted surfaces (IF-E1-16..26),
      // so the pair exercised here is what is left: Products is the default and AI agents is
      // the one that has to survive a reload in the URL.
      currentTab: "agents",
      defaultTab: "products",
    },
  ] as const;

  for (const testCase of cases) {
    it(`restores and clears the ${testCase.name} tab while preserving unrelated search`, () => {
      vi.mocked(testCase.route.useLoaderData).mockReturnValue(testCase.loader as never);
      const currentSearch = { tab: testCase.currentTab, unrelated: "keep" };
      vi.mocked(testCase.route.useSearch).mockReturnValue(currentSearch as never);

      const Component = testCase.route.options.component as ComponentType;
      render(<Component />);

      expect(captures.tabs?.value).toBe(testCase.currentTab);
      act(() => {
        (captures.tabs?.onValueChange as (tab: string) => void)(testCase.defaultTab);
      });
      const navigation = navigateMock.mock.calls.at(-1)?.[0];
      expect(navigation.replace).toBe(true);
      expect(navigation.search(currentSearch)).toEqual({ unrelated: "keep" });
      cleanup();
      navigateMock.mockClear();
    });
  }
});

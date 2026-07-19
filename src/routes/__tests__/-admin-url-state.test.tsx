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
  tabs: null as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
  notFound: vi.fn(),
  useNavigate: vi.fn(() => navigateMock),
  useRouter: vi.fn(() => ({ invalidate: invalidateMock })),
}));

vi.mock("@tanstack/react-query", () => ({
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
  CommandHeader: () => null,
  MetricStrip: () => null,
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
  formatCurrencyAmount: (value: number) => String(value),
  formatDateTime: (value: string) => value,
}));
vi.mock("@/lib/pipeline", () => ({
  filterPipelineLeads: ({ leads }: { leads: unknown[] }) => leads,
  getPipelineSummary: () => ({ overdue: 0, dueToday: 0, highScore: 0 }),
}));
vi.mock("@/lib/sales-workspace", () => ({ buildRevenueActions: () => [] }));
vi.mock("@/server-functions/agent-runs", () => ({
  getActivityLogs: vi.fn(),
  getAgentRuns: vi.fn(),
}));
vi.mock("@/server-functions/leads", () => ({
  moveLeadStage: vi.fn(),
  triggerLeadAgent: vi.fn(),
  triggerLeadReplyDraft: vi.fn(),
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
vi.mock("@/server-functions/clients", () => ({ getClient: vi.fn(), getClients: vi.fn() }));
vi.mock("@/server-functions/relationship-signals", () => ({ getRelationshipSignals: vi.fn() }));
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
  captures.tabs = null;
  vi.mocked(Route.useLoaderData).mockReturnValue({
    leads,
    quotes: [],
    tasks: [],
    approvals: [],
    agentRuns: [],
    activityLogs: [],
    products: [],
  } as never);
  vi.mocked(Route.useSearch).mockReturnValue(search as never);
});

afterEach(cleanup);

describe("Revenue Desk URL state", () => {
  it("restores filters and selected lead, then navigates with the intended history semantics", () => {
    const Component = Route.options.component as ComponentType;
    render(<Component />);

    expect(captures.toolbar?.filters).toEqual({
      search: "northstar",
      source: "event",
      owner: "user-1",
      urgency: "overdue",
      aiState: "ready_for_review",
    });
    expect((captures.inspector?.lead as { id: string }).id).toBe("lead-2");

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
      clients: [],
      signals: [],
      preferences: { favorites: [], views: [] },
    } as never);
    vi.mocked(AccountsRoute.useSearch).mockReturnValue({
      lifecycle: "active_client",
      sort: "name:asc",
      account: "account-2",
      unrelated: "keep",
    } as never);
    vi.mocked(getCompanyWorkspaceCore).mockResolvedValue({
      company: accounts[1],
      contacts: [],
    } as never);
  });

  it("restores lifecycle, sort, and preview while preserving history semantics", async () => {
    const Component = AccountsRoute.options.component as ComponentType;
    render(<Component />);

    expect((screen.getByLabelText("Lifecycle") as HTMLSelectElement).value).toBe("active_client");
    expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe("name:asc");
    expect(captures.accountRows.slice(0, 2)).toEqual(["account-3", "account-2"]);
    await waitFor(() =>
      expect(getCompanyWorkspaceCore).toHaveBeenCalledWith({ data: { accountId: "account-2" } }),
    );

    act(() => {
      (screen.getByLabelText("Lifecycle") as HTMLSelectElement).value = "prospect";
      screen.getByLabelText("Lifecycle").dispatchEvent(new Event("change", { bubbles: true }));
    });
    const lifecycleNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(lifecycleNavigation.replace).toBe(true);
    expect(lifecycleNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "prospect",
      sort: "name:asc",
      account: "account-2",
      unrelated: "keep",
    });

    act(() => {
      screen.getByRole("button", { name: "Preview Northstar Media" }).click();
    });
    const selectionNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(selectionNavigation.replace).toBeUndefined();
    expect(selectionNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "active_client",
      sort: "name:asc",
      account: "account-2",
      unrelated: "keep",
    });

    act(() => {
      (captures.preview?.onOpenChange as (open: boolean) => void)(false);
    });
    const closeNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(closeNavigation.replace).toBeUndefined();
    expect(closeNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "active_client",
      sort: "name:asc",
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
    expect(new Set(captures.accountRows.slice(-1))).toEqual(new Set(["account-2"]));
    const savedNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(savedNavigation.replace).toBe(true);
    expect(savedNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "at_risk",
      sort: "relationship_health:desc",
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
        client: {
          id: "client-1",
          company_name: "Northstar",
          tier: "A",
          industry: "Technology",
          account_owner: null,
          account_id: null,
          health_score: 80,
          arr: 0,
          renewal_date: null,
          onboarding_status: "active",
          created_at: "2026-07-01",
        },
        quotes: [],
        engagements: [],
        contacts: [],
        products: [],
        touchpoints: [],
        jobSheets: [],
        tasks: [],
        activityLogs: [],
      },
      currentTab: "contacts",
      defaultTab: "overview",
    },
    {
      name: "agent",
      route: AgentDetailRoute,
      loader: {
        agent: {
          display_name: "Lead Agent",
          description: "Qualifies leads",
          status: "active",
          human_approval: false,
          model: "test-model",
        },
        runs: [],
      },
      currentTab: "memory",
      defaultTab: "runs",
    },
    {
      name: "settings",
      route: SettingsRoute,
      loader: [],
      currentTab: "team",
      defaultTab: "profile",
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

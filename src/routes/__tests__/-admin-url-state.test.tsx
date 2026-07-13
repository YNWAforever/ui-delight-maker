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
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: vi.fn(() => navigateMock),
  useRouter: vi.fn(() => ({ invalidate: invalidateMock })),
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
vi.mock("@/lib/business-date", () => ({ getBusinessDateKey: () => "2026-07-14" }));
vi.mock("@/lib/format", () => ({ formatCompactHKD: (value: number) => String(value) }));
vi.mock("@/lib/pipeline", () => ({
  filterPipelineLeads: ({ leads }: { leads: unknown[] }) => leads,
  getPipelineSummary: () => ({ overdue: 0, dueToday: 0, highScore: 0 }),
}));
vi.mock("@/lib/sales-workspace", () => ({ buildRevenueActions: () => [] }));
vi.mock("@/server-functions/agent-runs", () => ({ getActivityLogs: vi.fn() }));
vi.mock("@/server-functions/leads", () => ({
  moveLeadStage: vi.fn(),
  triggerLeadAgent: vi.fn(),
  triggerLeadReplyDraft: vi.fn(),
}));
vi.mock("@/server-functions/pipeline", () => ({ getPipelineData: vi.fn() }));
vi.mock("@/server-functions/products", () => ({ getProducts: vi.fn() }));
vi.mock("@/server-functions/quotes", () => ({ triggerQuoteAgent: vi.fn() }));
vi.mock("@/server-functions/tasks", () => ({ createTask: vi.fn() }));
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
vi.mock("@/server-functions/accounts", () => ({ getAccounts: vi.fn() }));
vi.mock("@/server-functions/clients", () => ({ getClients: vi.fn() }));
vi.mock("@/server-functions/relationship-signals", () => ({ getRelationshipSignals: vi.fn() }));
vi.mock("@/server-functions/workspace-preferences", () => ({
  getWorkspacePreferences: vi.fn(),
  togglePersonalWorkspaceFavorite: vi.fn(),
}));
vi.mock("@/server-functions/company-workspace", () => ({
  getCompanyWorkspaceCore: vi.fn(),
}));
import { Route } from "../index";
import { Route as AccountsRoute } from "../accounts";
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
    expect(new Set(captures.accountRows)).toEqual(new Set(["account-2"]));
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
    const savedNavigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(savedNavigation.replace).toBe(true);
    expect(savedNavigation.search(AccountsRoute.useSearch())).toEqual({
      lifecycle: "at_risk",
      sort: "relationship_health:desc",
      account: "account-2",
      unrelated: "keep",
    });
  });
});

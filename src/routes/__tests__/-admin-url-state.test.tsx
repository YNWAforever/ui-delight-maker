// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.hoisted(() => vi.fn());
const invalidateMock = vi.hoisted(() => vi.fn());
const captures = vi.hoisted(() => ({
  toolbar: null as Record<string, unknown> | null,
  board: null as Record<string, unknown> | null,
  inspector: null as Record<string, unknown> | null,
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

import { Route } from "../index";

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

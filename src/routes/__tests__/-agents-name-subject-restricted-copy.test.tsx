// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `loadAgentHistoryPage` (`src/server/read-models/agent-workspaces.ts`) sets
 * `subject_restricted: true` on a row when the reader lacks the view capability for that run's
 * `subject_type`, and nulls out both `input_data` and `output_summary` for it. `/agents/$name`
 * is supposed to render dedicated copy for that state — "Summary restricted." on the row itself,
 * and "Restricted. This run is about a record you do not have permission to view." in the
 * expanded input panel — instead of falling through to the unrestricted placeholders
 * ("No output summary recorded." / "—"), which would report a permission boundary as an absence
 * of data.
 *
 * Nothing pinned that: deleting both `subject_restricted` ternaries in `agents.$name.tsx` left
 * the repo compiling and every other test green. This file is that regression test.
 *
 * Harness cloned from `-agents-ai-ops-integrity.test.tsx`'s
 * "/agents/$name reports the catalogue's status, not the reader's clicks" block, which already
 * renders this exact component end to end via `AgentDetailRoute.options.component` — reused
 * rather than inventing a second way to mount it.
 */

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
  Outlet: () => null,
  notFound: vi.fn(),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ initialData }: { initialData: unknown }) => ({
    data: initialData,
    isFetching: false,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/server-functions/agent-runs", () => ({
  getAgentHistoryPage: vi.fn(),
}));

vi.mock("@/server-functions/agents-catalogue", () => ({
  getEffectiveAgentCatalogue: vi.fn(),
}));

vi.mock("@/components/sales", () => ({
  EmptyWorkspaceState: ({ title }: { title: string }) => <p>{title}</p>,
  ErrorState: () => null,
  MetricStrip: () => null,
  SectionHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  ),
  StatusBadge: (props: { domain?: string; value?: unknown }) => (
    <span data-testid="status-badge">{String(props.value)}</span>
  ),
  WorkspaceHeader: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  TabsContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import type { AgentHistoryItem } from "@/server/read-models/agent-workspaces";
import { Route as AgentDetailRoute } from "../agents.$name";

const AGENT_FIXTURE = {
  id: "qualify-lead",
  name: "qualify-lead",
  display_name: "Lead Qualification Agent",
  workflow_type: "qualify_lead",
  description: "Scores and qualifies leads",
  status: "active",
  capabilities: ["ICP scoring"],
  role: "qualification",
  model: "claude-sonnet-4-6",
  human_approval: true,
} as const;

function historyItem(overrides: Partial<AgentHistoryItem> & { id: string }): AgentHistoryItem {
  return {
    agent_name: "Lead Qualification Agent",
    workflow_type: "qualify_lead",
    trigger_type: "manual",
    subject_type: "lead",
    subject_id: "lead-1",
    output_summary: null,
    input_data: null,
    subject_restricted: false,
    status: "completed",
    duration_ms: null,
    tokens_used: null,
    confidence_score: null,
    human_review_required: false,
    created_at: "2026-08-27T10:00:00.000Z",
    updated_at: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

function renderDetail(items: AgentHistoryItem[]) {
  vi.mocked(AgentDetailRoute.useLoaderData).mockReturnValue({
    agent: AGENT_FIXTURE,
    history: {
      items,
      total: items.length,
      page: 1,
      limit: 25,
      summary: { runs_24h: 0, avg_confidence: null },
    },
  } as never);
  vi.mocked(AgentDetailRoute.useSearch).mockReturnValue({ page: 1 } as never);
  const Component = AgentDetailRoute.options.component as () => ReactNode;
  render(<Component />);
}

describe("/agents/$name renders the redaction copy subject_restricted implies", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows 'Summary restricted.' on a restricted row, not the unrestricted placeholder", () => {
    renderDetail([
      historyItem({ id: "run-restricted", subject_restricted: true, output_summary: null }),
    ]);

    expect(screen.getByText("Summary restricted.")).toBeTruthy();
    expect(screen.queryByText("No output summary recorded.")).toBeNull();
  });

  it("shows the input panel's restriction copy on a restricted row, not the '—' placeholder", () => {
    renderDetail([
      historyItem({ id: "run-restricted", subject_restricted: true, input_data: null }),
    ]);

    // Only the (unexpanded) row toggle carries aria-expanded at this point.
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(
      screen.getByText(
        "Restricted. This run is about a record you do not have permission to view.",
      ),
    ).toBeTruthy();
  });

  it("renders the populated summary for an unrestricted row", () => {
    renderDetail([
      historyItem({
        id: "run-open",
        subject_restricted: false,
        output_summary: "Qualified: strong ICP match, routed to sales.",
      }),
    ]);

    expect(screen.getByText("Qualified: strong ICP match, routed to sales.")).toBeTruthy();
    expect(screen.queryByText("Summary restricted.")).toBeNull();
  });
});

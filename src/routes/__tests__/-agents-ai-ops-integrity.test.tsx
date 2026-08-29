// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AI Ops slice held the product's most convincing lies: controls that looked and felt
 * exactly like working ones and moved nothing but React state.
 *
 * `/agents` toasted `"<agent> enabled"` from a `Switch` that called `setAgentStates`
 * (IF-E1-04, IF-E1-05) and offered Replay on every run with no re-dispatch function behind
 * it (IF-E1-06). `/agents/$name` had a second copy of the enable switch (IF-E1-07), an
 * "Auto-execute (no human approval)" switch whose description promised the approval inbox
 * (IF-E1-09), two sliders whose values were invented in the component (IF-E1-10, IF-E1-11),
 * and — worst — an "At a glance → Status" row rendered from that local state (IF-E1-08), so
 * flipping a switch that did nothing rewrote the status the page reported. BD-3 records that
 * there is no agent-config table in `neon/migrations/` at all: `status` and `human_approval`
 * are fields on the code-defined `AGENT_DEFINITIONS` catalogue.
 *
 * The assertions below are of three kinds, deliberately.
 *
 * **Source guards** — because "this control must not come back" is a claim about the file,
 * not about one render. A render test only covers the branch someone remembered to mount;
 * a reinstated `Switch` behind a feature flag would sail past it. This is the same tool
 * `-quotes-archive-removed.test.ts` and `-no-raw-error-text-in-routes.test.ts` use.
 *
 * **Pure-function tests** — the success-rate denominator and the attention ordering are
 * product rules, so they are exported and tested as rules rather than inferred from markup.
 *
 * **Render tests** — for the one thing only a render can prove: that the Status readout is
 * bound to the catalogue value and not to anything the user can move.
 */

const navigateMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn());
const captures = vi.hoisted(() => ({
  statusBadges: [] as Array<{ domain?: string; value?: unknown }>,
  tabValues: [] as string[],
  attentionItems: [] as Array<Record<string, unknown>>,
  metrics: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
    useRouteContext: vi.fn(),
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
  Outlet: () => null,
  notFound: vi.fn(),
  useNavigate: () => navigateMock,
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
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));

vi.mock("@/server-functions/agent-runs", () => ({
  getAgentDirectoryRead: vi.fn(),
  getAgentHistoryPage: vi.fn(),
}));

vi.mock("@/components/sales", () => ({
  AttentionQueue: ({ items }: { items: Array<Record<string, unknown>> }) => {
    captures.attentionItems = items;
    return null;
  },
  EmptyWorkspaceState: ({ title }: { title: string }) => <p>{title}</p>,
  ErrorState: () => null,
  FilterToolbar: () => null,
  FilteredEmptyState: () => null,
  MetricStrip: ({ metrics }: { metrics: Array<Record<string, unknown>> }) => {
    captures.metrics = metrics;
    return null;
  },
  ResponsiveRecordList: () => null,
  SectionHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  ),
  StaleDataIndicator: () => null,
  StatusBadge: (props: { domain?: string; value?: unknown }) => {
    captures.statusBadges.push(props);
    return <span data-testid="status-badge">{String(props.value)}</span>;
  },
  WorkspaceHeader: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ value, children }: { value: string; children?: ReactNode }) => {
    captures.tabValues.push(value);
    return <button type="button">{children}</button>;
  },
  TabsContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { AGENT_DETAIL_TABS, agentDetailSearchSchema } from "@/lib/admin-ux-search";
import type { AgentRunSummary } from "@/server/read-models/agent-workspaces";
import { Route as AgentsRoute } from "../agents";
import { Route as AgentDetailRoute } from "../agents.$name";

const READ_ONLY_SENTENCE =
  "Configuration is read-only until runtime policy enforcement is enabled.";

/**
 * `agents.$name.tsx` no longer carries `READ_ONLY_SENTENCE` above: enforcement shipped, so
 * saying it is not yet enabled is false. Task 10 (BD-3 slice 3) wires up `AgentPolicyForm`, so
 * the Governance description no longer says a write requires `agents.configure` — it says
 * these two fields are editable by anyone who holds it.
 */
const EDITABLE_VALUES_SENTENCE =
  "Catalogue state and Human approval are editable below by anyone holding the agents.configure capability; Workflow type, Model and Capabilities are fixed in code.";

const REGISTER_SENTENCE_BY_FILE: Record<(typeof ROUTE_FILES)[number], string> = {
  "agents.tsx": READ_ONLY_SENTENCE,
  "agents.$name.tsx": EDITABLE_VALUES_SENTENCE,
};

/**
 * `process.cwd()` rather than `import.meta.url`: under the jsdom environment this file
 * needs for its render tests, `import.meta.url` is not a project-rooted file URL, and a
 * source guard that silently read the wrong path would pass by finding nothing.
 */
const ROUTES_DIR = join(process.cwd(), "src", "routes");

function fullSource(fileName: string): string {
  const source = readFileSync(join(ROUTES_DIR, fileName), "utf8");
  // The failure mode of a source guard is looking nowhere and calling it clean.
  if (source.length < 500) throw new Error(`${fileName} read as ${source.length} bytes`);
  return source;
}

/** Doc comments in both files discuss the controls at length, so only code is searched. */
function executableSource(fileName: string): string {
  return fullSource(fileName)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ROUTE_FILES = ["agents.tsx", "agents.$name.tsx"] as const;

describe("AI Ops ships no ungoverned control", () => {
  for (const file of ROUTE_FILES) {
    it(`${file} imports no Switch and no Slider`, () => {
      const source = executableSource(file);
      // The import is the guard, not the JSX: a switch cannot be rendered without one, and
      // matching the tag alone would miss a renamed local alias.
      expect(source).not.toMatch(/from "@\/components\/ui\/switch"/);
      expect(source).not.toMatch(/from "@\/components\/ui\/slider"/);
    });

    it(`${file} never reports success for work it did not do`, () => {
      const source = executableSource(file);
      // toast.error survives: a refresh that genuinely failed should say so. What may not
      // survive is an assertion that something happened.
      expect(source).not.toMatch(/toast\s*\.\s*success/);
      expect(source).not.toMatch(/toast\s*\.\s*message/);
    });

    it(`${file} holds no local mirror of catalogue configuration`, () => {
      const source = executableSource(file);
      for (const setter of [
        "setAgentStates",
        "setEnabled",
        "setAutoApprove",
        "setTemp",
        "setConfThreshold",
      ]) {
        expect(source).not.toContain(setter);
      }
    });

    it(`${file} states the governance rule in the words the register uses`, () => {
      expect(fullSource(file)).toContain(REGISTER_SENTENCE_BY_FILE[file]);
    });
  }

  it("agents.tsx offers no replay, because no re-dispatch server function exists", () => {
    const source = executableSource("agents.tsx");
    expect(source).not.toMatch(/replay/i);
  });

  it("agents.$name.tsx binds its status readout to the catalogue, never to state", () => {
    const source = executableSource("agents.$name.tsx");
    // The exact expression IF-E1-08 flagged.
    expect(source).not.toMatch(/enabled\s*\?\s*"active"\s*:\s*"paused"/);
    expect(source).toContain("value={agent.status}");
  });

  it("agents.$name.tsx no longer navigates to an empty memory tab", () => {
    const source = executableSource("agents.$name.tsx");
    expect(source).not.toMatch(/value="memory"/);
    expect(source).not.toMatch(/value="config"/);
  });
});

describe("the removed Memory tab is unreachable, including by old links", () => {
  it("is not a tab any more", () => {
    expect([...AGENT_DETAIL_TABS]).toEqual(["runs", "governance"]);
  });

  it("drops an obsolete tab value rather than rendering an empty destination", () => {
    // `.catch(undefined)` on the enum, so `?tab=memory` and `?tab=config` land on Runs.
    expect(agentDetailSearchSchema.parse({ tab: "memory" })).toEqual({});
    expect(agentDetailSearchSchema.parse({ tab: "config" })).toEqual({});
    expect(agentDetailSearchSchema.parse({ tab: "governance" }).tab).toBe("governance");
  });
});

function run(overrides: Partial<AgentRunSummary> & { id: string }): AgentRunSummary {
  return {
    agent_name: "Lead Qualification Agent",
    trigger_type: "manual",
    output_summary: null,
    status: "completed",
    duration_ms: null,
    tokens_used: null,
    confidence_score: null,
    human_review_required: false,
    workflow_type: "qualify_lead",
    subject_type: "lead",
    subject_id: "lead-1",
    created_at: "2026-08-27T10:00:00.000Z",
    updated_at: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

const AGENT_FIXTURE = {
  id: "qualify-lead",
  name: "qualify-lead",
  display_name: "Lead Qualification Agent",
  workflow_type: "qualify_lead",
  description: "Scores and qualifies leads",
  status: "inactive",
  capabilities: ["ICP scoring"],
  role: "qualification",
  model: "claude-sonnet-4-6",
  human_approval: true,
} as const;

describe("/agents/$name reports the catalogue's status, not the reader's clicks", () => {
  beforeEach(() => {
    captures.statusBadges = [];
    captures.tabValues = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderDetail() {
    vi.mocked(AgentDetailRoute.useLoaderData).mockReturnValue({
      agent: AGENT_FIXTURE,
      history: {
        items: [],
        total: 0,
        page: 1,
        limit: 25,
        summary: { runs_24h: 0, avg_confidence: null },
      },
    } as never);
    vi.mocked(AgentDetailRoute.useSearch).mockReturnValue({ page: 1 } as never);
    // No agents.configure: the render tests below only need the read side to work, and a
    // disabled AgentPolicyForm proves that path without also exercising the write gate.
    vi.mocked(AgentDetailRoute.useRouteContext).mockReturnValue({
      capabilities: ["agents.view"],
    } as never);
    const Component = AgentDetailRoute.options.component as () => ReactNode;
    render(<Component />);
  }

  it("renders every agent-domain badge from the loader's catalogue entry", () => {
    renderDetail();

    const agentBadges = captures.statusBadges.filter((badge) => badge.domain === "agents");
    expect(agentBadges.length).toBeGreaterThan(0);
    // The fixture's catalogue status is "inactive". Nothing on the page can produce
    // "active"/"paused" from component state any more.
    expect(agentBadges.every((badge) => badge.value === "inactive")).toBe(true);
  });

  it("offers exactly the two tabs that have something in them", () => {
    renderDetail();
    expect(captures.tabValues).toEqual(["runs", "governance"]);
  });

  it("says what has to exist before the settings come back", () => {
    renderDetail();
    expect(screen.getByText(/Required before settings become editable/)).toBeTruthy();
    expect(screen.getByText(new RegExp(EDITABLE_VALUES_SENTENCE))).toBeTruthy();
    // The Memory tab's one sentence survives as prose here rather than as a destination.
    expect(screen.getByText(/Long-term memory/)).toBeTruthy();
  });

  it("shows the catalogue's approval rule rather than a toggle", () => {
    renderDetail();
    // human_approval: true on the fixture.
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);
  });
});

describe("/agents reports the aggregates the read model returned", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("takes its KPI numbers from `operations`, not from the fifty loaded runs", () => {
    vi.mocked(AgentsRoute.useLoaderData).mockReturnValue({
      agents: [],
      // Deliberately inconsistent with recentRuns: the strip must read the aggregate,
      // which counts every row in agent_runs, not the page the loader happened to bring.
      operations: {
        runs_24h: 412,
        completed_24h: 400,
        failed_24h: 4,
        success_rate: 0.99,
        waiting_approval: 3,
        running: 2,
        stuck_runs: 1,
        needs_attention: 8,
        tokens_24h: 0,
        avg_confidence: 0.82,
      },
      attentionRuns: [],
      recentRuns: [run({ id: "only-one" })],
    } as never);

    const Component = AgentsRoute.options.component as () => ReactNode;
    render(<Component />);

    const byId = new Map(captures.metrics.map((metric) => [metric.id, metric.value]));
    expect(byId.get("runs-24h")).toBe("412");
    // Server-computed now, over every row rather than the loaded page.
    expect(byId.get("success-rate")).toBe("99%");
    // Server-computed: stuck + failed + waiting = 1 + 4 + 3.
    expect(byId.get("needs-attention")).toBe("8");
    expect(byId.get("running")).toBe("2");
  });
});

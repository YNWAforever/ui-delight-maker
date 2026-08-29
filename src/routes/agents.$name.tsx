import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { Bot, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import {
  EmptyWorkspaceState,
  ErrorState,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  WorkspaceHeader,
  type SalesMetric,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { agentDetailSearchSchema } from "@/lib/admin-ux-search";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { formatCount, formatDateTime, formatPercent } from "@/lib/format";
import { getAgentHistoryPage } from "@/server-functions/agent-runs";
import { getEffectiveAgentCatalogue } from "@/server-functions/agents-catalogue";

/**
 * One agent: its run history, and the catalogue definition the dispatch path reads.
 *
 * The tab this replaces was called "Config" and held five controls that wrote nothing:
 * an Enabled switch that toasted `"Agent enabled"` (IF-E1-07), an Auto-execute switch whose
 * description promised "when off, all actions go to the approval inbox" (IF-E1-09), and two
 * sliders whose values — 0.4 and 0.75 — were invented in the component and read by nothing
 * on either side of the wire (IF-E1-10, IF-E1-11). Sharpest of all, the "At a glance →
 * Status" row rendered `enabled ? "active" : "paused"` from that local state (IF-E1-08), so
 * flipping a switch that did nothing visibly rewrote the status the page reported, while the
 * n8n dispatch path went on running the agent.
 *
 * `status` and `human_approval` now come from `loadEffectiveAgentCatalogue` — the policy store
 * laid over the code catalogue — because those two fields are exactly what the dispatch path
 * and the writeback obey; every other field (model, capabilities, description, workflow type)
 * still comes straight from the code catalogue, since nothing overrides them. Nothing on this
 * page writes. BD-3 records what has to exist before any of it can become editable, and the
 * Governance tab states it on the page rather than leaving a reader to assume the controls
 * were merely misbehaving.
 *
 * The Memory tab is gone (M-1). It was a URL-addressable destination whose entire body was
 * one sentence saying memory is not persisted — Instruction §16's "coming soon presented as
 * active navigation", and a tab that costs a click to learn nothing. The fact it carried,
 * plus the three prerequisites BD-4 names that it never mentioned, is stated in Governance
 * where the rest of the not-yet-real surface is described.
 */

const agentHistorySearchSchema = agentDetailSearchSchema.extend({
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

const HISTORY_PAGE_SIZE = 25;

const historyQuery = (agent: string, page: number) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.agents.section(agent, "history", { page, limit: HISTORY_PAGE_SIZE }),
    queryFn: () => getAgentHistoryPage({ data: { agent, page, limit: HISTORY_PAGE_SIZE } }),
  });

const effectiveCatalogueQuery = () =>
  routeQueryOptions({
    queryKey: crmQueryKeys.agents.section("catalogue", "effective"),
    queryFn: () => getEffectiveAgentCatalogue(),
  });

/**
 * Governance wording for `AgentDefinition.human_approval`.
 *
 * Deliberately not routed through `getStatusLabel`: this is not a record's lifecycle state,
 * it is a property of the workflow, and borrowing the status vocabulary for it is how a KPI
 * ends up labelled "Draft".
 */
const HUMAN_APPROVAL_LABEL = { required: "Required", auto: "Auto-execute" } as const;

/**
 * What BD-3 and BD-4 say has to exist before any of this page becomes editable.
 *
 * Written out on the page rather than left in a design document, because the reader who
 * needs it is the one looking at a control that is missing and wondering whether it broke.
 */
const GOVERNANCE_PREREQUISITES = [
  "A versioned policy store, so a change to an agent has an author, a time and a previous value.",
  "Server-side enforcement in the dispatch path, so a paused agent actually stops running.",
  "Capability checks on policy writes, so reading this page is not the same permission as changing it.",
  "An audit log covering every change, alongside the one Admin already keeps for users.",
  "Rollback to a previous version, so a bad change is recoverable without a deploy.",
  "Runtime telemetry, so the effect of a change is observable rather than assumed.",
];

const MEMORY_PREREQUISITES = [
  "Persistence for long-term and episodic memory, which no migration provides today.",
  "A retention policy, since memory would hold client conversation content.",
  "Access controls and deletion and audit behaviour, so a record can be removed on request.",
];

export const Route = createFileRoute("/agents/$name")({
  validateSearch: agentHistorySearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context, params, deps }) => {
    const catalogue = await context.queryClient.ensureQueryData(effectiveCatalogueQuery());
    const agent = catalogue.find((item) => item.name === params.name);
    if (!agent) throw notFound();
    const history = await context.queryClient.ensureQueryData(
      historyQuery(agent.display_name, deps.page),
    );
    return { agent, history };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.agent.display_name ?? "Agent"} — Fimmick ClientOps` },
      {
        name: "description",
        content: `Run history and catalogue definition for ${loaderData?.agent.display_name ?? "this agent"}.`,
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="px-4 py-8 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Agent not found</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        No agent in the catalogue uses this name. The catalogue is fixed in code, so a link pointing
        at an agent that was renamed will not resolve.
      </p>
      <Link to="/agents" className="mt-4 inline-block text-sm text-primary hover:underline">
        Back to AI Ops
      </Link>
    </div>
  ),
  errorComponent: AgentDetailErrorState,
  component: AgentDetail,
});

/**
 * The loader reaches raw Neon SQL through `getAgentHistoryPage`. Without this the thrown
 * text — a capability denial or a driver message quoting the statement — rendered into the
 * page body through the root boundary.
 */
function AgentDetailErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This agent did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/agents/$name" });
        }}
      />
    </div>
  );
}

function AgentDetail() {
  const loaderData = Route.useLoaderData();
  const { agent } = loaderData;
  const search = Route.useSearch();
  const { data: history } = useQuery({
    ...historyQuery(agent.display_name, search.page),
    initialData: loaderData.history,
  });
  const runs = history.items;
  const navigate = useNavigate({ from: Route.fullPath });
  const [expanded, setExpanded] = useState<string | null>(null);

  const { runs_24h, avg_confidence } = history.summary;
  const lastPage = Math.max(1, Math.ceil(history.total / history.limit));
  const humanApproval = agent.human_approval
    ? HUMAN_APPROVAL_LABEL.required
    : HUMAN_APPROVAL_LABEL.auto;

  const metrics: SalesMetric[] = [
    { id: "runs-24h", label: "Runs (24h)", value: formatCount(runs_24h), hint: "this agent" },
    { id: "runs-total", label: "Runs on record", value: formatCount(history.total) },
    {
      id: "confidence",
      label: "Avg confidence",
      value: avg_confidence == null ? "—" : formatPercent(avg_confidence),
      hint: "across every scored run",
    },
  ];

  const pageFailures = runs.filter((run) => run.status === "failed").length;
  const pageFlagged = runs.filter((run) => run.human_review_required).length;

  return (
    <>
      <WorkspaceHeader
        context="Operate"
        title={agent.display_name}
        description={agent.description}
        backHref={{ to: "/agents", label: "All agents" }}
      />

      <div className="grid grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <MetricStrip metrics={metrics} columns={3} />

          <Card>
            <CardContent className="p-5">
              <Tabs
                value={search.tab ?? "runs"}
                onValueChange={(tab) =>
                  navigate({
                    search: (current) => ({
                      ...current,
                      tab: tab === "runs" ? undefined : (tab as NonNullable<typeof search.tab>),
                    }),
                    replace: true,
                  })
                }
              >
                <div className="max-w-full overflow-x-auto pb-1">
                  <TabsList className="w-max">
                    <TabsTrigger value="runs">Runs</TabsTrigger>
                    <TabsTrigger value="governance">Governance</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="runs" className="mt-4 space-y-4">
                  <SectionHeader
                    title="Run history"
                    description={`Every run recorded for this agent, newest first, ${HISTORY_PAGE_SIZE} to a page.`}
                  />
                  {runs.length === 0 ? (
                    <EmptyWorkspaceState
                      icon={Bot}
                      title={history.total === 0 ? "No runs recorded" : "No runs on this page"}
                      description={
                        history.total === 0
                          ? "Runs appear here as soon as this agent is dispatched from a lead, quote or account."
                          : "Page back to reach the runs that do exist."
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {runs.map((run) => {
                        const open = expanded === run.id;
                        return (
                          <li key={run.id} className="py-3">
                            <button
                              type="button"
                              aria-expanded={open}
                              className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setExpanded(open ? null : run.id)}
                            >
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                {open ? (
                                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium">{run.id}</span>
                                  <StatusBadge domain="agentRuns" value={run.status} />
                                  {run.confidence_score != null && (
                                    <span className="text-xs text-muted-foreground">
                                      confidence {formatPercent(run.confidence_score)}
                                    </span>
                                  )}
                                </span>
                                <span className="mt-1 block text-sm text-muted-foreground">
                                  {run.output_summary ?? "No output summary recorded."}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {formatDateTime(run.created_at)}
                                  {run.tokens_used != null
                                    ? ` · ${formatCount(run.tokens_used)} tokens`
                                    : ""}
                                </span>
                              </span>
                            </button>
                            {open && (
                              <div className="mt-3 ml-11 space-y-2">
                                <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                                  <span className="font-medium text-primary">Input data</span>
                                  {"\n"}
                                  {run.input_data ? JSON.stringify(run.input_data, null, 2) : "—"}
                                </pre>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Page {history.page} of {lastPage} · {formatCount(history.total)} runs
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous agent history page"
                      disabled={history.page <= 1}
                      onClick={() =>
                        navigate({
                          search: (current) => ({ ...current, page: history.page - 1 }),
                          replace: true,
                        })
                      }
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Next agent history page"
                      disabled={history.page >= lastPage}
                      onClick={() =>
                        navigate({
                          search: (current) => ({ ...current, page: history.page + 1 }),
                          replace: true,
                        })
                      }
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="governance" className="mt-4 space-y-5">
                  <SectionHeader
                    title="Catalogue definition"
                    description="Catalogue state and Workflow type govern dispatch: an inactive agent is refused before any run is created. Human approval governs the writeback, deciding whether a finished run parks for a human; Model and Capabilities are descriptive only. These are the values the dispatch path enforces today - changing them requires the agents.configure capability."
                  />

                  <dl className="divide-y divide-border rounded-md border border-border">
                    <GovernanceRow label="Catalogue state">
                      <StatusBadge domain="agents" value={agent.status} />
                    </GovernanceRow>
                    <GovernanceRow label="Workflow type">
                      <code className="text-xs">{agent.workflow_type}</code>
                    </GovernanceRow>
                    <GovernanceRow label="Model">
                      <code className="text-xs">{agent.model}</code>
                    </GovernanceRow>
                    <GovernanceRow label="Human approval">
                      <span className="text-sm">{humanApproval}</span>
                    </GovernanceRow>
                    <GovernanceRow label="Capabilities">
                      <span className="text-right text-sm">{agent.capabilities.join(" · ")}</span>
                    </GovernanceRow>
                  </dl>

                  <div className="rounded-md border border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-medium text-foreground">
                      Required before settings become editable
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {GOVERNANCE_PREREQUISITES.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-medium text-foreground">Long-term memory</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nothing this agent learns is retained between runs. Each dispatch sees only
                      the record it was given, so there is no memory to browse and no tab that would
                      show one.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {MEMORY_PREREQUISITES.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">At a glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/*
              Bound to `agent.status` — the catalogue value the dispatch path reads — and not
              to any component state. That binding is the whole point: the previous version
              rendered this row from a switch, so the page reported a status the running
              system did not have.
            */}
            <Row label="Catalogue state">
              <StatusBadge domain="agents" value={agent.status} />
            </Row>
            <Row label="Human approval" value={humanApproval} />
            <Row label="Model">
              <code className="text-xs">{agent.model}</code>
            </Row>
            <Row label="Runs (24h)" value={formatCount(runs_24h)} />
            <Row
              label="Avg confidence"
              value={avg_confidence == null ? "—" : formatPercent(avg_confidence)}
            />
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                <Bot className="mr-1 inline h-3 w-3" aria-hidden="true" />
                On this page
              </p>
              <p className="mt-1 leading-snug">
                {formatCount(runs.length)} runs shown · {formatCount(pageFailures)} failed ·{" "}
                {formatCount(pageFlagged)} flagged for review. Page back for older runs.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function GovernanceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{children ?? value}</span>
    </div>
  );
}

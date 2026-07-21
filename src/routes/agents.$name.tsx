import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft, Bot, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { agentDetailSearchSchema } from "@/lib/admin-ux-search";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { formatCount, formatDateTime } from "@/lib/format";
import { getAgentHistoryPage } from "@/server-functions/agent-runs";
import { AGENT_DEFINITIONS } from "@/lib/agents";

const agentHistorySearchSchema = agentDetailSearchSchema.extend({
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

const historyQuery = (agent: string, page: number) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.agents.section(agent, "history", { page, limit: 25 }),
    queryFn: () => getAgentHistoryPage({ data: { agent, page, limit: 25 } }),
  });

export const Route = createFileRoute("/agents/$name")({
  validateSearch: agentHistorySearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context, params, deps }) => {
    const agent = AGENT_DEFINITIONS.find((item) => item.name === params.name);
    if (!agent) throw notFound();
    const history = await context.queryClient.ensureQueryData(
      historyQuery(agent.display_name, deps.page),
    );
    return { agent, history };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.agent.display_name ?? "Agent"} — ClientOps` },
      {
        name: "description",
        content: `Run history, memory, and config for ${loaderData?.agent.display_name}.`,
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Agent not found</h1>
      <Link to="/agents" className="mt-2 inline-block text-sm text-primary hover:underline">
        ← Back to agents
      </Link>
    </div>
  ),
  component: AgentDetail,
});

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
  const [temp, setTemp] = useState([0.4]);
  const [confThreshold, setConfThreshold] = useState([0.75]);
  const [enabled, setEnabled] = useState(agent.status === "active");
  const [autoApprove, setAutoApprove] = useState(!agent.human_approval);

  const { runs_24h, avg_confidence } = history.summary;
  const lastPage = Math.max(1, Math.ceil(history.total / history.limit));

  return (
    <>
      <PageHeader
        title={agent.display_name}
        description={agent.description}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/agents">
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> All agents
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
                  <TabsTrigger value="memory">Memory</TabsTrigger>
                  <TabsTrigger value="config">Config</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="runs" className="mt-4">
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs on this page.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {runs.map((r) => {
                      const open = expanded === r.id;
                      return (
                        <li key={r.id} className="py-3">
                          <button
                            className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setExpanded(open ? null : r.id)}
                          >
                            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{r.id}</span>
                                <StatusBadge value={r.status} />
                                {r.confidence_score != null && (
                                  <span className="text-xs text-muted-foreground">
                                    conf {(r.confidence_score * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {r.output_summary}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(r.created_at)}
                                {r.tokens_used != null
                                  ? ` · ${formatCount(r.tokens_used)} tokens`
                                  : ""}
                              </p>
                            </div>
                          </button>
                          {open && (
                            <div className="mt-3 ml-11 space-y-2">
                              <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                                <span className="font-medium text-primary">Input data</span>
                                {"\n"}
                                {r.input_data ? JSON.stringify(r.input_data, null, 2) : "—"}
                              </pre>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    Page {history.page} of {lastPage} ({history.total} runs)
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
                    <ArrowLeft className="h-4 w-4" />
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
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="memory" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Agent memory is not yet persisted. Long-term and episodic memory will appear here
                  once the memory system is enabled.
                </p>
              </TabsContent>

              <TabsContent value="config" className="mt-4 space-y-5">
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Enabled</p>
                    <p className="text-xs text-muted-foreground">Agent runs when triggered.</p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => {
                      setEnabled(v);
                      toast.success(`Agent ${v ? "enabled" : "paused"}`);
                    }}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Auto-execute (no human approval)</p>
                    <p className="text-xs text-muted-foreground">
                      When off, all actions go to the approval inbox.
                    </p>
                  </div>
                  <Switch
                    aria-label="Auto-execute without human approval"
                    checked={autoApprove}
                    onCheckedChange={setAutoApprove}
                  />
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="agent-temperature" className="text-sm">
                      Temperature
                    </Label>
                    <span className="text-sm tabular-nums">{temp[0].toFixed(2)}</span>
                  </div>
                  <Slider
                    id="agent-temperature"
                    value={temp}
                    onValueChange={setTemp}
                    min={0}
                    max={1}
                    step={0.05}
                    className="mt-3"
                  />
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="agent-confidence-threshold" className="text-sm">
                      Confidence threshold (escalate below)
                    </Label>
                    <span className="text-sm tabular-nums">{confThreshold[0].toFixed(2)}</span>
                  </div>
                  <Slider
                    id="agent-confidence-threshold"
                    value={confThreshold}
                    onValueChange={setConfThreshold}
                    min={0.5}
                    max={1}
                    step={0.05}
                    className="mt-3"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">At a glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Status">
              <StatusBadge value={enabled ? "active" : "paused"} />
            </Row>
            <Row label="Model">
              <code className="text-xs">{agent.model}</code>
            </Row>
            <Row
              label="Avg confidence"
              value={avg_confidence != null ? `${(avg_confidence * 100).toFixed(0)}%` : "—"}
            />
            <Row label="Runs (24h)" value={String(runs_24h)} />
            <Row label="Human approval" value={autoApprove ? "Auto-execute" : "Required"} />
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                <Bot className="mr-1 inline h-3 w-3" />
                Recent behavior
              </p>
              <p className="mt-1 leading-snug">
                {runs.length} runs visible · {runs.filter((r) => r.status === "failed").length}{" "}
                failed · {runs.filter((r) => r.human_review_required).length} flagged for review.
              </p>
              {/* human_review_required from Supabase AgentRun type */}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
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

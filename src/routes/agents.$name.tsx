import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      { title: `${loaderData?.agent.display_name ?? "Agent"} — AI Ops` },
      {
        name: "description",
        content: `Run history and governance status for ${loaderData?.agent.display_name}.`,
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Agent not found</h1>
      <Link to="/agents" className="mt-2 inline-block text-sm text-primary hover:underline">
        ← Back to AI Ops
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
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> AI Ops
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
                  <TabsTrigger value="config">Governance</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="runs" className="mt-4">
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs on this page.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {runs.map((run) => {
                      const open = expanded === run.id;
                      return (
                        <li key={run.id} className="py-3">
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setExpanded(open ? null : run.id)}
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
                                <span className="font-mono text-xs">{run.id}</span>
                                <StatusBadge value={run.status} />
                                {run.confidence_score != null ? (
                                  <span className="text-xs text-muted-foreground">
                                    confidence {(run.confidence_score * 100).toFixed(0)}%
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {run.output_summary ?? "No output summary recorded."}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(run.created_at)}
                                {run.tokens_used != null
                                  ? ` · ${formatCount(run.tokens_used)} tokens`
                                  : ""}
                              </p>
                            </div>
                          </button>
                          {open ? (
                            <div className="mt-3 ml-11 space-y-2">
                              <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                                <span className="font-medium text-primary">Input data</span>
                                {"\n"}
                                {run.input_data ? JSON.stringify(run.input_data, null, 2) : "—"}
                              </pre>
                            </div>
                          ) : null}
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
                <div className="rounded-md border border-border p-4">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Memory is not persisted</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Long-term, episodic, and account-scoped memory must have explicit retention,
                        access, deletion, and audit policies before it is enabled.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="config" className="mt-4 space-y-4">
                <div className="rounded-md border border-warning/30 bg-warning/5 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">Read-only governance profile</p>
                        <StatusBadge value="active" label="Catalogue state" />
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        ClientOps does not yet persist or enforce per-agent enablement, model,
                        temperature, confidence threshold, token budget, or auto-approval policy.
                        Showing editable controls before a server-side policy gate exists would be
                        misleading, so this page reports the current code-defined behavior only.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <GovernanceItem label="Workflow identity" value={agent.workflow_type} />
                  <GovernanceItem label="Runtime state" value={agent.status} />
                  <GovernanceItem label="Model catalogue" value={agent.model} />
                  <GovernanceItem
                    label="Human review behavior"
                    value={agent.human_approval ? "Policy-based review" : "Advisory output"}
                  />
                </div>

                <div className="rounded-md border border-border p-4">
                  <h3 className="text-sm font-medium">Required before controls become editable</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Add a versioned agent-policy store, enforce it in every dispatch path, require
                    capability checks for changes, record an audit event, support rollback, and
                    verify the effective policy in runtime telemetry.
                  </p>
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
              <StatusBadge value={agent.status} />
            </Row>
            <Row label="Model">
              <code className="text-xs">{agent.model}</code>
            </Row>
            <Row
              label="Avg confidence"
              value={avg_confidence != null ? `${(avg_confidence * 100).toFixed(0)}%` : "—"}
            />
            <Row label="Runs (24h)" value={String(runs_24h)} />
            <Row
              label="Human review"
              value={agent.human_approval ? "Policy-based" : "Advisory only"}
            />
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                <Bot className="mr-1 inline h-3 w-3" />
                Recent behavior
              </p>
              <p className="mt-1 leading-snug">
                {runs.length} runs visible · {runs.filter((run) => run.status === "failed").length}{" "}
                failed · {runs.filter((run) => run.human_review_required).length} flagged for
                review.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function GovernanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value.replace(/_/g, " ")}</p>
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

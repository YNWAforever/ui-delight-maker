import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Bot, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  AttentionQueue,
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
  type FilterOption,
  type SalesMetric,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useClientNow } from "@/hooks/use-client-now";
import { buildAgentAttentionItems } from "@/lib/agent-ops";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDateTime, formatPercent } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import { getStatusLabel } from "@/lib/status-labels";
import type { AgentRunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  getAgentDirectoryRead,
  type AgentDirectoryRead,
  type AgentRunSummary,
} from "@/server-functions/agent-runs";

/**
 * AI Ops.
 *
 * What this page used to do, and why none of it is here any more: every agent card carried
 * an enable/pause `Switch` that called `setAgentStates` and then toasted
 * `"<agent> enabled"` (IF-E1-04, IF-E1-05), and every recent run carried a Replay button
 * that toasted `Replaying <id>` (IF-E1-06). There is no agent-config table in
 * `neon/migrations/` and no re-dispatch export in `src/server-functions/` — `status` and
 * `human_approval` are fields on the code-defined `AGENT_DEFINITIONS` catalogue, and the
 * three GET functions in `agent-runs.ts` are the whole server surface. So the switch moved
 * a boolean in React and the toast asserted an operational change that never left the
 * browser (BD-3).
 *
 * Catalogue state is now a read-only badge and replay is gone. Nothing on this page writes.
 */

const AGENT_DIRECTORY_KEY = crmQueryKeys.agents.list({ view: "directory" });

const agentDirectoryQuery = () =>
  routeQueryOptions({
    queryKey: AGENT_DIRECTORY_KEY,
    queryFn: () => getAgentDirectoryRead(),
  });

/** The four values `agent_runs_status_check` allows, in operator-attention order. */
const RUN_STATUS_FILTER_VALUES: AgentRunStatus[] = [
  "running",
  "waiting_approval",
  "failed",
  "completed",
];

export const Route = createFileRoute("/agents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentDirectoryQuery()),
  head: () => ({
    meta: [
      { title: "AI Ops — Fimmick ClientOps" },
      {
        name: "description",
        content: "Agent run health, exceptions awaiting a human, and recent run history.",
      },
    ],
  }),
  errorComponent: AgentsErrorState,
  component: AgentsRoute,
});

/**
 * Without this the loader's failures fell through to the root boundary, which prints the
 * thrown text into the page body — and this loader reaches raw Neon SQL, so that text is a
 * driver message quoting the failing statement.
 */
function AgentsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="AI Ops did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/agents" });
        }}
      />
    </div>
  );
}

function AgentsRoute() {
  const isIndexRoute = useIsExactPath("/agents");
  if (!isIndexRoute) return <Outlet />;
  return <AgentsMonitor />;
}

function AgentsMonitor() {
  const initialData = Route.useLoaderData() as AgentDirectoryRead;
  const queryClient = useQueryClient();
  const clientNow = useClientNow();
  const directoryQuery = useQuery({
    ...agentDirectoryQuery(),
    initialData,
    // Replaces a hand-rolled setInterval + invalidateQueries pair. Same 45s cadence, but it
    // pauses with the tab and stops when the component unmounts, which the interval did not.
    refetchInterval: 45_000,
  });
  const directory = directoryQuery.data;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const slugByDisplayName = useMemo(
    () => new Map(directory.agents.map((agent) => [agent.display_name, agent.name])),
    [directory.agents],
  );

  const attentionItems = useMemo(
    () => buildAgentAttentionItems(directory.attentionRuns, slugByDisplayName, clientNow),
    [directory.attentionRuns, slugByDisplayName, clientNow],
  );

  const filteredRuns = useMemo(
    () =>
      statusFilter === "all"
        ? directory.recentRuns
        : directory.recentRuns.filter((run) => run.status === statusFilter),
    [directory.recentRuns, statusFilter],
  );

  const operations = directory.operations;
  // main's read model precomputes both, over ALL runs rather than the recent-runs window
  // this route loads — so a stuck run older than that window is counted here and was
  // invisible to the client-side derivation this replaces.
  const successRate = operations.success_rate;
  const needsAttention = operations.needs_attention;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: AGENT_DIRECTORY_KEY, exact: true });
    } catch (error) {
      toast.error(toSafeErrorMessage(error, "stale"));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshBusy = refreshing || directoryQuery.isFetching;

  const primaryMetrics: SalesMetric[] = [
    {
      id: "runs-24h",
      label: "Runs (24h)",
      value: formatCount(operations.runs_24h),
      hint: "every agent",
    },
    {
      id: "success-rate",
      label: "Success rate (24h)",
      value: successRate === null ? "—" : formatPercent(successRate),
      hint: successRate === null ? "no runs settled yet" : "of runs that finished",
      tone: successRate === null ? "neutral" : successRate < 0.9 ? "warning" : "success",
    },
    {
      id: "needs-attention",
      label: "Needs attention",
      value: formatCount(needsAttention),
      hint: "stuck, failed or waiting",
      tone: needsAttention > 0 ? "destructive" : "neutral",
    },
    {
      id: "running",
      label: "Running now",
      value: formatCount(operations.running),
      hint: "in flight",
      tone: operations.running > 0 ? "info" : "neutral",
    },
  ];

  const supportingMetrics: SalesMetric[] = [
    { id: "waiting", label: "Waiting approval", value: formatCount(operations.waiting_approval) },
    { id: "failed", label: "Failed (24h)", value: formatCount(operations.failed_24h) },
    {
      id: "stuck",
      label: `Stuck over ${AGENT_RUN_STUCK_MINUTES}m`,
      value: formatCount(operations.stuck_runs),
    },
    {
      id: "confidence",
      label: "Avg confidence (24h)",
      value: operations.avg_confidence === null ? "—" : formatPercent(operations.avg_confidence),
    },
  ];

  const statusOptions: FilterOption[] = [
    { value: "all", label: "All run statuses" },
    ...RUN_STATUS_FILTER_VALUES.map((value) => ({
      value,
      label: getStatusLabel("agentRuns", value).label,
    })),
  ];

  const runColumns: ColumnDef<AgentRunSummary>[] = [
    {
      id: "agent",
      header: "Agent",
      priority: "primary",
      sticky: true,
      cell: (run) => <span className="font-medium text-foreground">{run.agent_name}</span>,
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (run) => <StatusBadge domain="agentRuns" value={run.status} />,
    },
    {
      id: "when",
      header: "When",
      priority: "primary",
      cell: (run) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(run.created_at)}</span>
      ),
    },
    {
      id: "trigger",
      header: "Trigger",
      priority: "secondary",
      cell: (run) => (
        <span className="text-xs capitalize text-muted-foreground">{run.trigger_type ?? "—"}</span>
      ),
    },
    {
      id: "duration",
      header: "Duration",
      priority: "secondary",
      numeric: true,
      cell: (run) => (run.duration_ms == null ? "—" : `${(run.duration_ms / 1000).toFixed(1)}s`),
    },
    {
      id: "tokens",
      header: "Tokens",
      priority: "tertiary",
      numeric: true,
      cell: (run) => (run.tokens_used == null ? "—" : formatCount(run.tokens_used)),
    },
    {
      id: "confidence",
      header: "Confidence",
      priority: "tertiary",
      numeric: true,
      cell: (run) => (run.confidence_score == null ? "—" : formatPercent(run.confidence_score)),
    },
  ];

  const renderRunDetails = (run: AgentRunSummary) => (
    <p className="text-sm text-muted-foreground">
      {run.output_summary ?? "No output summary recorded."}
    </p>
  );

  const renderRunCard = (run: AgentRunSummary) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{run.agent_name}</span>
        <StatusBadge domain="agentRuns" value={run.status} />
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {run.output_summary ?? "No output summary recorded."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatDateTime(run.created_at)}
        {run.tokens_used == null ? "" : ` · ${formatCount(run.tokens_used)} tokens`}
      </p>
    </div>
  );

  return (
    <>
      <WorkspaceHeader
        context="Operate"
        title="AI Ops"
        description={`${formatCount(operations.running)} running now, ${formatCount(needsAttention)} needing a human. Decisions are made in AI Review.`}
        status={
          clientNow === null ? undefined : (
            <StaleDataIndicator
              updatedAt={new Date(directoryQuery.dataUpdatedAt).toISOString()}
              isRefetching={directoryQuery.isFetching}
            />
          )
        }
        secondaryActions={[
          <Button key="ai-review" size="sm" variant="outline" asChild>
            <Link to="/ai-review">Open AI Review</Link>
          </Button>,
        ]}
        primaryAction={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshBusy}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshBusy && "animate-spin")} />
            {refreshBusy ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip metrics={primaryMetrics} supporting={supportingMetrics} columns={4} />

        <section className="space-y-3">
          <SectionHeader
            title="Agent workforce"
            description="Catalogue state is the definition the dispatch path reads. Configuration is read-only until runtime policy enforcement is enabled."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {directory.agents.map((agent) => {
              const rate = agent.success_rate;
              const attention = agent.stuck_runs + agent.failed_24h + agent.waiting_approval;
              const maxCount = Math.max(...agent.sparkline, 1);

              return (
                <Card key={agent.name}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Bot className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{agent.display_name}</p>
                          <code className="text-xs text-muted-foreground">
                            {agent.workflow_type}
                          </code>
                        </div>
                      </div>
                      <StatusBadge domain="agents" value={agent.status} />
                    </div>

                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Runs (24h)</dt>
                        <dd className="font-medium tabular-nums">{formatCount(agent.runs_24h)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Success</dt>
                        <dd className="font-medium tabular-nums">
                          {rate === null ? "—" : formatPercent(rate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Attention</dt>
                        <dd
                          className={cn(
                            "font-medium tabular-nums",
                            attention > 0 && "text-destructive",
                          )}
                        >
                          {formatCount(attention)}
                        </dd>
                      </div>
                    </dl>

                    {/* Fourteen hourly buckets straight out of `count(*) group by hours_ago`.
                        No payload is read to draw it. */}
                    <div
                      className="flex h-6 items-end gap-0.5"
                      role="img"
                      aria-label={`Runs per hour for the last ${agent.sparkline.length} hours: ${agent.sparkline.join(", ")}`}
                    >
                      {agent.sparkline.map((count, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex-1 rounded-sm",
                            count > 0 ? "bg-primary/60" : "bg-muted",
                          )}
                          style={{
                            height: `${Math.max(8, Math.round((count / maxCount) * 100))}%`,
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        {agent.last_run_at === null
                          ? "No runs recorded"
                          : `Last run ${formatDateTime(agent.last_run_at)}`}
                      </span>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/agents/$name" params={{ name: agent.name }}>
                          Inspect
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Needs a human"
            description="Ordered stuck, then failed, then waiting approval. Read from the recent runs below; the strip above counts every run on record."
          />
          <AttentionQueue
            items={attentionItems}
            emptyTitle="Nothing needs a human"
            emptyDescription="No stuck, failed or waiting runs in the recent history."
          />
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Recent runs"
            description="The most recent runs across every agent. The filter narrows this list — open an agent to page through its full history."
          />
          <FilterToolbar
            filters={[
              {
                id: "run-status",
                label: "Run status",
                options: statusOptions,
                value: statusFilter,
                onChange: setStatusFilter,
              },
            ]}
            onClear={() => setStatusFilter("all")}
            resultCount={filteredRuns.length}
          />
          {directory.recentRuns.length === 0 ? (
            <EmptyWorkspaceState
              icon={Bot}
              title="No agent runs recorded"
              description="Runs appear here as soon as an agent is dispatched from a lead, quote or account."
            />
          ) : filteredRuns.length === 0 ? (
            <FilteredEmptyState
              onClear={() => setStatusFilter("all")}
              filterSummary={`Status: ${getStatusLabel("agentRuns", statusFilter).label}`}
            />
          ) : (
            <ResponsiveRecordList
              columns={runColumns}
              rows={filteredRuns}
              rowKey={(run) => run.id}
              renderCard={renderRunCard}
              expandable={{ renderDetails: renderRunDetails }}
              caption="Recent agent runs"
            />
          )}
        </section>
      </div>
    </>
  );
}

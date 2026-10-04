import { useMemo, useState } from "react";
import { z } from "zod";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { RunQueuePanel } from "@/components/agents/run-queue-panel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useRouter, useNavigate } from "@tanstack/react-router";
import { Bot, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  AttentionQueue,
  EmptyWorkspaceState,
  ErrorState,
  MetricStrip,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type SalesMetric,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { AuxiliaryWorkflowPanel } from "@/components/agents/auxiliary-workflow-panel";
import { Card, CardContent } from "@/components/ui/card";
import { useClientNow } from "@/hooks/use-client-now";
import { buildAgentAttentionItems } from "@/lib/agent-ops";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDateTime, formatPercent } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import { cn } from "@/lib/utils";
import { AdminError } from "@/lib/admin/errors";
import { getAgentDirectoryRead, type AgentDirectoryRead } from "@/server-functions/agent-runs";

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

export const Route = createFileRoute("/agents")({
  validateSearch: agentQueueSearchSchema.merge(
    z.object({ auxiliaryRun: z.string().uuid().optional().catch(undefined) }),
  ),
  loader: async ({ context }) => {
    try {
      return await context.queryClient.ensureQueryData(agentDirectoryQuery());
    } catch (error) {
      // Expected capability denials are data-free views, not errored hydrated queries.
      if (
        error instanceof AdminError &&
        (error.code === "FORBIDDEN" || error.code === "OUTSIDE_SCOPE")
      )
        return { accessDenied: true as const };
      throw error;
    }
  },
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
  const data = Route.useLoaderData();
  if (!isIndexRoute) return <Outlet />;
  if ("accessDenied" in data)
    return (
      <AgentsErrorState error={new AdminError("FORBIDDEN", "You do not have this capability")} />
    );
  return <AgentsMonitor />;
}

function AgentsMonitor() {
  const actorId = Route.useRouteContext?.().profile?.id ?? "unknown";
  const queueFilters = agentQueueSearchSchema.parse(Route.useSearch() ?? {});
  const navigate = useNavigate({ from: Route.fullPath });
  const auxiliaryRun = Route.useSearch()?.auxiliaryRun;
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
  const [refreshing, setRefreshing] = useState(false);

  const slugByWorkflowType = useMemo(
    () => new Map(directory.agents.map((agent) => [agent.workflow_type, agent.name])),
    [directory.agents],
  );

  const attentionItems = useMemo(
    () => buildAgentAttentionItems(directory.attentionRuns, slugByWorkflowType, clientNow),
    [directory.attentionRuns, slugByWorkflowType, clientNow],
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
        <AuxiliaryWorkflowPanel key={auxiliaryRun ?? "note-history"} runId={auxiliaryRun} />

        <section className="space-y-3">
          <SectionHeader
            title="Agent workforce"
            description="Stored status governs dispatch. Open an agent’s Governance tab for versioned status controls; human approval and model remain read-only. Worker/provider readiness needs separate verification."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {directory.agents.map((agent) => {
              const rate = agent.success_rate;
              const attention = agent.stuck_runs + agent.failed_7d + agent.waiting_approval;
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
            description="Running for at least 60 minutes, failures in the last seven days, then waiting approvals. The count covers the whole queue; this list shows the first eight."
          />
          <AttentionQueue
            items={attentionItems}
            emptyTitle="Nothing needs a human"
            emptyDescription="No runs match the attention rules."
          />
        </section>

        {(directory.unknownWorkflows ?? []).length > 0 && (
          <section className="space-y-3" aria-label="Unknown workflows">
            <SectionHeader
              title="Unknown workflows"
              description="Recorded workflow identities without a current agent definition. Preserve the original run ID and label when investigating."
            />
            <ul className="space-y-2 text-sm">
              {directory.unknownWorkflows.map((workflow) => (
                <li key={workflow.workflow_type} className="rounded-md border p-3">
                  <code>{workflow.workflow_type}</code> · {formatCount(workflow.runs_24h)} runs in
                  24h
                  {workflow.last_run_at && (
                    <span className="ml-2 text-muted-foreground">
                      Last run {formatDateTime(workflow.last_run_at)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <RunQueuePanel
          key={actorId}
          actorId={actorId}
          filters={queueFilters}
          onChange={(next) => void navigate({ search: (current) => ({ ...current, ...next }) })}
        />
      </div>
    </>
  );
}

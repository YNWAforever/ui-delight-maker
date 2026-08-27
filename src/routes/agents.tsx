import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cpu,
  RefreshCw,
} from "lucide-react";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatDateTime, formatPercent } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import { getAgentDirectoryRead, type AgentDirectoryRead } from "@/server-functions/agent-runs";

const agentDirectoryQuery = () =>
  routeQueryOptions({
    queryKey: crmQueryKeys.agents.list({ view: "directory" }),
    queryFn: () => getAgentDirectoryRead(),
  });

export const Route = createFileRoute("/agents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentDirectoryQuery()),
  head: () => ({
    meta: [
      { title: "AI Ops Control Tower - Fimmick ClientOps" },
      {
        name: "description",
        content: "AI workforce health, approval workload, failures, and model usage.",
      },
    ],
  }),
  component: AgentsRoute,
});

function AgentsRoute() {
  const isIndexRoute = useIsExactPath("/agents");
  if (!isIndexRoute) return <Outlet />;
  return <AiOpsControlTower />;
}

function AiOpsControlTower() {
  const initialData = Route.useLoaderData() as AgentDirectoryRead;
  const queryClient = useQueryClient();
  const { data: directory } = useQuery({ ...agentDirectoryQuery(), initialData });
  const [open, setOpen] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: crmQueryKeys.agents.list({ view: "directory" }),
        exact: true,
      });
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  const filteredRuns = useMemo(
    () =>
      statusFilter === "all"
        ? directory.recentRuns
        : directory.recentRuns.filter((run) => run.status === statusFilter),
    [directory.recentRuns, statusFilter],
  );

  const agentsByDisplayName = useMemo(
    () => new Map(directory.agents.map((agent) => [agent.display_name, agent])),
    [directory.agents],
  );

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: crmQueryKeys.agents.list({ view: "directory" }),
      exact: true,
    });

  const operations = directory.operations;

  return (
    <>
      <CommandHeader
        title="AI Ops Control Tower"
        status="Operate"
        description="Monitor the Fimmick AI workforce across run health, human approvals, failures, stuck work, confidence, and token usage."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/ai-review">Open AI Review</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="space-y-6 px-6 py-6">
        <MetricStrip
          metrics={[
            {
              label: "Runs (24h)",
              value: formatCount(operations.runs_24h),
              icon: Bot,
              hint: `${formatCount(operations.running)} currently running`,
            },
            {
              label: "Success rate",
              value: formatPercent(operations.success_rate),
              icon: CheckCircle2,
              hint: `${formatCount(operations.completed_24h)} completed · ${formatCount(operations.failed_24h)} failed`,
            },
            {
              label: "Needs attention",
              value: formatCount(operations.needs_attention),
              icon: AlertTriangle,
              hint: `${formatCount(operations.waiting_approval)} approvals · ${formatCount(operations.stuck_runs)} stuck`,
            },
            {
              label: "Tokens (24h)",
              value: formatCount(operations.tokens_24h),
              icon: Cpu,
              hint: `Average confidence ${formatPercent(operations.avg_confidence)}`,
            },
          ]}
        />

        <section aria-labelledby="agent-fleet-heading" className="space-y-3">
          <div>
            <h2 id="agent-fleet-heading" className="text-sm font-semibold">
              AI workforce
            </h2>
            <p className="text-xs text-muted-foreground">
              Read-only runtime status. Governance changes are not represented as active until they
              are persisted and enforced server-side.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {directory.agents.map((agent) => {
              const maxCount = Math.max(...agent.sparkline, 1);
              const attention = agent.failed_24h + agent.waiting_approval + agent.stuck_runs;
              return (
                <Card key={agent.name} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to="/agents/$name"
                      params={{ name: agent.name }}
                      className="flex min-w-0 items-center gap-2 hover:text-primary"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{agent.display_name}</p>
                        <p className="text-xs text-muted-foreground">{agent.workflow_type}</p>
                      </div>
                    </Link>
                    <StatusBadge value={agent.status} />
                  </div>

                  <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                    {agent.description}
                  </p>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Runs</p>
                      <p className="font-medium tabular-nums">{formatCount(agent.runs_24h)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Success</p>
                      <p className="font-medium tabular-nums">
                        {formatPercent(agent.success_rate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Attention</p>
                      <p className="font-medium tabular-nums">{formatCount(attention)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex h-6 items-end gap-0.5" aria-hidden="true">
                    {agent.sparkline.map((count, index) => (
                      <div
                        key={index}
                        title={`${count} run${count === 1 ? "" : "s"}`}
                        className={`flex-1 rounded-sm ${count > 0 ? "bg-primary/60" : "bg-muted"}`}
                        style={{ height: `${Math.max(8, Math.round((count / maxCount) * 100))}%` }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last run {formatDateTime(agent.last_run_at)}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="attention-queue-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="attention-queue-heading" className="text-sm font-semibold">
                Attention queue
              </h2>
              <p className="text-xs text-muted-foreground">
                Stuck runs, recent failures, and AI work waiting for human approval.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {directory.attentionRuns.length} item
              {directory.attentionRuns.length === 1 ? "" : "s"} shown
            </span>
          </div>

          <Card>
            {directory.attentionRuns.length === 0 ? (
              <div className="p-4">
                <WorkSurfaceEmpty
                  title="No AI operations need attention"
                  description="Stuck runs, failures from the past seven days, and pending approvals will appear here."
                  action={
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/ai-review">Check AI Review</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directory.attentionRuns.map((run) => {
                    const agent = agentsByDisplayName.get(run.agent_name);
                    return (
                      <TableRow key={run.id}>
                        <TableCell>
                          <StatusBadge
                            value={run.status}
                            label={attentionReasonLabel(run.attention_reason)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{run.agent_name}</TableCell>
                        <TableCell>
                          <p className="text-sm capitalize">{run.subject_type}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {run.subject_id.slice(0, 8)}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatAttentionAge(run.age_minutes)}
                        </TableCell>
                        <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                          <p className="line-clamp-2">
                            {run.output_summary ?? "No output summary recorded."}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {run.attention_reason === "waiting_approval" ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link to="/ai-review">Review</Link>
                            </Button>
                          ) : agent ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link to="/agents/$name" params={{ name: agent.name }}>
                                Inspect
                              </Link>
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </section>

        <section aria-labelledby="recent-runs-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="recent-runs-heading" className="text-sm font-semibold">
                Recent runs
              </h2>
              <p className="text-xs text-muted-foreground">
                Inspect runtime outcomes without exposing controls that are not yet enforced.
              </p>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[210px]" aria-label="Filter agent runs by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All run statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="waiting_approval">Waiting approval</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table className="min-w-[1050px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Agent</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No recent agent runs match this status.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRuns.map((run) => {
                    const expanded = open === run.id;
                    const agent = agentsByDisplayName.get(run.agent_name);
                    return (
                      <Fragment key={run.id}>
                        <TableRow
                          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          tabIndex={0}
                          onClick={() => setOpen(expanded ? null : run.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setOpen(expanded ? null : run.id);
                            }
                          }}
                        >
                          <TableCell>
                            {expanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{run.agent_name}</TableCell>
                          <TableCell>
                            <p className="text-xs">{run.workflow_type.replace(/_/g, " ")}</p>
                            <p className="text-[11px] capitalize text-muted-foreground">
                              {run.trigger_type ?? "unknown trigger"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge value={run.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {run.duration_ms == null
                              ? "—"
                              : `${(run.duration_ms / 1000).toFixed(1)}s`}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {run.tokens_used == null ? "—" : formatCount(run.tokens_used)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {formatPercent(run.confidence_score)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(run.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            {agent ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Link to="/agents/$name" params={{ name: agent.name }}>
                                  Inspect
                                </Link>
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 py-4 text-sm">
                              <div className="flex items-start gap-2">
                                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <p>{run.output_summary ?? "No output summary recorded."}</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </div>
    </>
  );
}

function attentionReasonLabel(
  reason: AgentDirectoryRead["attentionRuns"][number]["attention_reason"],
) {
  switch (reason) {
    case "waiting_approval":
      return "Waiting approval";
    case "stuck":
      return "Stuck run";
    default:
      return "Failed";
  }
}

function formatAttentionAge(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1_440)}d`;
}

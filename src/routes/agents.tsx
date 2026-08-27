import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Bot, ChevronDown, ChevronRight, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatDateTime } from "@/lib/format";
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
      { title: "Agents - Fimmick ClientOps" },
      { name: "description", content: "Agent runs, tool calls, and confidence scores." },
    ],
  }),
  component: AgentsRoute,
});

function AgentsRoute() {
  const isIndexRoute = useIsExactPath("/agents");
  if (!isIndexRoute) return <Outlet />;
  return <AgentsMonitor />;
}

function AgentsMonitor() {
  const initialData = Route.useLoaderData() as AgentDirectoryRead;
  const queryClient = useQueryClient();
  const { data: directory } = useQuery({ ...agentDirectoryQuery(), initialData });
  const [open, setOpen] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentStates, setAgentStates] = useState(() =>
    Object.fromEntries(directory.agents.map((agent) => [agent.name, agent.status === "active"])),
  );

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

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: crmQueryKeys.agents.list({ view: "directory" }),
      exact: true,
    });

  return (
    <>
      <PageHeader
        title="AI Ops"
        description="Operational logs and run health. Use AI Review for human decisions."
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {directory.agents.map((agent) => {
            const maxCount = Math.max(...agent.sparkline, 1);
            return (
              <Card key={agent.name} className="p-4">
                <div className="flex items-start justify-between">
                  <Link
                    to="/agents/$name"
                    params={{ name: agent.name }}
                    className="flex items-center gap-2 hover:text-primary"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{agent.display_name}</p>
                      <p className="text-xs text-muted-foreground">{agent.runs_24h} runs / 24h</p>
                    </div>
                  </Link>
                  <Switch
                    checked={agentStates[agent.name]}
                    onCheckedChange={(enabled) => {
                      setAgentStates((current) => ({ ...current, [agent.name]: enabled }));
                      toast.success(`${agent.display_name} ${enabled ? "enabled" : "paused"}`);
                    }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Confidence</p>
                    <p className="font-medium">
                      {agent.avg_confidence == null
                        ? "-"
                        : `${(agent.avg_confidence * 100).toFixed(0)}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Approval</p>
                    <p className="font-medium">{agent.human_approval ? "Required" : "Auto"}</p>
                  </div>
                </div>
                <div className="mt-3 flex h-6 items-end gap-0.5">
                  {agent.sparkline.map((count, index) => (
                    <div
                      key={index}
                      title={`${count} run${count === 1 ? "" : "s"}`}
                      className={`flex-1 rounded-sm ${count > 0 ? "bg-primary/60" : "bg-muted"}`}
                      style={{ height: `${Math.max(8, Math.round((count / maxCount) * 100))}%` }}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filter agent runs by status">
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
            <span className="text-xs text-muted-foreground">
              {filteredRuns.length} recent run{filteredRuns.length === 1 ? "" : "s"}
            </span>
          </div>
        </Card>

        <Card>
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Agent</TableHead>
                <TableHead>Trigger</TableHead>
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
                        <TableCell className="text-xs capitalize text-muted-foreground">
                          {run.trigger_type ?? "-"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={run.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {run.duration_ms == null
                            ? "-"
                            : `${(run.duration_ms / 1000).toFixed(1)}s`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {run.tokens_used == null ? "-" : formatCount(run.tokens_used)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {run.confidence_score == null
                            ? "-"
                            : `${(run.confidence_score * 100).toFixed(0)}%`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(run.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              toast.message(`Replaying ${run.id}`);
                            }}
                          >
                            <Play className="mr-1 h-3 w-3" /> Replay
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/30 py-4 text-sm">
                            {run.output_summary ?? "No output summary recorded."}
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
      </div>
    </>
  );
}

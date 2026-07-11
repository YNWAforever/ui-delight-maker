import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
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
import { useIsExactPath } from "@/lib/routing-utils";
import { useRoutePollingRefresh } from "@/hooks/use-route-polling-refresh";
import { getAgentRuns } from "@/server-functions/agent-runs";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import type { AgentRun } from "@/lib/types";

const SPARKLINE_HOURS = 14;

/** Compute per-agent stats from the raw run list. */
function computeAgentStats(runs: AgentRun[]) {
  const now = Date.now();
  const since24h = now - 24 * 60 * 60 * 1000;
  const sinceSparkline = now - SPARKLINE_HOURS * 60 * 60 * 1000;

  const map: Record<string, { runs24h: number; confidences: number[]; sparkline: number[] }> = {};

  for (const run of runs) {
    const key = run.agent_name;
    if (!map[key]) {
      map[key] = { runs24h: 0, confidences: [], sparkline: Array(SPARKLINE_HOURS).fill(0) };
    }
    const ts = new Date(run.created_at).getTime();
    if (ts >= since24h) map[key].runs24h++;
    if (run.confidence_score != null) map[key].confidences.push(run.confidence_score);
    if (ts >= sinceSparkline) {
      const bucket = Math.min(
        SPARKLINE_HOURS - 1,
        Math.floor((ts - sinceSparkline) / (60 * 60 * 1000)),
      );
      map[key].sparkline[bucket]++;
    }
  }

  return map;
}

export const Route = createFileRoute("/agents")({
  loader: () => getAgentRuns({}),
  head: () => ({
    meta: [
      { title: "Agents — Fimmick ClientOps" },
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
  const agentRuns = Route.useLoaderData() as AgentRun[];
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  useRoutePollingRefresh();

  const stats = useMemo(() => computeAgentStats(agentRuns), [agentRuns]);

  const agents = useMemo(
    () =>
      AGENT_DEFINITIONS.map((a) => {
        const s = stats[a.display_name];
        const confidences = s?.confidences ?? [];
        const avg_confidence =
          confidences.length > 0
            ? confidences.reduce((acc, c) => acc + c, 0) / confidences.length
            : null;
        return {
          ...a,
          runs_24h: s?.runs24h ?? 0,
          avg_confidence,
          sparkline: s?.sparkline ?? Array(SPARKLINE_HOURS).fill(0),
        };
      }),
    [stats],
  );

  const [agentStates, setAgentStates] = useState(() =>
    Object.fromEntries(agents.map((a) => [a.name, a.status === "active"])),
  );

  const filteredRuns = useMemo(
    () => (statusFilter === "all" ? agentRuns : agentRuns.filter((r) => r.status === statusFilter)),
    [agentRuns, statusFilter],
  );

  return (
    <>
      <PageHeader
        title="Agent Monitor"
        description="Operational logs and run health. Use AI Review for human decisions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/ai-review">Open AI Review</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.invalidate()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <Card key={a.name} className="p-4">
              <div className="flex items-start justify-between">
                <Link
                  to="/agents/$name"
                  params={{ name: a.name }}
                  className="flex items-center gap-2 hover:text-primary"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.display_name}</p>
                    <p className="text-xs text-muted-foreground">{a.runs_24h} runs / 24h</p>
                  </div>
                </Link>
                <Switch
                  checked={agentStates[a.name]}
                  onCheckedChange={(v) => {
                    setAgentStates((p) => ({ ...p, [a.name]: v }));
                    toast.success(`${a.display_name} ${v ? "enabled" : "paused"}`);
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Confidence</p>
                  <p className="font-medium">
                    {a.avg_confidence != null ? `${(a.avg_confidence * 100).toFixed(0)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Approval</p>
                  <p className="font-medium">{a.human_approval ? "Required" : "Auto"}</p>
                </div>
              </div>
              {/* Real sparkline — last 14 hours of activity */}
              <div className="mt-3 flex h-6 items-end gap-0.5">
                {a.sparkline.map((count, i) => {
                  const maxCount = Math.max(...a.sparkline, 1);
                  const heightPct = Math.max(8, Math.round((count / maxCount) * 100));
                  return (
                    <div
                      key={i}
                      title={`${count} run${count !== 1 ? "s" : ""}`}
                      className={`flex-1 rounded-sm transition-[height,background-color] ${count > 0 ? "bg-primary/60" : "bg-muted"}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  );
                })}
              </div>
            </Card>
          ))}
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
              {filteredRuns.length} run{filteredRuns.length !== 1 ? "s" : ""} · click a row to
              inspect
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
                    No agent runs yet. Trigger a lead to start the pipeline.
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (e.key === " ") e.preventDefault();
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
                          {run.trigger_type ?? "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={run.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {run.duration_ms != null
                            ? `${(run.duration_ms / 1000).toFixed(1)}s`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {run.tokens_used != null ? formatCount(run.tokens_used) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {run.confidence_score != null
                            ? `${(run.confidence_score * 100).toFixed(0)}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(run.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.message(`Replaying ${run.id}`);
                            }}
                          >
                            <Play className="mr-1 h-3 w-3" /> Replay
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/30">
                            <div className="space-y-3 py-2">
                              <KV label="Output" value={run.output_summary ?? "—"} />
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Input data
                                </p>
                                <pre className="mt-1 overflow-auto rounded-md border border-border bg-card p-2 text-xs text-muted-foreground">
                                  {run.input_data ? JSON.stringify(run.input_data, null, 2) : "—"}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, ChevronDown, ChevronRight, Play } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { agentRuns, agents as seedAgents } from "@/lib/mock-data";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Fimmick ClientOps" },
      { name: "description", content: "Live agent runs, tool calls, and confidence scores." },
    ],
  }),
  component: AgentsMonitor,
});

function AgentsMonitor() {
  const [open, setOpen] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentStates, setAgentStates] = useState(() =>
    Object.fromEntries(seedAgents.map((a) => [a.name, a.status === "active"])),
  );

  const filteredRuns = useMemo(
    () => (statusFilter === "all" ? agentRuns : agentRuns.filter((r) => r.status === statusFilter)),
    [statusFilter],
  );

  return (
    <>
      <PageHeader title="Agent Monitor" description="Live runs across the multi-agent system." />

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {seedAgents.map((a) => (
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
                  <p className="font-medium">{(a.avg_confidence * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Approval</p>
                  <p className="font-medium">{a.human_approval ? "Required" : "Auto"}</p>
                </div>
              </div>
              <div className="mt-3 flex h-6 items-end gap-0.5">
                {Array.from({ length: 14 }).map((_, i) => {
                  const h = 20 + ((i * 13 + a.runs_24h * 7) % 80);
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-primary/30"
                      style={{ height: `${h}%` }}
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
              <SelectTrigger className="h-9 w-[200px]">
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
              {filteredRuns.length} runs · click a row to inspect
            </span>
          </div>
        </Card>

        <Card>
          <Table>
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
              {filteredRuns.map((run) => {
                const expanded = open === run.id;
                return (
                  <Fragment key={run.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setOpen(expanded ? null : run.id)}
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
                        {run.trigger_type}
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={run.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {(run.duration_ms / 1000).toFixed(1)}s
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {run.tokens_used.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {(run.confidence_score * 100).toFixed(0)}%
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
                            <KV label="Input" value={run.input_summary} />
                            <KV label="Output" value={run.output_summary} />
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Tool calls ({run.tool_calls.length})
                              </p>
                              <ul className="mt-1 space-y-2">
                                {run.tool_calls.map((tc) => (
                                  <li
                                    key={tc.id}
                                    className="rounded-md border border-border bg-card p-2 text-xs"
                                  >
                                    <div className="flex items-center justify-between">
                                      <code className="font-mono">{tc.tool_name}</code>
                                      <span
                                        className={
                                          tc.success ? "text-success" : "text-destructive"
                                        }
                                      >
                                        {tc.success ? "ok" : "failed"}
                                      </span>
                                    </div>
                                    <pre className="mt-1 overflow-auto text-muted-foreground">
                                      {JSON.stringify(tc.input_params, null, 2)}
                                    </pre>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
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

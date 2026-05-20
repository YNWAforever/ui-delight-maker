import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, ChevronDown, ChevronRight, Play } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agentRuns, agents } from "@/lib/mock-data";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Fimmick ClientOps" },
      { name: "description", content: "Live agent runs, tool calls, and confidence scores." },
    ],
  }),
  component: AgentsMonitor,
});

const fmt = new Intl.DateTimeFormat("en-HK", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function AgentsMonitor() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Agent Monitor" description="Live runs across the multi-agent system." />

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <Link
              key={a.name}
              to="/agents/$name"
              params={{ name: a.name }}
              className="group rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary">{a.display_name}</p>
                    <p className="text-xs text-muted-foreground">{a.runs_24h} runs / 24h</p>
                  </div>
                </div>
                <StatusBadge value={a.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Conf</p>
                  <p className="font-medium">{(a.avg_confidence * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Approval</p>
                  <p className="font-medium">{a.human_approval ? "Required" : "Auto"}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

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
              {agentRuns.map((run) => {
                const expanded = open === run.id;
                return (
                  <>
                    <TableRow
                      key={run.id}
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
                        {fmt.format(new Date(run.created_at))}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                          <Play className="mr-1 h-3 w-3" /> Replay
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${run.id}-expand`}>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <div className="space-y-3 py-2">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Input
                              </p>
                              <p className="text-sm">{run.input_summary}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Output
                              </p>
                              <p className="text-sm">{run.output_summary}</p>
                            </div>
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
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

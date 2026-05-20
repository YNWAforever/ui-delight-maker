import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Bot, ChevronDown, ChevronRight, Pin } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { agentByName, agentRuns } from "@/lib/mock-data";

export const Route = createFileRoute("/agents/$name")({
  loader: ({ params }) => {
    const agent = agentByName(params.name);
    if (!agent) throw notFound();
    return { agent };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.agent.display_name ?? "Agent"} — ClientOps` },
      { name: "description", content: `Run history, memory, and config for ${loaderData?.agent.display_name}.` },
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

const MEMORIES = [
  {
    kind: "long_term",
    text: "Aurora Retail prefers Cantonese in client-facing materials; CFO needs ROI estimate within 48h of first call.",
    pinned: true,
  },
  {
    kind: "episodic",
    text: "Last quote to Helix Biotech accepted at full price — anchor future biotech quotes higher.",
    pinned: false,
  },
  {
    kind: "short_term",
    text: "Currently routing 3 leads through qualification with pending discovery calls.",
    pinned: false,
  },
];

function AgentDetail() {
  const { agent } = Route.useLoaderData();
  const runs = agentRuns.filter((r) => r.agent_name === agent.display_name);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [memories, setMemories] = useState(MEMORIES);
  const [temp, setTemp] = useState([0.4]);
  const [confThreshold, setConfThreshold] = useState([0.75]);
  const [enabled, setEnabled] = useState(agent.status === "active");
  const [autoApprove, setAutoApprove] = useState(!agent.human_approval);

  return (
    <>
      <PageHeader
        title={agent.display_name}
        description={agent.role}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/agents">
              <ArrowLeft className="mr-2 h-4 w-4" /> All agents
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <Tabs defaultValue="runs">
              <TabsList>
                <TabsTrigger value="runs">Runs</TabsTrigger>
                <TabsTrigger value="memory">Memory</TabsTrigger>
                <TabsTrigger value="config">Config</TabsTrigger>
              </TabsList>

              <TabsContent value="runs" className="mt-4">
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs in the last 24h.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {runs.map((r) => {
                      const open = expanded === r.id;
                      return (
                        <li key={r.id} className="py-3">
                          <button
                            className="flex w-full items-start gap-3 text-left"
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
                                <span className="text-xs text-muted-foreground">
                                  conf {(r.confidence_score * 100).toFixed(0)}%
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {r.output_summary}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(r.created_at)} ·{" "}
                                {r.tokens_used.toLocaleString()} tokens
                              </p>
                            </div>
                          </button>
                          {open && (
                            <div className="mt-3 ml-11 space-y-2">
                              {r.tool_calls.map((tc) => (
                                <pre
                                  key={tc.id}
                                  className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs"
                                >
                                  <span className="font-medium text-primary">{tc.tool_name}</span>
                                  {"\n"}
                                  {JSON.stringify(
                                    { input: tc.input_params, output: tc.output_result },
                                    null,
                                    2,
                                  )}
                                </pre>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="memory" className="mt-4 space-y-2">
                {memories.map((m, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
                        {m.kind.replace(/_/g, " ")}
                      </span>
                      <button
                        onClick={() =>
                          setMemories((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, pinned: !p.pinned } : p)),
                          )
                        }
                        className={
                          m.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        }
                        aria-label="Pin"
                      >
                        <Pin className="h-3.5 w-3.5" fill={m.pinned ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <p className="mt-1.5 leading-snug">{m.text}</p>
                  </div>
                ))}
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
                  <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Temperature</Label>
                    <span className="text-sm tabular-nums">{temp[0].toFixed(2)}</span>
                  </div>
                  <Slider
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
                    <Label className="text-sm">Confidence threshold (escalate below)</Label>
                    <span className="text-sm tabular-nums">{confThreshold[0].toFixed(2)}</span>
                  </div>
                  <Slider
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
            <Row label="Avg confidence" value={`${(agent.avg_confidence * 100).toFixed(0)}%`} />
            <Row label="Runs (24h)" value={String(agent.runs_24h)} />
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

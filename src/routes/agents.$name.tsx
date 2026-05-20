import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Bot } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const fmt = new Intl.DateTimeFormat("en-HK", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function AgentDetail() {
  const { agent } = Route.useLoaderData();
  const runs = agentRuns.filter((r) => r.agent_name === agent.display_name);

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
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent runs</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs in the last 24h.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {runs.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 py-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{r.id}</span>
                          <StatusBadge value={r.status} />
                          <span className="text-xs text-muted-foreground">
                            conf {(r.confidence_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{r.output_summary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmt.format(new Date(r.created_at))} · {r.tokens_used.toLocaleString()} tokens
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Memory snippets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <MemoryItem
                kind="long_term"
                text="Aurora Retail prefers Cantonese in client-facing materials; CFO needs ROI estimate within 48h of first call."
              />
              <MemoryItem
                kind="episodic"
                text="Last quote to Helix Biotech accepted at full price — anchor future biotech quotes higher."
              />
              <MemoryItem
                kind="short_term"
                text="Currently routing 3 leads through qualification with pending discovery calls."
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Status" value={<StatusBadge value={agent.status} />} />
            <Row label="Model" value={<code className="text-xs">{agent.model}</code>} />
            <Row label="Avg confidence" value={`${(agent.avg_confidence * 100).toFixed(0)}%`} />
            <Row label="Runs (24h)" value={String(agent.runs_24h)} />
            <Row label="Human approval" value={agent.human_approval ? "Required" : "Auto-execute"} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MemoryItem({ kind, text }: { kind: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
        {kind.replace(/_/g, " ")}
      </span>
      <p className="mt-1.5 leading-snug">{text}</p>
    </div>
  );
}

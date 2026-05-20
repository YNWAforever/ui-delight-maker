import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, FileText, Inbox, ShieldCheck, TrendingUp, User } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  activityLogs,
  agentRuns,
  approvals,
  conversionTrend,
  leads,
  pipelineFunnel,
  quotes,
} from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Fimmick ClientOps" },
      { name: "description", content: "Pipeline overview, agent activity, and key client ops metrics." },
    ],
  }),
  component: Dashboard,
});

const fmt = new Intl.DateTimeFormat("en-HK", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Dashboard() {
  const openLeads = leads.filter((l) => !["won", "lost"].includes(l.status)).length;
  const pendingQuoteValue = quotes
    .filter((q) => ["pending_approval", "sent", "viewed"].includes(q.status))
    .reduce((sum, q) => sum + q.total_value, 0);
  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;
  const runs24h = agentRuns.length;

  const kpis = [
    { label: "Open leads", value: openLeads, icon: Inbox, hint: "+12% vs last week" },
    {
      label: "Quotes in flight",
      value: `HKD ${(pendingQuoteValue / 1000).toFixed(0)}K`,
      icon: FileText,
      hint: `${quotes.length} active quotes`,
    },
    { label: "Pending approvals", value: pendingApprovals, icon: ShieldCheck, hint: "Avg 1.4h to decision" },
    { label: "Agent runs (24h)", value: runs24h, icon: Bot, hint: "1 needs review" },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live pipeline, agent activity, and what needs human attention."
      />

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {kpi.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{kpi.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <kpi.icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Pipeline funnel</CardTitle>
              <CardDescription>Lead counts by stage, last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineFunnel}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="stage" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-popover)",
                        borderColor: "var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead → Won trend</CardTitle>
              <CardDescription>Weekly leads and closed deals.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={conversionTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="week" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-popover)",
                        borderColor: "var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="leads" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="won" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Agent activity feed</CardTitle>
                <CardDescription>Latest runs across all agents.</CardDescription>
              </div>
              <Link
                to="/agents"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {agentRuns.slice(0, 6).map((run) => (
                <div
                  key={run.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{run.agent_name}</span>
                      <StatusBadge value={run.status} />
                      <span className="text-xs text-muted-foreground">
                        conf {(run.confidence_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{run.output_summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmt.format(new Date(run.created_at))} · {run.tokens_used.toLocaleString()} tokens
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription>Agents and humans, side by side.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activityLogs.slice(0, 7).map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div
                    className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${
                      log.actor_type === "agent"
                        ? "bg-primary/10 text-primary"
                        : "bg-accent text-accent-foreground"
                    }`}
                  >
                    {log.actor_type === "agent" ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug">
                      <span className="font-medium">{log.actor_name}</span>{" "}
                      <span className="text-muted-foreground">{log.action}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.format(new Date(log.created_at))} · {log.object_type} {log.object_id}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Top leads</CardTitle>
              <CardDescription>Highest-scoring open opportunities.</CardDescription>
            </div>
            <Link
              to="/leads"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {leads
                .filter((l) => !["lost"].includes(l.status))
                .sort((a, b) => b.lead_score - a.lead_score)
                .slice(0, 5)
                .map((lead) => (
                  <Link
                    key={lead.id}
                    to="/leads/$id"
                    params={{ id: lead.id }}
                    className="flex items-center gap-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                      {lead.company_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lead.company_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lead.contact_name} · {lead.source}
                      </p>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{lead.lead_score}</span>
                    </div>
                    <StatusBadge value={lead.status} />
                  </Link>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

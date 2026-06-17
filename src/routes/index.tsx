import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  FileText,
  HeartPulse,
  Inbox,
  Megaphone,
  Plus,
  ShieldCheck,
  TrendingUp,
  User,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LeaderboardWidget } from "@/components/leaderboard-widget";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatCompactHKD } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { getDashboardStats, getActivityLogs, getAgentRuns } from "@/server-functions/agent-runs";
import { getLeads } from "@/server-functions/leads";
import { getQuotes } from "@/server-functions/quotes";
import { getApprovals } from "@/server-functions/approvals";
import { getTasks } from "@/server-functions/tasks";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [stats, leads, quotes, approvals, tasks, activityLogs, agentRuns] = await Promise.all([
      getDashboardStats(),
      getLeads({}),
      getQuotes({}),
      getApprovals({ data: { status: "pending" } }),
      getTasks({}),
      getActivityLogs({}),
      getAgentRuns({}),
    ]);
    return { stats, leads, quotes, approvals, tasks, activityLogs, agentRuns };
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Fimmick ClientOps" },
      { name: "description", content: "Pipeline overview, agent activity, and key client ops metrics." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { stats, leads, quotes, approvals, tasks, activityLogs, agentRuns } = Route.useLoaderData();
  const router = useRouter();
  // Refresh loader data when n8n or users update lifecycle records.
  useRealtime("agent_runs", "*", undefined, () => {
    router.invalidate();
  });
  useRealtime("engagement_events", "*", undefined, () => {
    router.invalidate();
  });
  useRealtime("deals", "*", undefined, () => {
    router.invalidate();
  });
  useRealtime("campaign_members", "*", undefined, () => {
    router.invalidate();
  });
  useRealtime("customer_success_profiles", "*", undefined, () => {
    router.invalidate();
  });
  const openLeads = stats.openLeads;
  const pendingQuoteValue = stats.pendingQuoteValue;
  const pendingApprovals = stats.pendingApprovals;
  const runs24h = stats.runs24h;
  const lifecycleSignals = [
    {
      label: "Open pipeline",
      value: formatCompactHKD(stats.openPipeline),
      icon: TrendingUp,
    },
    {
      label: "Weighted forecast",
      value: formatCompactHKD(stats.weightedForecast),
      icon: BarChart3,
    },
    {
      label: "Campaign revenue",
      value: formatCompactHKD(stats.campaignSourcedRevenue),
      icon: Megaphone,
    },
    {
      label: "Avg health",
      value: `${stats.averageAccountHealth}/100`,
      icon: HeartPulse,
    },
    {
      label: "Renewals 30d",
      value: stats.renewalsDue30,
      icon: CalendarClock,
    },
    {
      label: "High-risk accounts",
      value: stats.highRiskAccounts,
      icon: Building2,
    },
  ];
  const needsAttention = [
    ...approvals.filter((a) => a.status === "pending").map((a) => ({
      kind: "Approval",
      title: a.context_summary ?? "Approval request",
      link: "/approvals" as const,
    })),
    ...tasks
      .filter((t) => t.status !== "done" && t.priority === "high")
      .slice(0, 3)
      .map((t) => ({ kind: "Task", title: t.title, link: "/tasks" as const })),
  ].slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live pipeline, agent activity, and what needs human attention."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/leads">
                <Plus className="mr-2 h-4 w-4" /> New lead
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/quotes/new">
                <Plus className="mr-2 h-4 w-4" /> New quote
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Open leads" value={openLeads} icon={Inbox} delta={12} hint="vs last week" />
          <MetricCard
            label="Quotes in flight"
            value={formatCompactHKD(pendingQuoteValue)}
            icon={FileText}
            delta={8}
            hint={`${quotes.length} in flight`}
          />
          <MetricCard
            label="Pending approvals"
            value={pendingApprovals}
            icon={ShieldCheck}
            delta={-4}
            hint="avg 1.4h to decision"
          />
          <MetricCard label="Agent runs (24h)" value={runs24h} icon={Bot} delta={6} hint="1 needs review" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lifecycle command center</CardTitle>
            <CardDescription>Sales forecast, marketing attribution, and CS risk in one view.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {lifecycleSignals.map((signal) => (
                <div key={signal.label} className="rounded-md border border-border bg-card p-3">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <signal.icon className="h-4 w-4" />
                  </div>
                  <p className="text-xs text-muted-foreground">{signal.label}</p>
                  <p className="mt-1 truncate text-lg font-semibold">{signal.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Pipeline funnel</CardTitle>
              <CardDescription>Lead counts by stage, last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[]}>  {/* pipeline data not yet fetched */}
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
                  <LineChart data={[]}>  {/* conversion trend data not yet fetched */}
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
        <LeaderboardWidget />


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
                      {run.confidence_score != null && (
                        <span className="text-xs text-muted-foreground">
                          conf {(run.confidence_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{run.output_summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(run.created_at)}{run.tokens_used != null ? ` · ${run.tokens_used.toLocaleString()} tokens` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Needs your attention</CardTitle>
              <CardDescription>Approvals and high-priority tasks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {needsAttention.map((item, idx) => (
                <Link
                  key={idx}
                  to={item.link}
                  className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="mt-0.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-foreground">
                    {item.kind}
                  </span>
                  <span className="flex-1 leading-snug">{item.title}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
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
                          {lead.contact_name ?? "—"}{lead.source ? ` · ${lead.source}` : ""}
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
                      <span className="font-medium">{log.actor_name ?? log.actor_type ?? "Unknown"}</span>{" "}
                      <span className="text-muted-foreground">{log.action}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(log.created_at)} · {log.object_type} {log.object_id}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
export const Route = createFileRoute("/reports")({
  loader: () => ({ leads: [], quotes: [], agentRuns: [] }),
  head: () => ({
    meta: [
      { title: "Reports — Fimmick ClientOps" },
      { name: "description", content: "Pipeline, conversion, revenue, and agent reports." },
    ],
  }),
  component: ReportsPage,
});

// Stub chart data until analytics server functions are implemented
const agentLeaderboard: { name: string; runs: number; success: number }[] = [];
const conversionTrend: { week: string; leads: number; won: number }[] = [];
const pipelineFunnel: { stage: string; count: number }[] = [];
const revenueTrend: { week: string; revenue: number }[] = [];
const taskThroughput: { day: string; created: number; completed: number }[] = [];

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  borderColor: "var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

const RANGES = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

function ReportsPage() {
  const [range, setRange] = useState("30d");

  return (
    <>
      <PageHeader
        title="Reports"
        description="Pipeline, conversion, revenue, and agent activity."
        actions={
          <>
            <div className="flex items-center rounded-md border border-border p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    range === r.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.success("CSV export queued")}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <ChartCard title="Revenue trend" description="Weekly closed-won revenue (HKD K).">
          <AreaChart data={revenueTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="week" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Pipeline funnel" description="Lead counts by stage.">
          <BarChart data={pipelineFunnel}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="stage" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Lead → Won conversion" description="Weekly leads vs closed-won.">
          <LineChart data={conversionTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="week" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="leads" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="won" stroke="var(--color-success)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Agent leaderboard" description="Runs and success rate (24h).">
          <BarChart data={agentLeaderboard} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis dataKey="name" type="category" width={100} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="runs" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Task throughput" description="Created vs completed by day.">
          <BarChart data={taskThroughput}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="created" fill="var(--color-info)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="completed" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Agent success rate" description="Per-agent completion rate.">
          <BarChart data={agentLeaderboard}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis domain={[80, 100]} stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="success" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

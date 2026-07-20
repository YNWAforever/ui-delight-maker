import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { formatCompactHKD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getReportDataset, getReportSummary } from "@/server-functions/operations";

const ReportChart = lazy(() =>
  import("@/components/reports/report-charts").then((module) => ({
    default: module.ReportChart,
  })),
);

const reportSearchSchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d").catch("30d"),
});

type ReportId = "revenue" | "pipeline" | "conversion" | "agents" | "tasks";

type ReportSummaryView = {
  metrics: {
    revenue: number;
    pipelineValue: number;
    leads: number;
    wonLeads: number;
    conversionRate: number;
    agentRuns: number;
    successfulAgentRuns: number;
    openTasks: number;
  };
  reports: Array<{ id: ReportId; title: string; description: string }>;
};

const summaryMetrics = (metrics: ReportSummaryView["metrics"]) => [
  { label: "Accepted revenue", value: formatCompactHKD(metrics.revenue) },
  { label: "Pipeline value", value: formatCompactHKD(metrics.pipelineValue) },
  {
    label: "Lead conversion",
    value: `${metrics.conversionRate}%`,
    hint: `${metrics.wonLeads} of ${metrics.leads} leads`,
  },
  {
    label: "Agent runs",
    value: metrics.agentRuns,
    hint: `${metrics.successfulAgentRuns} completed`,
  },
  { label: "Open tasks", value: metrics.openTasks },
];

const RANGES = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
] as const;

export const Route = createFileRoute("/reports")({
  validateSearch: reportSearchSchema,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.reports.list({ view: "summary", ...deps }),
        queryFn: () => getReportSummary({ data: deps }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Reports - Fimmick ClientOps" },
      { name: "description", content: "Pipeline, conversion, revenue, and agent reports." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const summary = Route.useLoaderData() as ReportSummaryView;
  const { range } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [selectedReport, setSelectedReport] = useState<ReportId | null>(
    summary.reports[0]?.id ?? null,
  );
  const selectedDefinition = summary.reports.find((report) => report.id === selectedReport) ?? null;
  const datasetQuery = useQuery({
    queryKey: crmQueryKeys.reports.list({ view: "dataset", range, report: selectedReport }),
    queryFn: () => getReportDataset({ data: { range, report: selectedReport as ReportId } }),
    enabled: selectedReport !== null,
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description="Pipeline, conversion, revenue, and agent activity."
        actions={
          <>
            <div className="flex items-center rounded-md border border-border p-0.5">
              {RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={range === item.id}
                  onClick={() =>
                    navigate({
                      search: (current) => ({ ...current, range: item.id }),
                      replace: true,
                    })
                  }
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    range === item.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.success("CSV export queued")}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryMetrics(summary.metrics).map((metric) => (
            <div key={metric.label} className="border-b border-border pb-3">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold">{metric.value}</p>
              {metric.hint ? <p className="text-xs text-muted-foreground">{metric.hint}</p> : null}
            </div>
          ))}
        </div>

        {summary.reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No reports are available for this range.
            </CardContent>
          </Card>
        ) : (
          <Tabs
            value={selectedReport ?? undefined}
            onValueChange={(value) => setSelectedReport(value as ReportId)}
          >
            <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
              {summary.reports.map((report) => (
                <TabsTrigger key={report.id} value={report.id}>
                  {report.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">{selectedDefinition?.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{selectedDefinition?.description}</p>
              </CardHeader>
              <CardContent>
                {datasetQuery.isError ? (
                  <div className="flex h-64 items-center justify-center text-sm text-destructive">
                    Report data could not be loaded.
                  </div>
                ) : datasetQuery.isPending || !selectedReport ? (
                  <ChartSkeleton />
                ) : (
                  <Suspense fallback={<ChartSkeleton />}>
                    <ReportChart report={selectedReport} data={datasetQuery.data.data} />
                  </Suspense>
                )}
              </CardContent>
            </Card>
          </Tabs>
        )}
      </div>
    </>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-64 items-end gap-3" aria-label="Loading report chart">
      {[42, 68, 51, 82, 59, 73, 48].map((height, index) => (
        <div
          key={`${height}-${index}`}
          className="flex-1 animate-pulse rounded-t bg-muted"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  DataTableShell,
  EmptyWorkspaceState,
  ErrorState,
  MetricStrip,
  StaleDataIndicator,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { csvFileName, toCsv } from "@/lib/csv";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCompactHKD, formatCount, formatPercentPoints } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import {
  DEFAULT_RANGE,
  DEFAULT_REPORT,
  REPORT_IDS,
  REPORT_RANGES,
  REPORT_SPECS,
  buildReportSeries,
  describeReportData,
  formatReportCell,
  isReportId,
  reportCsvColumns,
  reportGapNote,
  type ReportId,
  type ReportRange,
  type ReportRow,
} from "@/lib/reports";
import { routeQueryOptions } from "@/lib/route-query";
import { cn } from "@/lib/utils";
import { getReportDataset, getReportSummary } from "@/server-functions/operations";

const ReportChart = lazy(() =>
  import("@/components/reports/report-charts").then((module) => ({
    default: module.ReportChart,
  })),
);

/**
 * `report` is a search param, not component state.
 *
 * It used to be `useState<ReportId | null>(null)`, which had three consequences: the report
 * area was blank on arrival, a cache entry keyed `report: null` was minted and never enabled,
 * and a link to "the conversion report over 90 days" could not be sent to anyone — `range`
 * was shareable and the report beside it was not.
 *
 * The enum is built from `REPORT_IDS`, not retyped here. A hand-copied list of five literals
 * is exactly what let this schema silently reject a sixth report — `human_review_workload`
 * compiled everywhere else in the app and 404'd only at this one boundary. `REPORT_IDS` is a
 * `readonly` tuple of literals, so `z.enum` reads the exact ids straight off the catalogue and
 * no cast is needed; a report missing from the catalogue is a compile error there.
 */
const reportSearchSchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default(DEFAULT_RANGE).catch(DEFAULT_RANGE),
  report: z.enum(REPORT_IDS).default(DEFAULT_REPORT).catch(DEFAULT_REPORT),
});

const summaryQueryOptions = (range: ReportRange) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.reports.list({ view: "summary", range }),
    queryFn: () => getReportSummary({ data: { range } }),
  });

/**
 * Wrapped in `routeQueryOptions` like every other read in the product.
 *
 * This was the one query in the slice built by hand, so it opted out of `CRM_STALE_TIME_MS`
 * and refetched on a policy nothing else in the app follows.
 */
const datasetQueryOptions = (report: ReportId, range: ReportRange) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.reports.list({ view: "dataset", range, report }),
    queryFn: () => getReportDataset({ data: { range, report } }),
  });

export const Route = createFileRoute("/reports")({
  validateSearch: reportSearchSchema,
  loaderDeps: ({ search }) => ({ range: search.range, report: search.report }),
  loader: async ({ context, deps }) => {
    const [summary, dataset] = await Promise.all([
      context.queryClient.ensureQueryData(summaryQueryOptions(deps.range)),
      context.queryClient.ensureQueryData(datasetQueryOptions(deps.report, deps.range)),
    ]);
    return { summary, dataset };
  },
  head: () => ({
    meta: [
      { title: "Reports — Fimmick ClientOps" },
      { name: "description", content: "Pipeline, conversion, revenue, and agent reports." },
    ],
  }),
  errorComponent: ReportsErrorState,
  component: ReportsPage,
});

/**
 * Both reads reach raw SQL through `src/server/read-models/operations.ts`, and this route had
 * no boundary of its own — so a driver failure rendered its own text through the root
 * boundary, into the page body.
 */
function ReportsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Reports did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/reports" });
        }}
      />
    </div>
  );
}

const RANGE_LABELS: Record<ReportRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

const EXPORT_DISABLED_ID = "report-export-disabled";

function ReportsPage() {
  const loaded = Route.useLoaderData();
  const { range, report } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [exporting, setExporting] = useState(false);

  const summaryQuery = useQuery({ ...summaryQueryOptions(range), initialData: loaded.summary });
  const datasetQuery = useQuery({
    ...datasetQueryOptions(report, range),
    initialData: loaded.dataset,
  });

  const summary = summaryQuery.data;
  const metrics = summary.metrics;
  const definitions = summary.reports.filter((definition) => isReportId(definition.id));
  const definition = definitions.find((item) => item.id === report) ?? null;
  const spec = REPORT_SPECS[report];

  const rows: ReportRow[] = datasetQuery.isError ? [] : datasetQuery.data.data;
  const series = buildReportSeries(report, rows);
  const gapNote = reportGapNote(report, series);
  const textSummary = describeReportData(report, rows);

  /**
   * Why "Export CSV" and not "Export loaded rows".
   *
   * `loadReportDataset` runs one aggregate query per report with no `limit` and no `offset`,
   * so `rows` is the entire result set for the selected report and range — not a page of it.
   * `-reports-export.test.tsx` asserts that on the read model itself, so the day someone
   * paginates the query the label has to change with it.
   */
  const exportDisabledReason = datasetQuery.isError
    ? "The report did not load, so there is nothing to export."
    : rows.length === 0
      ? "Nothing to export — this report recorded no rows in this range."
      : null;

  const exportCsv = () => {
    if (exporting || exportDisabledReason) return;

    setExporting(true);
    try {
      const fileName = csvFileName("fimmick", report, range);
      const csv = toCsv(rows, reportCsvColumns(report));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      // Never "queued": there is no queue, and the file is already on disk by this line.
      toast.success(
        `${fileName} downloaded — ${formatCount(rows.length)} ${rows.length === 1 ? "row" : "rows"}`,
      );
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const setSearch = (next: { range?: ReportRange; report?: ReportId }) => {
    void navigate({ search: (current) => ({ ...current, ...next }), replace: true });
  };

  return (
    <>
      <WorkspaceHeader
        context="Operate"
        title="Reports"
        description={`Pipeline, conversion, revenue and agent activity over the last ${RANGE_LABELS[range]}.`}
        status={
          <StaleDataIndicator
            updatedAt={new Date(summaryQuery.dataUpdatedAt).toISOString()}
            isRefetching={summaryQuery.isFetching || datasetQuery.isFetching}
          />
        }
        primaryAction={
          exportDisabledReason ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled aria-describedby={EXPORT_DISABLED_ID}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV
              </Button>
              <span id={EXPORT_DISABLED_ID} className="text-xs text-muted-foreground">
                {exportDisabledReason}
              </span>
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {exporting ? "Preparing…" : "Export CSV"}
            </Button>
          )
        }
        secondaryActions={[
          <div
            key="range"
            role="group"
            aria-label="Report range"
            className="flex items-center rounded-md border border-border p-0.5"
          >
            {REPORT_RANGES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={range === item}
                onClick={() => setSearch({ range: item })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  range === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>,
        ]}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "revenue",
              label: "Accepted revenue",
              value: formatCompactHKD(metrics.revenue),
              hint: `accepted in ${RANGE_LABELS[range]}`,
            },
            {
              id: "pipeline",
              label: "Pipeline value",
              value: formatCompactHKD(metrics.pipelineValue),
              hint: "quotes awaiting a decision",
            },
            {
              id: "conversion",
              label: "Lead conversion",
              value: formatPercentPoints(metrics.conversionRate),
              hint: `${formatCount(metrics.wonLeads)} of ${formatCount(metrics.leads)} leads`,
            },
            {
              id: "agent-runs",
              label: "Agent runs",
              value: formatCount(metrics.agentRuns),
              hint: `${formatCount(metrics.successfulAgentRuns)} completed`,
            },
          ]}
          supporting={[
            {
              id: "open-tasks",
              label: "Open tasks",
              value: formatCount(metrics.openTasks),
              hint: `created in ${RANGE_LABELS[range]}`,
            },
          ]}
          columns={4}
        />

        {definitions.length === 0 ? (
          <EmptyWorkspaceState
            title="No reports are available"
            description="Report definitions come from the operations read model. None were returned for this range."
          />
        ) : (
          <Tabs
            value={report}
            onValueChange={(value) => {
              if (isReportId(value)) setSearch({ report: value });
            }}
          >
            <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
              {definitions.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">{definition?.title ?? "Report"}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {definition?.description ?? "This report has no description."} Last{" "}
                  {RANGE_LABELS[range]}.
                </p>
              </CardHeader>
              <CardContent>
                {datasetQuery.isError ? (
                  <ErrorState
                    kind="server"
                    error={datasetQuery.error}
                    title="This report did not load"
                    onRetry={() => void datasetQuery.refetch()}
                  />
                ) : rows.length === 0 ? (
                  <EmptyWorkspaceState
                    title="Nothing recorded in this range"
                    description={`No rows were written for this report in the last ${RANGE_LABELS[range]}. Widen the range or check back once activity is recorded.`}
                  />
                ) : spec.shape === "table" ? (
                  <ReportTable report={report} rows={rows} caption={definition?.title ?? report} />
                ) : (
                  <figure className="space-y-3">
                    <Suspense fallback={<ChartSkeleton />}>
                      <ReportChart report={report} data={series.data} />
                    </Suspense>
                    {/*
                      The chart itself is aria-hidden, so this is the only description a
                      screen-reader user gets — it carries the span, the extremes and the
                      gaps rather than restating the title.
                    */}
                    <figcaption className="sr-only">{textSummary}</figcaption>
                    {gapNote && <p className="text-xs text-muted-foreground">{gapNote}</p>}
                    <details className="rounded-md border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                        Show the {formatCount(rows.length)} {rows.length === 1 ? "row" : "rows"}{" "}
                        behind this chart
                      </summary>
                      <div className="border-t border-border">
                        <ReportTable
                          report={report}
                          rows={rows}
                          caption={`${definition?.title ?? report} data`}
                        />
                      </div>
                    </details>
                  </figure>
                )}
              </CardContent>
            </Card>
          </Tabs>
        )}
      </div>
    </>
  );
}

/**
 * The same rows as the chart, as a table.
 *
 * It is the primary view for Agent performance — four values per agent, and the decision is
 * the completion rate rather than the relative length of a bar (Instruction §13) — and the
 * disclosure under every other report, so the data is readable without the chart chunk and
 * without sight.
 */
function ReportTable({
  report,
  rows,
  caption,
}: {
  report: ReportId;
  rows: ReportRow[];
  caption: string;
}) {
  const columns: ColumnDef<ReportRow>[] = REPORT_SPECS[report].fields.map((field, index) => ({
    id: field.key,
    header: field.header,
    priority: index < 2 ? "primary" : "secondary",
    numeric: field.kind === "count" || field.kind === "currency" || field.kind === "percent",
    cell: (row: ReportRow) => formatReportCell(field, row[field.key]),
  }));

  return (
    <DataTableShell
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row[REPORT_SPECS[report].fields[0].key] ?? "")}
      caption={caption}
      allowHorizontalScroll
    />
  );
}

function ChartSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded-md bg-muted"
      role="status"
      aria-label="Loading report chart"
    />
  );
}

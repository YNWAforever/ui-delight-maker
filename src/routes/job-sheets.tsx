import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { z } from "zod";

import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { ListPagination } from "@/components/list-pagination";
import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  WorkspaceHeader,
  type ColumnDef,
  type FilterOption,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCount, formatCurrencyAmount, formatDate } from "@/lib/format";
import { useIsExactPath } from "@/lib/routing-utils";
import type { JobSheet, JobSheetStatus } from "@/lib/types";
import {
  JOB_SHEET_STATUS_VALUES,
  formatAcceptedValueSummary,
  getJobSheetStatusLabel,
} from "@/lib/job-sheet-editor";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getJobSheetsPage } from "@/server-functions/job-sheets";

/**
 * `status` is new, and it is not a client-side filter.
 *
 * `listJobSheetsPage` has always accepted `status`, `client_id` and `account_id`
 * (src/server/repositories/job-sheets.ts) and `getJobSheetsPage` passes the whole object
 * through — the queue simply never offered a control for any of them, so the only way to
 * find what needed accounting attention was to read every page. Putting it in the search
 * schema means the filter is a real server filter, shareable as a URL, and counted by the
 * pager rather than by whatever happened to load.
 */
const jobSheetStatusFilterSchema = z.enum([
  "all",
  ...(JOB_SHEET_STATUS_VALUES as [JobSheetStatus, ...JobSheetStatus[]]),
]);

const jobSheetListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  status: jobSheetStatusFilterSchema.default("all").catch("all"),
});

type JobSheetListSearch = z.infer<typeof jobSheetListSearchSchema>;
type JobSheetStatusFilter = z.infer<typeof jobSheetStatusFilterSchema>;

function isJobSheetStatusFilter(value: string): value is JobSheetStatusFilter {
  return value === "all" || (JOB_SHEET_STATUS_VALUES as string[]).includes(value);
}

/** The search params, narrowed to what `listJobSheetsPage` understands. */
function toJobSheetPageFilters(search: Partial<JobSheetListSearch>) {
  const { status, ...pagination } = search;
  return status && status !== "all" ? { ...pagination, status } : pagination;
}

export const Route = createFileRoute("/job-sheets")({
  validateSearch: jobSheetListSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.jobSheets.list(search),
        queryFn: () => getJobSheetsPage({ data: toJobSheetPageFilters(search) }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Job Sheets - Fimmick ClientOps" },
      {
        name: "description",
        content: "Accounting queue for quote-to-cash job sheets and manual Xero handoff tracking.",
      },
    ],
  }),
  errorComponent: JobSheetsErrorState,
  component: JobSheetsPage,
});

function JobSheetsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Job sheets did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/job-sheets" });
        }}
      />
    </div>
  );
}

function JobSheetsPage() {
  const isIndexRoute = useIsExactPath("/job-sheets");

  if (!isIndexRoute) return <Outlet />;

  return <JobSheetsIndex />;
}

function JobSheetsIndex() {
  const jobSheetPage = Route.useLoaderData();
  const { status: statusFilter, limit } = Route.useSearch();
  const rows = jobSheetPage.items;
  const navigate = useNavigate({ from: Route.fullPath });

  const setStatusFilter = (value: string) => {
    const status: JobSheetStatusFilter = isJobSheetStatusFilter(value) ? value : "all";
    // Page 1, because page 4 of "all" is very rarely page 4 of a narrower filter.
    navigate({ search: (current) => ({ ...current, status, page: 1 }), replace: true });
  };

  const awaitingReview = rows.filter((row) => row.status !== "accepted").length;
  const acceptedValue = formatAcceptedValueSummary(rows);
  const pageScope = `on this page of ${formatCount(rows.length)}`;

  const statusOptions: FilterOption[] = [
    { value: "all", label: "All statuses" },
    ...JOB_SHEET_STATUS_VALUES.map((value) => ({
      value,
      label: getJobSheetStatusLabel(value),
    })),
  ];

  const columns: ColumnDef<JobSheet>[] = [
    {
      id: "number",
      header: "Job sheet",
      priority: "primary",
      cell: (row) => row.number,
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (row) => <JobSheetStatusBadge status={row.status} />,
    },
    {
      id: "quote",
      header: "Quote",
      priority: "tertiary",
      /*
       * The cell used to print `row.quote_id` — a bare UUID with no link.
       * `listJobSheetsPage` selects `job_sheets.*` only, so the quote number genuinely is
       * not available on this read; until it joins `quotes.number`, a labelled link is the
       * honest rendering. An identifier no one can act on is not data.
       */
      cell: (row) => (
        <Link
          to="/quotes/$id"
          params={{ id: row.quote_id }}
          aria-label={`Open the quote behind ${row.number}`}
          className="inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Open quote
        </Link>
      ),
    },
    {
      id: "po",
      header: "PO / order",
      priority: "secondary",
      cell: (row) => row.po_number ?? row.client_order_number ?? "Not supplied",
    },
    {
      id: "created",
      header: "Created",
      priority: "tertiary",
      cell: (row) => formatDate(row.created_at),
    },
    {
      id: "amount",
      header: "Amount",
      priority: "primary",
      numeric: true,
      cell: (row) => formatCurrencyAmount(row.total_amount, row.currency),
    },
  ];

  return (
    <>
      <WorkspaceHeader
        context="Deliver"
        title="Accounting Job Sheets"
        description={`${formatCount(jobSheetPage.total)} job sheets in this queue. Accepted quotes land here for billing handoff.`}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "total",
              label: "Job sheets",
              value: formatCount(jobSheetPage.total),
              hint:
                statusFilter === "all"
                  ? "all statuses, every page"
                  : `status: ${getJobSheetStatusLabel(statusFilter)}`,
            },
            {
              id: "needs-review",
              label: "Needs review",
              value: formatCount(awaitingReview),
              hint: `not accepted, ${pageScope}`,
              tone: awaitingReview > 0 ? "warning" : "neutral",
            },
            {
              id: "accepted-value",
              label: "Accepted value",
              value: acceptedValue,
              hint: `locked handoffs by currency, ${pageScope}`,
            },
          ]}
          columns={3}
        />

        <FilterToolbar
          filters={[
            {
              id: "status",
              label: "Status",
              options: statusOptions,
              value: statusFilter,
              onChange: setStatusFilter,
            },
          ]}
          onClear={() => setStatusFilter("all")}
          resultCount={jobSheetPage.total}
        />

        {rows.length === 0 ? (
          statusFilter === "all" ? (
            <EmptyWorkspaceState
              title="No accounting job sheets yet"
              description="Accepted quotes appear here for accounting review."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/quotes">Open quotes</Link>
                </Button>
              }
            />
          ) : (
            <FilteredEmptyState
              onClear={() => setStatusFilter("all")}
              filterSummary={`Status: ${getJobSheetStatusLabel(statusFilter)}`}
            />
          )
        ) : (
          <>
            <Card className="p-0">
              <ResponsiveRecordList
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                rowHref={(row) => `/job-sheets/${row.id}`}
                renderCard={(row) => (
                  <>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.number}</span>
                      <JobSheetStatusBadge status={row.status} />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatCurrencyAmount(row.total_amount, row.currency)} ·{" "}
                      {row.po_number ?? row.client_order_number ?? "No PO supplied"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Created {formatDate(row.created_at)}
                    </span>
                  </>
                )}
                caption="Accounting job sheets"
              />
            </Card>

            <ListPagination
              page={jobSheetPage.page}
              limit={limit}
              total={jobSheetPage.total}
              onPageChange={(page) =>
                navigate({ search: (current) => ({ ...current, page }), replace: true })
              }
            />
          </>
        )}
      </div>
    </>
  );
}

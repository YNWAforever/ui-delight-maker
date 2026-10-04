import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { z } from "zod";

import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { BulkActionBar } from "@/components/operations/bulk-action-bar";
import { BulkPreviewDialog } from "@/components/operations/bulk-preview-dialog";
import { remainingBulkSelection } from "@/components/operations/bulk-results";
import { useBulkOperation } from "@/components/operations/use-bulk-operation";
import { ProfileSearchCombobox } from "@/components/people/profile-search-combobox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCount, formatCurrencyAmount, formatDate } from "@/lib/format";
import { csvFileName, toCsv, type CsvColumn } from "@/lib/csv";
import type { JobSheetListItem } from "@/server/repositories/job-sheets";
import { useIsExactPath } from "@/lib/routing-utils";
import type { JobSheetStatus } from "@/lib/types";
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
  company: z.string().max(200).default("").catch(""),
  quoteNumber: z.string().max(100).default("").catch(""),
  accountingOwner: z.string().max(200).default("").catch(""),
  po: z.string().max(100).default("").catch(""),
  createdFrom: z.string().max(10).default("").catch(""),
  createdTo: z.string().max(10).default("").catch(""),
});

type JobSheetListSearch = z.infer<typeof jobSheetListSearchSchema>;
type JobSheetStatusFilter = z.infer<typeof jobSheetStatusFilterSchema>;

function isJobSheetStatusFilter(value: string): value is JobSheetStatusFilter {
  return value === "all" || (JOB_SHEET_STATUS_VALUES as string[]).includes(value);
}

/** The search params, narrowed to what `listJobSheetsPage` understands. */
function toJobSheetPageFilters(search: Partial<JobSheetListSearch>) {
  return {
    page: search.page,
    limit: search.limit,
    ...(search.status && search.status !== "all" ? { status: search.status } : {}),
    ...(search.company?.trim() ? { company: search.company.trim() } : {}),
    ...(search.quoteNumber?.trim() ? { quoteNumber: search.quoteNumber.trim() } : {}),
    ...(search.accountingOwner ? { accountingOwner: search.accountingOwner } : {}),
    ...(search.po?.trim() ? { po: search.po.trim() } : {}),
    ...(search.createdFrom ? { createdFrom: search.createdFrom } : {}),
    ...(search.createdTo ? { createdTo: search.createdTo } : {}),
  };
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

function downloadSelectedJobSheets(rows: JobSheetListItem[]) {
  if (rows.length === 0) return;
  const columns: CsvColumn<JobSheetListItem>[] = [
    { header: "Job Sheet", value: (row) => row.number },
    { header: "Company", value: (row) => row.company_name },
    { header: "Quote", value: (row) => row.quote_number },
    { header: "Status", value: (row) => row.status },
    { header: "PO number", value: (row) => row.po_number },
    { header: "Client order", value: (row) => row.client_order_number },
    { header: "Accounting owner ID", value: (row) => row.accounting_owner },
    { header: "Amount", value: (row) => row.total_amount, kind: "number" },
    { header: "Currency", value: (row) => row.currency },
    { header: "Created at", value: (row) => row.created_at, kind: "date" },
  ];
  const blob = new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = csvFileName("job-sheets", "selected-page");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function JobSheetsIndex() {
  const jobSheetPage = Route.useLoaderData();
  const search = Route.useSearch();
  const { status: statusFilter, limit } = search;
  const [draft, setDraft] = useState({
    company: search.company,
    quoteNumber: search.quoteNumber,
    accountingOwner: search.accountingOwner,
    po: search.po,
    createdFrom: search.createdFrom,
    createdTo: search.createdTo,
  });
  useEffect(() => {
    setDraft({
      company: search.company,
      quoteNumber: search.quoteNumber,
      accountingOwner: search.accountingOwner,
      po: search.po,
      createdFrom: search.createdFrom,
      createdTo: search.createdTo,
    });
  }, [
    search.company,
    search.quoteNumber,
    search.accountingOwner,
    search.po,
    search.createdFrom,
    search.createdTo,
  ]);
  const rows = jobSheetPage.items;
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const router = useRouter();
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [bulkOwner, setBulkOwner] = useState("");
  const assignmentIds = rows
    .filter((row) => bulkSelected.has(row.id) && row.can_assign_owner === true)
    .map((row) => row.id);
  const bulkOperation = useBulkOperation("clientops:bulk:job-sheets", async (result) => {
    setBulkSelected((current) => new Set(remainingBulkSelection(Array.from(current), result)));
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.jobSheets.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/job-sheets" });
  });

  const setStatusFilter = (value: string) => {
    const status: JobSheetStatusFilter = isJobSheetStatusFilter(value) ? value : "all";
    // Page 1, because page 4 of "all" is very rarely page 4 of a narrower filter.
    navigate({ search: (current) => ({ ...current, status, page: 1 }), replace: true });
  };

  const clearFilters = () => {
    const empty = {
      company: "",
      quoteNumber: "",
      accountingOwner: "",
      po: "",
      createdFrom: "",
      createdTo: "",
    };
    setDraft(empty);
    navigate({
      search: (current) => ({ ...current, ...empty, status: "all", page: 1 }),
      replace: true,
    });
  };

  const hasActiveFilters =
    statusFilter !== "all" ||
    Boolean(
      search.company ||
      search.quoteNumber ||
      search.accountingOwner ||
      search.po ||
      search.createdFrom ||
      search.createdTo,
    );
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

  const columns: ColumnDef<(typeof rows)[number]>[] = [
    {
      id: "number",
      header: "Job sheet",
      priority: "primary",
      cell: (row) => row.number,
    },
    {
      id: "company",
      header: "Company",
      priority: "secondary",
      cell: (row) => row.company_name ?? "Not linked",
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
          {row.quote_number ?? "Open quote"}
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
          onClear={clearFilters}
          resultCount={jobSheetPage.total}
        />

        <form
          className="grid gap-3 rounded-md border p-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ search: (current) => ({ ...current, ...draft, page: 1 }), replace: true });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="job-sheet-company-filter">Company</Label>
            <Input
              id="job-sheet-company-filter"
              value={draft.company}
              onChange={(event) =>
                setDraft((current) => ({ ...current, company: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-sheet-quote-filter">Quote number</Label>
            <Input
              id="job-sheet-quote-filter"
              value={draft.quoteNumber}
              onChange={(event) =>
                setDraft((current) => ({ ...current, quoteNumber: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-sheet-po-filter">PO number</Label>
            <Input
              id="job-sheet-po-filter"
              value={draft.po}
              onChange={(event) => setDraft((current) => ({ ...current, po: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-sheet-from-filter">Created from (Hong Kong date)</Label>
            <Input
              id="job-sheet-from-filter"
              type="date"
              value={draft.createdFrom}
              onChange={(event) =>
                setDraft((current) => ({ ...current, createdFrom: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-sheet-to-filter">Created to (Hong Kong date)</Label>
            <Input
              id="job-sheet-to-filter"
              type="date"
              value={draft.createdTo}
              onChange={(event) =>
                setDraft((current) => ({ ...current, createdTo: event.target.value }))
              }
            />
          </div>
          <ProfileSearchCombobox
            purpose="job_sheet_owner_filter"
            label="Accounting owner"
            value={draft.accountingOwner}
            onChange={(accountingOwner) => {
              setDraft((current) => ({ ...current, accountingOwner }));
              navigate({
                search: (current) => ({ ...current, accountingOwner, page: 1 }),
                replace: true,
              });
            }}
          />
          <div className="md:col-span-3">
            <Button type="submit">Apply filters</Button>
          </div>
        </form>

        {(bulkSelected.size > 0 || bulkOperation.result || bulkOperation.recoveryState) && (
          <BulkActionBar
            selectedCount={bulkSelected.size}
            busy={bulkOperation.busy}
            result={bulkOperation.result}
            recoveryState={bulkOperation.recoveryState}
            onRetryResult={bulkOperation.retryLoadResult}
            onResume={() => void bulkOperation.resume()}
            onClear={() => {
              setBulkSelected(new Set());
              bulkOperation.dismiss();
            }}
          >
            {bulkSelected.size > 0 && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!rows.some((row) => bulkSelected.has(row.id))}
                  onClick={() =>
                    downloadSelectedJobSheets(rows.filter((row) => bulkSelected.has(row.id)))
                  }
                >
                  Export selected on this page
                </Button>
                {assignmentIds.length > 0 && (
                  <>
                    <ProfileSearchCombobox
                      purpose="job_sheet_owner"
                      resourceId={assignmentIds[0]}
                      label="Bulk accounting owner"
                      value={bulkOwner}
                      onChange={setBulkOwner}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkOperation.busy || !bulkOwner}
                      onClick={() =>
                        void bulkOperation.prepare(
                          { type: "job_sheet.assign", profileId: bulkOwner },
                          assignmentIds,
                        )
                      }
                    >
                      Assign owner
                    </Button>
                  </>
                )}
              </>
            )}
          </BulkActionBar>
        )}
        <BulkPreviewDialog
          preview={bulkOperation.preview}
          busy={bulkOperation.busy}
          onCancel={bulkOperation.cancelPreview}
          onCommit={() => void bulkOperation.commit()}
        />

        {rows.length === 0 ? (
          !hasActiveFilters ? (
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
            <FilteredEmptyState onClear={clearFilters} filterSummary="Current Job Sheet filters" />
          )
        ) : (
          <>
            <Card className="p-0">
              <ResponsiveRecordList
                breakpoint="container"
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                rowLabel={(row) => [row.number, row.company_name].filter(Boolean).join(" · ")}
                rowHref={(row) => `/job-sheets/${row.id}`}
                selection={{
                  selected: bulkSelected,
                  onChange: (next) => {
                    if (next.size > 100) {
                      toast.error("Select at most 100 job sheets per bulk operation.");
                    } else {
                      setBulkSelected(next);
                    }
                  },
                }}
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

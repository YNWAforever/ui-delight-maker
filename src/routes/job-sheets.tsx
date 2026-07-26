import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { ListPagination } from "@/components/list-pagination";
import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyAmount, formatDate } from "@/lib/format";
import { useIsExactPath } from "@/lib/routing-utils";
import type { JobSheet } from "@/lib/types";
import { formatAcceptedValueSummary } from "@/lib/job-sheet-editor";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getJobSheetsPage } from "@/server-functions/job-sheets";

const jobSheetListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
});

export const Route = createFileRoute("/job-sheets")({
  validateSearch: jobSheetListSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.jobSheets.list(search),
        queryFn: () => getJobSheetsPage({ data: search }),
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
  component: JobSheetsPage,
});

function JobSheetsPage() {
  const isIndexRoute = useIsExactPath("/job-sheets");

  if (!isIndexRoute) return <Outlet />;

  return <JobSheetsIndex />;
}

function JobSheetsIndex() {
  const jobSheetPage = Route.useLoaderData();
  const rows = jobSheetPage.items;
  const navigate = useNavigate({ from: Route.fullPath });
  const awaitingReview = rows.filter((row) => row.status !== "accepted").length;
  const acceptedValue = formatAcceptedValueSummary(rows);

  return (
    <>
      <CommandHeader
        title="Accounting Job Sheets"
        status="Convert"
        description={`${awaitingReview} job sheets need accounting attention.`}
      />

      <div className="space-y-4 px-6 py-6">
        <ListPagination
          page={jobSheetPage.page}
          limit={jobSheetPage.limit}
          total={jobSheetPage.total}
          onPageChange={(page) =>
            navigate({ search: (current) => ({ ...current, page }), replace: true })
          }
        />
        <MetricStrip
          metrics={[
            { label: "Needs review", value: String(awaitingReview), hint: "not accepted" },
            { label: "Accepted value", value: acceptedValue, hint: "locked handoffs by currency" },
            { label: "Total sheets", value: String(rows.length), hint: "all statuses" },
          ]}
          columns={3}
        />

        <Card className="overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>Job sheet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quote</TableHead>
                <TableHead>PO / order</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      to="/job-sheets/$id"
                      params={{ id: row.id }}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {row.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <JobSheetStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>{row.quote_id}</TableCell>
                  <TableCell>{row.po_number ?? row.client_order_number ?? "Missing"}</TableCell>
                  <TableCell>{formatDate(row.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyAmount(row.total_amount, row.currency)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-4">
                    <WorkSurfaceEmpty
                      title="No accounting job sheets yet"
                      description="Accepted quotes will appear here for accounting review."
                      action={
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/quotes">Open quotes</Link>
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { ResponsiveRecordList, type ColumnDef } from "@/components/sales";
import { formatCurrencyAmount, formatDate } from "@/lib/format";
import type { JobSheetListItem } from "@/server/repositories/job-sheets";

const jobSheetName = (sheet: JobSheetListItem) =>
  [sheet.number, sheet.company_name].filter(Boolean).join(" · ");

/**
 * The job sheets on accounting's landing page.
 *
 * Each row used to be the sheet number and a raw status key such as "accounting_review", which
 * gave nothing to triage by (audit UX-15). It now reads like the Job Sheets list: who the
 * client is, the accepted total, the status as a badge and when it arrived.
 */
export function TodayJobSheetList({ jobSheets }: { jobSheets: JobSheetListItem[] }) {
  const columns: ColumnDef<JobSheetListItem>[] = [
    { id: "number", header: "Job sheet", priority: "primary", cell: (sheet) => sheet.number },
    {
      id: "company",
      header: "Client",
      priority: "primary",
      cell: (sheet) => sheet.company_name ?? "Not linked",
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (sheet) => <JobSheetStatusBadge status={sheet.status} />,
    },
    {
      id: "amount",
      header: "Accepted total",
      priority: "secondary",
      numeric: true,
      cell: (sheet) => formatCurrencyAmount(sheet.total_amount, sheet.currency),
    },
    {
      id: "created",
      header: "Arrived",
      priority: "tertiary",
      cell: (sheet) => formatDate(sheet.created_at),
    },
  ];

  return (
    <ResponsiveRecordList
      columns={columns}
      rows={jobSheets}
      rowKey={(sheet) => sheet.id}
      rowLabel={jobSheetName}
      rowHref={(sheet) => `/job-sheets/${sheet.id}`}
      caption="Job sheets waiting on accounting"
      renderCard={(sheet) => (
        <>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{sheet.number}</span>
            <JobSheetStatusBadge status={sheet.status} />
          </span>
          <span className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted-foreground">
            <span className="min-w-0 text-pretty">{sheet.company_name ?? "Not linked"}</span>
            <span className="whitespace-nowrap tabular-nums text-foreground">
              {formatCurrencyAmount(sheet.total_amount, sheet.currency)}
            </span>
          </span>
        </>
      )}
    />
  );
}

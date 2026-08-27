import { DataTableShell, type ColumnDef } from "@/components/sales";
import { formatCurrencyAmount, formatDate } from "@/lib/format";
import { describeBillingProgress, getJobSheetPortionStatusLabel } from "@/lib/job-sheet-editor";
import { getPortionReconciliation } from "@/lib/quote-to-cash";
import type { JobSheetPortion } from "@/lib/types";

type BillingPortionsTableProps = {
  totalAmount: number;
  currency: string;
  portions: JobSheetPortion[];
};

const formatLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/**
 * The one table in this product where `allowHorizontalScroll` is the right answer.
 *
 * Everywhere else a column that does not fit is a column to prune. Here the six columns are
 * a single reconciliation statement — amount only means something read against its billing
 * type, target date and Xero reference — so dropping the right-hand half on a phone would
 * leave a row that cannot be checked. The identity column is `sticky`, so the portion name
 * stays visible while the money moves.
 */
export function BillingPortionsTable({
  totalAmount,
  currency,
  portions,
}: BillingPortionsTableProps) {
  const reconciliation = getPortionReconciliation(totalAmount, portions);

  const columns: ColumnDef<JobSheetPortion>[] = [
    {
      id: "portion",
      header: "Portion",
      priority: "primary",
      sticky: true,
      width: "14rem",
      cell: (portion) => (
        <>
          <div className="font-medium">{portion.name}</div>
          <div className="text-xs text-muted-foreground">
            {portion.description?.trim() || "No billing note"}
          </div>
        </>
      ),
    },
    {
      id: "billing_type",
      header: "Billing type",
      priority: "primary",
      cell: (portion) => formatLabel(portion.billing_type),
    },
    {
      id: "target_invoice_date",
      header: "Target invoice date",
      priority: "primary",
      cell: (portion) => formatDate(portion.target_invoice_date),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (portion) => getJobSheetPortionStatusLabel(portion.status),
    },
    {
      id: "xero",
      header: "Xero reference",
      priority: "primary",
      cell: (portion) => portion.xero_invoice_reference?.trim() || "Not entered in Xero",
    },
    {
      id: "amount",
      header: "Amount",
      priority: "primary",
      numeric: true,
      cell: (portion) => formatCurrencyAmount(portion.amount, portion.currency),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Accepted total</span>
          <span className="tabular-nums">
            {formatCurrencyAmount(reconciliation.totalAmount, currency)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Planned billing</span>
          <span className="tabular-nums">
            {formatCurrencyAmount(reconciliation.portionTotal, currency)}
          </span>
        </div>
        <p
          className={`mt-2 text-sm ${
            reconciliation.reconciled ? "text-success" : "text-destructive"
          }`}
        >
          {reconciliation.reconciled
            ? "Billing plan reconciles with the accepted quote total."
            : `Reconciliation delta: ${formatCurrencyAmount(reconciliation.delta, currency)}`}
        </p>
        {/* Progress as a sentence, never a bar: "2 of 3" says which two are left to raise. */}
        <p className="mt-1 text-xs text-muted-foreground">{describeBillingProgress(portions)}</p>
      </div>

      <div className="rounded-md border border-border">
        <DataTableShell
          columns={columns}
          rows={portions}
          rowKey={(portion) => portion.id}
          caption="Billing portions for this job sheet"
          allowHorizontalScroll
        />
      </div>
    </div>
  );
}

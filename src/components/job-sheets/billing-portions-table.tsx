import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyAmount, formatDate } from "@/lib/format";
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

export function BillingPortionsTable({
  totalAmount,
  currency,
  portions,
}: BillingPortionsTableProps) {
  const reconciliation = getPortionReconciliation(totalAmount, portions);

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
            reconciliation.reconciled ? "text-emerald-600" : "text-destructive"
          }`}
        >
          {reconciliation.reconciled
            ? "Billing plan reconciles with the accepted quote total."
            : `Reconciliation delta: ${formatCurrencyAmount(reconciliation.delta, currency)}`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Portion</TableHead>
              <TableHead>Billing type</TableHead>
              <TableHead>Target invoice date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Xero reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {portions.map((portion) => (
              <TableRow key={portion.id}>
                <TableCell>
                  <div className="font-medium">{portion.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {portion.description?.trim() || "No billing note"}
                  </div>
                </TableCell>
                <TableCell>{formatLabel(portion.billing_type)}</TableCell>
                <TableCell>{formatDate(portion.target_invoice_date)}</TableCell>
                <TableCell>{formatLabel(portion.status)}</TableCell>
                <TableCell>
                  {portion.xero_invoice_reference?.trim() || "Not entered in Xero"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(portion.amount, portion.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

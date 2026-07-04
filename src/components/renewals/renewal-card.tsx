import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import type { Engagement } from "@/lib/types";

type RenewalRow = Engagement & { client_company_name: string; product_name: string };

const riskClass: Record<Engagement["renewal_risk"], string> = {
  high: "border-l-4 border-l-destructive",
  medium: "border-l-4 border-l-warning-foreground",
  low: "border-l-4 border-l-success",
};

export function RenewalCard({
  engagement,
  selected,
  onSelect,
}: {
  engagement: RenewalRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className={cn(
        "cursor-pointer p-3 transition-colors hover:bg-accent/40",
        riskClass[engagement.renewal_risk],
        selected && "ring-2 ring-primary",
      )}
    >
      <p className="text-sm font-medium">{engagement.client_company_name}</p>
      <p className="text-xs text-muted-foreground">{engagement.product_name}</p>
      <div className="mt-2 flex items-center justify-between">
        <StatusBadge value={engagement.renewal_risk} />
        <span className="text-xs tabular-nums text-muted-foreground">
          {engagement.renewal_date ?? "no date"}
        </span>
      </div>
      {engagement.next_action && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{engagement.next_action}</p>
      )}
    </Card>
  );
}

import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RelationshipSignal } from "@/lib/types";

const iconBySeverity = {
  high: AlertTriangle,
  medium: Lightbulb,
  low: CheckCircle2,
} as const;

export function RelationshipSignalCard({
  signal,
  accountName,
  onDismiss,
}: {
  signal: RelationshipSignal;
  accountName: string;
  onDismiss: (signal: RelationshipSignal) => void;
}) {
  const Icon = iconBySeverity[signal.severity];

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm font-medium">{signal.title}</p>
            <StatusBadge value={signal.severity} />
          </div>
          <p className="text-sm text-muted-foreground">{accountName}</p>
          <p className="text-sm text-foreground">{signal.reason}</p>
          {signal.suggested_action && (
            <p className="text-sm text-muted-foreground">{signal.suggested_action}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDismiss(signal)}
          aria-label={`Dismiss signal: ${signal.title}`}
        >
          Dismiss
        </Button>
      </CardContent>
    </Card>
  );
}

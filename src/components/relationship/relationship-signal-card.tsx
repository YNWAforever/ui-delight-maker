import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RelationshipSignal } from "@/lib/types";

const iconBySeverity = {
  high: AlertTriangle,
  medium: Lightbulb,
  low: CheckCircle2,
} as const;

export function RelationshipSignalCard({
  signal,
  accountName,
  dismissReason,
  isDismissOpen,
  isDismissing,
  onStartDismiss,
  onDismissReasonChange,
  onConfirmDismiss,
  onCancelDismiss,
}: {
  signal: RelationshipSignal;
  accountName: string;
  dismissReason: string;
  isDismissOpen: boolean;
  isDismissing: boolean;
  onStartDismiss: (signal: RelationshipSignal) => void;
  onDismissReasonChange: (signalId: string, reason: string) => void;
  onConfirmDismiss: (signal: RelationshipSignal) => void;
  onCancelDismiss: (signalId: string) => void;
}) {
  const Icon = iconBySeverity[signal.severity];
  const inputId = `dismiss-reason-${signal.id}`;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-4">
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
            onClick={() => onStartDismiss(signal)}
            disabled={isDismissing}
            aria-label={`Dismiss signal: ${signal.title}`}
          >
            {isDismissing ? "Dismissing..." : "Dismiss"}
          </Button>
        </div>

        {isDismissOpen && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={inputId}>Dismissal reason</Label>
                <Input
                  id={inputId}
                  value={dismissReason}
                  onChange={(event) => onDismissReasonChange(signal.id, event.target.value)}
                  placeholder="Why is this signal being dismissed?"
                  disabled={isDismissing}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => onConfirmDismiss(signal)} disabled={isDismissing}>
                  Confirm dismiss
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancelDismiss(signal.id)}
                  disabled={isDismissing}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

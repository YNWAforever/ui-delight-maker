import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lead, LeadStatus } from "@/lib/types";

interface StageMoveDialogProps {
  lead: Lead | null;
  nextStatus: LeadStatus | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function StageMoveDialog({
  lead,
  nextStatus,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: StageMoveDialogProps) {
  const open = lead != null && nextStatus != null;

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm stage change</AlertDialogTitle>
          <AlertDialogDescription>
            {lead?.company_name} will move to {nextStatus?.replace(/_/g, " ")}. Add a short reason
            so the timeline explains the decision.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="stage-reason">Reason</Label>
          <Textarea
            id="stage-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Client accepted proposal, budget mismatch, no response after follow-up..."
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={!reason.trim()}>
            Confirm move
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

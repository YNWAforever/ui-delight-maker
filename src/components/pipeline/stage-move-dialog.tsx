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
  /** True while the stage write is in flight. Freezes the form and the confirm button. */
  submitting?: boolean;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function StageMoveDialog({
  lead,
  nextStatus,
  reason,
  submitting = false,
  onReasonChange,
  onCancel,
  onConfirm,
}: StageMoveDialogProps) {
  const open = lead != null && nextStatus != null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        // A dismissal mid-write would leave the user with no idea whether the move landed.
        if (submitting) return;
        if (!nextOpen) onCancel();
      }}
    >
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
            name="stage-reason"
            value={reason}
            disabled={submitting}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Client accepted proposal, budget mismatch, no response after follow-up…"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          {/*
            `preventDefault` is load-bearing. Radix closes an AlertDialogAction's dialog on
            click, so without it the panel vanished while the write was still in flight and a
            failed move looked exactly like a successful one — dialog gone, board unchanged,
            no message. The caller closes the dialog itself, and only after the write settles.
          */}
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={submitting || !reason.trim()}
          >
            {submitting ? "Moving…" : "Confirm move"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

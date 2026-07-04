import { useState } from "react";
import { toast } from "sonner";
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
import { endEngagement, renewEngagement } from "@/server-functions/engagements";

interface MarkRenewedEndedDialogProps {
  engagementId: string;
  action: "renew" | "end" | null;
  onClose: () => void;
  onDone: () => void;
}

export function MarkRenewedEndedDialog({
  engagementId,
  action,
  onClose,
  onDone,
}: MarkRenewedEndedDialogProps) {
  const [reason, setReason] = useState("");

  const confirm = async () => {
    if (action === "renew") {
      await renewEngagement({ data: { id: engagementId, reason: reason.trim() || undefined } });
      toast.success("Engagement renewed");
    } else if (action === "end") {
      await endEngagement({ data: { id: engagementId, reason: reason.trim() } });
      toast.success("Engagement ended");
    }
    setReason("");
    onDone();
  };

  return (
    <AlertDialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action === "renew" ? "Mark renewed" : "Mark ended"}</AlertDialogTitle>
          <AlertDialogDescription>
            {action === "renew"
              ? "The renewal date advances by the product's default term. This is logged to the timeline."
              : "This engagement leaves the active roster. Add a reason for the record."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="renewal-reason">Reason {action === "end" && "(required)"}</Label>
          <Textarea
            id="renewal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={action === "end" && !reason.trim()}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

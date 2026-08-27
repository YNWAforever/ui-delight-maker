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
import { toSafeErrorMessage } from "@/lib/errors";
import { endEngagement, renewEngagement } from "@/server-functions/engagements";

interface MarkRenewedEndedDialogProps {
  engagementId: string;
  action: "renew" | "end" | null;
  onClose: () => void;
  /** Runs only after the write succeeded. May refresh caches, so it can be async. */
  onDone: () => void | Promise<void>;
}

export function MarkRenewedEndedDialog({
  engagementId,
  action,
  onClose,
  onDone,
}: MarkRenewedEndedDialogProps) {
  const [reason, setReason] = useState("");
  /**
   * `confirm` had no in-flight flag and no `try`/`catch`, and Radix's `AlertDialogAction`
   * closes the dialog the moment it is clicked. So a rejected `renewEngagement` or
   * `endEngagement` — a capability denial, an engagement already ended — left the user
   * looking at an unchanged board with the dialog gone, no success toast and no error
   * either. The flag also stops a second click issuing a second lifecycle transition.
   */
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (saving || action === null) return;

    setSaving(true);
    try {
      if (action === "renew") {
        await renewEngagement({ data: { id: engagementId, reason: reason.trim() || undefined } });
        toast.success("Engagement renewed");
      } else {
        await endEngagement({ data: { id: engagementId, reason: reason.trim() } });
        toast.success("Engagement ended");
      }
      setReason("");
      await onDone();
    } catch (error) {
      // The dialog stays open (see the preventDefault at the call site) so the reason the
      // user typed survives the failure and the retry is one click.
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (saving) return;
        if (!open) onClose();
      }}
    >
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
            name="renewal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={action === "end"}
            aria-required={action === "end"}
            disabled={saving}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={saving}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Radix closes on click; the write has not settled yet, so closing here would
              // discard the failure path entirely.
              event.preventDefault();
              void confirm();
            }}
            disabled={saving || (action === "end" && !reason.trim())}
          >
            {saving ? "Saving…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

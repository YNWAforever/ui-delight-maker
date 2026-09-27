import type { BulkPreview } from "@/lib/operations/bulk-contract";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BulkPreviewDialog({
  preview,
  busy,
  onCancel,
  onCommit,
}: {
  preview: BulkPreview | null;
  busy: boolean;
  onCancel: () => void;
  onCommit: () => void;
}) {
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review bulk change</DialogTitle>
          <DialogDescription>
            {preview?.eligibleCount ?? 0} of {preview?.rows.length ?? 0} selected items were
            eligible at preview. Each item is checked again when it is processed. Up to 20 items run
            per step; closing this page pauses further steps.
          </DialogDescription>
        </DialogHeader>
        <div
          className="max-h-64 space-y-1 overflow-y-auto text-sm"
          role="list"
          aria-label="Bulk preview items"
        >
          {preview?.rows.map((row) => (
            <div
              role="listitem"
              key={row.id}
              className="flex items-center justify-between gap-2 rounded border p-2"
            >
              <span className="truncate">{row.summary || "Item unavailable"}</span>
              <span className="shrink-0">{row.eligible ? "Eligible" : "Needs review"}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !preview || preview.eligibleCount === 0}
            onClick={onCommit}
          >
            {busy ? "Processing…" : "Process first 20"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

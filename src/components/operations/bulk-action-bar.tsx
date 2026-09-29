import type { ReactNode } from "react";
import type { BulkResult } from "@/lib/operations/bulk-contract";
import { csvFileName } from "@/lib/csv";
import { bulkFailuresCsv } from "./bulk-results";
import { Button } from "@/components/ui/button";

function downloadFailures(result: BulkResult) {
  const blob = new Blob([bulkFailuresCsv(result)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = csvFileName("bulk-errors", result.operationId);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function BulkActionBar({
  selectedCount,
  busy,
  result,
  recoveryState,
  onRetryResult,
  onResume,
  canResume = true,
  onClear,
  clearLabel = "Clear selection",
  children,
}: {
  selectedCount: number;
  busy: boolean;
  result: BulkResult | null;
  recoveryState?: "loading" | "retry" | null;
  onRetryResult?: () => void;
  onResume: () => void;
  canResume?: boolean;
  onClear: () => void;
  clearLabel?: string;
  children?: ReactNode;
}) {
  const failures = result?.results.filter((item) => item.status !== "succeeded").length ?? 0;
  const successes = result?.results.filter((item) => item.status === "succeeded").length ?? 0;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <span className="font-medium">{selectedCount} selected</span>
      {children}
      {recoveryState === "loading" && <span>Checking previous bulk result…</span>}
      {recoveryState === "retry" && (
        <>
          <span>Previous bulk result could not be loaded. The receipt is saved in this tab.</span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRetryResult}>
            Retry loading result
          </Button>
        </>
      )}
      {result && (
        <>
          <span>
            {result.processed} of {result.total} processed; {successes} succeeded; {failures} need
            review
          </span>
          {result.state !== "completed" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !canResume}
              onClick={onResume}
            >
              {result.state === "running" ? "Check or resume" : "Resume"}
            </Button>
          )}
          {failures > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => downloadFailures(result)}
            >
              Download failures
            </Button>
          )}
        </>
      )}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}>
        {clearLabel}
      </Button>
    </div>
  );
}

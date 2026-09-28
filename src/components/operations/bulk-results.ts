import type { BulkResult } from "@/lib/operations/bulk-contract";
import { toCsv } from "@/lib/csv";

export function remainingBulkSelection(
  selectedIds: readonly string[],
  result: BulkResult,
): string[] {
  const succeeded = new Set(
    result.results.filter((item) => item.status === "succeeded").map((item) => item.id),
  );
  return [...new Set([...selectedIds.filter((id) => !succeeded.has(id)), ...result.remainingIds])];
}

export function bulkFailuresCsv(result: BulkResult): string {
  const failures = result.results.filter((item) => item.status !== "succeeded");
  return toCsv(failures, [
    { header: "ID", kind: "text", value: (item) => item.id },
    { header: "Status", kind: "text", value: (item) => item.status },
    { header: "Code", kind: "text", value: (item) => item.code ?? "" },
    { header: "Message", kind: "text", value: (item) => item.message ?? "" },
    { header: "Retryable", kind: "text", value: (item) => (item.retryable ? "yes" : "no") },
  ]);
}

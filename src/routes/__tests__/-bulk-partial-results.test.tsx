import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkActionBar } from "@/components/operations/bulk-action-bar";
import { remainingBulkSelection, bulkFailuresCsv } from "@/components/operations/bulk-results";
import type { BulkResult } from "@/lib/operations/bulk-contract";

const result: BulkResult = {
  operationId: "operation-1",
  state: "paused",
  processed: 4,
  total: 5,
  remainingIds: ["id-2", "id-3", "id-4", "id-5"],
  results: [
    { id: "id-1", status: "succeeded", retryable: false },
    { id: "id-2", status: "forbidden", code: "FORBIDDEN", message: "=1+1", retryable: false },
    { id: "id-3", status: "stale", code: "STALE", retryable: false },
    { id: "id-4", status: "failed", code: "TEMP", retryable: true },
  ],
};

describe("bulk partial result UI", () => {
  it("keeps only non-success IDs selected after a partial result or page refresh", () => {
    expect(remainingBulkSelection(["id-1", "id-2", "id-3", "id-4", "id-5"], result)).toEqual([
      "id-2",
      "id-3",
      "id-4",
      "id-5",
    ]);
    expect(remainingBulkSelection([], result)).toEqual(result.remainingIds);
  });
  it("renders progress, failures, and an explicit resume action", () => {
    const html = renderToStaticMarkup(
      <BulkActionBar
        selectedCount={4}
        busy={false}
        result={result}
        onResume={() => {}}
        onClear={() => {}}
      >
        <button type="button">Assign</button>
      </BulkActionBar>,
    );
    expect(html).toContain("4 selected");
    expect(html).toContain("4 of 5 processed");
    expect(html).toContain("Resume");
    expect(html).toContain("Download failures");
  });
  it("offers recovery when a disconnected request still has a running lease", () => {
    const html = renderToStaticMarkup(
      <BulkActionBar
        selectedCount={1}
        busy={false}
        result={{ ...result, state: "running" }}
        onResume={() => {}}
        onClear={() => {}}
      />,
    );
    expect(html).toContain("Check or resume");
  });
  it("exports formula-shaped error text through the typed safe CSV writer", () => {
    const csv = bulkFailuresCsv(result);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("id-2");
    expect(csv).not.toContain("id-1");
  });
});

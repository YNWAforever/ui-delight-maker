import { describe, expect, it } from "vitest";
import type { ListOptions } from "../http.server";
import { importWfmHistory } from "../importer.server";

describe("WFM ordered dry-run importer", () => {
  it("passes incremental filters in dependency order while refreshing all settings", async () => {
    const calls: { path: string; options?: ListOptions }[] = [];
    const snapshot = await importWfmHistory({
      source: {
        sourceNamespace: "workflowmax:fixture-org",
        async *list(path, options) {
          calls.push({ path, options });
          yield* [];
        },
      },
      updatedSince: "2025-01-02",
    });
    expect(calls.map((call) => call.path)).toEqual([
      "v2/taxes",
      "v2/staff",
      "v2/clients",
      "v2/leads/",
      "v2/quotes",
      "v2/jobs",
      "v2/jobs/tasks",
      "v2/jobs/notes",
      "v2/purchase-orders",
      "v2/timesheets",
      "v2/invoices",
      "v2/payments",
    ]);
    expect(calls[0].options).toMatchObject({ pageSizeParam: "pagesize" });
    expect(calls[0].options?.updatedSince).toBeUndefined();
    expect(calls.slice(1).every((call) => call.options?.updatedSince === "2025-01-02")).toBe(true);
    expect(calls.at(-1)?.options).toMatchObject({
      pageSizeParam: "pagesize",
      updatedSinceParam: "updatedsince",
    });
    expect(snapshot).toMatchObject({ complete: true, mode: "incremental" });
  });

  it("stops before dependent stages if a source collection is incomplete", async () => {
    const calls: string[] = [];
    await expect(
      importWfmHistory({
        source: {
          sourceNamespace: "workflowmax:fixture-org",
          async *list(path) {
            calls.push(path);
            if (path === "v2/staff") throw new Error("Incomplete WFM list response");
            yield* [];
          },
        },
      }),
    ).rejects.toThrow("Incomplete");
    expect(calls).toEqual(["v2/taxes", "v2/staff"]);
  });
});

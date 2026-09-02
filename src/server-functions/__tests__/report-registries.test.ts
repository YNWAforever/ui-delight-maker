import { describe, expect, it, vi } from "vitest";

/**
 * Every registry that has to list all six report families, checked against the catalogue
 * rather than against a list retyped here.
 *
 * PR #70 added `human_review_workload` to `ReportId` and it reached production unreachable:
 * no tab in the report bar, and `Invalid report` thrown from the dataset validator for anyone
 * who typed the URL directly. `tsc` said nothing, because the two registries that missed it
 * were a `readonly ReportDefinition[]` and a `Set<ReportId>` — shapes that check the *type of
 * each member present* and cannot express *which members must be present*. The
 * `Record<ReportId, …>` structures sitting beside them (`REPORT_SPECS`, `reportQueries`) were
 * correct automatically, because a `Record` over a union is exhaustive by construction.
 *
 * Both gaps are now compile errors as well (see `AssertEveryReportId` in `src/lib/reports.ts`).
 * These tests are the second layer: they fail loudly in CI even for someone who ships past a
 * type error, and they pin the runtime behaviour — a compile-time assertion cannot show that
 * `parseDatasetInput` actually returns rather than throws.
 *
 * Every expectation compares against `REPORT_IDS` itself. A hand-written list of six here
 * would pass happily while the seventh report family drifted, which is precisely the bug.
 */

const mocks = vi.hoisted(() => {
  const chain = {
    validator() {
      return chain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return { chain };
});

// `src/server-functions/operations.ts` builds its server functions at module load.
// `parseDatasetInput` is a plain function and needs none of that machinery.
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => mocks.chain }));

import { REPORT_IDS, REPORT_SPECS } from "@/lib/reports";
import { REPORT_DEFINITIONS, reportQueries } from "@/server/read-models/operations";
import { parseDatasetInput } from "@/server-functions/operations";

const catalogue = [...REPORT_IDS].sort();

describe("report registries cover every report id", () => {
  it("gives every report a tab in the read model", () => {
    // Registry 1 — the tab bar. `src/routes/reports.tsx` maps these straight into `TabsList`,
    // so a report missing here has no control that can select it.
    expect(REPORT_DEFINITIONS.map((definition) => definition.id).sort()).toEqual(catalogue);
  });

  it("gives every tab a title and a description a reader can act on", () => {
    // A definition present but blank is the same unreachable tab with extra steps.
    for (const definition of REPORT_DEFINITIONS) {
      expect(definition.title.trim()).not.toBe("");
      expect(definition.description.trim()).not.toBe("");
    }
  });

  it("accepts every report at the dataset validator", () => {
    // Registry 2 — the validator that threw `Invalid report`. This is the assertion that
    // fails if anyone replaces the derived Set with a hand-typed literal again.
    for (const report of REPORT_IDS) {
      expect(parseDatasetInput({ report, range: "30d" })).toEqual({ report, range: "30d" });
    }
  });

  it("still rejects an id that is not a report", () => {
    // Deriving the Set must not turn the validator into a pass-through.
    expect(() => parseDatasetInput({ report: "margin", range: "30d" })).toThrow("Invalid report");
    expect(() => parseDatasetInput({ range: "30d" })).toThrow("Invalid report");
  });

  it("has a SQL query and a display spec for every report", () => {
    // Both are `Record<ReportId, …>` and so cannot drift, but they are what the tab and the
    // validator lead to — asserting them here keeps the whole path in one place.
    expect(Object.keys(reportQueries).sort()).toEqual(catalogue);
    expect(Object.keys(REPORT_SPECS).sort()).toEqual(catalogue);
  });
});

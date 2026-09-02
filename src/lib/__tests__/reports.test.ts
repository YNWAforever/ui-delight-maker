import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE,
  DEFAULT_REPORT,
  REPORT_IDS,
  REPORT_SPECS,
  buildReportSeries,
  describeReportData,
  formatReportCell,
  isReportId,
  reportCsvColumns,
  reportDimensionField,
  reportGapNote,
  reportValueFields,
  type ReportId,
  type ReportRow,
} from "@/lib/reports";

const week = (day: string, revenue: number): ReportRow => ({ week: day, revenue });

describe("report specifications", () => {
  it("describes every report the read model can return", () => {
    // The union and the table are declared separately, so this is the assertion that stops a
    // sixth report reaching the screen with no header, no formatter and no CSV column.
    expect(Object.keys(REPORT_SPECS).sort()).toEqual([...REPORT_IDS].sort());
    expect(isReportId(DEFAULT_REPORT)).toBe(true);
    expect(DEFAULT_RANGE).toBe("30d");
  });

  it("gives every field a header and every report a leading dimension", () => {
    for (const report of REPORT_IDS) {
      const spec = REPORT_SPECS[report];
      expect(spec.fields.length).toBeGreaterThanOrEqual(2);
      expect(reportDimensionField(report).header.length).toBeGreaterThan(0);
      expect(reportValueFields(report).length).toBeGreaterThanOrEqual(1);
      for (const field of spec.fields) expect(field.header.trim()).not.toBe("");
    }
  });

  it("draws agent performance as a table rather than a chart", () => {
    // Instruction §13. The bar chart it replaces plotted `runs` and dropped the completion
    // rate, which is the number the reader is actually deciding on.
    expect(REPORT_SPECS.agents.shape).toBe("table");
    expect(REPORT_SPECS.revenue.shape).toBe("chart");
    expect(REPORT_SPECS.conversion.shape).toBe("chart");
  });

  it("tabulates the per-entity families, whose measures no fallback chart can draw", () => {
    // Do not "restore" these to "chart" for visual parity with their neighbours.
    // `renderChart` in `src/components/reports/report-charts.tsx` special-cases exactly three
    // reports — revenue, conversion and tasks — and every other chart-shaped report falls
    // through to a bar chart bound to `dataKey="count"`. That works for `pipeline`, which has
    // a `count` field. Neither of these does, so "chart" renders an empty drawing above a
    // correct table. `human_review_workload` shipped that way in PR #70.
    for (const report of ["human_review_workload", "renewal_expansion"] as const) {
      expect(REPORT_SPECS[report].shape).toBe("table");
      expect(REPORT_SPECS[report].fields.map((field) => field.key)).not.toContain("count");
    }

    // The one fallback-charted family, kept honest: pipeline may stay "chart" only while it
    // still has the field the fallback draws.
    expect(REPORT_SPECS.pipeline.shape).toBe("chart");
    expect(REPORT_SPECS.pipeline.fields.map((field) => field.key)).toContain("count");
  });

  it("rejects an unknown report id", () => {
    expect(isReportId("revenue")).toBe(true);
    expect(isReportId("margin")).toBe(false);
    expect(isReportId(null)).toBe(false);
  });

  it("describes the human review workload family with honest headers", () => {
    const spec = REPORT_SPECS["human_review_workload"];

    // The dimension is the reviewer, so gaps must never be filled: buildReportSeries only
    // interpolates when the first field is a period, and a non-zero step would invent
    // reviewers who do not exist.
    expect(spec.periodStepDays).toBe(0);
    expect(spec.fields[0].key).toBe("reviewer");

    // The two columns carry different time semantics and the headers are where a reader
    // learns that. Pending is a now fact; decided is windowed by the range selector.
    const headers = spec.fields.map((field) => field.header);
    expect(headers).toContain("Pending now");
    expect(headers).toContain("Decided in range");
  });

  it("measures decision time in minutes, which never rounds a real duration to zero", () => {
    // formatCount uses maximumFractionDigits: 0, so 0.4 hours would render as "0" - a reviewer
    // deciding in 24 minutes would read as instant, which is the inverse of the truth.
    const spec = REPORT_SPECS["human_review_workload"];
    const keys = spec.fields.map((field) => field.key);

    expect(keys).toContain("median_minutes");
    expect(keys).not.toContain("median_hours");
  });

  it("describes the renewal and expansion family with directional headers", () => {
    const spec = REPORT_SPECS["renewal_expansion"];

    // Clients are categories, not periods - a non-zero step would invent clients.
    expect(spec.periodStepDays).toBe(0);
    expect(spec.fields[0].key).toBe("client");

    // One range parameter, two directions. The headers are where a reader learns that.
    const headers = spec.fields.map((f) => f.header);
    expect(headers.some((h) => /ahead/i.test(h))).toBe(true);
    expect(headers.some((h) => /recently/i.test(h))).toBe(true);
  });
});

describe("formatReportCell", () => {
  const field = (report: ReportId, key: string) => {
    const found = REPORT_SPECS[report].fields.find((item) => item.key === key);
    if (!found) throw new Error(`no field ${key}`);
    return found;
  };

  it("renders dates through the shared UTC formatter", () => {
    expect(formatReportCell(field("revenue", "week"), "2026-01-05")).toBe("05 Jan 2026");
    expect(formatReportCell(field("revenue", "week"), null)).toBe("—");
  });

  it("renders money with its currency, and compactly on an axis", () => {
    expect(formatReportCell(field("revenue", "revenue"), 1240000)).toBe("HKD 1,240,000");
    expect(formatReportCell(field("revenue", "revenue"), 1240000, { compact: true })).toBe(
      "HKD 1.2M",
    );
  });

  it("renders counts and rates through format.ts", () => {
    expect(formatReportCell(field("conversion", "leads"), "42")).toBe("42");
    expect(formatReportCell(field("agents", "success"), 92.5)).toBe("92.5%");
    expect(formatReportCell(field("agents", "success"), null)).toBe("—");
  });

  it("renders a pipeline stage through the lead status vocabulary", () => {
    // The stage column is `leads.status`. Printing it raw is exactly the "status label string
    // in a route" this revision removes — and it disagreed with every other lead surface.
    expect(formatReportCell(field("pipeline", "stage"), "pending_approval")).toBe(
      "Pending approval",
    );
    expect(formatReportCell(field("pipeline", "stage"), "won")).toBe("Won");
    // Unknown values fall back to the raw word rather than crashing or inventing one.
    expect(formatReportCell(field("pipeline", "stage"), "brand_new")).toBe("brand new");
  });
});

describe("reportCsvColumns", () => {
  it("writes machine-readable values and carries the unit in the header", () => {
    const columns = reportCsvColumns("revenue");
    const row: ReportRow = { week: "2026-01-05", revenue: 1240000 };

    expect(columns.map((column) => column.header)).toEqual([
      "Week starting",
      "Accepted quote value (HKD)",
    ]);
    // ISO date, not "05 Jan 2026": it sorts correctly in every tool that opens the file.
    expect(columns[0].value(row)).toBe("2026-01-05");
    // A raw number, not "HKD 1,240,000": a spreadsheet must be able to sum the column.
    expect(columns[1].value(row)).toBe(1240000);
  });

  it("translates the stage enum, because its raw value is an internal word", () => {
    const columns = reportCsvColumns("pipeline");
    expect(columns[0].value({ stage: "pending_approval", count: 3 })).toBe("Pending approval");
    expect(columns[1].value({ stage: "pending_approval", count: 3 })).toBe(3);
  });

  it("writes an absent measurement as null rather than zero", () => {
    // Zero is a measurement. A missing row is not, and conflating them is the whole reason
    // the gap rules below exist.
    const columns = reportCsvColumns("conversion");
    expect(columns[1].value({ week: "2026-01-05", leads: null, won: null })).toBeNull();
  });
});

describe("buildReportSeries — missing periods are holes, never interpolated", () => {
  it("inserts an explicit gap for a week with no row", () => {
    const series = buildReportSeries("revenue", [week("2026-01-05", 10), week("2026-01-19", 30)]);

    expect(series.gapCount).toBe(1);
    expect(series.gapsUnknown).toBe(false);
    expect(series.data).toHaveLength(3);
    expect(series.data[1]).toEqual({ label: "12 Jan 2026", present: false, revenue: null });
    // The neighbours keep their real values — the hole is between them, not instead of them.
    expect(series.data[0].revenue).toBe(10);
    expect(series.data[2].revenue).toBe(30);
  });

  it("never substitutes zero, an average or the previous value for a gap", () => {
    const series = buildReportSeries("conversion", [
      { week: "2026-02-02", leads: 8, won: 2 },
      { week: "2026-02-23", leads: 12, won: 5 },
    ]);

    const gaps = series.data.filter((point) => point.present === false);
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) {
      expect(gap.leads).toBeNull();
      expect(gap.won).toBeNull();
    }
  });

  it("fills daily reports a day at a time", () => {
    const series = buildReportSeries("tasks", [
      { day: "2026-03-01", created: 3, completed: 1 },
      { day: "2026-03-04", created: 5, completed: 4 },
    ]);

    expect(series.data.map((point) => point.present)).toEqual([true, false, false, true]);
  });

  it("reports no gaps for a contiguous run", () => {
    const series = buildReportSeries("revenue", [week("2026-01-05", 1), week("2026-01-12", 2)]);

    expect(series.gapCount).toBe(0);
    expect(reportGapNote("revenue", series)).toBeNull();
  });

  it("does not guess when the periods are not on a regular grid", () => {
    const series = buildReportSeries("revenue", [
      week("2026-01-05", 1),
      week("2026-01-09", 2),
      week("2026-01-19", 3),
    ]);

    expect(series.gapsUnknown).toBe(true);
    expect(series.gapCount).toBe(0);
    expect(series.data).toHaveLength(3);
    expect(reportGapNote("revenue", series)).toMatch(/not evenly spaced/i);
  });

  it("passes a categorical report through untouched", () => {
    const rows: ReportRow[] = [
      { stage: "new", count: 4 },
      { stage: "won", count: 1 },
    ];
    const series = buildReportSeries("pipeline", rows);

    expect(series.gapCount).toBe(0);
    expect(series.gapsUnknown).toBe(false);
    expect(series.data).toEqual([
      { label: "New", present: true, count: 4 },
      { label: "Won", present: true, count: 1 },
    ]);
  });

  it("handles an empty dataset without inventing a span", () => {
    const series = buildReportSeries("revenue", []);
    expect(series).toEqual({ data: [], gapCount: 0, gapsUnknown: false });
  });
});

describe("reportGapNote", () => {
  it("says how many periods are empty and that nothing was inferred", () => {
    const series = buildReportSeries("revenue", [week("2026-01-05", 1), week("2026-01-26", 2)]);
    const note = reportGapNote("revenue", series);

    // 05, 12, 19, 26 Jan: four points on the grid, two of them with no row.
    expect(note).toContain("2 weeks");
    expect(note).toMatch(/drawn as gaps/i);
    expect(note).toMatch(/no value is inferred/i);
  });

  it("uses the singular for one empty period", () => {
    const series = buildReportSeries("tasks", [
      { day: "2026-03-01", created: 1, completed: 0 },
      { day: "2026-03-03", created: 2, completed: 1 },
    ]);
    expect(reportGapNote("tasks", series)).toContain("1 day");
  });
});

describe("describeReportData — the accessible summary carries the same facts", () => {
  it("gives the span, the extremes and the gaps for a time series", () => {
    const summary = describeReportData("revenue", [week("2026-01-05", 10), week("2026-01-19", 40)]);

    expect(summary).toContain("05 Jan 2026");
    expect(summary).toContain("19 Jan 2026");
    expect(summary).toContain("HKD 40");
    expect(summary).toContain("HKD 10");
    expect(summary).toMatch(/gaps/i);
  });

  it("enumerates a categorical report", () => {
    const summary = describeReportData("pipeline", [
      { stage: "new", count: 4 },
      { stage: "won", count: 1 },
    ]);

    expect(summary).toContain("New: Leads 4");
    expect(summary).toContain("Won: Leads 1");
  });

  it("says plainly when there is nothing to describe", () => {
    expect(describeReportData("revenue", [])).toBe("No rows were recorded for this range.");
  });
});

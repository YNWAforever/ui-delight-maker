import type { CsvColumn } from "@/lib/csv";
import {
  formatCompactHKD,
  formatCount,
  formatCurrencyAmount,
  formatDate,
  formatPercentPoints,
} from "@/lib/format";
import { getStatusLabel, type StatusDomain } from "@/lib/status-labels";

/**
 * How each report's rows are named, formatted, charted and exported.
 *
 * One table rather than five call sites, because the same five facts have to agree in four
 * places — the chart axis, the chart tooltip, the data table under it and the CSV file — and
 * they did not. The chart labelled the pipeline x-axis with the raw `leads.status` value
 * (`pending_approval`, `won`) while every other surface in the product renders those through
 * `status-labels.ts`; the axis printed bare numbers where the tile above it printed
 * `HKD 1.2M`.
 *
 * Keyed on `ReportId`, so adding a report to `src/server/read-models/operations.ts` without
 * describing it here is a compile error rather than an unlabelled chart.
 */

export type ReportId =
  | "revenue"
  | "pipeline"
  | "conversion"
  | "agents"
  | "tasks"
  | "human_review_workload";
export type ReportRange = "7d" | "30d" | "90d";

/**
 * `true` only when `Present` covers every member of `ReportId`, otherwise `false`.
 *
 * Assigning the result to a literal `true` turns "a report id is missing from this
 * collection" into a `tsc` error. It exists because the two shapes this file's neighbours
 * reach for — `readonly ReportId[]` and `Set<ReportId>` — type-check *membership* and say
 * nothing about *completeness*: every element being a valid `ReportId` is exactly as true of
 * a list of five as of a list of six. `Record<ReportId, …>` (see `REPORT_SPECS` below) gets
 * completeness for free, which is why it never drifted; ordered collections cannot use it
 * without giving up their order, so they use this instead.
 *
 * The tuple wrapping (`[ReportId] extends [Present]`) suppresses distribution over the union.
 * Without it a naked conditional would test each member separately and collapse to `boolean`,
 * which `true` happens to be assignable from — a check that never fails.
 */
export type AssertEveryReportId<Present extends ReportId> = [ReportId] extends [Present]
  ? true
  : false;

/**
 * Every report id, in the order the product talks about them.
 *
 * `as const satisfies` rather than a `readonly ReportId[]` annotation, and the difference is
 * the whole point: an annotation *widens* the value to the declared type, so
 * `(typeof REPORT_IDS)[number]` would read back as `ReportId` no matter what the array
 * actually held, and the assertion below would be vacuously satisfied. `satisfies` checks the
 * literal against the type while preserving it, so the assertion compares the ids genuinely
 * present here against `ReportId`.
 *
 * This array is load-bearing at two boundaries that used to hand-copy it — the search-param
 * enum in `src/routes/reports.tsx` and the validator Set in `src/server-functions/operations.ts`
 * — so a gap here silently un-ships a report at both.
 */
export const REPORT_IDS = [
  "revenue",
  "pipeline",
  "conversion",
  "agents",
  "tasks",
  "human_review_workload",
] as const satisfies readonly ReportId[];

const everyReportIdIsListed: AssertEveryReportId<(typeof REPORT_IDS)[number]> = true;
void everyReportIdIsListed;

export const REPORT_RANGES: readonly ReportRange[] = ["7d", "30d", "90d"];

/** The report a reader lands on. §9.23 forbids opening on an empty report area. */
export const DEFAULT_REPORT: ReportId = "revenue";
export const DEFAULT_RANGE: ReportRange = "30d";

export function isReportId(value: unknown): value is ReportId {
  return typeof value === "string" && (REPORT_IDS as readonly string[]).includes(value);
}

/** One row exactly as `loadReportDataset` returns it. */
export type ReportRow = Record<string, string | number | null>;

type FieldKind = "period" | "label" | "status" | "count" | "currency" | "percent";

export type ReportField = {
  key: string;
  /** Column header and series name. Carries the unit, so cells do not have to. */
  header: string;
  kind: FieldKind;
  /** Only for `kind: "status"` — which vocabulary the stored value belongs to. */
  statusDomain?: StatusDomain;
};

/**
 * Whether a report is a measurement over time or a comparison across named things.
 *
 * This is the only input to the chart-or-table decision (Instruction §13), so it is data
 * rather than a condition buried in a component.
 */
export type ReportShape = "chart" | "table";

export type ReportSpec = {
  fields: readonly ReportField[];
  shape: ReportShape;
  /** Days between consecutive periods. Zero when the leading field is not a period. */
  periodStepDays: number;
  /** Singular noun for one period, used in the gap note and the text summary. */
  periodNoun: string;
};

export const REPORT_SPECS: Record<ReportId, ReportSpec> = {
  revenue: {
    fields: [
      { key: "week", header: "Week starting", kind: "period" },
      { key: "revenue", header: "Accepted quote value (HKD)", kind: "currency" },
    ],
    shape: "chart",
    periodStepDays: 7,
    // Charted: the shape of the trend over weeks is the decision, not any one week's figure.
    periodNoun: "week",
  },
  pipeline: {
    fields: [
      { key: "stage", header: "Stage", kind: "status", statusDomain: "leads" },
      { key: "count", header: "Leads", kind: "count" },
    ],
    shape: "chart",
    // Stages are categories, not periods. `periodStepDays` is unused for this report because
    // `buildReportSeries` only fills gaps when the first field is a period.
    periodStepDays: 0,
    // Charted: relative stage volume reads at a glance, and there are never more than seven
    // stages. The exact counts are one disclosure away in the data table.
    periodNoun: "stage",
  },
  conversion: {
    fields: [
      { key: "week", header: "Week starting", kind: "period" },
      { key: "leads", header: "Leads created", kind: "count" },
      { key: "won", header: "Leads won", kind: "count" },
    ],
    shape: "chart",
    periodStepDays: 7,
    // Charted: two series diverging or tracking each other is the whole point of the report.
    periodNoun: "week",
  },
  agents: {
    fields: [
      { key: "name", header: "Agent", kind: "label" },
      { key: "runs", header: "Runs", kind: "count" },
      { key: "successful_runs", header: "Completed runs", kind: "count" },
      { key: "success", header: "Completion rate (%)", kind: "percent" },
    ],
    shape: "table",
    periodStepDays: 0,
    // Tabulated. Instruction §13: a chart only where the visual pattern aids the decision.
    // The bar chart this replaces plotted `runs` and silently dropped the other three columns,
    // including the completion rate — the one number a reader is actually deciding on.
    periodNoun: "agent",
  },
  tasks: {
    fields: [
      { key: "day", header: "Day", kind: "period" },
      { key: "created", header: "Tasks created", kind: "count" },
      { key: "completed", header: "Tasks completed", kind: "count" },
    ],
    shape: "chart",
    periodStepDays: 1,
    // Charted: created against completed over days shows whether the backlog is growing.
    periodNoun: "day",
  },
  human_review_workload: {
    fields: [
      { key: "reviewer", header: "Reviewer", kind: "label" },
      { key: "pending", header: "Pending now", kind: "count" },
      { key: "decided", header: "Decided in range", kind: "count" },
      { key: "median_minutes", header: "Median minutes to decide", kind: "count" },
      { key: "oldest_pending_days", header: "Oldest pending (days)", kind: "count" },
    ],
    shape: "chart",
    // Reviewers are categories, not periods. buildReportSeries only fills gaps when the first
    // field is a period, so a non-zero step here would invent reviewers who do not exist.
    periodStepDays: 0,
    periodNoun: "reviewer",
  },
};

/** The fields that carry a measurement, i.e. everything but the leading dimension. */
export function reportValueFields(report: ReportId): readonly ReportField[] {
  return REPORT_SPECS[report].fields.slice(1);
}

export function reportDimensionField(report: ReportId): ReportField {
  return REPORT_SPECS[report].fields[0];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A cell as it is shown on screen. Every branch routes through `src/lib/format.ts`.
 *
 * `compact` is for axis ticks, where `HKD 1,240,000` does not fit and `HKD 1.2M` does. It
 * changes the precision of the *rendering* only; the tooltip, the table and the CSV all carry
 * the full number.
 */
export function formatReportCell(
  field: ReportField,
  value: unknown,
  options: { compact?: boolean } = {},
): string {
  switch (field.kind) {
    case "period":
      return typeof value === "string" && value ? formatDate(value) : "—";
    case "status":
      return getStatusLabel(field.statusDomain, typeof value === "string" ? value : null).label;
    case "label":
      return typeof value === "string" && value.trim() ? value : "—";
    case "count": {
      const parsed = toNumber(value);
      return parsed === null ? "—" : formatCount(parsed);
    }
    case "currency": {
      const parsed = toNumber(value);
      if (parsed === null) return "—";
      return options.compact ? formatCompactHKD(parsed) : formatCurrencyAmount(parsed, "HKD");
    }
    case "percent":
      return formatPercentPoints(toNumber(value));
  }
}

/**
 * A cell as it is written to CSV.
 *
 * Deliberately not `formatReportCell`. A spreadsheet column of `HKD 1,240,000` is text: it
 * will not sum, and the thousands separator makes every row need quoting for a separator that
 * carries no information. Numbers therefore go out unformatted with the unit in the header,
 * and periods go out as the ISO date the database stored, which sorts correctly in every tool
 * that opens the file. Only the status column is translated, because its raw value
 * (`pending_approval`) is an internal enum member and the label is the product's own word for
 * it.
 */
export function reportCsvValue(field: ReportField, value: unknown): string | number | null {
  switch (field.kind) {
    case "period":
    case "label":
      return typeof value === "string" && value ? value : null;
    case "status":
      return getStatusLabel(field.statusDomain, typeof value === "string" ? value : null).label;
    case "count":
    case "currency":
    case "percent":
      return toNumber(value);
  }
}

export function reportCsvColumns(report: ReportId): CsvColumn<ReportRow>[] {
  return REPORT_SPECS[report].fields.map((field) => ({
    header: field.header,
    value: (row: ReportRow) => reportCsvValue(field, row[field.key]),
  }));
}

/**
 * A chart datum. `label` and `present` are reserved; the rest are the report's value keys.
 *
 * `present: false` marks a period the dataset has no row for. Every value on such a point is
 * `null` so that Recharts, with `connectNulls={false}`, leaves a hole rather than drawing a
 * straight line across it (Instruction §13: gaps render as gaps, never interpolated).
 */
export type ReportChartDatum = Record<string, string | number | boolean | null>;

export type ReportSeries = {
  data: ReportChartDatum[];
  /** Periods inside the observed span that have no row. */
  gapCount: number;
  /** Set when the periods are not on a regular grid and gap filling was not attempted. */
  gapsUnknown: boolean;
};

const DAY_MS = 86_400_000;

/** Guards against a malformed period producing an unbounded fill loop. */
const MAX_SERIES_POINTS = 400;

function parseIsoDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

function toIsoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function datumFromRow(report: ReportId, row: ReportRow): ReportChartDatum {
  const dimension = reportDimensionField(report);
  const datum: ReportChartDatum = {
    label: formatReportCell(dimension, row[dimension.key]),
    present: true,
  };
  for (const field of reportValueFields(report)) {
    datum[field.key] = toNumber(row[field.key]);
  }
  return datum;
}

/**
 * Chart data for a report, with missing periods materialised as explicit holes.
 *
 * Only *interior* gaps are filled — periods between the first and last row the dataset
 * actually returned. Leading and trailing gaps would require knowing where the range window
 * starts, and that boundary is `now()` evaluated on the database, which the client cannot
 * reproduce without inventing a second, disagreeing answer. Claiming a shorter span honestly
 * beats claiming the full one with a made-up edge.
 *
 * A dataset whose periods are not on a regular grid is returned untouched with
 * `gapsUnknown: true`, so the caller can say so instead of quietly implying completeness.
 */
export function buildReportSeries(report: ReportId, rows: readonly ReportRow[]): ReportSeries {
  const dimension = reportDimensionField(report);
  const stepDays = REPORT_SPECS[report].periodStepDays;

  if (dimension.kind !== "period" || stepDays <= 0 || rows.length === 0) {
    return { data: rows.map((row) => datumFromRow(report, row)), gapCount: 0, gapsUnknown: false };
  }

  const stamped = rows.map((row) => ({ row, ms: parseIsoDay(row[dimension.key]) }));
  if (stamped.some((entry) => entry.ms === null)) {
    return { data: rows.map((row) => datumFromRow(report, row)), gapCount: 0, gapsUnknown: true };
  }

  const ordered = [...stamped].sort((left, right) => (left.ms as number) - (right.ms as number));
  const stepMs = stepDays * DAY_MS;
  const firstMs = ordered[0].ms as number;
  const lastMs = ordered[ordered.length - 1].ms as number;

  const offGrid = ordered.some((entry) => ((entry.ms as number) - firstMs) % stepMs !== 0);
  const expectedPoints = Math.floor((lastMs - firstMs) / stepMs) + 1;
  if (offGrid || expectedPoints > MAX_SERIES_POINTS) {
    return {
      data: ordered.map((entry) => datumFromRow(report, entry.row)),
      gapCount: 0,
      gapsUnknown: true,
    };
  }

  const byMs = new Map(ordered.map((entry) => [entry.ms as number, entry.row]));
  const data: ReportChartDatum[] = [];
  let gapCount = 0;

  for (let ms = firstMs; ms <= lastMs; ms += stepMs) {
    const row = byMs.get(ms);
    if (row) {
      data.push(datumFromRow(report, row));
      continue;
    }

    gapCount += 1;
    const gap: ReportChartDatum = {
      label: formatReportCell(dimension, toIsoDay(ms)),
      present: false,
    };
    for (const field of reportValueFields(report)) gap[field.key] = null;
    data.push(gap);
  }

  return { data, gapCount, gapsUnknown: false };
}

/** The sentence shown under a chart whenever a period has no row. Null when there are none. */
export function reportGapNote(report: ReportId, series: ReportSeries): string | null {
  const noun = REPORT_SPECS[report].periodNoun;

  if (series.gapsUnknown) {
    return `Periods are not evenly spaced in this dataset, so no ${noun} is inferred — only the ${noun}s that were recorded are drawn.`;
  }
  if (series.gapCount === 0) return null;

  const plural = series.gapCount === 1 ? noun : `${noun}s`;
  return `${series.gapCount} ${plural} in this span recorded nothing and are drawn as gaps. No value is inferred for them.`;
}

/**
 * The chart's accessible text summary — the same data, in a sentence.
 *
 * Instruction §13 requires one for every chart. It is not a caption restating the title: a
 * reader who cannot see the drawing gets the span, the extremes and the gaps from here.
 */
export function describeReportData(report: ReportId, rows: readonly ReportRow[]): string {
  const spec = REPORT_SPECS[report];
  const dimension = reportDimensionField(report);
  const valueFields = reportValueFields(report);

  if (rows.length === 0) return "No rows were recorded for this range.";

  if (dimension.kind !== "period") {
    const listed = rows
      .slice(0, 12)
      .map((row) => {
        const values = valueFields
          .map((field) => `${field.header} ${formatReportCell(field, row[field.key])}`)
          .join(", ");
        return `${formatReportCell(dimension, row[dimension.key])}: ${values}`;
      })
      .join("; ");
    const remainder = rows.length > 12 ? `; and ${rows.length - 12} more` : "";
    return `${rows.length} ${rows.length === 1 ? spec.periodNoun : `${spec.periodNoun}s`}. ${listed}${remainder}.`;
  }

  const series = buildReportSeries(report, rows);
  const primary = valueFields[0];
  const measured = rows
    .map((row) => ({ row, value: toNumber(row[primary.key]) }))
    .filter((entry): entry is { row: ReportRow; value: number } => entry.value !== null);

  const first = formatReportCell(dimension, rows[0][dimension.key]);
  const last = formatReportCell(dimension, rows[rows.length - 1][dimension.key]);
  const span = `${rows.length} ${rows.length === 1 ? spec.periodNoun : `${spec.periodNoun}s`} with data, from ${first} to ${last}.`;

  if (measured.length === 0) return span;

  const highest = measured.reduce((best, entry) => (entry.value > best.value ? entry : best));
  const lowest = measured.reduce((best, entry) => (entry.value < best.value ? entry : best));
  const extremes =
    highest.row === lowest.row
      ? `${primary.header} ${formatReportCell(primary, highest.value)}.`
      : `Highest ${primary.header.toLowerCase()} ${formatReportCell(primary, highest.value)} at ${formatReportCell(dimension, highest.row[dimension.key])}; lowest ${formatReportCell(primary, lowest.value)} at ${formatReportCell(dimension, lowest.row[dimension.key])}.`;

  const gaps = reportGapNote(report, series);
  return [span, extremes, gaps].filter(Boolean).join(" ");
}

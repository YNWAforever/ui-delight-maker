import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  formatReportCell,
  reportValueFields,
  type ReportChartDatum,
  type ReportId,
} from "@/lib/reports";

/**
 * The drawing half of a report. Everything else — title, subtitle, text summary, gap note,
 * data table — is rendered by the route, outside this chunk.
 *
 * That split is deliberate. Recharts is bundled into `vendor-charts` and loaded lazily, so
 * anything inside this file is unavailable until that chunk arrives. The parts a reader needs
 * in order to *understand the same data without seeing it* must therefore live outside it, or
 * the accessible summary would itself depend on the chart library loading.
 *
 * The chart is `aria-hidden`. Recharts renders an SVG of unlabelled paths and tick text that
 * a screen reader announces as a stream of numbers in visual order; the route's `figcaption`
 * says the same thing in a sentence. Hiding one and providing the other is the honest pairing
 * (Instruction §13).
 */

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  borderColor: "var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

/**
 * Series colours.
 *
 * `--color-success` appears only where "more is better" is the literal meaning of the series
 * — leads won, tasks completed. Everything else takes `--color-primary`, because tinting a
 * neutral measurement green or amber tells a colour-blind reader nothing and tells everyone
 * else something untrue (Instruction §13, §14).
 */
const PRIMARY = "var(--color-primary)";
const SUCCESS = "var(--color-success)";

export function ReportChart({ report, data }: { report: ReportId; data: ReportChartDatum[] }) {
  return (
    <div className="h-64" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {renderChart(report, data)}
      </ResponsiveContainer>
    </div>
  );
}

function makeTooltipFormatter(report: ReportId) {
  const byKey = new Map(reportValueFields(report).map((field) => [field.key, field]));

  return (value: unknown, name: unknown): [string, string] => {
    const field = typeof name === "string" ? byKey.get(name) : undefined;
    if (!field) return [value == null ? "—" : String(value), typeof name === "string" ? name : ""];
    return [formatReportCell(field, value), field.header];
  };
}

function makeValueTickFormatter(report: ReportId) {
  const [primary] = reportValueFields(report);
  return (value: unknown) => (primary ? formatReportCell(primary, value, { compact: true }) : "");
}

function renderChart(report: ReportId, data: ReportChartDatum[]) {
  const formatTooltip = makeTooltipFormatter(report);
  const formatValueTick = makeValueTickFormatter(report);

  if (report === "revenue") {
    return (
      <AreaChart data={data}>
        <Grid />
        <CategoryAxis />
        <ValueAxis tickFormatter={formatValueTick} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltip} />
        <Area
          type="linear"
          dataKey="revenue"
          stroke={PRIMARY}
          fill={PRIMARY}
          fillOpacity={0.15}
          strokeWidth={2}
          // A week the dataset has no row for is `null`, and it stays a hole: no line is
          // drawn across it and no value is invented for it.
          connectNulls={false}
          dot={{ r: 2 }}
        />
      </AreaChart>
    );
  }

  if (report === "conversion") {
    return (
      <LineChart data={data}>
        <Grid />
        <CategoryAxis />
        <ValueAxis tickFormatter={formatValueTick} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendLabel(report)} />
        <Line
          type="linear"
          dataKey="leads"
          stroke={PRIMARY}
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 2 }}
        />
        <Line
          type="linear"
          dataKey="won"
          stroke={SUCCESS}
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 2 }}
        />
      </LineChart>
    );
  }

  if (report === "tasks") {
    return (
      <BarChart data={data}>
        <Grid />
        <CategoryAxis />
        <ValueAxis tickFormatter={formatValueTick} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendLabel(report)} />
        <Bar dataKey="created" fill={PRIMARY} radius={[6, 6, 0, 0]} />
        <Bar dataKey="completed" fill={SUCCESS} radius={[6, 6, 0, 0]} />
      </BarChart>
    );
  }

  return (
    <BarChart data={data}>
      <Grid />
      <CategoryAxis />
      <ValueAxis tickFormatter={formatValueTick} />
      <Tooltip contentStyle={tooltipStyle} formatter={formatTooltip} />
      <Bar dataKey="count" fill={PRIMARY} radius={[6, 6, 0, 0]} />
    </BarChart>
  );
}

function legendLabel(report: ReportId) {
  const byKey = new Map(reportValueFields(report).map((field) => [field.key, field.header]));
  return (value: unknown) =>
    (typeof value === "string" ? byKey.get(value) : undefined) ??
    (typeof value === "string" ? value : "");
}

function Grid() {
  return <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />;
}

/**
 * The category axis always reads `label`, which `buildReportSeries` has already formatted
 * through `src/lib/format.ts` — including for the gap points, so a hole still carries the
 * date it is a hole for.
 */
function CategoryAxis() {
  return (
    <XAxis
      dataKey="label"
      stroke="var(--color-muted-foreground)"
      fontSize={12}
      tickLine={false}
      axisLine={false}
      interval="preserveStartEnd"
      minTickGap={16}
    />
  );
}

function ValueAxis({ tickFormatter }: { tickFormatter: (value: unknown) => string }) {
  return (
    <YAxis
      stroke="var(--color-muted-foreground)"
      fontSize={12}
      tickLine={false}
      axisLine={false}
      width={72}
      tickFormatter={tickFormatter}
    />
  );
}

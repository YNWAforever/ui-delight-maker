import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientNow } from "@/hooks/use-client-now";
import { formatDate, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The KPI strip that opens a workspace.
 *
 * Nine routes already render this, so the older shape (`label` as the identity, `value`
 * as `string | number`, `delta`, `icon`, `columns`) stays accepted rather than migrated:
 * renaming props would be a nine-file change that buys nothing. `id`, `tone`, `href` and
 * `updatedAt` are the additions.
 *
 * Three things it now refuses to get wrong:
 *
 * 1. **Four metrics, not nine.** A strip that grows with the backlog stops being a
 *    summary. Anything past four belongs in `supporting`.
 * 2. **Tone is a word.** `tone` picks a phrase as well as a colour; a metric that is only
 *    red says nothing to a reader who cannot see red.
 * 3. **Loading and error keep the strip's shape.** Every slot reserves its height in
 *    every state, so a slow query does not push the page down and then yank it back.
 */

export type MetricTone = "neutral" | "info" | "success" | "warning" | "destructive";

export interface SalesMetric {
  /**
   * Stable identity. Optional because the callers that predate it key on `label`; supply
   * it whenever two metrics could share a label.
   */
  id?: string;
  label: string;
  /**
   * Already formatted by the caller through `src/lib/format.ts`. `number` stays accepted
   * for the existing callers that pass a raw count.
   */
  value: string | number;
  /** One short phrase. Not a sentence. */
  hint?: string;
  /** Reads the number as a state. Rendered as text as well as colour. */
  tone?: MetricTone;
  /** Path to the workspace already filtered to exactly this number. */
  href?: string;
  /** ISO timestamp. Absolute until the client mounts, relative after — see MetricTimestamp. */
  updatedAt?: string;
  /** Period-over-period change in percent. Pre-existing; `tone` is the newer signal. */
  delta?: number;
  icon?: LucideIcon;
}

export type MetricColumns = 1 | 2 | 3 | 4;

export interface MetricStripProps {
  metrics: SalesMetric[];
  /** A compact second row for the numbers that did not earn a card. */
  supporting?: SalesMetric[];
  isLoading?: boolean;
  error?: boolean;
  /** Overrides the column count otherwise derived from `metrics.length`. */
  columns?: MetricColumns;
  className?: string;
}

const MAX_PRIMARY_METRICS = 4;

const COLUMN_CLASS: Record<MetricColumns, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
};

/**
 * The phrase each tone renders. `neutral` deliberately renders nothing: "nothing to flag"
 * is the default, and a marker on every card would train people to ignore all of them.
 */
const TONE_LABEL: Record<MetricTone, string | null> = {
  neutral: null,
  info: "Watch",
  success: "On track",
  warning: "Needs attention",
  destructive: "Critical",
};

const TONE_CLASS: Record<MetricTone, string> = {
  neutral: "",
  info: "text-info",
  success: "text-success",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
};

type CellState = "loaded" | "loading" | "error";

/**
 * Every slot carries its own `min-h-*` rather than a filler character, so an absent hint,
 * a skeleton and an error message all leave the card exactly the same height. `min-h-4`
 * is the line box of `text-xs`; `min-h-8` is the line box of `text-2xl`.
 */
const LABEL_CLASS = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const LABEL_SLOT_CLASS = "flex min-h-4 items-center";
// These are cards, not a <table>, so the global `table { tabular-nums }` rule in
// styles.css does not reach them and the utility has to be spelled out.
const VALUE_CLASS = "mt-2 min-h-8 text-2xl font-semibold tracking-tight tabular-nums";
const FOOTER_CLASS =
  "mt-1 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground";
// Stretches the link over the whole card, so the click target is the card rather than
// four words of label.
const STRETCH_CLASS = "after:absolute after:inset-0 after:content-[''] hover:text-foreground";

function clampColumns(count: number): MetricColumns {
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return MAX_PRIMARY_METRICS;
}

/** Blank metrics that hold a row open while there is nothing to put in it. */
function placeholderMetrics(count: number): SalesMetric[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `metric-placeholder-${index}`,
    label: "",
    value: "",
  }));
}

function ToneMarker({ tone }: { tone: MetricTone }) {
  const label = TONE_LABEL[tone];
  if (!label) return null;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", TONE_CLASS[tone])}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/**
 * The `useClientNow` subscription lives in this leaf rather than in MetricStrip, so a
 * strip whose metrics carry no `updatedAt` — which is all nine of today's callers — never
 * mounts the 30s interval at all.
 *
 * Absolute date before mount, relative after: `relativeTime` needs an explicit `now`, and
 * reading the clock during render would make the server and the first client render
 * disagree.
 */
function MetricTimestamp({ iso }: { iso: string }) {
  const now = useClientNow();

  return (
    <time dateTime={iso}>Updated {now === null ? formatDate(iso) : relativeTime(iso, now)}</time>
  );
}

function MetricLabel({ metric, state }: { metric: SalesMetric; state: CellState }) {
  if (!metric.label) return state === "loading" ? <Skeleton className="h-4 w-24" /> : null;

  // Only a loaded card links out: a link to a filtered workspace is a promise about a
  // number we do not currently have.
  if (metric.href && state === "loaded") {
    return (
      <Link to={metric.href} className={cn(LABEL_CLASS, STRETCH_CLASS)}>
        {metric.label}
      </Link>
    );
  }

  return <p className={LABEL_CLASS}>{metric.label}</p>;
}

function MetricValue({ metric, state }: { metric: SalesMetric; state: CellState }) {
  if (state === "loading") return <Skeleton className="mt-2 h-8 w-24" />;
  // An em dash, never the last number and never a zero: a strip that keeps reporting "0"
  // through an outage is worse than one that admits it does not know.
  if (state === "error") return <p className={VALUE_CLASS}>&mdash;</p>;

  return <p className={VALUE_CLASS}>{metric.value}</p>;
}

function DeltaChip({ delta }: { delta: number }) {
  const up = delta >= 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        up ? "text-success" : "text-destructive",
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}
      {delta}%
    </span>
  );
}

function MetricFooter({ metric, state }: { metric: SalesMetric; state: CellState }) {
  if (state === "loading") {
    return (
      <div className={FOOTER_CLASS}>
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={FOOTER_CLASS}>
        <span className="font-medium text-destructive">Unavailable</span>
      </div>
    );
  }

  return (
    <div className={FOOTER_CLASS}>
      {metric.tone && <ToneMarker tone={metric.tone} />}
      {typeof metric.delta === "number" && <DeltaChip delta={metric.delta} />}
      {metric.hint && <span>{metric.hint}</span>}
      {metric.updatedAt && <MetricTimestamp iso={metric.updatedAt} />}
    </div>
  );
}

function MetricCell({ metric, state }: { metric: SalesMetric; state: CellState }) {
  const Icon = metric.icon;

  return (
    <Card data-metric-cell="" className="relative p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={LABEL_SLOT_CLASS}>
            <MetricLabel metric={metric} state={state} />
          </div>
          <MetricValue metric={metric} state={state} />
          <MetricFooter metric={metric} state={state} />
        </div>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

function SupportingLabel({ metric, state }: { metric: SalesMetric; state: CellState }) {
  if (!metric.label) return state === "loading" ? <Skeleton className="h-3 w-16" /> : null;

  if (metric.href && state === "loaded") {
    return (
      <Link to={metric.href} className={STRETCH_CLASS}>
        {metric.label}
      </Link>
    );
  }

  return <span>{metric.label}</span>;
}

function SupportingCell({ metric, state }: { metric: SalesMetric; state: CellState }) {
  return (
    <div data-supporting-cell="" className="relative min-w-0">
      <div className={cn(LABEL_SLOT_CLASS, "text-xs text-muted-foreground")}>
        <SupportingLabel metric={metric} state={state} />
      </div>
      <div className="flex min-h-5 items-center gap-2 text-sm font-medium tabular-nums">
        {state === "loading" && <Skeleton className="h-4 w-14" />}
        {state === "error" && <span className="font-medium text-destructive">Unavailable</span>}
        {state === "loaded" && (
          <>
            <span>{metric.value}</span>
            {metric.tone && <ToneMarker tone={metric.tone} />}
            {metric.updatedAt && (
              <span className="text-xs font-normal text-muted-foreground">
                <MetricTimestamp iso={metric.updatedAt} />
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function MetricStrip({
  metrics,
  supporting,
  isLoading,
  error,
  columns,
  className,
}: MetricStripProps) {
  if (import.meta.env.DEV && metrics.length > MAX_PRIMARY_METRICS) {
    // Loud in development, silent in production, and it still renders all of them: an
    // over-full strip is a call-site problem, not a reason to break the page.
    console.warn(
      `MetricStrip was given ${metrics.length} primary metrics. At most ` +
        `${MAX_PRIMARY_METRICS} belong in the primary row — move the rest into supporting.`,
    );
  }

  const state: CellState = error ? "error" : isLoading ? "loading" : "loaded";
  const columnCount = columns ?? clampColumns(metrics.length);

  // While loading or failed the caller usually has no metrics yet, so the grid is held
  // open with as many blank cells as it will end up having columns.
  const primary =
    metrics.length > 0 || state === "loaded" ? metrics : placeholderMetrics(columnCount);

  // Reserve the second row for a provided-but-empty array too, otherwise it appears only
  // once the data lands and shoves the rest of the page down at the worst moment.
  const supportingCells =
    supporting && supporting.length === 0 && state !== "loaded"
      ? placeholderMetrics(2)
      : (supporting ?? []);

  const grid = (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        COLUMN_CLASS[columnCount],
        supportingCells.length === 0 && className,
      )}
      aria-busy={state === "loading" || undefined}
    >
      {primary.map((metric) => (
        <MetricCell key={metric.id ?? metric.label} metric={metric} state={state} />
      ))}
    </div>
  );

  // With no supporting row the rendered tree is exactly what the nine existing callers
  // already get: no extra wrapper, no spacing change.
  if (supportingCells.length === 0) return grid;

  return (
    <div className={cn("space-y-3", className)}>
      {grid}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
        {supportingCells.map((metric) => (
          <SupportingCell key={metric.id ?? metric.label} metric={metric} state={state} />
        ))}
      </div>
    </div>
  );
}

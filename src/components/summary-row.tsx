import type { ReactNode } from "react";

/**
 * A label/value row inside a detail card.
 *
 * The two spans need opposite behaviour under pressure, which is the whole reason this is a
 * component rather than an inline div. A flex item defaults to `min-width: auto`, so both
 * spans were content-sized: a long value grew, and the only thing left to give was the label,
 * which wrapped. "Lifecycle stage" broke across two lines so that an industry name could stay
 * on one — exactly backwards, since the label is fixed text the reader already knows and the
 * value is the part they came for.
 *
 * So the label is pinned with `shrink-0`, and the value gets `min-w-0` so it is the one that
 * shrinks, plus `break-words` so an unbroken string like a long domain wraps inside the row
 * instead of pushing the row wider than its card.
 */
export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words text-foreground">{value}</span>
    </div>
  );
}

/**
 * Arithmetic over money columns.
 *
 * Every money column in `neon/migrations/` is `numeric`, and Postgres hands `numeric` to the
 * driver as a *string* so arbitrary precision survives the wire. `src/lib/types.ts` declares
 * those fields `number`, so the two disagree at runtime and `sum + row.total_value`
 * concatenates instead of adding — which is how the dashboard, /quotes and /clients came to
 * render "HK$NaN" as soon as two rows were in scope, while a single row rendered correctly.
 *
 * `src/server/db/neon.server.ts` now registers a type parser that widens `numeric` to a JS
 * number at the driver, which fixes the root cause. These helpers are the second layer: they
 * make the arithmetic correct for values that arrive by any other route — a legacy Supabase
 * read, a JSON payload from n8n, a cached SSR payload serialised before the parser landed —
 * and they say at the call site that the input is money of uncertain representation.
 */

/**
 * A money value as a finite number, or 0. Accepts the string form Postgres emits for
 * `numeric` as well as an already-parsed number; anything unparseable is 0 rather than NaN,
 * because a NaN here propagates through a whole total and surfaces as "HK$NaN" on screen.
 */
export function toAmount(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Sum of a money field across rows, guarding every element with {@link toAmount}. */
export function sumAmounts<T>(
  rows: readonly T[],
  select: (row: T) => number | string | null | undefined,
): number {
  return rows.reduce<number>((total, row) => total + toAmount(select(row)), 0);
}

/** Rounds to two decimal places, the scale every money column in the schema is declared at. */
export function roundToMoney(value: number | string | null | undefined): number {
  return Math.round((toAmount(value) + Number.EPSILON) * 100) / 100;
}

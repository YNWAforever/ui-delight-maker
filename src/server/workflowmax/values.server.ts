import { assertDate, type WfmObject } from "./http.server";

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
export function dateValue(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : assertDate(String(value));
}
export function uuidKey(row: WfmObject): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.uuid))
    throw new Error("WFM_UUID_REQUIRED");
  return row.uuid; // preserve source UUID spelling; never replace with a human number
}

// Exact decimal accumulation, independent of JS floating point. Reject precision
// outside this scaffold's supported range instead of silently rounding money.
const SCALE = 18;
const UNIT = 10n ** BigInt(SCALE);
export function decimalUnits(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("DECIMAL_REQUIRED");
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  )
    throw new Error("UNSAFE_DECIMAL");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new Error("INVALID_DECIMAL");
  const fractional = match[3] ?? "";
  const power = SCALE + Number(match[4] ?? 0) - fractional.length;
  if (!Number.isSafeInteger(power) || Math.abs(power) > 100 || match[2].length > 100)
    throw new Error("UNSUPPORTED_DECIMAL_PRECISION");
  let units = BigInt(match[2] + fractional);
  if (power < 0) {
    const divisor = 10n ** BigInt(-power);
    if (units % divisor !== 0n) throw new Error("UNSUPPORTED_DECIMAL_PRECISION");
    units /= divisor;
  } else units *= 10n ** BigInt(power);
  return match[1] === "-" ? -units : units;
}
export function decimalText(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const fraction = String(abs % UNIT)
    .padStart(SCALE, "0")
    .replace(/0+$/, "");
  return `${sign}${abs / UNIT}${fraction ? `.${fraction}` : ""}`;
}
export function decimalValue(value: unknown): string | null {
  return value === undefined || value === null ? null : decimalText(decimalUnits(value));
}
export function currencyValue(row: WfmObject, fallback?: string): string | null {
  const value = textValue(row.currency) ?? fallback ?? null;
  if (value !== null && !/^[A-Z]{3}$/.test(value)) throw new Error("INVALID_CURRENCY");
  return value;
}

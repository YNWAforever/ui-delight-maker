/**
 * RFC 4180 CSV writer. Text cells are escaped for spreadsheet formulas before
 * ordinary CSV quoting; numeric cells retain their machine-readable values.
 * The default UTF-8 BOM lets Excel on Windows read Chinese text correctly.
 */

/** The value kinds a cell may be given. Anything else is a caller bug, not a runtime case. */
export type CsvValue = string | number | null | undefined;

export type CsvColumn<T> = {
  /** Header text for this column. Quoted on the same rules as any other field. */
  header: string;
  /** The cell for one row. Return the machine-readable value; format for display elsewhere. */
  value: (row: T) => CsvValue;
  /** Text is spreadsheet-escaped; number remains machine-readable. Defaults to text. */
  kind?: "text" | "number" | "date";
};

/** RFC 4180 §2.1 — records are terminated by CRLF. */
export const CSV_RECORD_SEPARATOR = "\r\n";

/** U+FEFF, written as UTF-8 by every Blob and file API we hand this to. */
export const UTF8_BOM = "\uFEFF";

/** The four characters RFC 4180 §2.6 says force quoting. */
const MUST_QUOTE = /[",\r\n]/;

/**
 * One field, escaped.
 *
 * `null` and `undefined` become an empty field rather than the strings "null"/"undefined" —
 * a spreadsheet showing the word `null` in a currency column is a data error a reader will
 * carry into whatever they build on top of it. Non-finite numbers (`NaN`, `Infinity`) are
 * treated the same way for the same reason: there is no honest CSV spelling of them.
 */
export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value;
  if (text === "") return "";
  if (!MUST_QUOTE.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Spreadsheet applications may evaluate an untrusted CSV cell as a formula. Prefix text
 * with an apostrophe before RFC quoting; the original bytes remain after that prefix.
 * Import deliberately does not strip it, since it cannot distinguish an original apostrophe.
 */
export function escapeSpreadsheetText(value: string): string {
  let index = 0;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code > 32 && code !== 0xfeff) break;
    index++;
  }
  return "=+-@".includes(value[index] ?? "") && index < value.length ? "'" + value : value;
}

function serializeCsvCell(value: CsvValue, kind: NonNullable<CsvColumn<unknown>["kind"]>): string {
  if (value === null || value === undefined) return "";
  if (kind === "number") {
    if (typeof value === "number") return escapeCsvValue(value);
    if (typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      return escapeCsvValue(value);
    }
    throw new Error("Invalid numeric CSV value");
  }
  return escapeCsvValue(escapeSpreadsheetText(String(value)));
}

export type ToCsvOptions = {
  /** Prefix the UTF-8 BOM. Default true — see the module comment. */
  bom?: boolean;
};

/**
 * A header row plus one record per row.
 *
 * Returns an empty string when there are no columns, because a file with neither header nor
 * body is not a CSV of anything. Zero *rows* is different and does produce a header-only
 * file — but callers should not reach here at all with an empty dataset: the export control
 * is expected to be disabled with a reason instead of handing the user an empty file that
 * looks like a measurement.
 */
export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  options: ToCsvOptions = {},
): string {
  if (columns.length === 0) return "";

  const records = [
    columns.map((column) => escapeCsvValue(escapeSpreadsheetText(column.header))).join(","),
    ...rows.map((row) =>
      columns.map((column) => serializeCsvCell(column.value(row), column.kind ?? "text")).join(","),
    ),
  ];

  const body = records.join(CSV_RECORD_SEPARATOR) + CSV_RECORD_SEPARATOR;
  return options.bom === false ? body : UTF8_BOM + body;
}

/**
 * A file name safe on Windows, macOS and Linux.
 *
 * Download file names come from user-visible identifiers (a report id, a range), so they can
 * pick up spaces and punctuation that a file system or a `Content-Disposition` header treats
 * as structure.
 */
export function csvFileName(...parts: Array<string | number>): string {
  const slug = parts
    .map((part) => String(part))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "export"}.csv`;
}

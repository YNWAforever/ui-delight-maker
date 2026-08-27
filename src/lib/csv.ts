/**
 * CSV *serialization*. The repository already has two parsers and no writer.
 *
 * `src/lib/csv-import.ts` and `src/server/repositories/event-import.ts` both read CSV, and
 * they disagree with each other about trimming and about blank lines. Neither of them can
 * write one, which is why `/reports` shipped an "Export CSV" button that produced a toast
 * and no file. This module is the missing half — a writer only. It deliberately does not
 * export a `parse` function: a third parser with a third opinion would make the existing
 * disagreement worse rather than better.
 *
 * The output follows RFC 4180:
 *
 * - fields are separated by commas and records by CRLF (§2.1, §2.4);
 * - a field containing a comma, a double quote, CR or LF is wrapped in double quotes (§2.6);
 * - a double quote inside a quoted field is written twice (§2.7).
 *
 * It is prefixed with a UTF-8 byte-order mark. That is not part of RFC 4180, and it is here
 * for one concrete reason: Excel on Windows decodes a BOM-less file as the system ANSI code
 * page, so a Chinese company name or a curly apostrophe in an exported row arrives as
 * mojibake. Every other consumer we care about skips the BOM. Callers that need a byte-exact
 * RFC file can pass `{ bom: false }`.
 */

/** The value kinds a cell may be given. Anything else is a caller bug, not a runtime case. */
export type CsvValue = string | number | null | undefined;

export type CsvColumn<T> = {
  /** Header text for this column. Quoted on the same rules as any other field. */
  header: string;
  /** The cell for one row. Return the machine-readable value; format for display elsewhere. */
  value: (row: T) => CsvValue;
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
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(column.value(row))).join(",")),
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

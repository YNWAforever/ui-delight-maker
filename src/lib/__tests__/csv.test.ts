import { describe, expect, it } from "vitest";

import { parseClientImportCsv } from "@/lib/csv-import";
import { CSV_RECORD_SEPARATOR, UTF8_BOM, csvFileName, escapeCsvValue, toCsv } from "@/lib/csv";

/**
 * The quoting rules, tested against the characters that break naive writers.
 *
 * Every one of these is a real failure a hand-rolled `rows.map(r => r.join(","))` produces: a
 * company name with a comma silently becomes two columns, a quoted phrase in a note ends the
 * field early, and a multi-line address turns one record into three. They are asserted
 * individually rather than through one round-trip, because a round-trip can pass while both
 * halves are wrong in the same way.
 */
describe("escapeCsvValue", () => {
  it("leaves a field that needs no quoting alone", () => {
    expect(escapeCsvValue("Northstar Media")).toBe("Northstar Media");
    expect(escapeCsvValue("2026-01-05")).toBe("2026-01-05");
    // Spaces and semicolons are not delimiters, so quoting them would only add noise.
    expect(escapeCsvValue("  padded  ")).toBe("  padded  ");
    expect(escapeCsvValue("a; b")).toBe("a; b");
  });

  it("quotes a field containing the delimiter", () => {
    expect(escapeCsvValue("Acme, Limited")).toBe('"Acme, Limited"');
  });

  it("doubles an embedded double quote and quotes the field", () => {
    expect(escapeCsvValue('He said "yes"')).toBe('"He said ""yes"""');
    // A field that is nothing but a quote character is the degenerate case.
    expect(escapeCsvValue('"')).toBe('""""');
  });

  it("quotes a field containing CR, LF or CRLF", () => {
    expect(escapeCsvValue("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvValue("line one\rline two")).toBe('"line one\rline two"');
    expect(escapeCsvValue("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("writes an empty field for every absent value", () => {
    // "null" in a currency column is a data error a reader carries downstream.
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue("")).toBe("");
    expect(escapeCsvValue(Number.NaN)).toBe("");
    expect(escapeCsvValue(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("writes numbers unformatted so a spreadsheet reads them as numbers", () => {
    expect(escapeCsvValue(1240000)).toBe("1240000");
    expect(escapeCsvValue(0)).toBe("0");
    expect(escapeCsvValue(-12.5)).toBe("-12.5");
  });
});

type Row = { company: string; note: string | null; amount: number | null };

const columns = [
  { header: "Company", value: (row: Row) => row.company },
  { header: "Note", value: (row: Row) => row.note },
  { header: "Amount (HKD)", value: (row: Row) => row.amount },
];

describe("toCsv", () => {
  it("writes a header row and CRLF-terminated records with a BOM", () => {
    const csv = toCsv([{ company: "Acme", note: "ok", amount: 10 }], columns);

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(
      `${UTF8_BOM}Company,Note,Amount (HKD)${CSV_RECORD_SEPARATOR}Acme,ok,10${CSV_RECORD_SEPARATOR}`,
    );
  });

  it("omits the BOM when asked, for a byte-exact RFC 4180 file", () => {
    const csv = toCsv([{ company: "Acme", note: null, amount: null }], columns, { bom: false });

    expect(csv.startsWith(UTF8_BOM)).toBe(false);
    expect(csv).toBe(
      `Company,Note,Amount (HKD)${CSV_RECORD_SEPARATOR}Acme,,${CSV_RECORD_SEPARATOR}`,
    );
  });

  it("escapes header cells on the same rules as body cells", () => {
    const csv = toCsv([], [{ header: 'Total, "gross"', value: () => "" }], { bom: false });

    expect(csv).toBe(`"Total, ""gross"""${CSV_RECORD_SEPARATOR}`);
  });

  it("writes a header-only file for an empty row set, and nothing at all with no columns", () => {
    expect(toCsv([], columns, { bom: false })).toBe(
      `Company,Note,Amount (HKD)${CSV_RECORD_SEPARATOR}`,
    );
    expect(toCsv([{ company: "Acme", note: null, amount: 1 }], [], { bom: false })).toBe("");
  });

  it("keeps a comma, a quote and a newline inside one field", () => {
    const csv = toCsv([{ company: 'Acme, "The" Co', note: "first\nsecond", amount: 1 }], columns, {
      bom: false,
    });

    expect(csv).toBe(
      `Company,Note,Amount (HKD)${CSV_RECORD_SEPARATOR}` +
        `"Acme, ""The"" Co","first\nsecond",1${CSV_RECORD_SEPARATOR}`,
    );
  });

  it("round-trips through the CSV reader this repository already ships", () => {
    // Not a substitute for the assertions above — it is the compatibility claim. The import
    // parser splits on line breaks before it splits on commas, so a field containing a newline
    // is outside what it can read; that is a limitation of the reader, and the reason this
    // case is written with single-line values.
    const csv = toCsv(
      [
        { company: 'Acme, "The" Co', note: "renewal; upsell", amount: 1240000 },
        { company: "Northstar", note: null, amount: 0 },
      ],
      [
        { header: "company_name", value: (row: Row) => row.company },
        { header: "note", value: (row: Row) => row.note },
        { header: "amount", value: (row: Row) => row.amount },
      ],
    );

    expect(parseClientImportCsv(csv.slice(UTF8_BOM.length))).toEqual([
      { company_name: 'Acme, "The" Co', note: "renewal; upsell", amount: "1240000" },
      { company_name: "Northstar", note: "", amount: "0" },
    ]);
  });
});

describe("csvFileName", () => {
  it("joins parts into a lower-case slug with a .csv suffix", () => {
    expect(csvFileName("fimmick", "revenue", "30d")).toBe("fimmick-revenue-30d.csv");
  });

  it("strips anything a file system or a header would treat as structure", () => {
    expect(csvFileName("Agent performance", "90d")).toBe("agent-performance-90d.csv");
    expect(csvFileName("../../etc/passwd")).toBe("etc-passwd.csv");
    expect(csvFileName("")).toBe("export.csv");
  });
});

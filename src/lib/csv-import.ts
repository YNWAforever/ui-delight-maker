export type ImportRow = Record<string, string>;

export type ParsedImportRow = {
  recordIndex: number;
  startLine: number;
  values: ImportRow;
};

export type CsvParseError = {
  recordIndex: number;
  startLine: number;
  reason: string;
};

export type ImportCsvParseResult = {
  rows: ParsedImportRow[];
  errors: CsvParseError[];
};

/**
 * Parse the whole file as RFC-style records. A quoted field can span physical lines;
 * line numbers refer to the first physical line of each logical record.
 */
export function parseImportCsvDetailed(raw: string): ImportCsvParseResult {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const records: Array<{ fields: string[]; startLine: number }> = [];
  const errors: CsvParseError[] = [];
  let fields: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1;
  let startLine = 1;

  const finish = () => {
    fields.push(field);
    if (!(fields.length === 1 && fields[0].trim() === "")) {
      records.push({ fields, startLine });
    }
    fields = [];
    field = "";
    state = "start";
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (state === "quoted") {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          state = "closed";
        }
      } else if (char === "\r" && text[index + 1] === "\n") {
        field += "\r\n";
        index++;
        line++;
      } else {
        field += char;
        if (char === "\r" || char === "\n") line++;
      }
      continue;
    }

    if (char === ",") {
      fields.push(field);
      field = "";
      state = "start";
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      finish();
      line++;
      startLine = line;
      continue;
    }
    if (char === '"' && state === "start") {
      state = "quoted";
      continue;
    }
    if (state === "closed" || char === '"') {
      errors.push({
        recordIndex: records.length,
        startLine,
        reason: "Unexpected character after quoted field",
      });
      break;
    }
    field += char;
    state = "plain";
  }

  if (errors.length === 0 && state === "quoted") {
    errors.push({ recordIndex: records.length, startLine, reason: "Unclosed quoted field" });
  } else if (errors.length === 0 && (fields.length > 0 || field !== "" || state === "closed")) {
    finish();
  }

  const [header, ...data] = records;
  if (!header) return { rows: [], errors };
  const headers = header.fields.map((value) => value.trim());
  return {
    rows: data.map((record, index) => {
      const values: ImportRow = {};
      headers.forEach((name, column) => {
        values[name] = (record.fields[column] ?? "").trim();
      });
      return { recordIndex: index + 1, startLine: record.startLine, values };
    }),
    errors,
  };
}

/** Existing import wizards consume plain rows. Syntax errors stop preview and commit. */
export function parseImportCsv(raw: string): ImportRow[] {
  const result = parseImportCsvDetailed(raw);
  if (result.errors.length > 0) {
    const error = result.errors[0];
    throw new Error("CSV line " + error.startLine + ": " + error.reason);
  }
  return result.rows.map((row) => row.values);
}

export type ImportRowError = { row: ImportRow; reason: string };

export function validateImportRows(
  rows: ImportRow[],
  context: { knownOwners: Set<string>; knownProducts: Set<string> },
): { valid: ImportRow[]; errors: ImportRowError[] } {
  const valid: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  for (const row of rows) {
    if (!row.company_name?.trim()) {
      errors.push({ row, reason: "Missing company name" });
      continue;
    }
    if (row.owner_email && !context.knownOwners.has(row.owner_email)) {
      errors.push({ row, reason: `Unresolvable owner email: ${row.owner_email}` });
      continue;
    }
    if (row.product_name && !context.knownProducts.has(row.product_name)) {
      errors.push({ row, reason: `Unknown product: ${row.product_name}` });
      continue;
    }
    valid.push(row);
  }

  return { valid, errors };
}

export function buildClientDedupeKey(companyName: string): string {
  return companyName.trim().toLowerCase();
}

/**
 * One half of a lead's identity, normalised.
 *
 * Exported because the database match in `commitLeadImport` compares the two parts as
 * separate columns rather than as one concatenated key: Postgres text cannot hold a NUL
 * byte, so the separator below has no SQL equivalent. Sharing this function is what stops
 * the in-file dedupe and the database match from disagreeing about what equality means.
 */
export function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The identity of a lead for import purposes: a company plus a contact.
 *
 * Not company alone, the way `buildClientDedupeKey` works — several contacts at one
 * company are several legitimate leads. Both parts are normalised so a stored value with
 * stray whitespace still matches rather than creating a duplicate.
 *
 * Used for in-file duplicate detection, where one string key is convenient.
 */
export function buildLeadDedupeKey(companyName: string, email: string): string {
  // The join separator (NUL) cannot appear in a stored company name or email, because
  // Postgres text columns cannot hold one — that is the whole reason it is safe to use
  // here. But `normalizeKeyPart` only trims and lowercases, so a part built from raw,
  // not-yet-persisted CSV input could still contain a literal NUL. Escaping it (and the
  // escape character itself) before joining means the two parts can never be rearranged
  // into the same key even in that case: `${a}\0${b}` and `a\0${b}` are otherwise
  // indistinguishable once concatenated with a bare NUL separator.
  // A regex literal containing a raw NUL trips ESLint's no-control-regex rule, so the
  // NUL is escaped with split/join instead of a second `.replace(/…/g, …)`.
  const escapePart = (part: string): string =>
    part.replace(/\\/g, "\\\\").split("\u0000").join("\\0");
  return `${escapePart(normalizeKeyPart(companyName))}\u0000${escapePart(normalizeKeyPart(email))}`;
}

export function buildContactDedupeKey(clientDedupeKey: string, email: string): string {
  return `${clientDedupeKey}:${email.trim().toLowerCase()}`;
}

export function buildEngagementDedupeKey(
  clientDedupeKey: string,
  productName: string,
  startDate: string,
): string {
  return `${clientDedupeKey}:${productName.trim().toLowerCase()}:${startDate.trim()}`;
}

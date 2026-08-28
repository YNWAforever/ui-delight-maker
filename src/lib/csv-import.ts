export type ImportRow = Record<string, string>;

/**
 * Split a CSV into header-keyed rows, honouring quoted fields and doubled quotes.
 *
 * Nothing here is specific to any one importer — it was named `parseClientImportCsv`
 * when the client import was the only caller.
 */
export function parseImportCsv(raw: string): ImportRow[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current);
    return fields;
  }

  const headers = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    const row: ImportRow = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] ?? "").trim();
    });
    return row;
  });
}

export type ImportRowError = { row: ImportRow; reason: string };

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

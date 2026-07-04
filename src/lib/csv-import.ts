export type ImportRow = Record<string, string>;

export function parseClientImportCsv(raw: string): ImportRow[] {
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

export function buildContactDedupeKey(clientDedupeKey: string, email: string): string {
  return `${clientDedupeKey}:${email.trim().toLowerCase()}`;
}

export function buildEngagementDedupeKey(clientDedupeKey: string, productName: string, startDate: string): string {
  return `${clientDedupeKey}:${productName.trim().toLowerCase()}:${startDate.trim()}`;
}

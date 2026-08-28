import { type ImportRow, type ImportRowError } from "@/lib/csv-import";

export function validateClientImportRows(
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

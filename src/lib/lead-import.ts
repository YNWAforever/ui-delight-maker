import { buildLeadDedupeKey, type ImportRow, type ImportRowError } from "@/lib/csv-import";

/**
 * A shape check, not a deliverability check.
 *
 * One `@`, a non-empty local part, and a dotted domain. Deliverability is not knowable
 * here, and an RFC-derived pattern rejects valid addresses — turning a working import into
 * a support question for no gain.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validateLeadImportRows(
  rows: ImportRow[],
  context: { knownOwners: Set<string> },
): { valid: ImportRow[]; errors: ImportRowError[] } {
  const valid: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const company = row.company_name?.trim() ?? "";
    const email = row.contact_email?.trim() ?? "";

    if (!company) {
      errors.push({ row, reason: "Missing company name" });
      continue;
    }
    if (!email) {
      errors.push({ row, reason: "Missing contact email" });
      continue;
    }
    if (!EMAIL_SHAPE.test(email)) {
      errors.push({ row, reason: `Malformed contact email: ${email}` });
      continue;
    }
    if (row.owner_email && !context.knownOwners.has(row.owner_email)) {
      errors.push({ row, reason: `Unresolvable owner email: ${row.owner_email}` });
      continue;
    }

    const key = buildLeadDedupeKey(company, email);
    if (seen.has(key)) {
      errors.push({ row, reason: "Duplicate of an earlier row in this file" });
      continue;
    }
    seen.add(key);
    valid.push(row);
  }

  return { valid, errors };
}

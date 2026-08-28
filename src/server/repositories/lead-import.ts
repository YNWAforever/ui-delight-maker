import { transaction } from "@/server/db/neon.server";
import { normalizeKeyPart, type ImportRow } from "@/lib/csv-import";
import type { ImportCommitResult } from "@/server/repositories/client-import";

/**
 * Columns a matched lead may have filled in from a CSV.
 *
 * `status`, `assigned_to` and `lead_score` are deliberately absent and must stay absent.
 * A lead that reached `won`, or that someone owns, must survive any re-import untouched —
 * and the guarantee is that these columns never reach an UPDATE, not that the right value
 * happens to be passed.
 */
const FILLABLE_COLUMNS = ["contact_name", "contact_phone", "enquiry_text"] as const;

type FillableColumn = (typeof FILLABLE_COLUMNS)[number];

type ExistingLead = { id: string } & Record<FillableColumn, string | null>;

export async function commitLeadImport(
  rows: ImportRow[],
  actorId: string,
): Promise<ImportCommitResult> {
  return transaction(async (db) => {
    const result: ImportCommitResult = { created: 0, updated: 0, skipped: 0 };

    for (const row of rows) {
      const company = row.company_name.trim();
      const email = row.contact_email.trim();

      // Matched on the two parts separately rather than by concatenating them into the
      // JS key: Postgres text cannot contain a NUL byte, so `chr(0)` is an error, not a
      // separator. Comparing each column on its own is index-friendlier anyway.
      // `normalizeKeyPart` is the same normalisation `buildLeadDedupeKey` applies, so the
      // in-file dedupe and the database match cannot disagree about equality.
      const existing = await db.query<ExistingLead>(
        `
          select id, contact_name, contact_phone, enquiry_text
          from leads
          where trim(lower(company_name)) = $1
            and trim(lower(coalesce(contact_email, ''))) = $2
          limit 1
        `,
        [normalizeKeyPart(company), normalizeKeyPart(email)],
      );

      const found = existing.rows[0];
      if (!found) {
        const ownerId = row.owner_email
          ? (
              await db.query<{ id: string }>("select id from profiles where email = $1", [
                row.owner_email,
              ])
            ).rows[0]?.id
          : undefined;

        await db.query(
          `
            insert into leads
              (company_name, contact_name, contact_email, contact_phone, enquiry_text,
               source, assigned_to)
            values ($1, nullif($2, ''), $3, nullif($4, ''), nullif($5, ''), 'csv', $6)
          `,
          [
            company,
            row.contact_name ?? "",
            email,
            row.contact_phone ?? "",
            row.enquiry_text ?? "",
            ownerId ?? null,
          ],
        );
        result.created += 1;
        continue;
      }

      // Only columns the CSV can fill AND the stored row leaves empty. If that set is
      // empty, no statement is issued at all — a no-op UPDATE would bump `updated_at`
      // across a whole list on every re-import and make it look freshly touched.
      const fills = FILLABLE_COLUMNS.filter(
        (column) => !found[column] && (row[column] ?? "").trim() !== "",
      );

      if (fills.length === 0) {
        result.skipped += 1;
        continue;
      }

      const assignments = fills.map((column, index) => `${column} = $${index + 2}`).join(", ");
      await db.query(`update leads set ${assignments}, updated_at = now() where id = $1`, [
        found.id,
        ...fills.map((column) => (row[column] ?? "").trim()),
      ]);
      result.updated += 1;
    }

    await db.query(
      `
        insert into activity_logs (actor_type, actor_id, action, object_type, diff_data)
        values ('user', $1, 'ran CSV lead import', 'lead', $2::jsonb)
      `,
      [actorId, JSON.stringify(result)],
    );

    return result;
  });
}

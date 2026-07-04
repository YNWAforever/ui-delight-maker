// src/server/repositories/client-import.ts
import { transaction } from "@/server/db/neon.server";
import { createClient } from "@/server/repositories/clients";
import { createClientContact } from "@/server/repositories/client-contacts";
import { createEngagement } from "@/server/repositories/engagements";
import type { ImportRow } from "@/lib/csv-import";
import { buildClientDedupeKey } from "@/lib/csv-import";
import type { Client, EngagementBillingPeriod } from "@/lib/types";

export type ImportCommitResult = { created: number; updated: number; skipped: number };

const VALID_BILLING_PERIODS: ReadonlySet<string> = new Set([
  "monthly",
  "quarterly",
  "annual",
  "one_off",
]);

function normalizeBillingPeriod(value: string | undefined): EngagementBillingPeriod {
  return value && VALID_BILLING_PERIODS.has(value) ? (value as EngagementBillingPeriod) : "monthly";
}

export async function commitClientImport(rows: ImportRow[], actorId: string): Promise<ImportCommitResult> {
  return transaction(async (db) => {
    const result: ImportCommitResult = { created: 0, updated: 0, skipped: 0 };
    const clientIdByKey = new Map<string, string>();

    for (const row of rows) {
      const key = buildClientDedupeKey(row.company_name);
      let clientId = clientIdByKey.get(key);

      if (!clientId) {
        // Match on trim(lower(...)) on both sides so a client whose stored
        // company_name has stray leading/trailing whitespace (a real
        // possibility elsewhere in this app — see the whitespace-trim fix in
        // convertWonLeadToEngagement) still matches instead of creating a
        // duplicate client.
        const existing = await db.query<{ id: string }>(
          "select id from clients where trim(lower(company_name)) = $1",
          [key],
        );
        if (existing.rows[0]) {
          clientId = existing.rows[0].id;
          await db.query(
            "update clients set industry = coalesce(nullif($2, ''), industry), tier = coalesce(nullif($3, ''), tier) where id = $1",
            [clientId, row.industry ?? "", row.tier ?? ""],
          );
          result.updated += 1;
        } else {
          const created = await createClient(
            {
              company_name: row.company_name,
              industry: row.industry || undefined,
              tier: (row.tier || undefined) as Client["tier"] | undefined,
            },
            db,
          );
          clientId = created.id;
          result.created += 1;
        }
        clientIdByKey.set(key, clientId);
      }

      if (row.contact_email) {
        const existingContact = await db.query<{ id: string }>(
          "select id from client_contacts where client_id = $1 and lower(email) = lower($2)",
          [clientId, row.contact_email],
        );
        if (!existingContact.rows[0]) {
          await createClientContact(
            { client_id: clientId, name: row.contact_name || "Unnamed", email: row.contact_email },
            db,
          );
        }
      }

      if (row.product_name) {
        const product = await db.query<{ id: string }>("select id from products where name = $1", [row.product_name]);
        const productId = product.rows[0]?.id;
        if (productId && row.start_date) {
          const owner = row.owner_email
            ? await db.query<{ id: string }>("select id from profiles where email = $1", [row.owner_email])
            : { rows: [] };
          const existingEngagement = await db.query<{ id: string }>(
            "select id from engagements where client_id = $1 and product_id = $2 and start_date = $3",
            [clientId, productId, row.start_date],
          );
          if (!existingEngagement.rows[0]) {
            await createEngagement(
              {
                client_id: clientId,
                product_id: productId,
                owner: owner.rows[0]?.id,
                value: row.value ? Number(row.value) : undefined,
                billing_period: normalizeBillingPeriod(row.billing_period),
                start_date: row.start_date,
              },
              db,
            );
          }
        }
      }
    }

    await db.query(
      `
        insert into activity_logs (actor_type, actor_id, action, object_type, diff_data)
        values ('user', $1, 'ran CSV client import', 'client', $2::jsonb)
      `,
      [actorId, JSON.stringify(result)],
    );

    return result;
  });
}

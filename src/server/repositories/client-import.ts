// src/server/repositories/client-import.ts
import { transaction } from "@/server/db/neon.server";
import { AdminError } from "@/lib/admin/errors";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { authorizeImportRow, type ImportWriteEffect } from "@/server/imports/authorize-row.server";
import { createClient } from "@/server/repositories/clients";
import { createClientContact } from "@/server/repositories/client-contacts";
import { createEngagement } from "@/server/repositories/engagements";
import type { ImportRow } from "@/lib/csv-import";
import { buildClientDedupeKey } from "@/lib/csv-import";
import { addMonthsToDateString } from "@/lib/engagement-utils";
import type { Client, EngagementBillingPeriod } from "@/lib/types";

const DEFAULT_TERM_MONTHS = 12;

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

export async function commitClientImport(
  rows: ImportRow[],
  actorId: string,
  ctx: RequestAuthorization,
): Promise<ImportCommitResult> {
  return transaction(async (db) => {
    const result: ImportCommitResult = { created: 0, updated: 0, skipped: 0 };
    const clientIdByKey = new Map<string, string>();

    for (const row of rows) {
      const key = buildClientDedupeKey(row.company_name);
      const firstOccurrence = !clientIdByKey.has(key);
      const matched = await db.query<{ id: string; industry: string | null; tier: string | null }>(
        firstOccurrence
          ? "select id, industry, tier from clients where trim(lower(company_name)) = $1 limit 2 for update"
          : "select id, industry, tier from clients where id = $1 for update",
        [firstOccurrence ? key : clientIdByKey.get(key)],
      );
      if (matched.rows.length > 1) throw new AdminError("CONFLICT", "Ambiguous import match");
      const existing = matched.rows[0];
      if (!existing && !firstOccurrence) {
        throw new AdminError("STALE_ADMIN_STATE", "Import target changed");
      }
      const clientId = existing?.id;
      const nextIndustry = row.industry?.trim() || null;
      const nextTier = row.tier?.trim() || null;
      const changeClient =
        firstOccurrence &&
        Boolean(existing) &&
        ((nextIndustry !== null && nextIndustry !== existing?.industry) ||
          (nextTier !== null && nextTier !== existing?.tier));
      const target = clientId ? { type: "client" as const, id: clientId } : undefined;

      const existingContact =
        clientId && row.contact_email
          ? (
              await db.query<{ id: string }>(
                "select id from client_contacts where client_id = $1 and lower(email) = lower($2) for update",
                [clientId, row.contact_email],
              )
            ).rows[0]
          : null;
      const addContact = Boolean(row.contact_email && !existingContact);

      const product = row.product_name
        ? (
            await db.query<{ id: string; default_term_months: number | null }>(
              "select id, default_term_months from products where name = $1 and active = true",
              [row.product_name],
            )
          ).rows[0]
        : null;
      if (row.product_name && !product) {
        throw new AdminError("STALE_ADMIN_STATE", "Import product changed");
      }
      const existingEngagement =
        clientId && product && row.start_date
          ? (
              await db.query<{ id: string }>(
                "select id from engagements where client_id = $1 and product_id = $2 and start_date = $3 for update",
                [clientId, product.id, row.start_date],
              )
            ).rows[0]
          : null;
      const addEngagement = Boolean(product && row.start_date && !existingEngagement);
      const owner =
        addEngagement && row.owner_email
          ? (
              await db.query<{ id: string }>(
                "select id from profiles where email = $1 and status = 'active'",
                [row.owner_email],
              )
            ).rows[0]
          : null;
      if (addEngagement && row.owner_email && !owner) {
        throw new AdminError("STALE_ADMIN_STATE", "Import owner changed");
      }

      const effects: ImportWriteEffect[] = clientId
        ? [{ capability: "accounts.view", resource: target }]
        : [{ capability: "accounts.create" }];
      if (changeClient && target) effects.push({ capability: "accounts.update", resource: target });
      if (addContact) effects.push({ capability: "contacts.create", resource: target });
      if (addEngagement) effects.push({ capability: "engagements.create", resource: target });
      const authorization = await authorizeImportRow(ctx, { effects }, db);
      if (!authorization.allowed) throw new AdminError("FORBIDDEN", "Import row is not authorized");

      let resolvedClientId = clientId;
      if (!resolvedClientId) {
        const created = await createClient(
          {
            company_name: row.company_name,
            industry: row.industry || undefined,
            tier: (row.tier || undefined) as Client["tier"] | undefined,
          },
          db,
        );
        resolvedClientId = created.id;
        result.created += 1;
      } else if (changeClient) {
        await db.query(
          "update clients set industry = coalesce($2, industry), tier = coalesce($3, tier) where id = $1",
          [resolvedClientId, nextIndustry, nextTier],
        );
        if (firstOccurrence) result.updated += 1;
      } else if (firstOccurrence) {
        if (addContact || addEngagement) result.updated += 1;
        else result.skipped += 1;
      }
      clientIdByKey.set(key, resolvedClientId);

      if (addContact) {
        await createClientContact(
          {
            client_id: resolvedClientId,
            name: row.contact_name || "Unnamed",
            email: row.contact_email,
          },
          db,
        );
      }
      if (addEngagement && product && row.start_date) {
        const termMonths = product.default_term_months ?? DEFAULT_TERM_MONTHS;
        await createEngagement(
          {
            client_id: resolvedClientId,
            product_id: product.id,
            owner: owner?.id,
            value: row.value ? Number(row.value) : undefined,
            billing_period: normalizeBillingPeriod(row.billing_period),
            start_date: row.start_date,
            renewal_date: addMonthsToDateString(row.start_date, termMonths),
          },
          db,
        );
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

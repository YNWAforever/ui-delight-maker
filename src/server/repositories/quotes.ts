import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne } from "@/server/db/neon.server";
import type { PricingTemplate, Quote } from "@/lib/types";

type QuoteFilters = {
  status?: string;
  lead_id?: string;
  client_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
};

type CreateQuoteInput = Pick<Quote, "lead_id" | "currency"> &
  Partial<
    Pick<
      Quote,
      | "client_id"
      | "contact_id"
      | "account_id"
      | "deal_id"
      | "line_items"
      | "total_value"
      | "valid_until"
      | "number"
      | "created_by"
    >
  >;

const quoteUpdateColumns: Array<keyof Partial<Quote> & string> = [
  "status",
  "total_value",
  "valid_until",
  "line_items",
  "pdf_url",
  "approved_by",
  "contact_id",
  "account_id",
  "deal_id",
];

export async function listQuotes(filters: QuoteFilters = {}) {
  const where = buildFilters([
    ["status", filters.status],
    ["lead_id", filters.lead_id],
    ["client_id", filters.client_id],
    ["contact_id", filters.contact_id],
    ["account_id", filters.account_id],
    ["deal_id", filters.deal_id],
  ]);

  return query<Quote>(
    `
      select *
      from quotes
      ${where.sql}
      order by created_at desc
    `,
    where.values,
  );
}

export async function getQuote(id: string) {
  const quote = await queryOne<Quote>("select * from quotes where id = $1", [id]);
  if (!quote) throw new Error("Quote not found");
  return quote;
}

export async function createQuote(input: CreateQuoteInput) {
  const quote = await queryOne<Quote>(
    `
      insert into quotes
        (number, lead_id, client_id, contact_id, account_id, deal_id, status, total_value, currency, valid_until, line_items, created_by)
      values
        ($1, $2, $3, $4, $5, $6, 'draft', $7, coalesce($8, 'HKD'), $9, coalesce($10::jsonb, '[]'::jsonb), $11)
      returning *
    `,
    [
      input.number ?? null,
      input.lead_id ?? null,
      input.client_id ?? null,
      input.contact_id ?? null,
      input.account_id ?? null,
      input.deal_id ?? null,
      input.total_value ?? null,
      input.currency ?? null,
      input.valid_until ?? null,
      input.line_items === undefined ? null : JSON.stringify(input.line_items),
      input.created_by ?? null,
    ],
  );

  if (!quote) throw new Error("Failed to create quote");
  return quote;
}

export async function updateQuote(id: string, updates: Partial<Quote>) {
  const normalizedUpdates = {
    ...updates,
    line_items: updates.line_items === undefined ? undefined : JSON.stringify(updates.line_items),
  };
  const update = buildUpdate(normalizedUpdates, quoteUpdateColumns, 1);
  const quote = await queryOne<Quote>(
    `
      update quotes
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
  );

  if (!quote) throw new Error("Quote not found");
  return quote;
}

export async function listActivePricingTemplates() {
  return query<PricingTemplate>(
    `
      select *
      from pricing_templates
      where active = true
      order by service
    `,
  );
}

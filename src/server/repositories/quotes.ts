import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import type { PricingTemplate, Quote, QuoteLineItem, QuoteLineItemRecord } from "@/lib/types";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import {
  normalizePagination,
  parseCount,
  type PaginatedResult,
  type PaginationInput,
} from "@/server/repositories/pagination";

export type QuoteFilters = {
  status?: string;
  lead_id?: string;
  client_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
};

export type QuotePageFilters = QuoteFilters & PaginationInput;

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
      | "quote_template_id"
      | "document_sections"
      | "cover_text"
      | "assumptions"
      | "payment_terms"
      | "created_by"
    >
  >;

const editableQuoteUpdateColumns: Array<keyof Partial<Quote> & string> = [
  "quote_template_id",
  "document_sections",
  "cover_text",
  "assumptions",
  "payment_terms",
  "parent_quote_id",
  "change_order_reason",
  "total_value",
  "valid_until",
  "line_items",
  "contact_id",
  "account_id",
  "deal_id",
];

const lifecycleQuoteUpdateColumns: Array<keyof Partial<Quote> & string> = [
  "status",
  "accepted_version_id",
  "issued_version_id",
  "accepted_at",
  "accepted_by",
  "pdf_url",
  "approved_by",
] as const;

const lifecycleQuoteUpdateColumnSet = new Set<string>(lifecycleQuoteUpdateColumns);
const immutableVersionReferenceColumns = ["accepted_version_id", "issued_version_id"] as const;

function assertNoLifecycleUpdates(updates: Partial<Quote>) {
  const lifecycleFields = Object.keys(updates).filter(
    (field) =>
      updates[field as keyof Quote] !== undefined && lifecycleQuoteUpdateColumnSet.has(field),
  );

  if (lifecycleFields.length > 0) {
    throw new Error("Quote lifecycle fields must be changed through workflow actions");
  }
}

function buildImmutableVersionReferenceGuard(updates: Partial<Quote>) {
  const clauses: string[] = [];
  const values: Array<string | null> = [];
  let nextIndex = 1;

  for (const column of immutableVersionReferenceColumns) {
    const value = updates[column];
    if (value === undefined) continue;

    clauses.push(`(${column} is null or ${column} is not distinct from $${nextIndex})`);
    values.push(value ?? null);
    nextIndex += 1;
  }

  return { clauses, values, nextIndex };
}

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

export async function listQuotesPage(
  filters: QuotePageFilters = {},
): Promise<PaginatedResult<Quote>> {
  const where = buildFilters([
    ["status", filters.status],
    ["lead_id", filters.lead_id],
    ["client_id", filters.client_id],
    ["contact_id", filters.contact_id],
    ["account_id", filters.account_id],
    ["deal_id", filters.deal_id],
  ]);
  const { page, limit, offset } = normalizePagination(filters);
  const [items, count] = await Promise.all([
    query<Quote>(
      `
        select *
        from quotes
        ${where.sql}
        order by created_at desc, id desc
        limit $${where.values.length + 1} offset $${where.values.length + 2}
      `,
      [...where.values, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      `
        select count(*) as total
        from quotes
        ${where.sql}
      `,
      where.values,
    ),
  ]);

  return { items, total: parseCount(count), page, limit };
}

export async function getQuote(id: string) {
  const quote = await queryOne<Quote>("select * from quotes where id = $1", [id]);
  if (!quote) throw new Error("Quote not found");
  return quote;
}

async function syncQuoteLineItemsColumn(
  quoteId: string,
  lineItems: QuoteLineItemRecord[],
  db?: Queryable,
): Promise<Quote> {
  const quote = await queryOne<Quote>(
    `
      update quotes
      set line_items = $1::jsonb
      where id = $2
      returning *
    `,
    [JSON.stringify(lineItems), quoteId],
    db,
  );

  if (!quote) throw new Error("Quote not found");
  return quote;
}

async function updateQuoteRow(
  id: string,
  updates: Partial<Quote>,
  allowedColumns: Array<keyof Partial<Quote> & string>,
  db?: Queryable,
) {
  const hasImmutableVersionReferenceUpdate =
    updates.accepted_version_id !== undefined || updates.issued_version_id !== undefined;
  const immutableVersionReferenceGuard = buildImmutableVersionReferenceGuard(updates);
  const normalizedUpdates = {
    ...updates,
    line_items: updates.line_items === undefined ? undefined : JSON.stringify(updates.line_items),
    document_sections:
      updates.document_sections === undefined
        ? undefined
        : JSON.stringify(updates.document_sections),
  };
  const update = buildUpdate(
    normalizedUpdates,
    allowedColumns,
    immutableVersionReferenceGuard.nextIndex,
  );
  const quote = await queryOne<Quote>(
    `
      update quotes
      set ${update.sql}
      where id = $${update.nextIndex}${
        immutableVersionReferenceGuard.clauses.length > 0
          ? ` and ${immutableVersionReferenceGuard.clauses.join(" and ")}`
          : ""
      }
      returning *
    `,
    [...immutableVersionReferenceGuard.values, ...update.values, id],
    db,
  );

  if (!quote) {
    throw new Error(
      hasImmutableVersionReferenceUpdate
        ? "Quote not found or version reference is immutable"
        : "Quote not found",
    );
  }

  return quote;
}

export async function createQuote(input: CreateQuoteInput, db?: Queryable) {
  const work = async (client?: Queryable) => {
    const quote = await queryOne<Quote>(
      `
      insert into quotes
        (number, lead_id, client_id, contact_id, account_id, deal_id, status, total_value, currency, valid_until, line_items, quote_template_id, document_sections, cover_text, assumptions, payment_terms, created_by)
      values
        ($1, $2, $3, $4, $5, $6, 'draft', $7, coalesce($8, 'HKD'), $9, coalesce($10::jsonb, '[]'::jsonb), $11, coalesce($12::jsonb, '[]'::jsonb), $13, $14, $15, $16)
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
        input.quote_template_id ?? null,
        input.document_sections === undefined ? null : JSON.stringify(input.document_sections),
        input.cover_text ?? null,
        input.assumptions ?? null,
        input.payment_terms ?? null,
        input.created_by ?? null,
      ],
      client,
    );

    if (!quote) throw new Error("Failed to create quote");
    if (input.line_items === undefined) {
      return quote;
    }

    const normalizedLineItems = await replaceQuoteLineItems(quote.id, input.line_items, client);
    return syncQuoteLineItemsColumn(quote.id, normalizedLineItems, client);
  };

  if (db || input.line_items === undefined) {
    return work(db);
  }

  return transaction((client) => work(client));
}

export async function updateQuote(id: string, updates: Partial<Quote>, db?: Queryable) {
  assertNoLifecycleUpdates(updates);

  const work = async (client?: Queryable) => {
    const hasLineItemUpdate = updates.line_items !== undefined;
    const updatesWithoutLineItems = {
      ...updates,
      line_items: undefined,
    };
    const hasNonLineItemUpdate = editableQuoteUpdateColumns.some(
      (column) => column !== "line_items" && updatesWithoutLineItems[column] !== undefined,
    );

    if (!hasLineItemUpdate) {
      return updateQuoteRow(id, updates, editableQuoteUpdateColumns, client);
    }

    if (!hasNonLineItemUpdate) {
      const existingQuote = await queryOne<Quote>(
        "select * from quotes where id = $1",
        [id],
        client,
      );
      if (!existingQuote) {
        throw new Error("Quote not found");
      }
    } else {
      await updateQuoteRow(id, updatesWithoutLineItems, editableQuoteUpdateColumns, client);
    }

    const normalizedLineItems = await replaceQuoteLineItems(id, updates.line_items ?? [], client);
    return syncQuoteLineItemsColumn(id, normalizedLineItems, client);
  };

  if (db || updates.line_items === undefined) {
    return work(db);
  }

  return transaction((client) => work(client));
}

export async function updateQuoteLifecycle(id: string, updates: Partial<Quote>, db?: Queryable) {
  return updateQuoteRow(id, updates, lifecycleQuoteUpdateColumns, db);
}

export async function listQuoteLineItems(quoteId: string): Promise<QuoteLineItemRecord[]> {
  return query<QuoteLineItemRecord>(
    `
      select *
      from quote_line_items
      where quote_id = $1
      order by sort_order, created_at
    `,
    [quoteId],
  );
}

export async function replaceQuoteLineItems(
  quoteId: string,
  items: QuoteLineItem[],
  db?: Queryable,
): Promise<QuoteLineItemRecord[]> {
  await query("delete from quote_line_items where quote_id = $1", [quoteId], db);

  const inserted: QuoteLineItemRecord[] = [];

  for (const [index, item] of items.entries()) {
    const row = await queryOne<QuoteLineItemRecord>(
      `
        insert into quote_line_items
          (quote_id, pricing_template_id, product_id, section_label, service, description, qty, unit_price, taxable, sort_order)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning *
      `,
      [
        quoteId,
        null,
        null,
        null,
        item.service,
        item.description,
        item.qty,
        item.unit_price,
        false,
        index,
      ],
      db,
    );

    if (!row) throw new Error("Failed to insert quote line item");
    inserted.push(row);
  }

  return inserted;
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

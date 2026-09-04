import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import type {
  Client,
  Lead,
  PricingTemplate,
  Product,
  Quote,
  QuoteLineItem,
  QuoteLineItemRecord,
} from "@/lib/types";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import { normalizePagination, type PaginationInput } from "@/server/repositories/pagination";
import {
  buildQuoteListQuery,
  type QuoteListSearchScope,
} from "@/server/repositories/quote-list-query";

export type QuoteFilters = {
  status?: string;
  lead_id?: string;
  client_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
};

export type QuotePageFilters = QuoteFilters & PaginationInput;

export type QuoteListRow = Quote & { linked_company_name: string | null };

export type QuoteListAggregate = {
  status: Quote["status"];
  currency: string;
  count: number;
  total: number;
};

export type QuoteListPage = {
  items: QuoteListRow[];
  total: number;
  page: number;
  limit: number;
  aggregates: QuoteListAggregate[];
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

type QuoteAggregateRow = {
  status: Quote["status"];
  currency: string;
  count: number | string;
  total: number | string;
};

/**
 * `currency` is `not null default 'HKD'` but may be the empty string, which the client
 * already normalises with `quote.currency || "HKD"`. The aggregate applies the identical
 * rule: a row counted under '' beside a tile counted under HKD is exactly the row/tile
 * disagreement this read exists to remove.
 */
const CURRENCY = "coalesce(nullif(q.currency, ''), 'HKD')";

export async function listQuotesPage(
  filters: QuotePageFilters & { search?: string; searchScope: QuoteListSearchScope },
): Promise<QuoteListPage> {
  const parts = buildQuoteListQuery({
    filters,
    search: filters.search,
    searchScope: filters.searchScope,
  });
  const { page, limit, offset } = normalizePagination(filters);

  const [items, aggregateRows] = await Promise.all([
    query<QuoteListRow>(
      `
        select q.*, ${parts.companyNameExpression} as linked_company_name
        from quotes q${parts.joins}
        ${parts.where}
        order by q.created_at desc, q.id desc
        limit $${parts.values.length + 1} offset $${parts.values.length + 2}
      `,
      [...parts.values, limit, offset],
    ),
    // Replaces the old count query rather than joining it: the per-currency sums and the
    // row total come from one grouped read, so the route's query budget does not move.
    // `total_value` is nullable and `sum` skips nulls, hence the coalesce.
    query<QuoteAggregateRow>(
      `
        select q.status, ${CURRENCY} as currency,
               count(*) as count, coalesce(sum(q.total_value), 0) as total
        from quotes q${parts.joins}
        ${parts.where}
        group by q.status, ${CURRENCY}
      `,
      parts.values,
    ),
  ]);

  const aggregates = aggregateRows.map((row) => ({
    status: row.status,
    currency: row.currency,
    count: Number(row.count),
    total: Number(row.total),
  }));

  return {
    items,
    total: aggregates.reduce((sum, entry) => sum + entry.count, 0),
    page,
    limit,
    aggregates,
  };
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

export type QuoteReferenceKind = "lead" | "client" | "product" | "pricing";

export type QuoteLeadReference = Pick<Lead, "id" | "company_name" | "contact_name" | "status">;
export type QuoteClientReference = Pick<Client, "id" | "company_name" | "industry" | "tier">;
export type QuoteProductReference = Pick<
  Product,
  "id" | "name" | "description" | "category" | "billing_type"
>;
export type QuotePricingReference = Pick<
  PricingTemplate,
  "id" | "service" | "description" | "category" | "unit_price" | "currency" | "product_id"
>;

export type QuoteReferenceItemMap = {
  lead: QuoteLeadReference;
  client: QuoteClientReference;
  product: QuoteProductReference;
  pricing: QuotePricingReference;
};

export type QuoteReferencePage<K extends QuoteReferenceKind = QuoteReferenceKind> = {
  items: QuoteReferenceItemMap[K][];
  total: number;
  page: number;
  limit: number;
};

export type QuoteReferencePageInput<K extends QuoteReferenceKind = QuoteReferenceKind> = {
  kind: K;
  search?: string;
  selectedId?: string;
  page?: number;
  limit?: number;
};

export type QuoteClientSummary = Pick<Client, "id" | "company_name" | "industry" | "tier">;
export type QuoteLeadSummary = Pick<Lead, "id" | "company_name" | "contact_name" | "contact_email">;

const QUOTE_COLUMNS = `
  id, number, lead_id, client_id, contact_id, account_id, deal_id, status,
  quote_template_id, accepted_version_id, issued_version_id, document_sections,
  cover_text, assumptions, payment_terms, accepted_at, accepted_by, parent_quote_id,
  change_order_reason, total_value, currency, valid_until, line_items, pdf_url,
  created_by, approved_by, created_at, updated_at
`;

function normalizeQuoteReferencePagination(input: { page?: number; limit?: number }) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const limit = Math.min(25, Math.max(1, Math.trunc(input.limit ?? 25)));
  return { page, limit, offset: (page - 1) * limit };
}

function matchesReferenceSearch(item: { id: string } & Record<string, unknown>, search?: string) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return Object.values(item).some(
    (value) => typeof value === "string" && value.toLowerCase().includes(needle),
  );
}

async function mergeSelectedReference<T extends { id: string }>(
  items: T[],
  selected: T | null,
  limit: number,
) {
  if (!selected) return items.slice(0, limit);
  return [selected, ...items.filter((item) => item.id !== selected.id)];
}

export async function listQuoteReferencePage<K extends QuoteReferenceKind>(
  input: QuoteReferencePageInput<K>,
): Promise<QuoteReferencePage<K>> {
  const { page, limit, offset } = normalizeQuoteReferencePagination(input);
  const search = input.search?.trim();
  const pattern = search ? `%${search}%` : undefined;

  let items: QuoteReferenceItemMap[K][];
  let selected: QuoteReferenceItemMap[K] | null = null;
  let count: { total: number | string } | null;

  if (input.kind === "lead") {
    const where = pattern
      ? "where id::text ilike $1 or company_name ilike $1 or coalesce(contact_name, '') ilike $1"
      : "";
    const values = pattern ? [pattern] : [];
    [items, count, selected] = (await Promise.all([
      query<QuoteLeadReference>(
        `select id, company_name, contact_name, status from leads ${where}
         order by company_name asc, id asc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      ),
      queryOne<{ total: number | string }>(`select count(*) as total from leads ${where}`, values),
      input.selectedId
        ? queryOne<QuoteLeadReference>(
            "select id, company_name, contact_name, status from leads where id = $1",
            [input.selectedId],
          )
        : Promise.resolve(null),
    ])) as [
      QuoteReferenceItemMap[K][],
      { total: number | string } | null,
      QuoteReferenceItemMap[K] | null,
    ];
  } else if (input.kind === "client") {
    const where = pattern
      ? "where id::text ilike $1 or company_name ilike $1 or coalesce(industry, '') ilike $1"
      : "";
    const values = pattern ? [pattern] : [];
    [items, count, selected] = (await Promise.all([
      query<QuoteClientReference>(
        `select id, company_name, industry, tier from clients ${where}
         order by company_name asc, id asc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      ),
      queryOne<{ total: number | string }>(
        `select count(*) as total from clients ${where}`,
        values,
      ),
      input.selectedId
        ? queryOne<QuoteClientReference>(
            "select id, company_name, industry, tier from clients where id = $1",
            [input.selectedId],
          )
        : Promise.resolve(null),
    ])) as [
      QuoteReferenceItemMap[K][],
      { total: number | string } | null,
      QuoteReferenceItemMap[K] | null,
    ];
  } else if (input.kind === "product") {
    const where = pattern
      ? "where active = true and (id::text ilike $1 or name ilike $1 or coalesce(description, '') ilike $1)"
      : "where active = true";
    const values = pattern ? [pattern] : [];
    [items, count, selected] = (await Promise.all([
      query<QuoteProductReference>(
        `select id, name, description, category, billing_type from products ${where}
         order by name asc, id asc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      ),
      queryOne<{ total: number | string }>(
        `select count(*) as total from products ${where}`,
        values,
      ),
      input.selectedId
        ? queryOne<QuoteProductReference>(
            "select id, name, description, category, billing_type from products where id = $1 and active = true",
            [input.selectedId],
          )
        : Promise.resolve(null),
    ])) as [
      QuoteReferenceItemMap[K][],
      { total: number | string } | null,
      QuoteReferenceItemMap[K] | null,
    ];
  } else {
    const where = pattern
      ? "where active = true and (id::text ilike $1 or service ilike $1 or coalesce(description, '') ilike $1)"
      : "where active = true";
    const values = pattern ? [pattern] : [];
    [items, count, selected] = (await Promise.all([
      query<QuotePricingReference>(
        `select id, service, description, category, unit_price, currency, product_id
         from pricing_templates ${where}
         order by service asc, id asc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      ),
      queryOne<{ total: number | string }>(
        `select count(*) as total from pricing_templates ${where}`,
        values,
      ),
      input.selectedId
        ? queryOne<QuotePricingReference>(
            `select id, service, description, category, unit_price, currency, product_id
             from pricing_templates where id = $1 and active = true`,
            [input.selectedId],
          )
        : Promise.resolve(null),
    ])) as [
      QuoteReferenceItemMap[K][],
      { total: number | string } | null,
      QuoteReferenceItemMap[K] | null,
    ];
  }

  const merged = await mergeSelectedReference(items, selected, limit);
  const selectedAddsToSearch = selected && !matchesReferenceSearch(selected, search);
  return {
    items: merged,
    total: Number(count?.total ?? 0) + (selectedAddsToSearch ? 1 : 0),
    page,
    limit,
  };
}

export async function listQuoteCreatePricingTemplates(
  limit = 10,
  selectedProductId?: string,
): Promise<QuotePricingReference[]> {
  const boundedLimit = Math.min(10, Math.max(1, Math.trunc(limit)));
  return query<QuotePricingReference>(
    `select id, service, description, category, unit_price, currency, product_id
     from pricing_templates
     where active = true
     order by case when product_id = $1 then 0 else 1 end, service asc, id asc
     limit $2`,
    [selectedProductId ?? null, boundedLimit],
  );
}

export async function getQuoteWorkspaceDetail(id: string) {
  const quote = await queryOne<Quote>(`select ${QUOTE_COLUMNS} from quotes where id = $1`, [id]);
  if (!quote) throw new Error("Quote not found");

  const [client, lead] = await Promise.all([
    quote.client_id
      ? queryOne<QuoteClientSummary>(
          "select id, company_name, industry, tier from clients where id = $1",
          [quote.client_id],
        )
      : Promise.resolve(null),
    quote.lead_id
      ? queryOne<QuoteLeadSummary>(
          "select id, company_name, contact_name, contact_email from leads where id = $1",
          [quote.lead_id],
        )
      : Promise.resolve(null),
  ]);

  return { quote, client, lead };
}

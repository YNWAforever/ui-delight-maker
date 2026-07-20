import type { JsonValue, QuoteVersion, QuoteVersionReason } from "@/lib/types";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";

export type CreateQuoteVersionInput = {
  quote_id: string;
  reason: QuoteVersionReason;
  snapshot: JsonValue;
  pdf_template_id?: string | null;
  pdf_url?: string | null;
  created_by?: string | null;
};

export async function createQuoteVersion(
  input: CreateQuoteVersionInput,
  db?: Queryable,
): Promise<QuoteVersion> {
  const version = await queryOne<QuoteVersion>(
    `
      insert into quote_versions
        (quote_id, version_number, reason, snapshot, pdf_template_id, pdf_url, created_by)
      values
        (
          $1,
          (select coalesce(max(version_number), 0) + 1 from quote_versions where quote_id = $1),
          $2,
          $3::jsonb,
          $4,
          $5,
          $6
        )
      returning *
    `,
    [
      input.quote_id,
      input.reason,
      JSON.stringify(input.snapshot),
      input.pdf_template_id ?? null,
      input.pdf_url ?? null,
      input.created_by ?? null,
    ],
    db,
  );

  if (!version) throw new Error("Failed to create quote version");
  return version;
}

export async function getQuoteVersion(id: string): Promise<QuoteVersion> {
  const version = await queryOne<QuoteVersion>("select * from quote_versions where id = $1", [id]);

  if (!version) throw new Error("Quote version not found");
  return version;
}

export async function listQuoteVersions(quoteId: string): Promise<QuoteVersion[]> {
  return query<QuoteVersion>(
    `
      select *
      from quote_versions
      where quote_id = $1
      order by version_number desc
    `,
    [quoteId],
  );
}

export type QuoteVersionSummary = Omit<QuoteVersion, "snapshot">;

function normalizeQuoteVersionPagination(input: { page?: number; limit?: number } = {}) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const limit = Math.min(25, Math.max(1, Math.trunc(input.limit ?? 25)));
  return { page, limit, offset: (page - 1) * limit };
}

export async function listQuoteVersionSummariesPage(
  quoteId: string,
  input: { page?: number; limit?: number } = {},
) {
  const { page, limit, offset } = normalizeQuoteVersionPagination(input);
  const [items, count] = await Promise.all([
    query<QuoteVersion>(
      `
        select id, quote_id, version_number, reason, pdf_template_id, pdf_url,
               created_by, created_at
        from quote_versions
        where quote_id = $1
        order by version_number desc, id desc
        limit $2 offset $3
      `,
      [quoteId, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      "select count(*) as total from quote_versions where quote_id = $1",
      [quoteId],
    ),
  ]);
  return {
    items: items.map(({ snapshot: _snapshot, ...summary }) => summary),
    total: Number(count?.total ?? 0),
    page,
    limit,
  };
}

export async function getQuoteDocumentVersion(
  quoteId: string,
  versionId?: string | null,
): Promise<QuoteVersion | null> {
  const rows = versionId
    ? await query<QuoteVersion>(
        `
          select id, quote_id, version_number, reason, snapshot, pdf_template_id,
                 pdf_url, created_by, created_at
          from quote_versions
          where quote_id = $1 and id = $2
          order by version_number desc, id desc
          limit $3
        `,
        [quoteId, versionId, 1],
      )
    : await query<QuoteVersion>(
        `
          select id, quote_id, version_number, reason, snapshot, pdf_template_id,
                 pdf_url, created_by, created_at
          from quote_versions
          where quote_id = $1
          order by version_number desc, id desc
          limit $2
        `,
        [quoteId, 1],
      );
  return rows[0] ?? null;
}

import { buildFilters } from "@/server/db/query-builders";
import type { QuoteFilters } from "@/server/repositories/quotes";

/**
 * Whether this actor's CAPABILITY (not any single row's ownership) lets a search term match
 * against each record type's company name — a target-independent, page-level answer, which is
 * the right question for a search predicate. Resolved by the caller, never here: repositories
 * in this codebase do no authorization, which is also what keeps `listQuotesPage` directly
 * callable by ROUTE_LOADER_CONTRACT.
 *
 * This used to also gate whether the joins ran at all and what `linked_company_name` selected —
 * a page-level, all-or-nothing redaction. It no longer does either: the join and the selected
 * name are now unconditional (see `QuoteListQueryParts`), because redaction moved to being a
 * per-row decision made after this query returns, against each row's own linked record, in
 * `src/server-functions/quotes.ts`. A per-row decision cannot be expressed by shaping the SQL a
 * single page-wide way.
 *
 * What SQL-level scoping is still needed, and still lives here: an actor who lacks a capability
 * outright (not "lacks it for this one row" — lacks it for every row of that type) must not be
 * able to use the search box to learn whether a company by a given name exists. Without this,
 * `search: "Acme"` would return a nonzero row/tile count for a lead the actor may never be
 * shown the name of, revealing the lead's existence through a field that is never rendered.
 * Per-row ownership denial does not carry the same oracle risk: a row that a search matches but
 * the actor turns out not to own is still shown to them (redacted), which a plain page browse
 * would have revealed anyway — so only the capability-level, not-a-single-row-visible case is
 * scoped here.
 */
export type QuoteListSearchScope = { leads: boolean; clients: boolean };

export type QuoteListQueryParts = {
  /**
   * Join clauses, appended directly after `from quotes q`. Always both, unconditionally: the
   * linked ids (`q.lead_id`, `q.client_id`) already sit on `quotes` itself, so nothing about
   * whether an actor may see a linked record's name depends on whether the join runs — only on
   * what happens to the selected name afterward, per row.
   */
  joins: string;
  /**
   * The expression selected as `linked_company_name`. Always a real `coalesce(...)` — never
   * `"null::text"` — for the same reason the joins are unconditional: a page-level "nobody gets
   * a name" shape cannot express "this row's reader may not see this row's name."
   */
  companyNameExpression: string;
  /** " where ..." or "". */
  where: string;
  values: unknown[];
};

/** Longest input that can reach the predicate. No number or company name approaches it. */
const MAX_SEARCH_LENGTH = 100;

/**
 * Trim, cap, and escape the LIKE metacharacters.
 *
 * Values are parameterised, so this is not about injection. It is that an unescaped `%`
 * matches every row, which would silently turn the tiles into a workspace-wide total. A
 * blank search must return null rather than degrade into `ilike '%%'` — the same bug.
 */
function normalizeSearch(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const escaped = trimmed.slice(0, MAX_SEARCH_LENGTH).replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/**
 * The joins, the selected name and the predicate, built once.
 *
 * The row query and the aggregate query both consume this. If they built their own, the
 * tiles could report a total over a different set than the rows beneath them.
 */
export function buildQuoteListQuery(input: {
  filters: QuoteFilters;
  search?: string;
  searchScope: QuoteListSearchScope;
}): QuoteListQueryParts {
  const { filters, search, searchScope } = input;

  // Qualified: `leads` also has a `status` column, so an unqualified name is ambiguous the
  // moment the join exists.
  const base = buildFilters([
    ["q.status", filters.status],
    ["q.lead_id", filters.lead_id],
    ["q.client_id", filters.client_id],
    ["q.contact_id", filters.contact_id],
    ["q.account_id", filters.account_id],
    ["q.deal_id", filters.deal_id],
  ]);

  // Unconditional: the ids these joins resolve (`q.lead_id`, `q.client_id`) are already columns
  // on `quotes`, so a reader denied the linked record's *name* never needed the join withheld —
  // only the name itself, decided per row after this query returns. Clients first in the
  // `coalesce`, matching `linkedRecord` in src/routes/quotes.tsx, which treats a client as
  // winning over a lead when a quote carries both.
  const joins = " left join clients c on c.id = q.client_id left join leads l on l.id = q.lead_id";
  const companyNameExpression = "coalesce(c.company_name, l.company_name)";

  // Search stays capability-scoped (see QuoteListSearchScope's doc comment): an actor who may
  // not see a record type AT ALL must not be able to use the search box to learn one exists.
  const searchColumns = ["q.number"];
  if (searchScope.clients) searchColumns.push("c.company_name");
  if (searchScope.leads) searchColumns.push("l.company_name");

  const values = [...base.values];
  let where = base.sql;

  const pattern = normalizeSearch(search);
  if (pattern) {
    const predicate = searchColumns
      .map((column) => `coalesce(${column}, '') ilike $${base.nextIndex}`)
      .join(" or ");
    where += where ? ` and (${predicate})` : ` where (${predicate})`;
    values.push(pattern);
  }

  return { joins, companyNameExpression, where, values };
}

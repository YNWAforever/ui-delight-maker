import { buildFilters } from "@/server/db/query-builders";
import type { QuoteFilters } from "@/server/repositories/quotes";

/**
 * Whether this actor may see each linked record type AT ALL — a target-independent answer,
 * which is the right question for a list. Resolved by the caller, never here: repositories
 * in this codebase do no authorization, which is also what keeps `listQuotesPage` directly
 * callable by ROUTE_LOADER_CONTRACT.
 */
export type QuoteListVisibility = { leads: boolean; clients: boolean };

export type QuoteListQueryParts = {
  /** Join clauses, or "" — appended directly after `from quotes q`. */
  joins: string;
  /** The expression selected as `linked_company_name`. */
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
  visibility: QuoteListVisibility;
}): QuoteListQueryParts {
  const { filters, search, visibility } = input;

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

  const joinParts: string[] = [];
  const nameParts: string[] = [];
  const searchColumns = ["q.number"];

  // Clients first: `linkedRecord` treats a client as winning over a lead.
  if (visibility.clients) {
    joinParts.push(" left join clients c on c.id = q.client_id");
    nameParts.push("c.company_name");
    searchColumns.push("c.company_name");
  }
  if (visibility.leads) {
    joinParts.push(" left join leads l on l.id = q.lead_id");
    nameParts.push("l.company_name");
    searchColumns.push("l.company_name");
  }

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

  return {
    joins: joinParts.join(""),
    companyNameExpression: nameParts.length ? `coalesce(${nameParts.join(", ")})` : "null::text",
    where,
    values,
  };
}

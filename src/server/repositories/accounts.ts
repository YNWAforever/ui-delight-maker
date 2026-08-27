import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { Account } from "@/lib/types";
import { toCompanyWorkspaceSummary } from "@/lib/relationship/company-workspace";
import { listAccountContacts } from "@/server/repositories/account-contacts";
import { getAccountTimeline } from "@/server/repositories/account-timeline";
import { listClients } from "@/server/repositories/clients";
import { listLeads } from "@/server/repositories/leads";
import { listQuotes } from "@/server/repositories/quotes";
import { listTasks } from "@/server/repositories/tasks";
import {
  normalizePagination,
  parseCount,
  type PaginatedResult,
  type PaginationInput,
} from "@/server/repositories/pagination";

export type AccountFilters = {
  owner?: string;
  cs_owner?: string;
  lifecycle_stage?: string;
  query?: string;
};

/**
 * The orderings `/accounts` offers, as `column:direction`.
 *
 * They are keys into a fixed map rather than interpolated column names: nothing a caller
 * sends ever reaches the SQL text, so an unknown key falls back to the default ordering
 * instead of becoming an injection surface or a syntax error.
 *
 * Sorting had to move here because it was being done in the route with `Array.prototype
 * .sort` over the current page, so "Name A-Z" on a multi-page tenant sorted at most 100
 * accounts and presented the result as the whole workspace. Every clause ends with
 * `id desc` for the same reason `listAccountsPage` already did: without a unique tie-break
 * a `limit/offset` page boundary can repeat or skip a row.
 */
export const ACCOUNT_ORDER_BY = {
  "last_activity_at:desc": "coalesce(last_activity_at, created_at) desc, id desc",
  "name:asc": "name asc, id desc",
  "relationship_health:asc": "relationship_health asc, id desc",
  "relationship_health:desc": "relationship_health desc, id desc",
} as const;

export type AccountSortKey = keyof typeof ACCOUNT_ORDER_BY;

export const DEFAULT_ACCOUNT_SORT: AccountSortKey = "last_activity_at:desc";

export function accountOrderBy(sort: string | undefined): string {
  return ACCOUNT_ORDER_BY[sort as AccountSortKey] ?? ACCOUNT_ORDER_BY[DEFAULT_ACCOUNT_SORT];
}

export type AccountPageFilters = AccountFilters &
  PaginationInput & {
    /** One of `ACCOUNT_ORDER_BY`'s keys. Anything else uses the default ordering. */
    sort?: string;
  };

export type CreateAccountInput = Pick<Account, "name"> &
  Partial<
    Pick<
      Account,
      | "website"
      | "domain"
      | "industry"
      | "region"
      | "tier"
      | "lifecycle_stage"
      | "account_owner"
      | "cs_owner"
      | "source"
      | "tags"
      | "notes"
    >
  >;

const accountUpdateColumns: Array<keyof Partial<Account> & string> = [
  "name",
  "website",
  "domain",
  "industry",
  "region",
  "tier",
  "lifecycle_stage",
  "account_owner",
  "cs_owner",
  "source",
  "tags",
  "notes",
  "relationship_health",
  "last_activity_at",
  "next_action",
];

export async function listAccounts(filters: AccountFilters = {}) {
  const where = buildFilters([
    ["account_owner", filters.owner],
    ["cs_owner", filters.cs_owner],
    ["lifecycle_stage", filters.lifecycle_stage],
  ]);
  const values = [...where.values];
  let querySearch = "";

  if (filters.query?.trim()) {
    values.push(`%${filters.query.trim()}%`);
    querySearch = `${where.sql ? " and" : " where"} name ilike $${values.length}`;
  }

  return query<Account>(
    `
      select *
      from accounts
      ${where.sql}${querySearch}
      order by coalesce(last_activity_at, created_at) desc
      limit 200
    `,
    values,
  );
}

export async function listAccountsPage(
  filters: AccountPageFilters = {},
): Promise<PaginatedResult<Account>> {
  const where = buildFilters([
    ["account_owner", filters.owner],
    ["cs_owner", filters.cs_owner],
    ["lifecycle_stage", filters.lifecycle_stage],
  ]);
  const filterValues = [...where.values];
  let querySearch = "";

  if (filters.query?.trim()) {
    filterValues.push(`%${filters.query.trim()}%`);
    querySearch = `${where.sql ? " and" : " where"} name ilike $${filterValues.length}`;
  }

  const { page, limit, offset } = normalizePagination(filters);
  const [items, count] = await Promise.all([
    query<Account>(
      `
        select *
        from accounts
        ${where.sql}${querySearch}
        order by ${accountOrderBy(filters.sort)}
        limit $${filterValues.length + 1} offset $${filterValues.length + 2}
      `,
      [...filterValues, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      `
        select count(*) as total
        from accounts
        ${where.sql}${querySearch}
      `,
      filterValues,
    ),
  ]);

  return { items, total: parseCount(count), page, limit };
}
export async function getAccount(id: string, db?: Queryable) {
  const account = await queryOne<Account>("select * from accounts where id = $1", [id], db);
  if (!account) throw new Error("Account not found");
  return account;
}

export async function getAccountWorkspaceData(id: string) {
  const account = await getAccount(id);
  const [contacts, clients, leads, quotes, tasks, timeline] = await Promise.all([
    listAccountContacts(id),
    listClients({ account_id: id }),
    listLeads({ account_id: id }),
    listQuotes({ account_id: id }),
    listTasks({ account_id: id }),
    getAccountTimeline({ accountId: id }),
  ]);
  const summary = toCompanyWorkspaceSummary({ account, contacts, clients, leads, quotes, tasks });

  return { account, summary, contacts, clients, leads, quotes, tasks, timeline };
}

export async function createAccount(input: CreateAccountInput, db?: Queryable) {
  const account = await queryOne<Account>(
    `
      insert into accounts
        (name, website, domain, industry, region, tier, lifecycle_stage, account_owner, cs_owner, source, tags, notes)
      values
        ($1, $2, $3, $4, $5, $6, coalesce($7, 'prospect'), $8, $9, $10, coalesce($11, '{}'::text[]), $12)
      returning *
    `,
    [
      input.name,
      input.website ?? null,
      input.domain ?? null,
      input.industry ?? null,
      input.region ?? null,
      input.tier ?? null,
      input.lifecycle_stage ?? null,
      input.account_owner ?? null,
      input.cs_owner ?? null,
      input.source ?? null,
      input.tags ?? null,
      input.notes ?? null,
    ],
    db,
  );

  if (!account) throw new Error("Failed to create account");
  return account;
}

export async function updateAccount(id: string, updates: Partial<Account>, db?: Queryable) {
  const update = buildUpdate(updates, accountUpdateColumns, 1);
  const account = await queryOne<Account>(
    `
      update accounts
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
    db,
  );

  if (!account) throw new Error("Account not found");
  return account;
}

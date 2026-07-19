import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { Client, RenewalRisk } from "@/lib/types";
import {
  normalizePagination,
  parseCount,
  type PaginatedResult,
  type PaginationInput,
} from "@/server/repositories/pagination";

export type ClientFilters = { tier?: string; health_min?: number; account_id?: string };
export type ClientPageFilters = ClientFilters & PaginationInput;

type CreateClientInput = Pick<Client, "company_name"> &
  Partial<
    Pick<
      Client,
      | "industry"
      | "tier"
      | "account_owner"
      | "health_score"
      | "renewal_date"
      | "arr"
      | "account_id"
      | "primary_contact_id"
    >
  >;

const clientUpdateColumns: Array<keyof Partial<Client> & string> = [
  "company_name",
  "industry",
  "tier",
  "onboarding_status",
  "account_id",
  "primary_contact_id",
];

const ROLLUP_SELECT = `
  select
    c.*,
    coalesce(r.arr, 0) as rollup_arr,
    coalesce(r.health_score, 50) as rollup_health_score,
    r.renewal_date as rollup_renewal_date,
    coalesce(r.renewal_risk, 'low') as rollup_renewal_risk
  from clients c
  left join (
    select
      e.client_id,
      sum(
        case e.billing_period
          when 'monthly' then coalesce(e.value, 0) * 12
          when 'quarterly' then coalesce(e.value, 0) * 4
          when 'annual' then coalesce(e.value, 0)
          else 0
        end
      ) as arr,
      min(e.health_score) as health_score,
      min(e.renewal_date) as renewal_date,
      case
        when bool_or(e.renewal_risk = 'high') then 'high'
        when bool_or(e.renewal_risk = 'medium') then 'medium'
        else 'low'
      end as renewal_risk
    from engagements e
    where e.status = 'active'
    group by e.client_id
  ) r on r.client_id = c.id
`;

type ClientRollupRow = Client & {
  rollup_arr: string;
  rollup_health_score: number;
  rollup_renewal_date: string | null;
  rollup_renewal_risk: RenewalRisk;
};

function mapRollupRow(row: ClientRollupRow): Client & { renewal_risk: RenewalRisk } {
  return {
    ...row,
    arr: Number(row.rollup_arr),
    health_score: row.rollup_health_score,
    renewal_date: row.rollup_renewal_date,
    renewal_risk: row.rollup_renewal_risk,
  };
}

export async function listClients(filters: ClientFilters = {}) {
  const where = buildFilters([
    ["c.tier", filters.tier],
    ["c.account_id", filters.account_id],
  ]);

  const rows = await query<ClientRollupRow>(
    `
      ${ROLLUP_SELECT}
      ${where.sql}
      order by c.company_name
    `,
    where.values,
  );

  const mapped = rows.map(mapRollupRow);
  return filters.health_min !== undefined
    ? mapped.filter((c) => c.health_score >= filters.health_min!)
    : mapped;
}

export async function listClientsPage(
  filters: ClientPageFilters = {},
): Promise<PaginatedResult<Client & { renewal_risk: RenewalRisk }>> {
  const where = buildFilters([
    ["c.tier", filters.tier],
    ["c.account_id", filters.account_id],
  ]);
  const filterValues = [...where.values];
  let healthFilter = "";

  if (filters.health_min !== undefined) {
    filterValues.push(filters.health_min);
    healthFilter = `${where.sql ? " and" : " where"} coalesce(r.health_score, 50) >= $${filterValues.length}`;
  }

  const { page, limit, offset } = normalizePagination(filters);
  const scopedRollup = `${ROLLUP_SELECT} ${where.sql}${healthFilter}`;
  const [rows, count] = await Promise.all([
    query<ClientRollupRow>(
      `
        ${scopedRollup}
        order by c.company_name
        limit $${filterValues.length + 1} offset $${filterValues.length + 2}
      `,
      [...filterValues, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      `select count(*) as total from (${scopedRollup}) scoped_clients`,
      filterValues,
    ),
  ]);

  return {
    items: rows.map(mapRollupRow),
    total: parseCount(count),
    page,
    limit,
  };
}

export async function getClient(id: string) {
  const row = await queryOne<ClientRollupRow>(`${ROLLUP_SELECT} where c.id = $1`, [id]);
  if (!row) throw new Error("Client not found");
  return mapRollupRow(row);
}

export async function createClient(input: CreateClientInput, db?: Queryable) {
  const client = await queryOne<Client>(
    `
      insert into clients
        (company_name, industry, tier, account_owner, health_score, renewal_date, arr, account_id, primary_contact_id)
      values
        ($1, $2, $3, $4, coalesce($5, 50), $6, $7, $8, $9)
      returning *
    `,
    [
      input.company_name,
      input.industry ?? null,
      input.tier ?? null,
      input.account_owner ?? null,
      input.health_score ?? null,
      input.renewal_date ?? null,
      input.arr ?? null,
      input.account_id ?? null,
      input.primary_contact_id ?? null,
    ],
    db,
  );

  if (!client) throw new Error("Failed to create client");
  return client;
}

export async function updateClient(id: string, updates: Partial<Client>) {
  const update = buildUpdate(updates, clientUpdateColumns, 1);
  const client = await queryOne<Client>(
    `
      update clients
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
  );

  if (!client) throw new Error("Client not found");
  return client;
}

import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { Client } from "@/lib/types";

type ClientFilters = { tier?: string; health_min?: number; account_id?: string };

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
  "health_score",
  "onboarding_status",
  "renewal_date",
  "arr",
  "account_id",
  "primary_contact_id",
];

export async function listClients(filters: ClientFilters = {}) {
  const where = buildFilters([
    ["tier", filters.tier],
    ["account_id", filters.account_id],
  ]);
  const havingHealth =
    filters.health_min !== undefined ? [...where.values, filters.health_min] : where.values;

  return query<Client>(
    `
      select *
      from clients
      ${where.sql}
      ${
        filters.health_min !== undefined
          ? (where.sql ? "and" : "where") + ` health_score >= $${where.values.length + 1}`
          : ""
      }
      order by company_name
    `,
    havingHealth,
  );
}

export async function getClient(id: string) {
  const client = await queryOne<Client>("select * from clients where id = $1", [id]);
  if (!client) throw new Error("Client not found");
  return client;
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

// src/server/repositories/engagements.ts
import { buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import type { Engagement, RenewalRisk } from "@/lib/types";

type CreateEngagementInput = Pick<Engagement, "client_id" | "product_id" | "billing_period"> &
  Partial<
    Pick<Engagement, "owner" | "value" | "start_date" | "renewal_date" | "lead_id" | "quote_id">
  >;

const engagementScoreColumns: Array<
  keyof Pick<Engagement, "health_score" | "renewal_risk" | "risk_reasoning" | "next_action">
> = ["health_score", "renewal_risk", "risk_reasoning", "next_action"];

export async function listEngagementsByClient(clientId: string) {
  return query<Engagement>(
    "select * from engagements where client_id = $1 order by start_date desc",
    [clientId],
  );
}

export async function listEngagementsByClientIds(clientIds: string[]) {
  if (clientIds.length === 0) return [];
  return query<Engagement>(
    `
      select *
      from engagements
      where client_id = any($1::uuid[])
      order by array_position($1::uuid[], client_id), start_date desc
    `,
    [clientIds],
  );
}

export async function getEngagement(id: string, db?: Queryable) {
  const engagement = await queryOne<Engagement>(
    "select * from engagements where id = $1",
    [id],
    db,
  );
  if (!engagement) throw new Error("Engagement not found");
  return engagement;
}

export type RenewalsFilters = {
  owner?: string;
  product_id?: string;
  risk?: RenewalRisk;
  tier?: string;
};

export async function listEngagementsForRenewals(filters: RenewalsFilters = {}) {
  const values: unknown[] = [];
  const clauses: string[] = ["e.status = 'active'"];

  if (filters.owner) {
    values.push(filters.owner);
    clauses.push(`e.owner = $${values.length}`);
  }
  if (filters.product_id) {
    values.push(filters.product_id);
    clauses.push(`e.product_id = $${values.length}`);
  }
  if (filters.risk) {
    values.push(filters.risk);
    clauses.push(`e.renewal_risk = $${values.length}`);
  }
  if (filters.tier) {
    values.push(filters.tier);
    clauses.push(`c.tier = $${values.length}`);
  }

  return query<
    Engagement & { client_company_name: string; client_tier: string | null; product_name: string }
  >(
    `
      select e.*, c.company_name as client_company_name, c.tier as client_tier, p.name as product_name
      from engagements e
      join clients c on c.id = e.client_id
      join products p on p.id = e.product_id
      where ${clauses.join(" and ")}
      order by e.renewal_date asc nulls last
    `,
    values,
  );
}

export async function createEngagement(input: CreateEngagementInput, db?: Queryable) {
  const engagement = await queryOne<Engagement>(
    `
      insert into engagements
        (client_id, product_id, owner, value, billing_period, start_date, renewal_date, lead_id, quote_id)
      values
        ($1, $2, $3, $4, $5, coalesce($6, current_date), $7, $8, $9)
      returning *
    `,
    [
      input.client_id,
      input.product_id,
      input.owner ?? null,
      input.value ?? null,
      input.billing_period,
      input.start_date ?? null,
      input.renewal_date ?? null,
      input.lead_id ?? null,
      input.quote_id ?? null,
    ],
    db,
  );

  if (!engagement) throw new Error("Failed to create engagement");
  return engagement;
}

export async function applyEngagementScore(
  id: string,
  updates: Pick<
    Partial<Engagement>,
    "health_score" | "renewal_risk" | "risk_reasoning" | "next_action"
  >,
  db?: Queryable,
) {
  const update = buildUpdate(updates, engagementScoreColumns, 1);
  const engagement = await queryOne<Engagement>(
    `
      update engagements
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
    db,
  );

  if (!engagement) throw new Error("Engagement not found");
  return engagement;
}

export async function markEngagementRenewed(input: {
  id: string;
  actorId: string;
  reason?: string;
}) {
  return transaction(async (client) => {
    const productResult = await client.query<{ default_term_months: number | null }>(
      `
        select p.default_term_months
        from engagements e
        join products p on p.id = e.product_id
        where e.id = $1
      `,
      [input.id],
    );
    const termMonths = productResult.rows[0]?.default_term_months ?? 12;

    const engagementResult = await client.query<Engagement>(
      `
        update engagements
        set renewal_date = greatest(coalesce(renewal_date, current_date), current_date) + ($1 || ' months')::interval,
            status = 'active'
        where id = $2
        returning *
      `,
      [termMonths, input.id],
    );
    const engagement = engagementResult.rows[0];
    if (!engagement) throw new Error("Engagement not found");

    await client.query(
      `
        insert into activity_logs
          (actor_type, actor_id, action, object_type, object_id, diff_data)
        values ('user', $1, 'renewed engagement', 'engagement', $2, $3::jsonb)
      `,
      [
        input.actorId,
        input.id,
        JSON.stringify({ reason: input.reason ?? null, new_renewal_date: engagement.renewal_date }),
      ],
    );

    return engagement;
  });
}

export async function markEngagementEnded(input: { id: string; actorId: string; reason: string }) {
  return transaction(async (client) => {
    const engagementResult = await client.query<Engagement>(
      "update engagements set status = 'ended', end_reason = $1 where id = $2 returning *",
      [input.reason, input.id],
    );
    const engagement = engagementResult.rows[0];
    if (!engagement) throw new Error("Engagement not found");

    await client.query(
      `
        insert into activity_logs
          (actor_type, actor_id, action, object_type, object_id, diff_data)
        values ('user', $1, 'ended engagement', 'engagement', $2, $3::jsonb)
      `,
      [input.actorId, input.id, JSON.stringify({ reason: input.reason })],
    );

    return engagement;
  });
}

export async function touchEngagement(id: string, occurredAt: string, db?: Queryable) {
  await query(
    "update engagements set last_touch_at = greatest(coalesce(last_touch_at, $2), $2) where id = $1",
    [id, occurredAt],
    db,
  );
}

export async function touchAllActiveEngagementsForClient(
  clientId: string,
  occurredAt: string,
  db?: Queryable,
) {
  await query(
    "update engagements set last_touch_at = greatest(coalesce(last_touch_at, $2), $2) where client_id = $1 and status = 'active'",
    [clientId, occurredAt],
    db,
  );
}

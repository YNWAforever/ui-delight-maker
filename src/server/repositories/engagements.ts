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
export type RenewalWindowFilter = "all" | "overdue" | "30" | "60" | "90" | "later";

export type RenewalsReadFilters = {
  renewalWindow: RenewalWindowFilter;
  risk?: RenewalRisk;
  productId?: string;
  asOf: string;
  page?: number;
  limit?: number;
};

export type RenewalReadRow = Pick<
  Engagement,
  | "id"
  | "client_id"
  | "product_id"
  | "owner"
  | "value"
  | "billing_period"
  | "start_date"
  | "renewal_date"
  | "status"
  | "health_score"
  | "renewal_risk"
  | "risk_reasoning"
  | "next_action"
  | "last_touch_at"
> & {
  client_company_name: string;
  client_tier: string | null;
  product_name: string;
};

export type ActiveProductSummary = { id: string; name: string; category: string | null };

function renewalWindowClause(window: RenewalWindowFilter, asOf: string) {
  switch (window) {
    case "all":
      return null;
    case "overdue":
      return `e.renewal_date < ${asOf}`;
    case "30":
      return `e.renewal_date between ${asOf} and (${asOf} + interval '30 days')`;
    case "60":
      return `e.renewal_date between (${asOf} + interval '31 days') and (${asOf} + interval '60 days')`;
    case "90":
      return `e.renewal_date between (${asOf} + interval '61 days') and (${asOf} + interval '90 days')`;
    case "later":
      return `(e.renewal_date is null or e.renewal_date > (${asOf} + interval '90 days'))`;
  }
}

function metric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listRenewalsRead(filters: RenewalsReadFilters) {
  const page = Math.max(1, Math.trunc(Number.isFinite(filters.page) ? filters.page! : 1));
  const requestedLimit = Math.max(
    1,
    Math.trunc(Number.isFinite(filters.limit) ? filters.limit! : 25),
  );
  const limit = Math.min(requestedLimit, 50);
  const offset = (page - 1) * limit;
  const values: unknown[] = [filters.asOf];
  const clauses = ["e.status = 'active'"];
  const windowClause = renewalWindowClause(filters.renewalWindow, "$1::date");
  // $1 (asOf) is bound for both queries below, but with the renewal window unfiltered
  // nothing in the items query referenced it, and Postgres cannot infer the type of a
  // bound parameter no query uses -- it failed with "could not determine data type of
  // parameter $1", which is what broke /renewals. Keep $1 referenced without changing
  // which rows match: `is not distinct from` holds even when the value is null.
  clauses.push(windowClause ?? "$1::date is not distinct from $1::date");
  if (filters.risk) {
    values.push(filters.risk);
    clauses.push(`e.renewal_risk = $${values.length}`);
  }
  // Hardening only: parseRenewalsInput already maps the "all" sentinel to undefined on
  // the route path, and RenewalRisk cannot be "all" at all. productId is a plain string
  // though, so a direct caller of this exported function could still pass the sentinel
  // into e.product_id, which is uuid -- Postgres rejects that outright.
  if (filters.productId && filters.productId !== "all") {
    values.push(filters.productId);
    clauses.push(`e.product_id = $${values.length}`);
  }
  const where = clauses.join(" and ");
  const limitIndex = values.length + 1;
  const offsetIndex = limitIndex + 1;

  const [items, aggregate, products] = await Promise.all([
    query<RenewalReadRow>(
      `
        select e.id, e.client_id, e.product_id, e.owner, e.value, e.billing_period,
               e.start_date, e.renewal_date, e.status, e.health_score, e.renewal_risk,
               e.risk_reasoning, e.next_action, e.last_touch_at,
               c.company_name as client_company_name, c.tier as client_tier,
               p.name as product_name
        from engagements e
        join clients c on c.id = e.client_id
        join products p on p.id = e.product_id
        where ${where}
        order by e.renewal_date asc nulls last, e.id asc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...values, limit, offset],
    ),
    queryOne<{
      total: number | string;
      annualized_value: number | string;
      arr_at_risk: number | string;
      due_soon: number | string;
      stale: number | string;
    }>(
      `
        select count(*) as total,
          coalesce(sum(case e.billing_period when 'monthly' then coalesce(e.value, 0) * 12 when 'quarterly' then coalesce(e.value, 0) * 4 when 'annual' then coalesce(e.value, 0) else 0 end), 0) as annualized_value,
          coalesce(sum(case when e.renewal_risk = 'high' then case e.billing_period when 'monthly' then coalesce(e.value, 0) * 12 when 'quarterly' then coalesce(e.value, 0) * 4 when 'annual' then coalesce(e.value, 0) else 0 end else 0 end), 0) as arr_at_risk,
          count(*) filter (where e.renewal_date <= $1::date + interval '90 days') as due_soon,
          count(*) filter (where e.last_touch_at is null or e.last_touch_at < $1::date - interval '30 days') as stale
        from engagements e
        where ${where}
      `,
      values,
    ),
    query<ActiveProductSummary>(
      `select p.id, p.name, p.category from products p where p.active = true order by p.name asc, p.id asc limit 200`,
    ),
  ]);

  return {
    items,
    total: metric(aggregate?.total),
    page,
    limit,
    metrics: {
      annualizedValue: metric(aggregate?.annualized_value),
      arrAtRisk: metric(aggregate?.arr_at_risk),
      dueSoon: metric(aggregate?.due_soon),
      stale: metric(aggregate?.stale),
    },
    products,
  };
}

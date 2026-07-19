import { query, queryOne } from "@/server/db/neon.server";

export type CompanyWorkspaceOverviewMetrics = {
  linked_client_count: number;
  active_engagement_count: number;
  quote_count: number;
  open_signal_count: number;
};

export type CompanyWorkspaceQuoteTotalRow = {
  currency: string;
  quote_count: number;
  total_value: number;
};

export async function getCompanyWorkspaceOverviewMetrics(accountId: string) {
  const metrics = await queryOne<CompanyWorkspaceOverviewMetrics>(
    `
      select
        (select count(*)::int from clients where account_id = $1) as linked_client_count,
        (
          select count(*)::int
          from engagements e
          join clients c on c.id = e.client_id
          where c.account_id = $1 and e.status = 'active'
        ) as active_engagement_count,
        (select count(*)::int from quotes where account_id = $1) as quote_count,
        (
          select count(*)::int
          from relationship_signals
          where account_id = $1 and dismissed_at is null
        ) as open_signal_count
    `,
    [accountId],
  );

  if (!metrics) throw new Error("Failed to load Company Workspace overview");
  return metrics;
}

export async function listCompanyWorkspaceQuoteTotals(accountId: string) {
  return query<CompanyWorkspaceQuoteTotalRow>(
    `
      select currency, count(*)::int as quote_count, coalesce(sum(total_value), 0)::float8 as total_value
      from quotes
      where account_id = $1
      group by currency
      order by currency
    `,
    [accountId],
  );
}

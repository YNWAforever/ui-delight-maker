import { queryOne } from "@/server/db/neon.server";

export type CompanyWorkspaceOverviewMetrics = {
  linked_client_count: number;
  active_engagement_count: number;
  quote_count: number;
  quote_total_value: number;
  quote_currency: string;
  open_signal_count: number;
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
          select coalesce(sum(total_value), 0)::float8
          from quotes
          where account_id = $1
        ) as quote_total_value,
        coalesce(
          (
            select currency
            from quotes
            where account_id = $1
            order by created_at desc
            limit 1
          ),
          'HKD'
        ) as quote_currency,
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

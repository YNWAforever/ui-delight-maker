import { buildAccountTimeline } from "@/lib/relationship/timeline";
import type { AccountTimelineInput, AccountTimelineKind } from "@/lib/relationship/types";
import type {
  ActivityLog,
  AgentRun,
  Engagement,
  HumanApproval,
  Lead,
  Quote,
  Task,
  TouchpointRecord,
} from "@/lib/types";
import { query } from "@/server/db/neon.server";

export async function getAccountTimelineData(accountId: string): Promise<AccountTimelineInput> {
  const [
    touchpoints,
    activityLogs,
    tasks,
    quotes,
    approvals,
    agentRuns,
    campaignMembers,
    leads,
    engagements,
  ] = await Promise.all([
    query<TouchpointRecord>(
      `
          select t.*
          from touchpoints t
          left join clients c on c.id = t.client_id
          where c.account_id = $1
          order by t.occurred_at desc
          limit 100
        `,
      [accountId],
    ),
    query<ActivityLog>(
      `
          select *
          from activity_logs
          where object_id = $1 or (diff_data->>'account_id') = $1
          order by created_at desc
          limit 100
        `,
      [accountId],
    ),
    query<Task>("select * from tasks where account_id = $1 order by created_at desc limit 100", [
      accountId,
    ]),
    query<Quote>("select * from quotes where account_id = $1 order by created_at desc limit 100", [
      accountId,
    ]),
    query<HumanApproval>(
      `
          select *
          from human_approvals
          where context_data->>'account_id' = $1
          order by created_at desc
          limit 100
        `,
      [accountId],
    ),
    query<AgentRun>(
      `
          select *
          from agent_runs
          where subject_type = 'account' and subject_id = $1
          order by created_at desc
          limit 100
        `,
      [accountId],
    ),
    query<AccountTimelineInput["campaignMembers"][number]>(
      `
          select *
          from campaign_members
          where account_id = $1
          order by created_at desc
          limit 100
        `,
      [accountId],
    ),
    query<Pick<Lead, "id" | "company_name" | "contact_name" | "status" | "source" | "created_at">>(
      `
          select id, company_name, contact_name, status, source, created_at
          from leads
          where account_id = $1
          order by created_at desc
          limit 100
        `,
      [accountId],
    ),
    query<
      Pick<
        Engagement,
        | "id"
        | "product_id"
        | "status"
        | "renewal_date"
        | "renewal_risk"
        | "next_action"
        | "created_at"
        | "updated_at"
      >
    >(
      `
          select e.id, e.product_id, e.status, e.renewal_date, e.renewal_risk,
                 e.next_action, e.created_at, e.updated_at
          from engagements e
          join clients c on c.id = e.client_id
          where c.account_id = $1
          order by e.updated_at desc
          limit 100
        `,
      [accountId],
    ),
  ]);

  return {
    touchpoints,
    activityLogs,
    tasks,
    quotes,
    approvals,
    agentRuns,
    campaignMembers,
    leads,
    engagements,
  };
}

export async function getAccountTimeline(input: {
  accountId: string;
  kinds?: AccountTimelineKind[];
}) {
  return buildAccountTimeline({
    ...(await getAccountTimelineData(input.accountId)),
    kinds: input.kinds,
  });
}

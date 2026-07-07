import { buildAccountTimeline } from "@/lib/relationship/timeline";
import type { AccountTimelineInput, AccountTimelineKind } from "@/lib/relationship/types";
import type { ActivityLog, AgentRun, HumanApproval, Quote, Task, TouchpointRecord } from "@/lib/types";
import { query } from "@/server/db/neon.server";

export async function getAccountTimelineData(accountId: string): Promise<AccountTimelineInput> {
  const [touchpoints, activityLogs, tasks, quotes, approvals, agentRuns, campaignMembers] =
    await Promise.all([
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
      query<Task>(
        "select * from tasks where account_id = $1 order by created_at desc limit 100",
        [accountId],
      ),
      query<Quote>(
        "select * from quotes where account_id = $1 order by created_at desc limit 100",
        [accountId],
      ),
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
    ]);

  return {
    touchpoints,
    activityLogs,
    tasks,
    quotes,
    approvals,
    agentRuns,
    campaignMembers,
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

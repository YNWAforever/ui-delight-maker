import { query, queryOne } from "@/server/db/neon.server";
import { listRenewalsRead, type RenewalsReadFilters } from "@/server/repositories/engagements";

export type ReportRange = "7d" | "30d" | "90d";
export type ReportId =
  | "revenue"
  | "pipeline"
  | "conversion"
  | "agents"
  | "tasks"
  | "human_review_workload";

export type ReportDefinition = {
  id: ReportId;
  title: string;
  description: string;
};

const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  { id: "revenue", title: "Revenue trend", description: "Accepted quote value by week." },
  { id: "pipeline", title: "Pipeline funnel", description: "Lead volume by stage." },
  { id: "conversion", title: "Lead conversion", description: "Created and won leads by week." },
  { id: "agents", title: "Agent performance", description: "Runs and successful outcomes." },
  { id: "tasks", title: "Task throughput", description: "Created and completed tasks by day." },
  {
    id: "human_review_workload",
    title: "Review workload",
    description: "Pending and decided approvals, and how long decisions take, by reviewer.",
  },
];

const RANGE_DAYS: Record<ReportRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

type ReportSummaryRow = {
  revenue: number | string | null;
  pipeline_value: number | string | null;
  leads: number | string | null;
  won_leads: number | string | null;
  agent_runs: number | string | null;
  successful_agent_runs: number | string | null;
  open_tasks: number | string | null;
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadRenewalsRead(input: RenewalsReadFilters) {
  const read = await listRenewalsRead(input);
  return {
    rows: read.items,
    total: read.total,
    page: read.page,
    limit: read.limit,
    metrics: read.metrics,
    products: read.products,
    asOf: input.asOf,
  };
}

export async function loadReportSummary(input: { range: ReportRange }) {
  const days = RANGE_DAYS[input.range];
  const row = await queryOne<ReportSummaryRow>(
    `
      select
        (
          select coalesce(sum(total_value), 0)
          from quotes
          where status = 'accepted'
            and updated_at >= now() - ($1::integer * interval '1 day')
        ) as revenue,
        (
          select coalesce(sum(total_value), 0)
          from quotes
          where status in ('pending_approval', 'approved', 'sent', 'viewed')
            and updated_at >= now() - ($1::integer * interval '1 day')
        ) as pipeline_value,
        (
          select count(*)
          from leads
          where created_at >= now() - ($1::integer * interval '1 day')
        ) as leads,
        (
          select count(*)
          from leads
          where status = 'won'
            and created_at >= now() - ($1::integer * interval '1 day')
        ) as won_leads,
        (
          select count(*)
          from agent_runs
          where created_at >= now() - ($1::integer * interval '1 day')
        ) as agent_runs,
        (
          select count(*)
          from agent_runs
          where status = 'completed'
            and created_at >= now() - ($1::integer * interval '1 day')
        ) as successful_agent_runs,
        (
          select count(*)
          from tasks
          where status <> 'done'
            and created_at >= now() - ($1::integer * interval '1 day')
        ) as open_tasks
    `,
    [days],
  );

  const leads = numeric(row?.leads);
  const wonLeads = numeric(row?.won_leads);
  return {
    range: input.range,
    metrics: {
      revenue: numeric(row?.revenue),
      pipelineValue: numeric(row?.pipeline_value),
      leads,
      wonLeads,
      conversionRate: leads === 0 ? 0 : Math.round((wonLeads / leads) * 1000) / 10,
      agentRuns: numeric(row?.agent_runs),
      successfulAgentRuns: numeric(row?.successful_agent_runs),
      openTasks: numeric(row?.open_tasks),
    },
    reports: REPORT_DEFINITIONS.map((definition) => ({ ...definition })),
  };
}

export const reportQueries: Record<ReportId, string> = {
  revenue: `
    select
      date_trunc('week', updated_at)::date::text as week,
      coalesce(sum(total_value), 0)::float8 as revenue
    from quotes
    where status = 'accepted'
      and updated_at >= now() - ($1::integer * interval '1 day')
    group by date_trunc('week', updated_at)
    order by date_trunc('week', updated_at) asc
  `,
  pipeline: `
    select status as stage, count(*)::integer as count
    from leads
    where created_at >= now() - ($1::integer * interval '1 day')
    group by status
    order by status asc
  `,
  conversion: `
    select
      date_trunc('week', created_at)::date::text as week,
      count(*)::integer as leads,
      count(*) filter (where status = 'won')::integer as won
    from leads
    where created_at >= now() - ($1::integer * interval '1 day')
    group by date_trunc('week', created_at)
    order by date_trunc('week', created_at) asc
  `,
  agents: `
    select
      agent_name as name,
      count(*)::integer as runs,
      count(*) filter (where status = 'completed')::integer as successful_runs,
      round(
        100.0 * count(*) filter (where status = 'completed') / nullif(count(*), 0),
        1
      )::float8 as success
    from agent_runs
    where created_at >= now() - ($1::integer * interval '1 day')
    group by agent_name
    order by runs desc, agent_name asc
  `,
  tasks: `
    select
      created_at::date::text as day,
      count(*)::integer as created,
      count(*) filter (where status = 'done')::integer as completed
    from tasks
    where created_at >= now() - ($1::integer * interval '1 day')
    group by created_at::date
    order by created_at::date asc
  `,
  // Pending is deliberately NOT windowed by $1 while decided is. A backlog is a now fact: if
  // the pending count moved when a reader switched 7d/30d/90d, a 30-day-old untouched
  // approval would vanish from the 7-day view - the one row this report most needs to show.
  // The field headers ("Pending now" vs "Decided in range") are where that is stated.
  //
  // The median is over decided rows only, via a case in the order by rather than a filter:
  // percentile_cont ignores nulls, so a row outside the window contributes nothing. Counting a
  // pending row as zero would make a stuck queue read as instant; counting now() - created_at
  // would mix "decided in two hours" with "has waited nine days" in one number.
  //
  // Minutes, not hours: formatCount uses maximumFractionDigits: 0, so a 24-minute median in
  // hours would render as "0".
  human_review_workload: `
    select
      coalesce(p.name, 'Unassigned') as reviewer,
      count(*) filter (where a.status = 'pending')::integer as pending,
      count(*) filter (
        where a.decided_at >= now() - ($1::integer * interval '1 day')
      )::integer as decided,
      round(
        percentile_cont(0.5) within group (
          order by case
            when a.decided_at >= now() - ($1::integer * interval '1 day')
            then extract(epoch from (a.decided_at - a.created_at)) / 60.0
          end
        )
      )::integer as median_minutes,
      max(
        extract(day from (now() - a.created_at))
      ) filter (where a.status = 'pending')::integer as oldest_pending_days
    from human_approvals a
    left join profiles p on p.id = a.assigned_to
    where a.status = 'pending'
       or a.decided_at >= now() - ($1::integer * interval '1 day')
    group by coalesce(p.name, 'Unassigned')
    order by pending desc, decided desc, reviewer asc
  `,
};

export async function loadReportDataset(input: { report: ReportId; range: ReportRange }) {
  const data = await query<Record<string, string | number | null>>(reportQueries[input.report], [
    RANGE_DAYS[input.range],
  ]);
  return { report: input.report, range: input.range, data };
}

import type { AssertEveryReportId, ReportId } from "@/lib/reports";
import { query, queryOne } from "@/server/db/neon.server";
import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import {
  buildSubjectVisibility,
  buildVisibilityScope,
  hasPotentialVisibility,
  type VisibleResourceType,
} from "@/server/auth/visibility-scope.server";
import { listRenewalsRead, type RenewalsReadFilters } from "@/server/repositories/engagements";

export type ReportRange = "7d" | "30d" | "90d";

/**
 * Re-exported, not redeclared.
 *
 * This module used to own a second, hand-maintained copy of the `ReportId` union that had to
 * stay letter-identical to the one in `src/lib/reports.ts`. Two unions meant a seventh report
 * added to one of them left every `Record<ReportId, …>` keyed on the *other* one still
 * complete and still green, so the compiler-forced structures on this side were only ever
 * checking against a copy the change had not touched. The import is type-only, so it costs
 * nothing at runtime and cannot pull client code into the server bundle.
 */
export type { ReportId };

export type ReportDefinition = {
  id: ReportId;
  title: string;
  description: string;
};

/**
 * The report tab bar, in tab order.
 *
 * An array rather than a `Record<ReportId, …>` because the order *is* the tab order —
 * `src/routes/reports.tsx` renders `summary.reports.map(...)` straight into `TabsList` with
 * no re-sort. A `Record` has no order, so switching to one would mean keeping a second,
 * separately maintained list of ids just to sort by, which is exactly as forgeable as the
 * array it replaced.
 *
 * `satisfies` rather than a `readonly ReportDefinition[]` annotation. An annotation widens
 * each `id` back to `ReportId`, which would make the assertion below compare `ReportId` with
 * itself and pass no matter which reports were listed. `satisfies` keeps the literal ids
 * visible to `(typeof REPORT_DEFINITIONS)[number]["id"]` while still rejecting an entry that
 * is not a well-formed `ReportDefinition`.
 */
export const REPORT_DEFINITIONS = [
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
  {
    id: "renewal_expansion",
    title: "Renewal and expansion",
    description:
      "Annualised value renewing ahead, worst renewal risk and engagements added recently, by client.",
  },
] satisfies readonly ReportDefinition[];

/**
 * `human_review_workload` shipped in PR #70 as a valid `ReportId` everywhere else and simply
 * absent from the array above: five tabs, six reports, and silence from `tsc`, because
 * `readonly ReportDefinition[]` only checks that each element *present* is a
 * `ReportDefinition` and says nothing about which ids are missing. Add a seventh `ReportId`
 * without an entry above and this assertion's type becomes `false`, which the literal `true`
 * cannot satisfy — a real `tsc` failure, not a lint warning or a test someone forgot to run.
 */
const everyReportIdHasATab: AssertEveryReportId<(typeof REPORT_DEFINITIONS)[number]["id"]> = true;
void everyReportIdHasATab;

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

export async function loadReportSummary(
  input: { range: ReportRange },
  context: RequestAuthorization,
) {
  const days = RANGE_DAYS[input.range];
  const values: unknown[] = [days];
  const access = {
    quotes: hasPotentialVisibility(context, "quote"),
    leads: hasPotentialVisibility(context, "lead"),
    tasks: hasPotentialVisibility(context, "task"),
    agents: evaluateAuthorization({
      actor: context.actor,
      capability: "agents.view",
      target: {},
      overrides: context.overrides,
      now: context.now,
    }).allowed,
  };
  const scope = (resource: VisibleResourceType, alias: string) => {
    if (!hasPotentialVisibility(context, resource)) return "false";
    const built = buildVisibilityScope(context, resource, alias);
    const sql = built.sql.replace(
      /\$(\d+)/g,
      (_, index: string) => "$" + (Number(index) + values.length),
    );
    values.push(...built.values);
    return sql;
  };
  const quoteScope = scope("quote", "q");
  const leadScope = scope("lead", "l");
  const taskScope = scope("task", "t");
  const subjects = access.agents
    ? buildSubjectVisibility(context, "ar", "subject_type", "subject_id")
    : { sql: "false", values: [] as readonly unknown[] };
  const agentScope = subjects.sql.replace(
    /\$(\d+)/g,
    (_, index: string) => "$" + (Number(index) + values.length),
  );
  values.push(...subjects.values);
  const row = await queryOne<ReportSummaryRow>(
    `select
      (select coalesce(sum(q.total_value),0) from quotes q
        where q.status = 'accepted'
          and q.updated_at >= now() - ($1::integer * interval '1 day')
          and ${quoteScope}) as revenue,
      (select coalesce(sum(q.total_value),0) from quotes q
        where q.status in ('pending_approval','approved','sent','viewed')
          and q.updated_at >= now() - ($1::integer * interval '1 day')
          and ${quoteScope}) as pipeline_value,
      (select count(*) from leads l
        where l.created_at >= now() - ($1::integer * interval '1 day')
          and ${leadScope}) as leads,
      (select count(*) from leads l
        where l.status = 'won'
          and l.created_at >= now() - ($1::integer * interval '1 day')
          and ${leadScope}) as won_leads,
      (select count(*) from agent_runs ar
        where ar.created_at >= now() - ($1::integer * interval '1 day')
          and ${agentScope}) as agent_runs,
      (select count(*) from agent_runs ar
        where ar.status = 'completed'
          and ar.created_at >= now() - ($1::integer * interval '1 day')
          and ${agentScope}) as successful_agent_runs,
      (select count(*) from tasks t
        where t.status <> 'done'
          and t.created_at >= now() - ($1::integer * interval '1 day')
          and ${taskScope}) as open_tasks`,
    values,
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
    access,
    reports: REPORT_DEFINITIONS.filter((definition) => {
      if (definition.id === "agents") return access.agents;
      if (definition.id === "renewal_expansion") {
        return (
          hasPotentialVisibility(context, "client") && hasPotentialVisibility(context, "engagement")
        );
      }
      const resource = REPORT_RESOURCE[definition.id];
      return resource ? hasPotentialVisibility(context, resource) : false;
    }).map((definition) => ({ ...definition })),
  };
}

export const reportQueries: Record<ReportId, string> = {
  revenue: `
    select
      date_trunc('week', updated_at)::date::text as week,
      coalesce(sum(total_value), 0)::float8 as revenue
    from quotes q
    where status = 'accepted'
      and updated_at >= now() - ($1::integer * interval '1 day')
    group by date_trunc('week', updated_at)
    order by date_trunc('week', updated_at) asc
  `,
  pipeline: `
    select status as stage, count(*)::integer as count
    from leads l
    where created_at >= now() - ($1::integer * interval '1 day')
    group by status
    order by status asc
  `,
  conversion: `
    select
      date_trunc('week', created_at)::date::text as week,
      count(*)::integer as leads,
      count(*) filter (where status = 'won')::integer as won
    from leads l
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
    from agent_runs ar
    where created_at >= now() - ($1::integer * interval '1 day')
    group by agent_name
    order by runs desc, agent_name asc
  `,
  tasks: `
    select
      created_at::date::text as day,
      count(*)::integer as created,
      count(*) filter (where status = 'done')::integer as completed
    from tasks t
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
    where (a.status = 'pending'
       or a.decided_at >= now() - ($1::integer * interval '1 day'))
    group by coalesce(p.name, 'Unassigned')
    order by pending desc, decided desc, reviewer asc
  `,
  // One range parameter read in two directions: renewal looks forward from today
  // (`current_date + $1 days`), expansion looks back (`current_date - $1 days`). The field
  // headers - "Annualised value renewing ahead" and "Engagements added recently" - are where a
  // reader learns that the same number is being spent twice.
  //
  // `current_date`, not `now()`: `renewal_date` and `start_date` are `date` columns, and
  // `date >= timestamptz` is a legal implicit cast in Postgres. A now()-based window would
  // therefore compile and run while shifting its boundary by the server's clock time.
  //
  // The annualisation is not `CLIENT_ENGAGEMENT_ROLLUP`: that fragment annualises every active
  // engagement, and this column annualises only the ones renewing inside the window.
  //
  // `count(e.id)` rather than `count(*)`, and the risk rank rather than the raw text in the
  // order by - alphabetically `high < low < medium`, which would put medium rows on top.
  renewal_expansion: `
    select
      c.company_name as client,
      coalesce(sum(
        case when e.renewal_date between current_date
                                     and current_date + ($1::integer * interval '1 day')
             then case e.billing_period
                    when 'monthly' then coalesce(e.value, 0) * 12
                    when 'quarterly' then coalesce(e.value, 0) * 4
                    when 'annual' then coalesce(e.value, 0)
                    else 0
                  end
             else 0 end
      ), 0)::float8 as renewing_value,
      initcap(case
        when bool_or(e.renewal_risk = 'high') then 'high'
        when bool_or(e.renewal_risk = 'medium') then 'medium'
        else 'low'
      end) as renewal_risk,
      count(e.id)::integer as active_engagements,
      count(e.id) filter (
        where e.start_date >= current_date - ($1::integer * interval '1 day')
      )::integer as added_recently
    from clients c
    join engagements e on e.client_id = c.id and e.status = 'active'
    group by c.id, c.company_name
    having
      bool_or(e.renewal_date between current_date
                                 and current_date + ($1::integer * interval '1 day'))
      or bool_or(e.start_date >= current_date - ($1::integer * interval '1 day'))
    order by renewing_value desc,
             case
               when bool_or(e.renewal_risk = 'high') then 3
               when bool_or(e.renewal_risk = 'medium') then 2
               else 1
             end desc,
             c.company_name asc
  `,
};

const REPORT_RESOURCE: Partial<Record<ReportId, VisibleResourceType>> = {
  revenue: "quote",
  pipeline: "lead",
  conversion: "lead",
  tasks: "task",
  human_review_workload: "human_approval",
  renewal_expansion: "client",
};

const REPORT_ALIAS: Partial<Record<ReportId, string>> = {
  revenue: "q",
  pipeline: "l",
  conversion: "l",
  tasks: "t",
  human_review_workload: "a",
  renewal_expansion: "c",
};

function shiftReportScope(sql: string, offset: number) {
  return sql.replace(/\$(\d+)/g, (_, index: string) => "$" + (Number(index) + offset));
}

export async function loadReportDataset(
  input: { report: ReportId; range: ReportRange },
  context: RequestAuthorization,
) {
  const values: unknown[] = [RANGE_DAYS[input.range]];
  const resource = REPORT_RESOURCE[input.report];
  if (resource && !hasPotentialVisibility(context, resource)) {
    throw new AdminError("FORBIDDEN", "Report data is outside your access");
  }
  let predicate: string;
  if (input.report === "agents") {
    const access = evaluateAuthorization({
      actor: context.actor,
      capability: "agents.view",
      target: {},
      overrides: context.overrides,
      now: context.now,
    });
    if (!access.allowed) throw new AdminError("FORBIDDEN", "Report data is outside your access");
    const subjects = buildSubjectVisibility(context, "ar", "subject_type", "subject_id");
    predicate = shiftReportScope(subjects.sql, values.length);
    values.push(...subjects.values);
  } else {
    const alias = REPORT_ALIAS[input.report];
    if (!resource || !alias) throw new AdminError("FORBIDDEN", "Unknown report scope");
    const scope = buildVisibilityScope(context, resource, alias);
    predicate = shiftReportScope(scope.sql, values.length);
    values.push(...scope.values);
    if (input.report === "renewal_expansion") {
      if (!hasPotentialVisibility(context, "engagement")) {
        throw new AdminError("FORBIDDEN", "Report data is outside your access");
      }
      const engagements = buildVisibilityScope(context, "engagement", "e");
      predicate += " and " + shiftReportScope(engagements.sql, values.length);
      values.push(...engagements.values);
    }
  }
  const sql = reportQueries[input.report];
  const groupBy = sql.indexOf("\n    group by");
  if (groupBy < 0) throw new Error("Report query is missing its aggregation boundary");
  const conjunction = input.report === "renewal_expansion" ? " where " : " and ";
  const scopedSql = sql.slice(0, groupBy) + conjunction + predicate + sql.slice(groupBy);
  const data = await query<Record<string, string | number | null>>(scopedSql, values);
  return { report: input.report, range: input.range, data };
}

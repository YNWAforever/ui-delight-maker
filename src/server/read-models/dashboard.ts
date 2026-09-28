import type { ActivityLog, AgentRun, HumanApproval, Lead, Product, Quote, Task } from "@/lib/types";
import type { CurrencyTotal } from "@/lib/money";
import { query } from "@/server/db/neon.server";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { Capability } from "@/lib/admin/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import {
  buildVisibilityScope,
  buildSubjectVisibility,
  hasPotentialVisibility,
  type VisibleResourceType,
} from "@/server/auth/visibility-scope.server";
import { listJobSheetsPage, type JobSheetListItem } from "@/server/repositories/job-sheets";

const DASHBOARD_LIMITS = {
  leads: 40,
  quotes: 40,
  tasks: 60,
  approvals: 30,
  agentRuns: 30,
  activityLogs: 20,
  products: 50,
} as const;

type PipelineTotalsRow = {
  open_leads: number | string;
  active_quote_totals: CurrencyTotal[] | null;
  open_tasks: number | string;
  pending_approvals: number | string;
};

export interface DashboardReadModel {
  leads: Lead[];
  quotes: Quote[];
  tasks: Task[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  activityLogs: ActivityLog[];
  products: Product[];
  jobSheets: JobSheetListItem[];
  access: {
    leads: boolean;
    jobSheets: boolean;
    tasks: boolean;
    approvals: boolean;
    quotes: boolean;
  };
  pipelineTotals: {
    openLeads: number;
    activeQuoteTotals: CurrencyTotal[];
    openTasks: number;
    pendingApprovals: number;
  };
  productSummary: Record<string, number>;
}

function shiftPlaceholders(sql: string, offset: number) {
  return sql.replace(/\$(\d+)/g, (_, index: string) => "$" + (Number(index) + offset));
}

async function visibleRows<T>(
  context: RequestAuthorization,
  resource: VisibleResourceType,
  alias: string,
  selectAndWhere: string,
  order: string,
  limit: number,
): Promise<T[]> {
  if (!hasPotentialVisibility(context, resource)) return [];
  const scope = buildVisibilityScope(context, resource, alias);
  return query<T>(
    selectAndWhere + " and " + scope.sql + " " + order + " limit $" + (scope.values.length + 1),
    [...scope.values, limit],
  );
}

async function visibleQuotes(context: RequestAuthorization): Promise<Quote[]> {
  if (!hasPotentialVisibility(context, "quote")) return [];
  const lead = buildVisibilityScope(context, "lead", "l");
  const quote = buildVisibilityScope(context, "quote", "q");
  const quotePredicate = shiftPlaceholders(quote.sql, lead.values.length);
  const values = [...lead.values, ...quote.values];
  return query<Quote>(
    `select q.id, left(q.number,64) as number,
            case when exists (
              select 1 from leads l where l.id = q.lead_id and ${lead.sql}
            ) then q.lead_id else null end as lead_id,
            q.client_id, q.contact_id, q.account_id, q.deal_id, q.status,
            q.total_value, q.currency, q.valid_until,
            '[]'::jsonb as line_items, q.created_by, q.created_at, q.updated_at
     from quotes q
     where q.status in ('draft','pending_approval','approved','sent','viewed','accepted')
       and ${quotePredicate}
     order by q.created_at desc, q.id desc
     limit $${values.length + 1}`,
    [...values, DASHBOARD_LIMITS.quotes],
  );
}

async function visibleAgentRuns(context: RequestAuthorization): Promise<AgentRun[]> {
  if (
    !evaluateAuthorization({
      actor: context.actor,
      capability: "agents.view",
      target: {},
      overrides: context.overrides,
      now: context.now,
    }).allowed
  )
    return [];
  const subjects = buildSubjectVisibility(context, "ar", "subject_type", "subject_id");
  if (!subjects.values.length) return [];
  return query<AgentRun>(
    `select ar.id, left(ar.agent_name, 120) as agent_name,
            case when ar.subject_type = 'lead'
              then jsonb_build_object('lead_id', ar.subject_id)
              else '{}'::jsonb end as input_data,
            left(ar.output_summary, 500) as output_summary, ar.status, ar.created_at
     from agent_runs ar where ${subjects.sql}
     order by ar.created_at desc, ar.id desc
     limit $${subjects.values.length + 1}`,
    [...subjects.values, DASHBOARD_LIMITS.agentRuns],
  );
}

async function visibleActivityLogs(context: RequestAuthorization): Promise<ActivityLog[]> {
  const subjects = buildSubjectVisibility(context, "al", "object_type", "object_id");
  if (!subjects.values.length) return [];
  return query<ActivityLog>(
    `select al.id, al.actor_type, al.actor_id, left(al.actor_name, 120) as actor_name,
            left(al.action, 240) as action, al.object_type, al.object_id, al.created_at
     from activity_logs al where ${subjects.sql}
     order by al.created_at desc, al.id desc
     limit $${subjects.values.length + 1}`,
    [...subjects.values, DASHBOARD_LIMITS.activityLogs],
  );
}

async function visibleTotals(
  context: RequestAuthorization,
): Promise<PipelineTotalsRow | undefined> {
  const values: unknown[] = [];
  const scope = (resource: VisibleResourceType, alias: string) => {
    if (!hasPotentialVisibility(context, resource)) return "false";
    const built = buildVisibilityScope(context, resource, alias);
    const sql = shiftPlaceholders(built.sql, values.length);
    values.push(...built.values);
    return sql;
  };
  const leadScope = scope("lead", "l");
  const quoteScope = scope("quote", "q");
  const taskScope = scope("task", "t");
  const approvalScope = scope("human_approval", "ha");
  const rows = await query<PipelineTotalsRow>(
    `select
      (select count(*) from leads l
        where l.status not in ('won','lost') and ${leadScope}) as open_leads,
      (select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'amount',amount)
                                  order by currency), '[]'::jsonb)
       from (
         select q.currency as currency, sum(q.total_value)::text as amount
         from quotes q
         where q.status in ('pending_approval','approved','sent','viewed')
           and ${quoteScope}
         group by q.currency
       ) currency_values) as active_quote_totals,
      (select count(*) from tasks t where t.status <> 'done'
        and ${taskScope}) as open_tasks,
      (select count(*) from human_approvals ha where ha.status = 'pending'
        and ${approvalScope}) as pending_approvals`,
    values,
  );
  return rows[0];
}

export async function getDashboardReadModel(
  context: RequestAuthorization,
): Promise<DashboardReadModel> {
  // Navigation is a hint, never an authorization boundary. Keep row-scoped allows
  // discoverable, but do not advertise a queue under a resource-wide deny.
  const canOfferQueue = (resource: VisibleResourceType, capability: Capability) =>
    hasPotentialVisibility(context, resource) &&
    evaluateAuthorization({
      actor: context.actor,
      capability,
      target: { resourceType: resource },
      overrides: context.overrides,
      now: context.now,
    }).reason !== "explicit_deny";
  const access = {
    leads: canOfferQueue("lead", "leads.view"),
    jobSheets: canOfferQueue("job_sheet", "job_sheets.view"),
    tasks: canOfferQueue("task", "tasks.view"),
    approvals: canOfferQueue("human_approval", "approvals.view"),
    quotes: canOfferQueue("quote", "quotes.view"),
  };
  const productsAllowed = evaluateAuthorization({
    actor: context.actor,
    capability: "products.view",
    target: {},
    overrides: context.overrides,
    now: context.now,
  }).allowed;

  const [
    leads,
    quotes,
    tasks,
    approvals,
    agentRuns,
    activityLogs,
    products,
    totals,
    jobSheetsPage,
  ] = await Promise.all([
    visibleRows<Lead>(
      context,
      "lead",
      "l",
      `select l.id, l.contact_id, l.account_id, l.source_campaign_id, l.campaign_member_id,
                left(l.company_name,160) as company_name, left(l.contact_name,120) as contact_name,
                left(l.contact_email,254) as contact_email, left(l.contact_phone,64) as contact_phone,
                l.source, l.status, l.assigned_to, l.lead_score,
                case when l.qualification_data is null then null else
                  jsonb_build_object('next_action',left(l.qualification_data->>'next_action',240))
                end as qualification_data,
                left(l.enquiry_text,500) as enquiry_text, l.created_at, l.updated_at
         from leads l where l.status not in ('won','lost')`,
      "order by l.created_at desc, l.id desc",
      DASHBOARD_LIMITS.leads,
    ),
    visibleQuotes(context),
    visibleRows<Task>(
      context,
      "task",
      "t",
      `select t.id, left(t.title,240) as title, t.assigned_to, t.lead_id, t.client_id,
                t.account_id, t.due_date, t.priority, t.status, t.created_at
         from tasks t where t.status <> 'done'`,
      "order by t.due_date asc nulls last, t.created_at desc, t.id desc",
      DASHBOARD_LIMITS.tasks,
    ),
    visibleRows<HumanApproval>(
      context,
      "human_approval",
      "ha",
      `select ha.id, ha.agent_run_id, ha.approval_type, ha.requested_by, ha.assigned_to,
                ha.status, '{}'::jsonb as context_data,
                left(ha.context_summary,300) as context_summary,
                null::text as reviewer_notes, null::timestamptz as decided_at, ha.created_at
         from human_approvals ha where ha.status = 'pending'`,
      "order by ha.created_at desc, ha.id desc",
      DASHBOARD_LIMITS.approvals,
    ),
    visibleAgentRuns(context),
    visibleActivityLogs(context),
    productsAllowed
      ? query<Product>(
          `select id, left(name,160) as name, left(description,300) as description,
                    left(category,80) as category, billing_type, default_term_months, active,
                    created_at, updated_at
             from products where active = true order by name, id limit $1`,
          [DASHBOARD_LIMITS.products],
        )
      : Promise.resolve([] as Product[]),
    visibleTotals(context),
    !access.leads && access.jobSheets
      ? listJobSheetsPage({ page: 1, limit: 10 }, context)
      : Promise.resolve(null),
  ]);

  const pipelineTotals = {
    openLeads: Number(totals?.open_leads ?? 0),
    activeQuoteTotals: Array.isArray(totals?.active_quote_totals) ? totals.active_quote_totals : [],
    openTasks: Number(totals?.open_tasks ?? 0),
    pendingApprovals: Number(totals?.pending_approvals ?? 0),
  };
  const productSummary = products.reduce<Record<string, number>>((summary, product) => {
    const category = product.category ?? "uncategorized";
    summary[category] = (summary[category] ?? 0) + 1;
    return summary;
  }, {});

  return {
    leads,
    quotes,
    tasks,
    approvals,
    agentRuns,
    activityLogs,
    products,
    jobSheets: jobSheetsPage?.items ?? [],
    access,
    pipelineTotals,
    productSummary,
  };
}
export type DashboardRead = DashboardReadModel;
export const getDashboardRead = getDashboardReadModel;

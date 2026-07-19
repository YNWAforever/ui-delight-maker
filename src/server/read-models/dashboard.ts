import type { ActivityLog, AgentRun, HumanApproval, Lead, Product, Quote, Task } from "@/lib/types";
import { query } from "@/server/db/neon.server";

const DASHBOARD_LIMITS = {
  leads: 50,
  quotes: 100,
  tasks: 100,
  approvals: 50,
  agentRuns: 50,
  activityLogs: 20,
  products: 50,
} as const;

type PipelineTotalsRow = {
  open_leads: number | string;
  active_quote_value: number | string;
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
  pipelineTotals: {
    openLeads: number;
    activeQuoteValue: number;
    openTasks: number;
    pendingApprovals: number;
  };
  productSummary: Record<string, number>;
}

export async function getDashboardReadModel(): Promise<DashboardReadModel> {
  const [leads, quotes, tasks, approvals, agentRuns, activityLogs, products, totalRows] = await Promise.all([
    query<Lead>(
      `select id, contact_id, account_id, source_campaign_id, campaign_member_id,
                company_name, contact_name, contact_email, contact_phone, source, status,
                assigned_to, lead_score, qualification_data, enquiry_text, created_at, updated_at
         from leads
         where status not in ('won', 'lost')
         order by created_at desc, id desc
         limit $1`,
      [DASHBOARD_LIMITS.leads],
    ),
    query<Quote>(
      `select q.id, q.number, q.lead_id, q.client_id, q.contact_id, q.account_id, q.deal_id,
                q.status, q.total_value, q.currency, q.valid_until, q.line_items,
                q.created_by, q.created_at, q.updated_at
         from quotes q
         inner join leads l on l.id = q.lead_id
         where l.status not in ('won', 'lost')
         order by q.created_at desc, q.id desc
         limit $1`,
      [DASHBOARD_LIMITS.quotes],
    ),
    query<Task>(
      `select id, title, assigned_to, lead_id, client_id, account_id, due_date,
                priority, status, created_at
         from tasks
         where status <> 'done'
         order by due_date asc nulls last, created_at desc, id desc
         limit $1`,
      [DASHBOARD_LIMITS.tasks],
    ),
    query<HumanApproval>(
      `select id, agent_run_id, approval_type, assigned_to, status,
                context_data, context_summary, created_at
         from human_approvals
         where status = 'pending'
         order by created_at desc, id desc
         limit $1`,
      [DASHBOARD_LIMITS.approvals],
    ),
    query<AgentRun>(
      `select id, agent_name, input_data, output_summary, status, created_at
         from agent_runs
         order by created_at desc, id desc
         limit $1`,
      [DASHBOARD_LIMITS.agentRuns],
    ),
    query<ActivityLog>(
      `select id, actor_type, actor_id, actor_name, action, object_type, object_id, created_at
         from activity_logs
         order by created_at desc, id desc
         limit $1`,
      [DASHBOARD_LIMITS.activityLogs],
    ),
    query<Product>(
      `select id, name, description, category, billing_type, default_term_months, active,
                created_at, updated_at
         from products
         where active = true
         order by name, id
         limit $1`,
      [DASHBOARD_LIMITS.products],
    ),
    query<PipelineTotalsRow>(
      `select
         (select count(*) from leads where status not in ('won', 'lost')) as open_leads,
         (select coalesce(sum(total_value), 0) from quotes
           where status in ('pending_approval', 'sent', 'viewed')) as active_quote_value,
         (select count(*) from tasks where status <> 'done') as open_tasks,
         (select count(*) from human_approvals where status = 'pending') as pending_approvals`,
    ),
  ]);

  const totals = totalRows[0];
  const pipelineTotals = {
    openLeads: Number(totals?.open_leads ?? 0),
    activeQuoteValue: Number(totals?.active_quote_value ?? 0),
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
    pipelineTotals,
    productSummary,
  };
}
export type DashboardRead = DashboardReadModel;
export const getDashboardRead = getDashboardReadModel;

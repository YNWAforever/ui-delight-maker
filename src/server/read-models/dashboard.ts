import type { ActivityLog, AgentRun, HumanApproval, Lead, Product, Quote, Task } from "@/lib/types";
import { query } from "@/server/db/neon.server";

const DASHBOARD_LIMITS = {
  leads: 200,
  quotes: 300,
  tasks: 300,
  approvals: 100,
  agentRuns: 50,
  activityLogs: 20,
  products: 100,
} as const;

export interface DashboardReadModel {
  leads: Lead[];
  quotes: Quote[];
  tasks: Task[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  activityLogs: ActivityLog[];
  products: Product[];
}

export async function getDashboardReadModel(): Promise<DashboardReadModel> {
  const [leads, quotes, tasks, approvals, agentRuns, activityLogs, products] = await Promise.all([
    query<Lead>(
      `select *
         from leads
         where status not in ('won', 'lost')
         order by created_at desc
         limit $1`,
      [DASHBOARD_LIMITS.leads],
    ),
    query<Quote>(
      `select q.*
         from quotes q
         inner join leads l on l.id = q.lead_id
         where l.status not in ('won', 'lost')
         order by q.created_at desc
         limit $1`,
      [DASHBOARD_LIMITS.quotes],
    ),
    query<Task>(
      `select *
         from tasks
         where status <> 'done'
         order by due_date asc nulls last, created_at desc
         limit $1`,
      [DASHBOARD_LIMITS.tasks],
    ),
    query<HumanApproval>(
      `select *
         from human_approvals
         where status = 'pending'
         order by created_at desc
         limit $1`,
      [DASHBOARD_LIMITS.approvals],
    ),
    query<AgentRun>(
      `select *
         from agent_runs
         order by created_at desc
         limit $1`,
      [DASHBOARD_LIMITS.agentRuns],
    ),
    query<ActivityLog>(
      `select *
         from activity_logs
         order by created_at desc
         limit $1`,
      [DASHBOARD_LIMITS.activityLogs],
    ),
    query<Product>(
      `select *
         from products
         where active = true
         order by name
         limit $1`,
      [DASHBOARD_LIMITS.products],
    ),
  ]);

  return { leads, quotes, tasks, approvals, agentRuns, activityLogs, products };
}
export type DashboardRead = DashboardReadModel;
export const getDashboardRead = getDashboardReadModel;

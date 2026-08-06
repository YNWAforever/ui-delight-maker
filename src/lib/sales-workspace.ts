import { formatDate } from "./format";
import { sumAmounts } from "./money";
import type { AgentRun, Client, HumanApproval, Lead, Quote, Task } from "./types";

export type RevenueActionKind =
  | "overdue_task"
  | "due_today"
  | "pending_approval"
  | "renewal_risk"
  | "hot_lead";

export type RevenueActionUrgency = "critical" | "high" | "medium";

export interface RevenueAction {
  id: string;
  kind: RevenueActionKind;
  title: string;
  accountName: string;
  description: string;
  href: string;
  urgency: RevenueActionUrgency;
  value: number | null;
  ownerId: string | null;
  score: number;
}

export interface RevenueDeskInput {
  leads: Lead[];
  tasks: Task[];
  quotes: Quote[];
  approvals: HumanApproval[];
  clients?: Client[];
  agentRuns?: AgentRun[];
  today: string;
}

const DAY_MS = 86_400_000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}/;

const dateKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const isoDate = DATE_KEY_PATTERN.exec(value)?.[0];
  if (isoDate) return isoDate;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const dateKeyTime = (key: string) => {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return Date.UTC(year, month - 1, day);
};

const daysBetween = (from: string, to: string) => {
  const fromKey = dateKey(from);
  const toKey = dateKey(to);
  if (fromKey == null || toKey == null) return Number.NaN;
  return Math.floor((dateKeyTime(toKey) - dateKeyTime(fromKey)) / DAY_MS);
};

const leadById = (leads: Lead[]) => new Map(leads.map((lead) => [lead.id, lead]));

const quoteValueForLead = (leadId: string, quotes: Quote[]) =>
  quotes.find((quote) => quote.lead_id === leadId)?.total_value ?? null;

const approvalLeadId = (approval: HumanApproval): string | null => {
  if (approval.context_data == null || typeof approval.context_data !== "object") return null;
  const context = approval.context_data as { lead_id?: unknown };
  return typeof context.lead_id === "string" ? context.lead_id : null;
};

const scoreRank: Record<RevenueActionKind, number> = {
  overdue_task: 500,
  pending_approval: 420,
  renewal_risk: 340,
  due_today: 300,
  hot_lead: 220,
};

export function buildRevenueActions(input: RevenueDeskInput): RevenueAction[] {
  const leads = leadById(input.leads);
  const actions: RevenueAction[] = [];
  const todayKey = dateKey(input.today);

  for (const task of input.tasks) {
    if (task.status === "done" || !task.due_date) continue;
    const linkedLead = task.lead_id ? leads.get(task.lead_id) : undefined;
    const dueDateKey = dateKey(task.due_date);
    const overdue = dueDateKey != null && todayKey != null && dueDateKey < todayKey;
    const dueToday = dueDateKey != null && todayKey != null && dueDateKey === todayKey;
    if (!overdue && !dueToday) continue;

    actions.push({
      id: `task:${task.id}`,
      kind: overdue ? "overdue_task" : "due_today",
      title: task.title,
      accountName: linkedLead?.company_name ?? "Unlinked task",
      description: overdue ? `Overdue since ${formatDate(task.due_date)}` : "Due today",
      href: linkedLead ? `/leads/${linkedLead.id}` : "/tasks",
      urgency: overdue ? "critical" : "high",
      value: linkedLead ? quoteValueForLead(linkedLead.id, input.quotes) : null,
      ownerId: task.assigned_to,
      score: scoreRank[overdue ? "overdue_task" : "due_today"] + (linkedLead?.lead_score ?? 0),
    });
  }

  for (const approval of input.approvals) {
    if (approval.status !== "pending") continue;
    const leadId = approvalLeadId(approval);
    const linkedLead = leadId ? leads.get(leadId) : undefined;
    actions.push({
      id: `approval:${approval.id}`,
      kind: "pending_approval",
      title: approval.context_summary ?? "Review approval request",
      accountName: linkedLead?.company_name ?? "Approval request",
      description: approval.approval_type?.replace(/_/g, " ") ?? "Human review required",
      href: "/approvals",
      urgency: "high",
      value: linkedLead ? quoteValueForLead(linkedLead.id, input.quotes) : null,
      ownerId: approval.assigned_to,
      score: scoreRank.pending_approval + (linkedLead?.lead_score ?? 0),
    });
  }

  for (const client of input.clients ?? []) {
    const renewalDate = client.renewal_date;
    if (!renewalDate) continue;
    const daysUntilRenewal = daysBetween(input.today, renewalDate);
    const risky = client.health_score < 55 || daysUntilRenewal <= 30;
    if (!risky) continue;
    actions.push({
      id: `client:${client.id}`,
      kind: "renewal_risk",
      title: `Protect renewal for ${client.company_name}`,
      accountName: client.company_name,
      description: `${formatDate(renewalDate)} renewal · health ${client.health_score}/100`,
      href: `/clients/${client.id}`,
      urgency: client.health_score < 50 || daysUntilRenewal <= 14 ? "critical" : "medium",
      value: client.arr,
      ownerId: client.account_owner,
      score: scoreRank.renewal_risk + Math.max(0, 100 - client.health_score),
    });
  }

  for (const lead of input.leads) {
    if (lead.lead_score < 75 || lead.status === "won" || lead.status === "lost") continue;
    actions.push({
      id: `lead:${lead.id}`,
      kind: "hot_lead",
      title: lead.qualification_data?.next_action ?? "Review hot lead",
      accountName: lead.company_name,
      description: `Score ${lead.lead_score} · ${lead.source ?? "unknown source"}`,
      href: `/leads/${lead.id}`,
      urgency: "medium",
      value: quoteValueForLead(lead.id, input.quotes),
      ownerId: lead.assigned_to,
      score: scoreRank.hot_lead + lead.lead_score,
    });
  }

  return actions.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function getQuoteDeskMetrics(quotes: Quote[]) {
  const valueOf = (quote: Quote) => quote.total_value;
  return {
    activeValue: sumAmounts(
      quotes.filter((quote) => ["pending_approval", "sent", "viewed"].includes(quote.status)),
      valueOf,
    ),
    acceptedValue: sumAmounts(
      quotes.filter((quote) => quote.status === "accepted"),
      valueOf,
    ),
    draftValue: sumAmounts(
      quotes.filter((quote) => quote.status === "draft"),
      valueOf,
    ),
    pendingApproval: quotes.filter((quote) => quote.status === "pending_approval").length,
  };
}

export function getClientPortfolioMetrics(clients: Client[], today: string) {
  const totalArr = sumAmounts(clients, (client) => client.arr);
  const averageHealth =
    clients.length === 0
      ? 0
      : Math.round(clients.reduce((sum, client) => sum + client.health_score, 0) / clients.length);

  return {
    totalArr,
    averageHealth,
    renewalsNext90Days: clients.filter((client) => {
      if (!client.renewal_date) return false;
      const days = daysBetween(today, client.renewal_date);
      return days >= 0 && days <= 90;
    }).length,
    atRiskAccounts: clients.filter((client) => client.health_score < 55).length,
  };
}

export function getTaskBoardMetrics(tasks: Task[], today: string) {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const todayKey = dateKey(today);
  return {
    open: openTasks.length,
    overdue: openTasks.filter((task) => {
      const dueDateKey = dateKey(task.due_date);
      return dueDateKey != null && todayKey != null && dueDateKey < todayKey;
    }).length,
    dueToday: openTasks.filter((task) => {
      const dueDateKey = dateKey(task.due_date);
      return dueDateKey != null && todayKey != null && dueDateKey === todayKey;
    }).length,
    highPriority: openTasks.filter((task) => task.priority === "high").length,
  };
}

export const getSalesDisplayDate = (value: string | Date | null | undefined) => formatDate(value);

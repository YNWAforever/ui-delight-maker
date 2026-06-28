import type {
  AgentRun,
  ApprovalStatus,
  HumanApproval,
  Lead,
  LeadSource,
  LeadStatus,
  Quote,
  Task,
} from "./types";

export type PipelineStageId = "new" | "qualified" | "quoted" | "follow_up" | "closed";
export type SlaState = "overdue" | "due_today" | "clear";
export type AiReviewState =
  | "running"
  | "ready_for_review"
  | "approved"
  | "sent"
  | "failed"
  | "idle";

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  statuses: LeadStatus[];
}

export interface PipelineFilters {
  search?: string;
  source?: LeadSource | "all";
  owner?: string | "all";
  urgency?: SlaState | "all";
  aiState?: AiReviewState | "all";
}

export interface PipelineSummary {
  overdue: number;
  dueToday: number;
  highScore: number;
  pendingApproval: number;
}

export const LEAD_PIPELINE_STAGES: PipelineStage[] = [
  { id: "new", label: "New", statuses: ["new"] },
  { id: "qualified", label: "Qualified", statuses: ["qualified"] },
  { id: "quoted", label: "Quoted", statuses: ["quoted", "approved"] },
  { id: "follow_up", label: "Follow-up", statuses: ["replied"] },
  { id: "closed", label: "Won/Lost", statuses: ["won", "lost"] },
];

const STAGE_BY_STATUS = new Map<LeadStatus, PipelineStageId>(
  LEAD_PIPELINE_STAGES.flatMap((stage) =>
    stage.statuses.map((status) => [status, stage.id] as const),
  ),
);

const STATUS_BY_STAGE: Record<PipelineStageId, LeadStatus> = {
  new: "new",
  qualified: "qualified",
  quoted: "quoted",
  follow_up: "replied",
  closed: "won",
};

export function getPipelineStageForStatus(status: LeadStatus): PipelineStageId {
  return STAGE_BY_STATUS.get(status) ?? "new";
}

export function getDefaultStatusForStage(stage: PipelineStageId): LeadStatus {
  return STATUS_BY_STAGE[stage];
}

export function groupLeadsByPipelineStage(leads: Lead[]): Record<PipelineStageId, Lead[]> {
  const grouped = Object.fromEntries(
    LEAD_PIPELINE_STAGES.map((stage) => [stage.id, [] as Lead[]]),
  ) as Record<PipelineStageId, Lead[]>;

  for (const lead of leads) {
    grouped[getPipelineStageForStatus(lead.status)].push(lead);
  }

  return grouped;
}

export function getLeadTasks(lead: Lead, tasks: Task[]): Task[] {
  return tasks.filter((task) => task.lead_id === lead.id);
}

export function getLeadOpenTasks(lead: Lead, tasks: Task[]): Task[] {
  return getLeadTasks(lead, tasks).filter((task) => task.status !== "done");
}

export function getLeadSlaState(
  lead: Lead,
  tasks: Task[],
  today = new Date().toISOString().slice(0, 10),
): { state: SlaState; label: string } {
  const openTasks = getLeadOpenTasks(lead, tasks).filter((task) => task.due_date);

  if (openTasks.some((task) => task.due_date != null && task.due_date < today)) {
    return { state: "overdue", label: "Overdue" };
  }

  if (openTasks.some((task) => task.due_date === today)) {
    return { state: "due_today", label: "Due today" };
  }

  return { state: "clear", label: "No SLA risk" };
}

function approvalContextLeadId(approval: HumanApproval): string | null {
  if (approval.context_data == null || typeof approval.context_data !== "object") {
    return null;
  }

  const context = approval.context_data as { lead_id?: unknown };
  return typeof context.lead_id === "string" ? context.lead_id : null;
}

export function getLeadPendingApprovals(lead: Lead, approvals: HumanApproval[]): HumanApproval[] {
  return approvals.filter((approval) => {
    if (approval.status !== "pending") return false;
    return approvalContextLeadId(approval) === lead.id;
  });
}

export function getLeadAiState(
  lead: Lead,
  approvals: HumanApproval[],
  agentRuns: AgentRun[] = [],
): { state: AiReviewState; label: string } {
  const pendingApproval = getLeadPendingApprovals(lead, approvals).at(0);
  if (pendingApproval) return { state: "ready_for_review", label: "Approval ready" };

  const leadRuns = agentRuns.filter((run) => {
    if (run.input_data == null || typeof run.input_data !== "object") return false;

    const input = run.input_data as { lead_id?: unknown };
    return input.lead_id === lead.id;
  });

  if (leadRuns.some((run) => run.status === "running")) {
    return { state: "running", label: "AI running" };
  }

  if (leadRuns.some((run) => run.status === "failed")) {
    return { state: "failed", label: "AI failed" };
  }

  if (lead.qualification_data) {
    return { state: "approved", label: "Qualified" };
  }

  return { state: "idle", label: "Awaiting AI" };
}

export function getLeadNextAction(lead: Lead, tasks: Task[]): string {
  const openTask = getLeadOpenTasks(lead, tasks)
    .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"))
    .at(0);

  if (openTask) return openTask.title;

  return lead.qualification_data?.next_action ?? "Review enquiry";
}

export function getLeadQuoteSummary(
  lead: Lead,
  quotes: Quote[],
): { value: number | null; status: string | null } {
  const quote = quotes.find((item) => item.lead_id === lead.id);

  return { value: quote?.total_value ?? null, status: quote?.status ?? null };
}

export function filterPipelineLeads(input: {
  leads: Lead[];
  tasks: Task[];
  approvals: HumanApproval[];
  agentRuns?: AgentRun[];
  filters: PipelineFilters;
  today?: string;
}): Lead[] {
  const search = input.filters.search?.trim().toLowerCase() ?? "";
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  return input.leads.filter((lead) => {
    if (
      input.filters.source &&
      input.filters.source !== "all" &&
      lead.source !== input.filters.source
    ) {
      return false;
    }

    if (
      input.filters.owner &&
      input.filters.owner !== "all" &&
      lead.assigned_to !== input.filters.owner
    ) {
      return false;
    }

    if (input.filters.urgency && input.filters.urgency !== "all") {
      if (getLeadSlaState(lead, input.tasks, today).state !== input.filters.urgency) {
        return false;
      }
    }

    if (input.filters.aiState && input.filters.aiState !== "all") {
      if (
        getLeadAiState(lead, input.approvals, input.agentRuns ?? []).state !== input.filters.aiState
      ) {
        return false;
      }
    }

    if (search) {
      const haystack = [
        lead.company_name,
        lead.contact_name,
        lead.contact_email,
        lead.contact_phone,
        lead.enquiry_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function getPipelineSummary(input: {
  leads: Lead[];
  tasks: Task[];
  approvals: HumanApproval[];
  today?: string;
}): PipelineSummary {
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  return {
    overdue: input.leads.filter(
      (lead) => getLeadSlaState(lead, input.tasks, today).state === "overdue",
    ).length,
    dueToday: input.leads.filter(
      (lead) => getLeadSlaState(lead, input.tasks, today).state === "due_today",
    ).length,
    highScore: input.leads.filter((lead) => lead.lead_score >= 75).length,
    pendingApproval: input.leads.filter(
      (lead) => getLeadPendingApprovals(lead, input.approvals).length > 0,
    ).length,
  };
}

export function approvalStatusLabel(status: ApprovalStatus): string {
  if (status === "escalated") return "changes requested";

  return status.replace(/_/g, " ");
}

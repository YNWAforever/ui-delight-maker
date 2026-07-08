import type { AccountTimelineEntry, AccountTimelineInput, AccountTimelineKind } from "./types";

const QUOTE_VALUE_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function includeKind(kind: AccountTimelineKind, kinds?: AccountTimelineKind[]): boolean {
  return !kinds || kinds.includes(kind);
}

function formatQuoteDetail(currency: string, totalValue: number | null): string | null {
  if (totalValue == null) {
    return null;
  }

  return `${currency} ${QUOTE_VALUE_FORMATTER.format(Number(totalValue))}`;
}

export function buildAccountTimeline(input: AccountTimelineInput): AccountTimelineEntry[] {
  const entries: AccountTimelineEntry[] = [];

  if (includeKind("touchpoint", input.kinds)) {
    entries.push(
      ...input.touchpoints.map((touchpoint) => ({
        id: `touchpoint:${touchpoint.id}`,
        kind: "touchpoint" as const,
        occurred_at: touchpoint.occurred_at,
        title: `${touchpoint.type.replace(/_/g, " ")} (${touchpoint.sentiment})`,
        detail: touchpoint.notes,
        object_type: "touchpoint",
        object_id: touchpoint.id,
        status: touchpoint.sentiment,
      })),
    );
  }

  if (includeKind("activity", input.kinds)) {
    entries.push(
      ...input.activityLogs.map((log) => ({
        id: `activity:${log.id}`,
        kind: "activity" as const,
        occurred_at: log.created_at,
        title: `${log.actor_name ?? log.actor_type ?? "System"} ${log.action}`,
        detail: null,
        object_type: log.object_type ?? "activity",
        object_id: log.object_id,
      })),
    );
  }

  if (includeKind("task", input.kinds)) {
    entries.push(
      ...input.tasks.map((task) => ({
        id: `task:${task.id}`,
        kind: "task" as const,
        occurred_at: task.due_date ?? task.created_at,
        title: task.title,
        detail: task.due_date ? `Due ${task.due_date}` : null,
        object_type: "task",
        object_id: task.id,
        status: task.status,
      })),
    );
  }

  if (includeKind("quote", input.kinds)) {
    entries.push(
      ...input.quotes.map((quote) => ({
        id: `quote:${quote.id}`,
        kind: "quote" as const,
        occurred_at: quote.created_at,
        title: quote.number ? `Quote ${quote.number}` : "Quote created",
        detail: formatQuoteDetail(quote.currency, quote.total_value),
        object_type: "quote",
        object_id: quote.id,
        status: quote.status,
      })),
    );
  }

  if (includeKind("approval", input.kinds)) {
    entries.push(
      ...input.approvals.map((approval) => ({
        id: `approval:${approval.id}`,
        kind: "approval" as const,
        occurred_at: approval.created_at,
        title: approval.approval_type
          ? `${approval.approval_type.replace(/_/g, " ")} approval`
          : "Approval",
        detail: approval.context_summary,
        object_type: "approval",
        object_id: approval.id,
        status: approval.status,
      })),
    );
  }

  if (includeKind("agent_run", input.kinds)) {
    entries.push(
      ...input.agentRuns.map((run) => ({
        id: `agent_run:${run.id}`,
        kind: "agent_run" as const,
        occurred_at: run.created_at,
        title: run.agent_name,
        detail: run.output_summary,
        object_type: "agent_run",
        object_id: run.id,
        status: run.status,
      })),
    );
  }

  if (includeKind("campaign", input.kinds)) {
    entries.push(
      ...input.campaignMembers.map((member) => ({
        id: `campaign:${member.id}`,
        kind: "campaign" as const,
        occurred_at: member.created_at,
        title: `Campaign attendee: ${member.attendee_status}`,
        detail: `Follow-up ${member.follow_up_status.replace(/_/g, " ")}`,
        object_type: "campaign_member",
        object_id: member.id,
        status: member.follow_up_status,
      })),
    );
  }

  if (includeKind("lead", input.kinds)) {
    entries.push(
      ...(input.leads ?? []).map((lead) => ({
        id: `lead:${lead.id}`,
        kind: "lead" as const,
        occurred_at: lead.created_at,
        title: `Lead ${lead.status}: ${lead.contact_name ?? lead.company_name}`,
        detail: lead.source ? `Source ${lead.source}` : null,
        object_type: "lead",
        object_id: lead.id,
        status: lead.status,
      })),
    );
  }

  if (includeKind("engagement", input.kinds)) {
    entries.push(
      ...(input.engagements ?? []).map((engagement) => ({
        id: `engagement:${engagement.id}`,
        kind: "engagement" as const,
        occurred_at: engagement.updated_at ?? engagement.created_at,
        title: `Engagement ${engagement.status}`,
        detail:
          engagement.next_action ??
          (engagement.renewal_date ? `Renewal ${engagement.renewal_date}` : null),
        object_type: "engagement",
        object_id: engagement.id,
        status: engagement.renewal_risk,
      })),
    );
  }

  return entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

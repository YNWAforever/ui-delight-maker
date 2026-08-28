import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarClock, Mail, Phone, Plus } from "lucide-react";
import { AiSalesDesk } from "@/components/pipeline/ai-sales-desk";
import { LeadTimelineSummaryCard } from "@/components/pipeline/lead-timeline-summary";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCompactHKD, formatDate, formatDateTime } from "@/lib/format";
import {
  getLeadNextAction,
  getLeadOpenTasks,
  getLeadQuoteSummary,
  getLeadSlaState,
} from "@/lib/pipeline";
import type { ActivityLog, AgentRun, HumanApproval, Lead, Quote, Task } from "@/lib/types";

interface LeadPreviewPanelProps {
  lead: Lead | null;
  tasks: Task[];
  quotes: Quote[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  activityLogs: ActivityLog[];
  onQualify: (lead: Lead) => void;
  onDraftReply: (lead: Lead) => void;
  onDraftQuote: (lead: Lead) => void;
  onCreateTask: (lead: Lead) => void;
  /** Lead whose AI dispatch is in flight, so a second dispatch cannot be fired. */
  pendingAiLeadId?: string | null;
  /** Lead whose follow-up task write is in flight. Every click creates another task. */
  pendingTaskLeadId?: string | null;
}

export function LeadPreviewPanel({
  lead,
  tasks,
  quotes,
  approvals,
  agentRuns,
  activityLogs,
  onQualify,
  onDraftReply,
  onDraftQuote,
  onCreateTask,
  pendingAiLeadId = null,
  pendingTaskLeadId = null,
}: LeadPreviewPanelProps) {
  if (!lead) {
    return (
      <aside className="rounded-md border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No lead selected.
      </aside>
    );
  }

  const openTasks = getLeadOpenTasks(lead, tasks);
  const sla = getLeadSlaState(lead, tasks);
  const quote = getLeadQuoteSummary(lead, quotes);
  const nextAction = getLeadNextAction(lead, tasks);
  const logs = activityLogs.filter((log) => log.object_id === lead.id).slice(0, 5);
  const taskPending = pendingTaskLeadId === lead.id;

  return (
    <aside className="space-y-4">
      <Card className="rounded-md">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{lead.company_name}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{lead.id}</p>
            </div>
            <StatusBadge value={lead.status} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium tabular-nums text-primary">
              Score {lead.lead_score}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
              {sla.label}
            </span>
            {quote.value != null && (
              <span className="rounded-md bg-success/10 px-2 py-0.5 font-medium text-success">
                {formatCompactHKD(quote.value)}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Next action</p>
            <p className="mt-1 font-medium">{nextAction}</p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <p className="font-medium">{lead.contact_name ?? "No contact name"}</p>
            {lead.contact_email && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {lead.contact_email}
              </p>
            )}
            {lead.contact_phone && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {lead.contact_phone}
              </p>
            )}
          </div>
          {lead.enquiry_text && (
            <>
              <Separator />
              <blockquote className="line-clamp-4 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
                {lead.enquiry_text}
              </blockquote>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/leads/$id" params={{ id: lead.id }}>
                Open lead
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={taskPending}
              onClick={() => onCreateTask(lead)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {taskPending ? "Creating…" : "Task"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AiSalesDesk
        lead={lead}
        approvals={approvals}
        agentRuns={agentRuns}
        pending={pendingAiLeadId === lead.id}
        onQualify={() => onQualify(lead)}
        onDraftReply={() => onDraftReply(lead)}
        onDraftQuote={() => onDraftQuote(lead)}
      />

      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">Open follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {openTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">No open tasks for this lead.</p>
          )}
          {openTasks.map((task) => (
            <div key={task.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{task.title}</p>
                <StatusBadge value={task.priority} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                {task.due_date ? formatDate(task.due_date) : "No due date"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <LeadTimelineSummaryCard leadId={lead.id} />

      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">Recent timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {logs.map((log) => (
            <div key={log.id} className="text-sm">
              <p className="font-medium">{log.actor_name ?? log.actor_type ?? "System"}</p>
              <p className="text-muted-foreground">{log.action}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </aside>
  );
}

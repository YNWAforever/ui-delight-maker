import { AlertTriangle, Bot, Clock, FileText, User } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatCompactHKD } from "@/lib/format";
import {
  getLeadAiState,
  getLeadNextAction,
  getLeadQuoteSummary,
  getLeadSlaState,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import { userById } from "@/lib/users";
import type { AgentRun, HumanApproval, Lead, Quote, Task } from "@/lib/types";

interface LeadCardProps {
  lead: Lead;
  tasks: Task[];
  quotes: Quote[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  selected: boolean;
  onSelect: (lead: Lead) => void;
}

const SLA_STYLES = {
  overdue: "border-destructive/40 bg-destructive/5 text-destructive",
  due_today: "border-warning/40 bg-warning/10 text-warning-foreground",
  clear: "border-border bg-muted/40 text-muted-foreground",
};

const AI_STYLES = {
  running: "bg-info/10 text-info",
  ready_for_review: "bg-info/10 text-info",
  approved: "bg-success/10 text-success",
  sent: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  idle: "bg-muted text-muted-foreground",
};

export function LeadCard({
  lead,
  tasks,
  quotes,
  approvals,
  agentRuns,
  selected,
  onSelect,
}: LeadCardProps) {
  const sla = getLeadSlaState(lead, tasks);
  const ai = getLeadAiState(lead, approvals, agentRuns);
  const quote = getLeadQuoteSummary(lead, quotes);
  const nextAction = getLeadNextAction(lead, tasks);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelect(lead)}
      className={cn(
        "h-auto w-full justify-start rounded-md border bg-card p-3 text-left shadow-none transition-colors hover:bg-muted/50",
        selected && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{lead.company_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {lead.contact_name ?? "No contact"}
              {lead.source ? ` / ${lead.source}` : ""}
            </p>
          </div>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {lead.lead_score}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
              SLA_STYLES[sla.state],
            )}
          >
            {sla.state === "overdue" ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            {sla.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              AI_STYLES[ai.state],
            )}
          >
            <Bot className="h-3 w-3" />
            {ai.label}
          </span>
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">{nextAction}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {lead.assigned_to
                ? (userById(lead.assigned_to)?.name ?? lead.assigned_to)
                : "Unassigned"}
            </span>
          </span>
          {quote.value != null && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <FileText className="h-3 w-3" />
              {formatCompactHKD(quote.value)}
            </span>
          )}
        </div>

        <StatusBadge value={lead.status} />
      </div>
    </Button>
  );
}

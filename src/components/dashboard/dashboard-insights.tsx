import { LeadPreviewPanel } from "@/components/pipeline/lead-preview-panel";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import type {
  ActivityLog,
  AgentRun,
  HumanApproval,
  Lead,
  LeadStatus,
  Quote,
  Task,
} from "@/lib/types";

/**
 * The board and the preview panel, side by side.
 *
 * The three `pending*LeadId` props are the in-flight channel for the writes this pair
 * fires. They are ids rather than booleans because both surfaces show many leads at once,
 * and a single boolean would grey out every row's control while one lead was being moved.
 */
type DashboardInsightsProps = {
  leads: Lead[];
  tasks: Task[];
  quotes: Quote[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  activityLogs: ActivityLog[];
  selectedLead: Lead | null;
  onSelectLead: (lead: Lead) => void;
  onMoveLead: (lead: Lead, status: LeadStatus) => void;
  onQualify: (lead: Lead) => void;
  onDraftReply: (lead: Lead) => void;
  onDraftQuote: (lead: Lead) => void;
  onCreateTask: (lead: Lead) => void;
  pendingMoveLeadId?: string | null;
  pendingAiLeadId?: string | null;
  pendingTaskLeadId?: string | null;
};

export function DashboardInsights({
  leads,
  tasks,
  quotes,
  approvals,
  agentRuns,
  activityLogs,
  selectedLead,
  onSelectLead,
  onMoveLead,
  onQualify,
  onDraftReply,
  onDraftQuote,
  onCreateTask,
  pendingMoveLeadId = null,
  pendingAiLeadId = null,
  pendingTaskLeadId = null,
}: DashboardInsightsProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 overflow-hidden">
        <PipelineBoard
          leads={leads}
          tasks={tasks}
          quotes={quotes}
          approvals={approvals}
          agentRuns={agentRuns}
          selectedLeadId={selectedLead?.id ?? null}
          onSelectLead={onSelectLead}
          onMoveLead={onMoveLead}
          pendingMoveLeadId={pendingMoveLeadId}
        />
      </div>
      <LeadPreviewPanel
        lead={selectedLead}
        tasks={tasks}
        quotes={quotes}
        approvals={approvals}
        agentRuns={agentRuns}
        activityLogs={activityLogs}
        onQualify={onQualify}
        onDraftReply={onDraftReply}
        onDraftQuote={onDraftQuote}
        onCreateTask={onCreateTask}
        pendingAiLeadId={pendingAiLeadId}
        pendingTaskLeadId={pendingTaskLeadId}
      />
    </div>
  );
}

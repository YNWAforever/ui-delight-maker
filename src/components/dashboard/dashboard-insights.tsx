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
  onSummarize: (lead: Lead) => void;
  onCreateTask: (lead: Lead) => void;
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
  onSummarize,
  onCreateTask,
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
        onSummarize={onSummarize}
        onCreateTask={onCreateTask}
      />
    </div>
  );
}

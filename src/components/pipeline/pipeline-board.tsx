import { EmptyState } from "@/components/empty-state";
import { LeadCard } from "@/components/pipeline/lead-card";
import { LEAD_PIPELINE_STAGES, groupLeadsByPipelineStage } from "@/lib/pipeline";
import type { AgentRun, HumanApproval, Lead, LeadStatus, Quote, Task } from "@/lib/types";

interface PipelineBoardProps {
  leads: Lead[];
  tasks: Task[];
  quotes: Quote[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  selectedLeadId: string | null;
  onSelectLead: (lead: Lead) => void;
  onMoveLead: (lead: Lead, status: LeadStatus) => void;
  /** The lead whose stage write is in flight. Its select is frozen until the write settles. */
  pendingMoveLeadId?: string | null;
}

/**
 * Every value `leads.status` can hold, so the select always has an option matching the
 * lead it is rendered for. `approved` used to be missing, which meant an approved lead's
 * select fell back to displaying the first entry ("Move to New") — the control reported a
 * stage the record was not in.
 */
const MOVE_OPTIONS: Array<{ label: string; status: LeadStatus }> = [
  { label: "New", status: "new" },
  { label: "Qualified", status: "qualified" },
  { label: "Follow-up", status: "replied" },
  { label: "Quoted", status: "quoted" },
  { label: "Approved", status: "approved" },
  { label: "Won", status: "won" },
  { label: "Lost", status: "lost" },
];

export function PipelineBoard({
  leads,
  tasks,
  quotes,
  approvals,
  agentRuns,
  selectedLeadId,
  onSelectLead,
  onMoveLead,
  pendingMoveLeadId = null,
}: PipelineBoardProps) {
  const grouped = groupLeadsByPipelineStage(leads);

  if (leads.length === 0) {
    return (
      <EmptyState
        title="No leads in this view"
        description="Create a lead or clear filters to bring pipeline work back into view."
      />
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto pb-3">
      <div className="grid min-w-[1040px] grid-cols-5 gap-3">
        {LEAD_PIPELINE_STAGES.map((stage) => {
          const stageLeads = grouped[stage.id];

          return (
            <section
              key={stage.id}
              className="flex min-h-[480px] flex-col rounded-md border border-border bg-muted/30"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <h2 className="text-sm font-semibold">{stage.label}</h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {stageLeads.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {stageLeads.map((lead) => (
                  <div key={lead.id} className="relative space-y-1">
                    <LeadCard
                      lead={lead}
                      tasks={tasks}
                      quotes={quotes}
                      approvals={approvals}
                      agentRuns={agentRuns}
                      selected={lead.id === selectedLeadId}
                      onSelect={onSelectLead}
                    />
                    <label className="sr-only" htmlFor={`move-${lead.id}`}>
                      Move {lead.company_name}
                    </label>
                    <select
                      id={`move-${lead.id}`}
                      value={lead.status}
                      disabled={pendingMoveLeadId === lead.id}
                      onChange={(event) => onMoveLead(lead, event.target.value as LeadStatus)}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {MOVE_OPTIONS.map((option) => (
                        <option key={option.status} value={option.status}>
                          Move to {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                {stageLeads.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-background/70 p-4 text-center text-xs text-muted-foreground">
                    No leads in {stage.label.toLowerCase()}.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

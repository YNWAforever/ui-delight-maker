import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CheckCircle2, Clock, Flame, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { MetricCard } from "@/components/metric-card";
import { LeadPreviewPanel } from "@/components/pipeline/lead-preview-panel";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { PipelineToolbar } from "@/components/pipeline/pipeline-toolbar";
import { StageMoveDialog } from "@/components/pipeline/stage-move-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { filterPipelineLeads, getPipelineSummary } from "@/lib/pipeline";
import type { PipelineFilters } from "@/lib/pipeline";
import type { ActivityLog, Lead, LeadStatus } from "@/lib/types";
import { APP_USERS } from "@/lib/users";
import { getActivityLogs } from "@/server-functions/agent-runs";
import { moveLeadStage, triggerLeadAgent, triggerLeadReplyDraft } from "@/server-functions/leads";
import { getPipelineData } from "@/server-functions/pipeline";
import { triggerQuoteAgent } from "@/server-functions/quotes";
import { createTask } from "@/server-functions/tasks";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [pipeline, activityLogs] = await Promise.all([getPipelineData(), getActivityLogs({})]);
    return { ...pipeline, activityLogs };
  },
  head: () => ({
    meta: [
      { title: "Pipeline - Fimmick ClientOps" },
      {
        name: "description",
        content: "Lead pipeline command center with AI-assisted follow-up.",
      },
    ],
  }),
  component: PipelineCommandCenter,
});

const TODAY = "2026-06-28";

function PipelineCommandCenter() {
  const { leads, quotes, tasks, approvals, agentRuns, activityLogs } = Route.useLoaderData();
  const router = useRouter();
  const [filters, setFilters] = useState<PipelineFilters>({
    search: "",
    source: "all",
    owner: "all",
    urgency: "all",
    aiState: "all",
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leads[0]?.id ?? null);
  const [moveDialog, setMoveDialog] = useState<{ lead: Lead; status: LeadStatus } | null>(null);
  const [moveReason, setMoveReason] = useState("");

  const filteredLeads = useMemo(
    () =>
      filterPipelineLeads({
        leads,
        tasks,
        approvals,
        agentRuns,
        filters,
        today: TODAY,
      }),
    [agentRuns, approvals, filters, leads, tasks],
  );

  const selectedLead =
    filteredLeads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? null;
  const summary = getPipelineSummary({ leads: filteredLeads, tasks, approvals, today: TODAY });

  const confirmMove = async () => {
    if (!moveDialog) return;

    await moveLeadStage({
      data: {
        id: moveDialog.lead.id,
        status: moveDialog.status,
        reason: moveReason.trim(),
      },
    });

    toast.success(
      `${moveDialog.lead.company_name} moved to ${moveDialog.status.replace(/_/g, " ")}`,
    );
    setSelectedLeadId(moveDialog.lead.id);
    setMoveDialog(null);
    setMoveReason("");
    router.invalidate();
  };

  const moveLead = async (lead: Lead, status: LeadStatus) => {
    if (status === "won" || status === "lost") {
      setMoveDialog({ lead, status });
      return;
    }

    await moveLeadStage({ data: { id: lead.id, status } });
    toast.success(`${lead.company_name} moved to ${status.replace(/_/g, " ")}`);
    setSelectedLeadId(lead.id);
    router.invalidate();
  };

  const qualifyLead = async (lead: Lead) => {
    try {
      const result = await triggerLeadAgent({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Qualification is already running");
        return;
      }
      if (result.reason === "missing_webhook") {
        toast.error("Qualification webhook is not configured");
        return;
      }
      toast.success("Qualification agent queued");
      router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow request failed");
    }
  };

  const draftReply = async (lead: Lead) => {
    try {
      const result = await triggerLeadReplyDraft({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Reply draft is already running");
        return;
      }
      if (result.reason === "missing_webhook") {
        toast.error("Reply draft webhook is not configured");
        return;
      }
      toast.success("Reply draft agent queued");
      router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow request failed");
    }
  };

  const draftQuote = async (lead: Lead) => {
    try {
      const result = await triggerQuoteAgent({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Quote draft is already running");
        return;
      }
      if (result.reason === "missing_webhook") {
        toast.error("Quote draft webhook is not configured");
        return;
      }
      toast.success("Quote agent queued");
      router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow request failed");
    }
  };

  const summarizeTimeline = (lead: Lead) => {
    toast.message(`Timeline summary is not connected yet for ${lead.company_name}.`);
  };

  const createFollowUpTask = async (lead: Lead) => {
    await createTask({
      data: {
        lead_id: lead.id,
        title: `Follow up with ${lead.company_name}`,
        priority: "medium",
        due_date: TODAY,
      },
    });
    toast.success("Follow-up task created");
    router.invalidate();
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Lead follow-up command center with AI-prepared next actions."
        actions={
          <Button size="sm" asChild>
            <Link to="/leads">
              <Plus className="mr-2 h-4 w-4" />
              New lead
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Overdue"
            value={summary.overdue}
            icon={Flame}
            hint="follow-ups past due"
          />
          <MetricCard
            label="Due today"
            value={summary.dueToday}
            icon={Clock}
            hint="needs action today"
          />
          <MetricCard
            label="High score"
            value={summary.highScore}
            icon={CheckCircle2}
            hint="score 75+"
          />
          <MetricCard
            label="Pending approval"
            value={summary.pendingApproval}
            icon={ShieldCheck}
            hint="AI work to review"
          />
        </div>

        <PipelineToolbar
          filters={filters}
          owners={APP_USERS.map((user) => ({ id: user.id, name: user.name }))}
          onFiltersChange={setFilters}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <PipelineBoard
            leads={filteredLeads}
            tasks={tasks}
            quotes={quotes}
            approvals={approvals}
            agentRuns={agentRuns}
            selectedLeadId={selectedLead?.id ?? null}
            onSelectLead={(lead) => setSelectedLeadId(lead.id)}
            onMoveLead={moveLead}
          />
          <LeadPreviewPanel
            lead={selectedLead}
            tasks={tasks}
            quotes={quotes}
            approvals={approvals}
            agentRuns={agentRuns}
            activityLogs={activityLogs as ActivityLog[]}
            onQualify={qualifyLead}
            onDraftReply={draftReply}
            onDraftQuote={draftQuote}
            onSummarize={summarizeTimeline}
            onCreateTask={createFollowUpTask}
          />
        </div>
      </div>

      <StageMoveDialog
        lead={moveDialog?.lead ?? null}
        nextStatus={moveDialog?.status ?? null}
        reason={moveReason}
        onReasonChange={setMoveReason}
        onCancel={() => {
          setMoveDialog(null);
          setMoveReason("");
        }}
        onConfirm={confirmMove}
      />
    </>
  );
}

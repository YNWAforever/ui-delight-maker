import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock, Flame, Plus, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";

import { LeadPreviewPanel } from "@/components/pipeline/lead-preview-panel";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { PipelineToolbar } from "@/components/pipeline/pipeline-toolbar";
import { StageMoveDialog } from "@/components/pipeline/stage-move-dialog";
import { WonConversionDialog } from "@/components/pipeline/won-conversion-dialog";
import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { formatCompactHKD } from "@/lib/format";
import { getBusinessDateKey } from "@/lib/business-date";
import { filterPipelineLeads, getPipelineSummary } from "@/lib/pipeline";
import { buildRevenueActions } from "@/lib/sales-workspace";
import {
  pipelineFiltersFromSearch,
  pipelineSearchFromFilters,
  revenueDeskSearchSchema,
} from "@/lib/admin-ux-search";
import type { ActivityLog, Lead, LeadStatus } from "@/lib/types";
import { APP_USERS } from "@/lib/users";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getDashboardRead } from "@/server-functions/dashboard";
import { moveLeadStage, triggerLeadAgent, triggerLeadReplyDraft } from "@/server-functions/leads";
import { triggerQuoteAgent } from "@/server-functions/quotes";
import { createTask } from "@/server-functions/tasks";

const DashboardInsights = lazy(() =>
  import("@/components/dashboard/dashboard-insights").then((module) => ({
    default: module.DashboardInsights,
  })),
);

export const Route = createFileRoute("/")({
  validateSearch: revenueDeskSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.dashboard(),
        queryFn: () => getDashboardRead(),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Revenue Desk - Fimmick ClientOps" },
      {
        name: "description",
        content:
          "Daily sales operating desk for actions, pipeline, approvals, and account context.",
      },
    ],
  }),
  component: PipelineCommandCenter,
});

function PipelineCommandCenter() {
  const { leads, quotes, tasks, approvals, agentRuns, activityLogs, products } =
    Route.useLoaderData();
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = getBusinessDateKey();
  const filters = useMemo(() => pipelineFiltersFromSearch(search), [search]);
  const [moveDialog, setMoveDialog] = useState<{ lead: Lead; status: LeadStatus } | null>(null);
  const [moveReason, setMoveReason] = useState("");
  const [wonLead, setWonLead] = useState<Lead | null>(null);

  const refreshDashboard = async (...queryKeys: ReadonlyArray<readonly unknown[]>) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.dashboard(), exact: true }),
      ...queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ]);
    await router.invalidate({ filter: (match) => match.routeId === "/" });
  };

  const filteredLeads = useMemo(
    () =>
      filterPipelineLeads({
        leads,
        tasks,
        approvals,
        agentRuns,
        filters,
        today,
      }),
    [agentRuns, approvals, filters, leads, tasks, today],
  );

  const selectedLead =
    filteredLeads.find((lead) => lead.id === search.lead) ?? filteredLeads[0] ?? null;
  const summary = getPipelineSummary({ leads: filteredLeads, tasks, approvals, today });
  const revenueActions = buildRevenueActions({
    leads,
    tasks,
    quotes,
    approvals,
    agentRuns,
    today,
  });

  const quoteValue = quotes
    .filter((quote) => ["pending_approval", "sent", "viewed"].includes(quote.status))
    .reduce((sum, quote) => sum + (quote.total_value ?? 0), 0);

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

    if (moveDialog.status === "won") {
      setWonLead(moveDialog.lead);
    }

    navigate({ search: (current) => ({ ...current, lead: moveDialog.lead.id }) });
    setMoveDialog(null);
    setMoveReason("");
    await refreshDashboard(crmQueryKeys.leads.all());
  };

  const moveLead = async (lead: Lead, status: LeadStatus) => {
    if (status === "won" || status === "lost") {
      setMoveDialog({ lead, status });
      return;
    }

    await moveLeadStage({ data: { id: lead.id, status } });
    toast.success(`${lead.company_name} moved to ${status.replace(/_/g, " ")}`);
    navigate({ search: (current) => ({ ...current, lead: lead.id }) });
    await refreshDashboard(crmQueryKeys.leads.all());
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
      await refreshDashboard(crmQueryKeys.leads.all());
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
      await refreshDashboard(crmQueryKeys.leads.all());
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
      await refreshDashboard(crmQueryKeys.leads.all(), crmQueryKeys.quotes.lists());
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
        due_date: today,
      },
    });
    toast.success("Follow-up task created");
    await refreshDashboard(crmQueryKeys.tasks.lists(), crmQueryKeys.leads.detail(lead.id));
  };

  const openRevenueAction = (href: string) => {
    if (href.startsWith("/leads/")) {
      navigate({ to: "/leads/$id", params: { id: href.slice("/leads/".length) } });
      return;
    }

    if (href.startsWith("/clients/")) {
      navigate({ to: "/clients/$id", params: { id: href.slice("/clients/".length) } });
      return;
    }

    if (href === "/approvals") {
      navigate({ to: "/approvals" });
      return;
    }

    if (href === "/tasks") {
      navigate({ to: "/tasks" });
    }
  };

  return (
    <>
      <CommandHeader
        title="Revenue Desk"
        status="Today"
        description={`${revenueActions.length} revenue actions need attention. Prioritized by SLA, lead score, quote value, and approval risk.`}
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
        <MetricStrip
          metrics={[
            { label: "Overdue", value: summary.overdue, icon: Flame, hint: "follow-ups past due" },
            {
              label: "Due today",
              value: summary.dueToday,
              icon: Clock,
              hint: "needs action today",
            },
            { label: "Hot leads", value: summary.highScore, icon: Target, hint: "score 75+" },
            {
              label: "Quote value",
              value: formatCompactHKD(quoteValue),
              icon: ShieldCheck,
              hint: "pending + sent + viewed",
            },
          ]}
        />

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Today queue</h2>
              <p className="text-xs text-muted-foreground">
                Fastest safe next steps across revenue work.
              </p>
            </div>
            <div className="divide-y divide-border">
              {revenueActions.length === 0 ? (
                <div className="p-4">
                  <WorkSurfaceEmpty
                    title="No urgent revenue actions"
                    description="New leads, approvals, and overdue tasks will appear here."
                    action={
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/leads">Review leads</Link>
                      </Button>
                    }
                  />
                </div>
              ) : (
                revenueActions.slice(0, 6).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    onClick={() => openRevenueAction(action.href)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{action.title}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {action.accountName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="min-w-0 space-y-4">
            <PipelineToolbar
              filters={filters}
              owners={APP_USERS.map((user) => ({ id: user.id, name: user.name }))}
              onFiltersChange={(nextFilters) =>
                navigate({
                  search: (current) => {
                    const nextSearch = { ...current };
                    delete nextSearch.q;
                    delete nextSearch.source;
                    delete nextSearch.owner;
                    delete nextSearch.urgency;
                    delete nextSearch.ai;
                    return { ...nextSearch, ...pipelineSearchFromFilters(nextFilters) };
                  },
                  replace: true,
                })
              }
            />
          </section>
        </div>

        <Suspense fallback={<DashboardInsightsSkeleton />}>
          <DashboardInsights
            leads={filteredLeads}
            tasks={tasks}
            quotes={quotes}
            approvals={approvals}
            agentRuns={agentRuns}
            activityLogs={activityLogs as ActivityLog[]}
            selectedLead={selectedLead}
            onSelectLead={(lead) =>
              navigate({ search: (current) => ({ ...current, lead: lead.id }) })
            }
            onMoveLead={moveLead}
            onQualify={qualifyLead}
            onDraftReply={draftReply}
            onDraftQuote={draftQuote}
            onSummarize={summarizeTimeline}
            onCreateTask={createFollowUpTask}
          />
        </Suspense>
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

      <WonConversionDialog
        lead={wonLead}
        products={products}
        matchingQuote={quotes.find((q) => q.lead_id === wonLead?.id) ?? null}
        onClose={() => setWonLead(null)}
        onDone={() => setWonLead(null)}
      />
    </>
  );
}

function DashboardInsightsSkeleton() {
  return (
    <div
      className="min-h-[480px] animate-pulse rounded-md border border-border bg-muted/30"
      aria-label="Loading pipeline insights"
    />
  );
}

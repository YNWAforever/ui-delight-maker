import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock, Flame, Plus, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";

import { PipelineToolbar } from "@/components/pipeline/pipeline-toolbar";
import { StageMoveDialog } from "@/components/pipeline/stage-move-dialog";
import { WonConversionDialog } from "@/components/pipeline/won-conversion-dialog";
import {
  EmptyWorkspaceState,
  MetricStrip,
  SectionHeader,
  WorkspaceHeader,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { formatCompactHKD, formatCount } from "@/lib/format";
import { getBusinessDateKey } from "@/lib/business-date";
import { describeTriggerFailure, toSafeErrorMessage } from "@/lib/errors";
import { filterPipelineLeads, getPipelineSummary } from "@/lib/pipeline";
import { getStatusLabel } from "@/lib/status-labels";
import { buildRevenueActions } from "@/lib/sales-workspace";
import {
  pipelineFiltersFromSearch,
  pipelineSearchFromFilters,
  revenueDeskSearchSchema,
} from "@/lib/admin-ux-search";
import type { ActivityLog, Lead, LeadStatus } from "@/lib/types";
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
  /**
   * No `loaderDeps`. There used to be one — `({ search }) => ({ search })` — and the loader
   * signature was `({ context })`, so the deps were computed and thrown away on every
   * navigation. `getDashboardRead` takes no arguments and the query key is the constant
   * `crmQueryKeys.dashboard()`, so re-running the loader on a filter change would fetch the
   * same 40 rows again. The filters are honest about being in-view filters instead; see the
   * caption under the toolbar.
   */
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
  const { leads, quotes, tasks, approvals, agentRuns, activityLogs, products, pipelineTotals } =
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

  /**
   * In-flight writes, held as the id of the lead being written rather than a boolean.
   *
   * The board shows every lead at once, so one boolean would freeze all forty controls
   * while a single lead was moving. Each of these three writes was previously re-fireable
   * mid-flight: a second stage move raced the first, and a second "Task" click created a
   * second identical follow-up task.
   */
  const [pendingMoveLeadId, setPendingMoveLeadId] = useState<string | null>(null);
  const [pendingAiLeadId, setPendingAiLeadId] = useState<string | null>(null);
  const [pendingTaskLeadId, setPendingTaskLeadId] = useState<string | null>(null);
  const [stageMoveSubmitting, setStageMoveSubmitting] = useState(false);

  /**
   * This component reads `Route.useLoaderData()` and subscribes to no query, so
   * `invalidateQueries` alone would repaint nothing. The scoped `router.invalidate` is what
   * actually re-runs this route's loader; the cache invalidations keep sibling routes honest.
   */
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

  const stageLabel = (status: LeadStatus) => getStatusLabel("leads", status).label;

  const confirmMove = async () => {
    if (!moveDialog || stageMoveSubmitting) return;
    const { lead, status } = moveDialog;

    setStageMoveSubmitting(true);
    try {
      await moveLeadStage({
        data: { id: lead.id, status, reason: moveReason.trim() },
      });
    } catch (error) {
      // Deliberately leaves the dialog open with the reason still typed, so the move can be
      // retried. Before this, Radix closed the dialog on click and a failure was invisible.
      setStageMoveSubmitting(false);
      toast.error(toSafeErrorMessage(error));
      return;
    }

    setStageMoveSubmitting(false);
    toast.success(`${lead.company_name} moved to ${stageLabel(status)}`);
    setMoveDialog(null);
    setMoveReason("");
    if (status === "won") setWonLead(lead);
    navigate({ search: (current) => ({ ...current, lead: lead.id }) });
    await refreshDashboard(crmQueryKeys.leads.all());
  };

  const moveLead = async (lead: Lead, status: LeadStatus) => {
    if (status === "won" || status === "lost") {
      setMoveDialog({ lead, status });
      return;
    }
    if (pendingMoveLeadId) return;

    setPendingMoveLeadId(lead.id);
    try {
      await moveLeadStage({ data: { id: lead.id, status } });
      toast.success(`${lead.company_name} moved to ${stageLabel(status)}`);
      navigate({ search: (current) => ({ ...current, lead: lead.id }) });
      await refreshDashboard(crmQueryKeys.leads.all());
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setPendingMoveLeadId(null);
    }
  };

  const qualifyLead = async (lead: Lead) => {
    if (pendingAiLeadId) return;
    setPendingAiLeadId(lead.id);
    try {
      const result = await triggerLeadAgent({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Qualification is already running");
        return;
      }
      const failure = describeTriggerFailure(result);
      if (failure) {
        toast.error(failure);
        return;
      }
      toast.success("Qualification agent queued");
      await refreshDashboard(crmQueryKeys.leads.all());
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setPendingAiLeadId(null);
    }
  };

  const draftReply = async (lead: Lead) => {
    if (pendingAiLeadId) return;
    setPendingAiLeadId(lead.id);
    try {
      const result = await triggerLeadReplyDraft({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Reply draft is already running");
        return;
      }
      const failure = describeTriggerFailure(result);
      if (failure) {
        toast.error(failure);
        return;
      }
      toast.success("Reply draft agent queued");
      await refreshDashboard(crmQueryKeys.leads.all());
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setPendingAiLeadId(null);
    }
  };

  const draftQuote = async (lead: Lead) => {
    if (pendingAiLeadId) return;
    setPendingAiLeadId(lead.id);
    try {
      const result = await triggerQuoteAgent({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Quote draft is already running");
        return;
      }
      const failure = describeTriggerFailure(result);
      if (failure) {
        toast.error(failure);
        return;
      }
      toast.success("Quote agent queued");
      await refreshDashboard(crmQueryKeys.leads.all(), crmQueryKeys.quotes.lists());
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setPendingAiLeadId(null);
    }
  };

  const createFollowUpTask = async (lead: Lead) => {
    if (pendingTaskLeadId) return;
    setPendingTaskLeadId(lead.id);
    try {
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
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setPendingTaskLeadId(null);
    }
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
      <WorkspaceHeader
        context="Today"
        title="Revenue Desk"
        description={
          revenueActions.length === 0
            ? "Nothing is overdue, waiting on approval, or scoring hot right now."
            : `The ${formatCount(revenueActions.length)} highest-priority revenue actions, ranked by SLA, lead score, quote value and approval risk.`
        }
        primaryAction={
          <Button size="sm" asChild>
            <Link to="/leads">
              <Plus className="mr-2 h-4 w-4" />
              New lead
            </Link>
          </Button>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              label: "Overdue",
              value: summary.overdue,
              icon: Flame,
              tone: summary.overdue > 0 ? "destructive" : "neutral",
              hint: "follow-ups past due on this board",
            },
            {
              label: "Due today",
              value: summary.dueToday,
              icon: Clock,
              hint: "needs action today on this board",
            },
            {
              label: "Hot leads",
              value: summary.highScore,
              icon: Target,
              hint: "score 75+ on this board",
            },
            {
              // The server aggregate, not a sum of the loaded page: `pipelineTotals` counts
              // every pending/sent/viewed quote, so this tile is a workspace figure and the
              // three beside it are explicitly board-scoped.
              label: "Quote value",
              value: formatCompactHKD(pipelineTotals.activeQuoteValue),
              icon: ShieldCheck,
              hint: "pending + sent + viewed, all quotes",
            },
          ]}
          supporting={[
            { id: "open-leads", label: "Open leads", value: formatCount(pipelineTotals.openLeads) },
            { id: "open-tasks", label: "Open tasks", value: formatCount(pipelineTotals.openTasks) },
            {
              id: "pending-approvals",
              label: "Waiting approval",
              value: formatCount(pipelineTotals.pendingApprovals),
              tone: pipelineTotals.pendingApprovals > 0 ? "warning" : "neutral",
            },
          ]}
        />

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3">
            <SectionHeader
              title="Today queue"
              description="Fastest safe next steps across revenue work."
            />
            {revenueActions.length === 0 ? (
              <EmptyWorkspaceState
                title="No urgent revenue actions"
                description="New leads, approvals, and overdue tasks will appear here."
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/leads">Review leads</Link>
                  </Button>
                }
              />
            ) : (
              /*
                Every action renders. The list used to `slice(0, 6)` while the header
                announced the full count, so up to half the queue was unreachable and the
                number above it was a claim about rows nobody could see.
              */
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {revenueActions.map((action) => (
                  <li key={action.id}>
                    <button
                      type="button"
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0 space-y-2">
            <PipelineToolbar
              filters={filters}
              /*
                No owner options. They used to come from `APP_USERS`, five hardcoded fixture
                ids that match no `profiles` row, so choosing any of them filtered the board
                to empty. The toolbar disables the control and says why until a real
                assignable-owners read exists.
              */
              owners={[]}
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
            <p className="text-xs text-muted-foreground">
              These filters narrow the {formatCount(leads.length)} open leads loaded on this board,
              out of {formatCount(pipelineTotals.openLeads)} open in total. Use{" "}
              <Link to="/leads" className="underline hover:text-foreground">
                Leads
              </Link>{" "}
              to search every lead.
            </p>
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
            onCreateTask={createFollowUpTask}
            pendingMoveLeadId={pendingMoveLeadId}
            pendingAiLeadId={pendingAiLeadId}
            pendingTaskLeadId={pendingTaskLeadId}
          />
        </Suspense>
      </div>

      <StageMoveDialog
        lead={moveDialog?.lead ?? null}
        nextStatus={moveDialog?.status ?? null}
        reason={moveReason}
        submitting={stageMoveSubmitting}
        onReasonChange={setMoveReason}
        onCancel={() => {
          setMoveDialog(null);
          setMoveReason("");
        }}
        onConfirm={() => void confirmMove()}
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

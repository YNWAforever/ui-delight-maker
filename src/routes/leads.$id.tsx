import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Bot, FileText, Mail, Phone, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  ActivityTimeline,
  ErrorState,
  SectionHeader,
  WorkspaceHeader,
  type ActivityEvent,
} from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { leadDetailSearchSchema } from "@/lib/admin-ux-search";
import { describeTriggerFailure, toSafeErrorMessage } from "@/lib/errors";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { getStatusLabel } from "@/lib/status-labels";
import type { LeadStatus } from "@/lib/types";
import { triggerLeadAgent, updateLead } from "@/server-functions/leads";
import { triggerQuoteAgent } from "@/server-functions/quotes";
import { crmQueryKeys } from "@/lib/query-keys";
import { normalizeQualificationData } from "@/lib/workflows/qualification";
import { getLeadWorkspaceRead } from "@/server-functions/relationship-workspaces";

export const Route = createFileRoute("/leads/$id")({
  validateSearch: leadDetailSearchSchema,
  loader: ({ params }) => getLeadWorkspaceRead({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.lead.company_name ?? "Lead"} — ClientOps` },
      {
        name: "description",
        content: `Lead profile for ${loaderData?.lead.company_name}, with qualification data and activity.`,
      },
    ],
  }),
  errorComponent: ({ error, reset }) => <LeadWorkspaceError error={error} reset={reset} />,
  notFoundComponent: () => (
    <div className="px-4 py-10 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Lead not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been merged, converted or deleted.
      </p>
      <Link to="/leads" className="mt-3 inline-block text-sm text-primary hover:underline">
        ← Back to leads
      </Link>
    </div>
  ),
  component: LeadDetail,
});

/**
 * The loader calls `getLeadWorkspaceRead` directly, so anything the capability check or the
 * Neon driver throws lands here. It used to render `{error.message}` into the page body —
 * a validator's "ID is required" and a Postgres error quoting the failing SQL looked the
 * same, and both reached the user verbatim. The raw text now goes to the console only.
 */
function LeadWorkspaceError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error("Lead workspace failed to load", error);
  }, [error]);

  return (
    <div className="space-y-4 px-4 py-10 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This lead did not load"
        onRetry={() => {
          reset();
          // Scoped, never bare: a whole-router invalidate refetches every mounted loader.
          void router.invalidate({ filter: (match) => match.routeId === "/leads/$id" });
        }}
      />
      <p className="text-center text-xs text-muted-foreground">
        <Link to="/leads" className="text-primary hover:underline">
          ← Back to all leads
        </Link>
      </p>
    </div>
  );
}

const STATUSES: LeadStatus[] = ["new", "qualified", "replied", "quoted", "approved", "won", "lost"];

/**
 * Every mutation on this page names the keys it invalidates.
 *
 * `agent_run` and `quote_agent_run` are new: both AI triggers used to invalidate nothing at
 * all, so the only thing that eventually showed the queued run was the 12s poll. The page
 * renders `workspaceQuery.data` rather than loader data, so `invalidateQueries` on these
 * narrow keys really does repaint it — no `router.invalidate` is needed here.
 */
const leadMutationQueryKeys = {
  status_change: (leadId: string) => [
    crmQueryKeys.leads.detail(leadId),
    crmQueryKeys.leads.lists(),
  ],
  agent_run: (leadId: string) => [crmQueryKeys.leads.detail(leadId)],
  quote_agent_run: (leadId: string) => [
    crmQueryKeys.leads.detail(leadId),
    crmQueryKeys.quotes.lists(),
  ],
} as const;

async function invalidateLeadMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  leadId: string,
  mutation: keyof typeof leadMutationQueryKeys,
) {
  await Promise.all(
    leadMutationQueryKeys[mutation](leadId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

function LeadDetail() {
  const initialRead = Route.useLoaderData();
  const leadId = initialRead.lead.id;
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: crmQueryKeys.leads.detail(leadId),
    queryFn: () => getLeadWorkspaceRead({ data: { id: leadId } }),
    initialData: initialRead,
    staleTime: 30_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
  });
  const { lead, activityLogs, quotes: relatedQuotes } = workspaceQuery.data;
  /**
   * The qualification, coerced to the shape this page renders.
   *
   * `qualification_data` holds free-form agent output. The writeback normalizes on the way in
   * now, but rows written before that still carry whatever the model returned — and the
   * Insights tab reads `.service_interest.map(...)`, so one malformed qualification threw
   * during render and took the whole lead page down instead of degrading a single panel.
   */
  const insights = lead.qualification_data
    ? normalizeQualificationData(lead.qualification_data)
    : null;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [status, setStatus] = useState<LeadStatus>(lead.status);
  useEffect(() => setStatus(lead.status), [lead.status]);

  const [statusSaving, setStatusSaving] = useState(false);
  const [agentPending, setAgentPending] = useState<"qualify" | "quote" | null>(null);

  const handleGenerateQuote = async () => {
    if (agentPending) return;
    setAgentPending("quote");
    try {
      const result = await triggerQuoteAgent({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("A quote draft is already running for this lead.");
        return;
      }
      // The server returns `{ triggered: false, reason: "missing_webhook" }` rather than
      // throwing when N8N_DRAFT_QUOTE_WEBHOOK_URL is unset. This used to toast success
      // regardless, promising a quote that could never arrive.
      const failure = describeTriggerFailure(result);
      if (failure) {
        toast.error(failure);
        return;
      }
      toast.success("Quote agent queued — the draft will appear under Quotes");
      await invalidateLeadMutation(queryClient, lead.id, "quote_agent_run");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setAgentPending(null);
    }
  };

  const handleQualifyLead = async () => {
    if (agentPending) return;
    setAgentPending("qualify");
    try {
      const result = await triggerLeadAgent({ data: { leadId: lead.id } });
      if (result.reason === "already_running") {
        toast.message("Qualification is already running for this lead.");
        return;
      }
      const failure = describeTriggerFailure(result);
      if (failure) {
        toast.error(failure);
        return;
      }
      toast.success("Qualification agent queued");
      await invalidateLeadMutation(queryClient, lead.id, "agent_run");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setAgentPending(null);
    }
  };

  const handleStatusChange = async (nextStatus: LeadStatus) => {
    if (statusSaving || nextStatus === status) return;
    const previousStatus = status;

    // Optimistic, but now with the matching rollback. Without it a rejected write left the
    // Select showing a status the database never took until the 12s poll happened to correct it.
    setStatus(nextStatus);
    setStatusSaving(true);
    try {
      await updateLead({ data: { id: lead.id, updates: { status: nextStatus } } });
      toast.success(`Status updated to ${getStatusLabel("leads", nextStatus).label}`);
      await invalidateLeadMutation(queryClient, lead.id, "status_change");
    } catch (error) {
      setStatus(previousStatus);
      toast.error(toSafeErrorMessage(error));
    } finally {
      setStatusSaving(false);
    }
  };

  const timelineEvents: ActivityEvent[] = activityLogs.map((log) => ({
    id: log.id,
    at: log.created_at,
    kind: log.action,
    title: log.action.replace(/_/g, " "),
    actor: log.actor_name
      ? { name: log.actor_name, isAgent: log.actor_type === "agent" }
      : undefined,
  }));

  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title={lead.company_name}
        description={`${lead.id} · created ${formatDateTime(lead.created_at)}`}
        backHref={{ to: "/leads", label: "All leads" }}
        status={
          workspaceQuery.isError ? (
            <span className="text-xs text-warning-foreground">
              Live updates paused. Showing the last data that loaded.
            </span>
          ) : undefined
        }
        secondaryActions={[
          <Button
            key="refresh"
            variant="outline"
            size="sm"
            disabled={workspaceQuery.isFetching}
            onClick={() => void workspaceQuery.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={`mr-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`}
            />
            {workspaceQuery.isFetching ? "Refreshing…" : "Refresh"}
          </Button>,
        ]}
        primaryAction={
          <Button size="sm" asChild>
            <Link to="/quotes/new" search={{ leadId: lead.id }}>
              <FileText aria-hidden="true" className="mr-2 h-4 w-4" /> New quote
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <Tabs
                value={search.tab ?? "overview"}
                onValueChange={(tab) =>
                  navigate({
                    search: (current) => ({
                      ...current,
                      tab: tab === "overview" ? undefined : (tab as NonNullable<typeof search.tab>),
                    }),
                    replace: true,
                  })
                }
              >
                <div className="max-w-full overflow-x-auto pb-1">
                  {/*
                    Files and Comments are gone. Both were entirely client-side: uploads
                    invented a filename, a size and a `Math.random()` id, the "download"
                    button was a toast with no fetch behind it, and comments were an array
                    seeded empty on every load with a hardcoded 2026-05-20 timestamp. There
                    is no attachments table in any migration and no lead-scoped note write,
                    so neither tab could ever have persisted anything.
                  */}
                  <TabsList className="w-max">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="quotes">Quotes ({relatedQuotes.length})</TabsTrigger>
                    <TabsTrigger value="insights">AI insights</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Enquiry
                    </p>
                    <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed">
                      {lead.enquiry_text}
                    </blockquote>
                  </div>

                  <Separator />

                  <div>
                    <SectionHeader
                      title="Notes"
                      description="Lead notes are not stored yet, so there is nowhere to write one. Agent and user actions are recorded on the Activity tab."
                    />
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-4">
                  <ActivityTimeline
                    events={timelineEvents}
                    groupByDay
                    emptyMessage="No activity recorded for this lead yet."
                  />
                </TabsContent>

                <TabsContent value="quotes" className="mt-4">
                  {relatedQuotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No quotes yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {relatedQuotes.map((q) => (
                        <li key={q.id} className="flex items-center justify-between py-3">
                          <div>
                            <Link
                              to="/quotes/$id"
                              params={{ id: q.id }}
                              className="text-sm font-medium hover:text-primary hover:underline"
                            >
                              {q.number}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {q.lineItemCount} items · valid until {formatDate(q.valid_until)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm tabular-nums">
                              {formatCurrencyAmount(q.total_value, q.currency)}
                            </span>
                            <StatusBadge value={q.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="insights" className="mt-4">
                  {insights ? (
                    <div className="space-y-4 p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Urgency</span>
                          <p className="font-medium tabular-nums">{insights.urgency_score} / 10</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fit</span>
                          <p className="font-medium tabular-nums">{insights.fit_score} / 10</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Budget</span>
                          <p className="font-medium">{insights.budget_range}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Confidence</span>
                          <p className="font-medium tabular-nums">
                            {(insights.confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Score</span>
                          <p className="font-medium tabular-nums">
                            {insights.qualification_score} / 100
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Services of interest</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {insights.service_interest.map((s: string) => (
                            <span
                              key={s}
                              className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      {insights.reason && (
                        <div>
                          <p className="text-sm text-muted-foreground">Reason</p>
                          <p className="text-sm">{insights.reason}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Recommended action</p>
                        <p className="text-sm font-medium">{insights.next_action}</p>
                      </div>
                      {insights.human_review_required && (
                        <p className="rounded-md bg-warning/15 px-2 py-1 text-xs text-warning-foreground">
                          Human review required — confidence below threshold
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                      <Bot className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Qualification agent hasn&apos;t run yet.{" "}
                        {lead.status === "new" &&
                          "Agent will run automatically after lead is created."}
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Select
                  value={status}
                  disabled={statusSaving}
                  onValueChange={(v) => void handleStatusChange(v as LeadStatus)}
                >
                  <SelectTrigger className="mt-1 h-9" aria-label="Lead status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {getStatusLabel("leads", s).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusSaving && (
                  <p className="mt-1 text-xs text-muted-foreground">Saving status…</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Score</span>
                <span className="font-medium tabular-nums">{lead.lead_score}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="capitalize">{lead.source}</span>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p className="mt-1 font-medium">{lead.contact_name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> {lead.contact_email}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" /> {lead.contact_phone}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Owner</p>
                <p className="mt-1">{lead.assigned_to ?? "Unassigned"}</p>
              </div>
            </CardContent>
          </Card>

          {/*
            The two agent triggers live here rather than in the header: WorkspaceHeader
            allows one primary and two secondary actions, and "New quote" (a form) sitting
            next to "Generate Quote" (an agent) was two near-identical labels for two very
            different things.
          */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agent actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                disabled={agentPending !== null}
                onClick={() => void handleQualifyLead()}
              >
                <Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
                {agentPending === "qualify" ? "Queuing…" : "Qualify this lead"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                disabled={agentPending !== null}
                onClick={() => void handleGenerateQuote()}
              >
                <Bot aria-hidden="true" className="mr-2 h-4 w-4" />
                {agentPending === "quote" ? "Queuing…" : "Draft a quote with the agent"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Both hand the lead to an n8n workflow. You will be told if the workflow is not
                connected.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

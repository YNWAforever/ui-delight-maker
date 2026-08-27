import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  BrainCircuit,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { CompanyWorkspaceSectionState } from "@/components/relationship/company-workspace-section-state";
import { StakeholderMap } from "@/components/relationship/stakeholder-map";
import { SummaryRow } from "@/components/summary-row";
import {
  ActivityTimeline,
  AttentionQueue,
  ErrorState,
  LifecycleBadge,
  MetricStrip,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type ActivityEvent,
  type AttentionItem,
  type AttentionSeverity,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountDetailSearchSchema } from "@/lib/admin-ux-search";
import {
  companyWorkspaceQueryKey,
  invalidateCompanyWorkspaceMutation,
} from "@/lib/company-workspace/invalidation";
import { getCompanyWorkspaceSectionEnablement } from "@/lib/company-workspace/section-enablement";
import { retainCompanyWorkspaceSectionData } from "@/lib/company-workspace/section-state";
import { describeTriggerFailure, toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { sumAmounts } from "@/lib/money";
import { crmQueryKeys } from "@/lib/query-keys";
import {
  COMPANY_WORKSPACE_STALE_TIME_MS,
  useCompanyWorkspaceSection,
} from "@/hooks/use-company-workspace-section";
import { getLifecycleLabel } from "@/lib/status-labels";
import { userById } from "@/lib/users";
import type { AccountContact, RelationshipSignal } from "@/lib/types";
import type { AccountTimelineEntry, RelationshipSignalType } from "@/lib/relationship/types";
import { triggerRelationshipIntelligence } from "@/server-functions/accounts";
import { getCompanyWorkspaceRead } from "@/server-functions/company-workspace";
import { createAccountContact, updateAccountContact } from "@/server-functions/contacts";
import { dismissRelationshipSignalFn } from "@/server-functions/relationship-signals";

export const Route = createFileRoute("/accounts/$id")({
  validateSearch: accountDetailSearchSchema,
  loader: ({ params }) => getCompanyWorkspaceRead({ data: { accountId: params.id, sections: [] } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.core.company.name ?? "Account"} - Fimmick ClientOps` }],
  }),
  errorComponent: AccountDetailErrorState,
  component: AccountDetailRoute,
});

/**
 * The loader calls `getCompanyWorkspaceRead` directly, so a capability denial and any Neon
 * driver failure both land here. Without this they fell through to the root boundary, which
 * prints the thrown text into the page body.
 */
function AccountDetailErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This account did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/accounts/$id" });
        }}
      />
    </div>
  );
}

/**
 * Signal type to the exception queue's vocabulary.
 *
 * Keyed on `RelationshipSignalType` rather than on the stored `severity`, because the queue's
 * chips name *what kind of problem this is* — a missing champion and a stale quote are both
 * "high" without being the same thing. The stored severity is rendered separately, as a
 * priority badge, so both facts survive.
 */
const SIGNAL_SEVERITY: Record<RelationshipSignalType, AttentionSeverity> = {
  missing_decision_maker: "risk",
  missing_champion: "risk",
  coverage_gap: "risk",
  unowned_account: "risk",
  high_risk_engagement: "risk",
  negative_sentiment: "risk",
  stale_touchpoint: "stuck",
  stale_quote: "stuck",
  post_event_follow_up_due: "stuck",
  cross_sell_opportunity: "value",
};

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * `APP_USERS` is five hard-coded fixtures whose ids appear in no migration and no seed
 * (IF-D1-10), so a real `profiles.id` never resolves through it. Reporting "Unassigned" for
 * an account that genuinely has an owner is the lie this avoids.
 */
function ownerLabel(profileId: string | null | undefined): string {
  if (!profileId) return "Unassigned";
  return userById(profileId)?.name ?? "Assigned (name unavailable)";
}

/**
 * Router paths as plain strings.
 *
 * `Link`'s `to` union rejects a template-literal type even when the path is real, so these
 * are annotated `string`, which is the branch the router accepts for a computed path.
 */
function jobSheetHref(id: string): string {
  return `/job-sheets/${id}`;
}

/** Only kinds with a real destination get one. A dead link is worse than no link. */
function timelineHref(entry: AccountTimelineEntry): string | undefined {
  if (!entry.object_id) return undefined;
  if (entry.kind === "quote") return `/quotes/${entry.object_id}`;
  if (entry.kind === "lead") return `/leads/${entry.object_id}`;
  return undefined;
}

function toActivityEvent(entry: AccountTimelineEntry): ActivityEvent {
  return {
    id: entry.id,
    at: entry.occurred_at,
    kind: entry.kind,
    title: entry.title,
    description: entry.detail ?? undefined,
    // An agent run and a human decision look identical in a raw event log. The timeline
    // marks the automated ones in words, which is the whole point of the shared component.
    actor: entry.kind === "agent_run" ? { name: entry.title, isAgent: true } : undefined,
    href: timelineHref(entry),
  };
}

function AccountDetailRoute() {
  const initialRead = Route.useLoaderData();
  const accountId = initialRead.core.company.id;
  const queryClient = useQueryClient();
  const router = useRouter();
  const overviewQueryKey = companyWorkspaceQueryKey(accountId, "overview");
  const workspaceReadQuery = useQuery({
    queryKey: overviewQueryKey,
    queryFn: async () => {
      const next = await getCompanyWorkspaceRead({ data: { accountId, sections: [] } });
      const previous = queryClient.getQueryData<typeof initialRead>(overviewQueryKey);
      return {
        ...next,
        overview: retainCompanyWorkspaceSectionData(next.overview, previous?.overview),
      };
    },
    initialData: initialRead,
    staleTime: COMPANY_WORKSPACE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
  const { core, overview } = workspaceReadQuery.data;
  const { company: account, contacts } = core;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab ?? "overview";
  const sectionEnablement = getCompanyWorkspaceSectionEnablement(activeTab);
  const commercialQuery = useCompanyWorkspaceSection(account.id, "commercial", {
    enabled: sectionEnablement.commercial,
  });
  const deliveryFinanceQuery = useCompanyWorkspaceSection(account.id, "delivery_finance", {
    enabled: sectionEnablement.delivery_finance,
  });
  const activityQuery = useCompanyWorkspaceSection(account.id, "activity", {
    enabled: sectionEnablement.activity,
  });
  const signalsQuery = useCompanyWorkspaceSection(account.id, "intelligence", {
    enabled: sectionEnablement.intelligence,
  });

  const [dismissedSignalIds, setDismissedSignalIds] = useState<string[]>([]);
  const [dismissTarget, setDismissTarget] = useState<RelationshipSignal | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissPending, setDismissPending] = useState(false);
  const [isTriggeringRelationshipIntelligence, setIsTriggeringRelationshipIntelligence] =
    useState(false);
  /**
   * Refs alongside the state flags. A handler captured before the re-render still reads the
   * old state, so the flag alone cannot reject the second click of a double click; the
   * disabled attribute and the ref close the two halves of that gap.
   */
  const dismissLock = useRef(false);
  const triggerLock = useRef(false);
  const [contactDraft, setContactDraft] = useState<{
    mode: "create" | "edit";
    contact: AccountContact | null;
  } | null>(null);

  useEffect(() => {
    setDismissedSignalIds([]);
    setDismissTarget(null);
    setDismissReason("");
    setContactDraft(null);
  }, [account.id]);

  /* ---------------------------------------------------------------------------------
   * Invalidation
   * ------------------------------------------------------------------------------ */

  /**
   * The page is both query-backed and loader-backed, so a write has to refresh both (PC-4).
   *
   * The section queries are what the tabs render. The loader read is what seeds the initial
   * data and the document title, and this file previously contained no `router.invalidate`
   * at all, so the title and the SSR payload kept the pre-write account after every write.
   */
  const refreshAccount = async (
    mutation: Parameters<typeof invalidateCompanyWorkspaceMutation>[2],
  ) => {
    await invalidateCompanyWorkspaceMutation(queryClient, account.id, mutation);
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.accounts.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/accounts/$id" });
  };

  /* ---------------------------------------------------------------------------------
   * Signals
   * ------------------------------------------------------------------------------ */

  const confirmDismiss = async () => {
    const signal = dismissTarget;
    if (!signal || dismissLock.current) return;

    const reason = dismissReason.trim();
    if (!reason) {
      toast.error("A dismissal reason is required.");
      return;
    }

    dismissLock.current = true;
    setDismissPending(true);
    try {
      await dismissRelationshipSignalFn({ data: { id: signal.id, reason } });
      setDismissedSignalIds((previous) => [...previous, signal.id]);
      setDismissTarget(null);
      setDismissReason("");
      // Activity is the tab a reader opens to check the dismissal landed, and it was the
      // one key these writes never invalidated.
      await refreshAccount("dismiss_relationship_signal");
      toast.success("Signal dismissed");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      dismissLock.current = false;
      setDismissPending(false);
    }
  };

  const toAttentionItems = (signals: RelationshipSignal[]): AttentionItem[] =>
    signals
      .filter((signal) => !dismissedSignalIds.includes(signal.id))
      .slice()
      .sort(
        (left, right) =>
          (SEVERITY_ORDER[left.severity] ?? 3) - (SEVERITY_ORDER[right.severity] ?? 3) ||
          right.created_at.localeCompare(left.created_at),
      )
      .map((signal) => ({
        id: signal.id,
        severity: SIGNAL_SEVERITY[signal.signal_type] ?? "risk",
        title: signal.title,
        reason: [signal.reason, signal.suggested_action].filter(Boolean).join(" "),
        age: `Raised ${formatDate(signal.created_at)}`,
        href: `/accounts/${account.id}`,
        action: (
          <div className="flex items-center gap-2">
            <StatusBadge domain="priority" value={signal.severity} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDismissTarget(signal);
                setDismissReason("");
              }}
            >
              Dismiss
            </Button>
          </div>
        ),
      }));

  /* ---------------------------------------------------------------------------------
   * Relationship intelligence
   * ------------------------------------------------------------------------------ */

  const runRelationshipIntelligence = async () => {
    if (triggerLock.current) return;

    triggerLock.current = true;
    setIsTriggeringRelationshipIntelligence(true);
    try {
      const result = await triggerRelationshipIntelligence({ data: { accountId: account.id } });

      if (result.reason === "already_running") {
        toast.message("Relationship intelligence is already running for this account.");
        return;
      }
      // The server answers `{ triggered: false, reason: "missing_webhook" }` instead of
      // throwing when N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL is unset. This used to
      // report the run as started regardless.
      const failure = describeTriggerFailure(result);
      if (failure) {
        toast.error(failure);
        return;
      }

      await refreshAccount("run_relationship_intelligence");
      toast.success("Relationship intelligence started");
    } catch (error) {
      // Previously `error.message`, which re-emitted the n8n dispatch error and any raw
      // Neon driver text straight into a toast.
      toast.error(toSafeErrorMessage(error));
    } finally {
      triggerLock.current = false;
      setIsTriggeringRelationshipIntelligence(false);
    }
  };

  /* ---------------------------------------------------------------------------------
   * Stakeholders
   * ------------------------------------------------------------------------------ */

  const saveContact = async (input: ContactFormValues) => {
    if (contactDraft?.mode === "edit" && contactDraft.contact) {
      await updateAccountContact({
        data: { id: contactDraft.contact.id, updates: input },
      });
    } else {
      await createAccountContact({ data: { account_id: account.id, ...input } });
    }
    await refreshAccount("account_contact");
    setContactDraft(null);
  };

  /* ---------------------------------------------------------------------------------
   * Derived display data
   * ------------------------------------------------------------------------------ */

  const overviewData =
    overview.status === "ready" || overview.status === "empty" ? overview.data : null;
  const quoteTotals = overviewData?.quoteTotals
    .map(({ currency, totalValue }) => formatCurrencyAmount(totalValue, currency))
    .join(" | ");
  const openSignalCount = overviewData
    ? Math.max(overviewData.openSignalCount - dismissedSignalIds.length, 0)
    : null;

  const lifecycleLabel = getLifecycleLabel(account.lifecycle_stage).label;
  const headerDescription = [
    lifecycleLabel,
    account.tier ?? "Tier not set",
    account.industry ?? "Industry not set",
    `Owner ${ownerLabel(account.account_owner)}`,
  ].join(" · ");

  /** Overview carries the five most recent; the Signals tab carries every open one. */
  const signalsFromOverview = overviewData ? toAttentionItems(overviewData.openSignals) : [];

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title={account.name}
        description={headerDescription}
        backHref={{ to: "/accounts", label: "Accounts" }}
        status={
          <div className="flex flex-wrap items-center gap-3">
            <LifecycleBadge stage={account.lifecycle_stage} />
            {/*
              The read's own `fetchedAt`, not a clock read during render. A `Date.now()`
              here would differ between the server render and the first client render, and
              every timestamp on the page would report a hydration mismatch.
            */}
            <StaleDataIndicator
              updatedAt={workspaceReadQuery.data.cache.overview.fetchedAt}
              isRefetching={workspaceReadQuery.isFetching}
            />
          </div>
        }
        primaryAction={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runRelationshipIntelligence()}
            disabled={isTriggeringRelationshipIntelligence}
          >
            <BrainCircuit className="mr-2 h-4 w-4" aria-hidden="true" />
            {isTriggeringRelationshipIntelligence ? "Starting…" : "Run intelligence"}
          </Button>
        }
      />

      <main className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "stakeholders",
              label: "Stakeholders",
              value: contacts.length,
              hint: "coverage map",
              icon: Users,
            },
            {
              id: "open-signals",
              label: "Open signals",
              value: openSignalCount ?? "—",
              hint: overview.status === "error" ? "unavailable" : "needs action",
              tone: openSignalCount && openSignalCount > 0 ? "warning" : "neutral",
              icon: BriefcaseBusiness,
            },
            {
              id: "linked-clients",
              label: "Linked clients",
              value: overviewData?.linkedClientCount ?? "—",
              hint: overviewData
                ? `${formatCount(overviewData.activeEngagementCount)} active engagements`
                : "unavailable",
              icon: CalendarClock,
            },
            {
              id: "quotes",
              label: "Quotes",
              value: overviewData?.quoteCount ?? "—",
              hint:
                quoteTotals || (overview.status === "error" ? "unavailable" : "no quoted value"),
              icon: FileText,
            },
          ]}
          columns={4}
        />

        <Tabs
          value={activeTab}
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
            <TabsList className="w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
              <TabsTrigger value="events">Commercial</TabsTrigger>
              <TabsTrigger value="tasks">Delivery &amp; Finance</TabsTrigger>
              <TabsTrigger value="timeline">Activity</TabsTrigger>
              <TabsTrigger value="signals">Signals</TabsTrigger>
            </TabsList>
          </div>

          {/* ---------------------------------------------------------------- Overview */}
          <TabsContent
            value="overview"
            className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Relationship snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SummaryRow
                    label="Lifecycle stage"
                    value={<LifecycleBadge stage={account.lifecycle_stage} />}
                  />
                  <SummaryRow label="Tier" value={account.tier ?? "Unassigned"} />
                  <SummaryRow label="Industry" value={account.industry ?? "Unassigned"} />
                  <SummaryRow label="Region" value={account.region ?? "Unassigned"} />
                  <SummaryRow
                    label="Website"
                    value={account.website ?? account.domain ?? "Not set"}
                  />
                  <SummaryRow
                    label="Last activity"
                    value={formatDateTime(account.last_activity_at)}
                  />
                </div>

                <div className="rounded-md border border-dashed border-border p-4 text-sm">
                  <p className="font-medium text-foreground">Next action</p>
                  <p className="mt-1 text-muted-foreground">
                    {account.next_action ??
                      "Review open signals, assign follow-up tasks, and confirm stakeholder coverage."}
                  </p>
                </div>

                <CompanyWorkspaceSectionState
                  state={overview}
                  isLoading={false}
                  isRefreshing={workspaceReadQuery.isFetching}
                  emptyMessage="No open relationship signals for this account."
                  onRetry={() => void workspaceReadQuery.refetch()}
                >
                  {() => (
                    <div className="space-y-3">
                      <SectionHeader
                        title="Open signals"
                        description="The five most recent. The Signals tab carries the rest."
                      />
                      <AttentionQueue
                        items={signalsFromOverview}
                        emptyTitle="No open signals"
                        emptyDescription="Nothing on this account needs a human right now."
                      />
                    </div>
                  )}
                </CompanyWorkspaceSectionState>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ownership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <SummaryRow label="Account owner" value={ownerLabel(account.account_owner)} />
                  <SummaryRow label="CS owner" value={ownerLabel(account.cs_owner)} />
                  <SummaryRow label="Created" value={formatDate(account.created_at)} />
                  <SummaryRow label="Updated" value={formatDate(account.updated_at)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linked clients</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <SummaryRow
                    label="Client profiles"
                    value={String(overviewData?.linkedClientCount ?? 0)}
                  />
                  <SummaryRow
                    label="Active engagements"
                    value={String(overviewData?.activeEngagementCount ?? 0)}
                  />
                  <p className="text-muted-foreground">
                    Open the Commercial tab to inspect linked clients and engagement details.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ----------------------------------------------------------- Stakeholders */}
          <TabsContent value="stakeholders">
            <StakeholderMap
              contacts={contacts}
              action={
                <Button
                  size="sm"
                  onClick={() => setContactDraft({ mode: "create", contact: null })}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add stakeholder
                </Button>
              }
              renderContactAction={(contact) => (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${contact.name}`}
                  onClick={() => setContactDraft({ mode: "edit", contact })}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            />
          </TabsContent>

          {/* -------------------------------------------------------------- Commercial */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads, quotes &amp; approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <CompanyWorkspaceSectionState
                    state={commercialQuery.data}
                    isLoading={commercialQuery.isLoading}
                    isRefreshing={commercialQuery.isFetching}
                    emptyMessage="No commercial activity is linked to this company yet."
                    onRetry={() => void commercialQuery.refetch()}
                  >
                    {(data) => (
                      <div className="space-y-4">
                        <CommercialList
                          title="Leads"
                          empty="No leads linked to this company."
                          items={data.leads.map((lead) => ({
                            id: lead.id,
                            title: lead.contact_name ?? lead.company_name,
                            detail: lead.source ?? "Source not set",
                            status: lead.status,
                            href: `/leads/${lead.id}`,
                          }))}
                        />
                        <CommercialList
                          title="Quotes"
                          empty="No quotes are linked to this company."
                          items={data.quotes.map((quote) => ({
                            id: quote.id,
                            title: quote.number ?? "Draft quote",
                            detail: formatCurrencyAmount(quote.total_value, quote.currency),
                            status: quote.status,
                            href: `/quotes/${quote.id}`,
                          }))}
                        />
                      </div>
                    )}
                  </CompanyWorkspaceSectionState>
                  <CompanyWorkspaceSectionState
                    state={activityQuery.data}
                    isLoading={activityQuery.isLoading}
                    isRefreshing={activityQuery.isFetching}
                    emptyMessage="No approval or campaign activity yet."
                    onRetry={() => void activityQuery.refetch()}
                  >
                    {(activityData) => (
                      <CommercialList
                        title="Approvals & campaigns"
                        empty="No approval or campaign activity yet."
                        items={activityData.timeline
                          .filter((entry) => entry.kind === "approval" || entry.kind === "campaign")
                          .map((entry) => ({
                            id: entry.id,
                            title: entry.title,
                            detail: entry.detail ?? formatDateTime(entry.occurred_at),
                            status: entry.status ? String(entry.status) : undefined,
                          }))}
                      />
                    )}
                  </CompanyWorkspaceSectionState>
                  <CompanyWorkspaceSectionState
                    state={deliveryFinanceQuery.data}
                    isLoading={deliveryFinanceQuery.isLoading}
                    isRefreshing={deliveryFinanceQuery.isFetching}
                    emptyMessage="No open commercial tasks."
                    onRetry={() => void deliveryFinanceQuery.refetch()}
                  >
                    {(deliveryData) => (
                      <CommercialList
                        title="Open tasks"
                        empty="No open commercial tasks."
                        items={deliveryData.tasks
                          .filter((task) => task.status !== "done")
                          .map((task) => ({
                            id: task.id,
                            title: task.title,
                            detail: `Due ${formatDate(task.due_date)}`,
                            status: task.status,
                          }))}
                      />
                    )}
                  </CompanyWorkspaceSectionState>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------ Delivery & Finance */}
          <TabsContent value="tasks">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Delivery tasks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CompanyWorkspaceSectionState
                    state={deliveryFinanceQuery.data}
                    isLoading={deliveryFinanceQuery.isLoading}
                    isRefreshing={deliveryFinanceQuery.isFetching}
                    emptyMessage="No open account tasks right now."
                    onRetry={() => void deliveryFinanceQuery.refetch()}
                  >
                    {(data) => {
                      const openTasks = data.tasks.filter((task) => task.status !== "done");

                      return openTasks.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                          No open account tasks right now.
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {openTasks
                            .slice()
                            .sort((a, b) =>
                              (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
                            )
                            .map((task) => (
                              <li
                                key={task.id}
                                className="rounded-md border border-border p-3 text-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-medium">{task.title}</p>
                                    {task.description ? (
                                      <p className="text-muted-foreground">{task.description}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <StatusBadge domain="priority" value={task.priority} />
                                    <StatusBadge domain="tasks" value={task.status} />
                                  </div>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Due {formatDate(task.due_date)} | Owner{" "}
                                  {ownerLabel(task.assigned_to)}
                                </p>
                              </li>
                            ))}
                        </ul>
                      );
                    }}
                  </CompanyWorkspaceSectionState>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job sheets &amp; Xero handoff</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <CompanyWorkspaceSectionState
                    state={commercialQuery.data}
                    isLoading={commercialQuery.isLoading}
                    isRefreshing={commercialQuery.isFetching}
                    emptyMessage="No active delivery engagements for this company."
                    onRetry={() => void commercialQuery.refetch()}
                  >
                    {(commercialData) => {
                      const activeEngagements = commercialData.engagements.filter(
                        (engagement) => engagement.status === "active",
                      );

                      return (
                        <div className="space-y-3">
                          <SummaryRow
                            label="Linked clients"
                            value={String(commercialData.clients.length)}
                          />
                          <SummaryRow
                            label="Active engagements"
                            value={String(activeEngagements.length)}
                          />
                          <SummaryRow
                            label="Account ARR"
                            /*
                             * Summed from the account's clients, which is where ARR is stored.
                             * This read `account.arr`, an optional field on the Account type
                             * that no column backs — `accounts` has no arr column in any
                             * migration — so it was always undefined and every company in the
                             * workspace reported "HKD 0" regardless of its actual revenue.
                             */
                            value={formatCurrencyAmount(
                              sumAmounts(commercialData.clients, (client) => client.arr),
                              commercialData.quotes[0]?.currency ?? "HKD",
                            )}
                          />
                          {activeEngagements.length === 0 ? (
                            <p className="text-muted-foreground">
                              No active delivery engagements for this company.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {activeEngagements.slice(0, 5).map((engagement) => (
                                <li
                                  key={engagement.id}
                                  className="rounded-md border border-border p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="font-medium">
                                        Engagement {engagement.id.slice(0, 8)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Renewal {formatDate(engagement.renewal_date)}
                                      </p>
                                    </div>
                                    <StatusBadge value={engagement.status} />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    }}
                  </CompanyWorkspaceSectionState>
                  <CompanyWorkspaceSectionState
                    state={deliveryFinanceQuery.data}
                    isLoading={deliveryFinanceQuery.isLoading}
                    isRefreshing={deliveryFinanceQuery.isFetching}
                    emptyMessage="No accepted quote job sheets for this account yet."
                    onRetry={() => void deliveryFinanceQuery.refetch()}
                  >
                    {(deliveryData) => (
                      <div className="space-y-2 border-t border-border/70 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-foreground">Accounting handoff</p>
                          <span className="text-xs text-muted-foreground">
                            {formatCount(deliveryData.jobSheets.length)} job sheet
                            {deliveryData.jobSheets.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {deliveryData.jobSheets.length === 0 ? (
                          <p className="text-muted-foreground">
                            No accepted quote job sheets for this account yet.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {deliveryData.jobSheets.slice(0, 5).map((sheet) => {
                              const quoteNumber =
                                commercialQuery.data?.status === "ready" ||
                                commercialQuery.data?.status === "empty"
                                  ? commercialQuery.data.data.quotes.find(
                                      (quote) => quote.id === sheet.quote_id,
                                    )?.number
                                  : undefined;

                              return (
                                <li key={sheet.id}>
                                  <Link
                                    to={jobSheetHref(sheet.id)}
                                    className="block rounded-md border border-border p-3 hover:bg-muted/50"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-medium">{sheet.number}</span>
                                      <JobSheetStatusBadge status={sheet.status} />
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                      <span>Quote {quoteNumber ?? sheet.quote_id}</span>
                                      <span>
                                        {formatCurrencyAmount(sheet.total_amount, sheet.currency)}
                                      </span>
                                      <span>
                                        {sheet.xero_customer_reference
                                          ? "Xero customer linked"
                                          : "Xero customer not linked"}
                                      </span>
                                    </div>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </CompanyWorkspaceSectionState>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------------------------------------------------------------- Activity */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyWorkspaceSectionState
                  state={activityQuery.data}
                  isLoading={activityQuery.isLoading}
                  isRefreshing={activityQuery.isFetching}
                  emptyMessage="No timeline activity yet."
                  onRetry={() => void activityQuery.refetch()}
                >
                  {(data) => (
                    <ActivityTimeline
                      events={data.timeline.map(toActivityEvent)}
                      groupByDay
                      emptyMessage="No timeline activity yet."
                    />
                  )}
                </CompanyWorkspaceSectionState>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------------------------------------------------------- Signals */}
          <TabsContent value="signals">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Relationship signals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CompanyWorkspaceSectionState
                  state={signalsQuery.data}
                  isLoading={signalsQuery.isLoading}
                  isRefreshing={signalsQuery.isFetching}
                  emptyMessage="No open relationship signals for this account."
                  onRetry={() => void signalsQuery.refetch()}
                >
                  {(data) => (
                    <AttentionQueue
                      items={toAttentionItems(data.signals)}
                      emptyTitle="No open signals"
                      emptyDescription="Coverage, touchpoints, quotes and renewals all look healthy on this account."
                    />
                  )}
                </CompanyWorkspaceSectionState>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog
        open={dismissTarget !== null}
        onOpenChange={(open) => {
          if (dismissPending) return;
          if (!open) setDismissTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this signal?</DialogTitle>
            <DialogDescription>
              {dismissTarget?.title} — the signal is closed with your reason recorded against it. It
              reappears only if the condition that raised it returns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="signal-dismiss-reason">Dismissal reason</Label>
            <Input
              id="signal-dismiss-reason"
              value={dismissReason}
              onChange={(event) => setDismissReason(event.target.value)}
              placeholder="Why is this signal being dismissed?"
              disabled={dismissPending}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDismissTarget(null)}
              disabled={dismissPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmDismiss()}
              disabled={dismissPending || dismissReason.trim() === ""}
            >
              {dismissPending ? "Dismissing…" : "Dismiss signal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactDialog
        key={contactDraft?.contact?.id ?? contactDraft?.mode ?? "closed"}
        open={contactDraft !== null}
        mode={contactDraft?.mode ?? "create"}
        contact={contactDraft?.contact ?? null}
        onClose={() => setContactDraft(null)}
        onSave={saveContact}
      />
    </>
  );
}

/* ------------------------------------------------------------------------------------
 * Commercial list
 * --------------------------------------------------------------------------------- */

type CommercialItem = {
  id: string;
  title: string;
  detail: string;
  status?: string;
  /** A router path. Every lead and quote here used to be a raw anchor and a page reload. */
  href?: string;
};

function CommercialList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: CommercialItem[];
}) {
  return (
    <section className="space-y-2 border-b border-border/70 pb-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {item.href ? (
                    <Link className="font-medium hover:underline" to={item.href}>
                      {item.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{item.title}</p>
                  )}
                  <p className="text-muted-foreground">{item.detail}</p>
                </div>
                {item.status ? <StatusBadge value={item.status} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------------------
 * Stakeholder dialog
 * --------------------------------------------------------------------------------- */

export type ContactFormValues = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Create and edit run through the same form because they write the same four fields.
 *
 * `createAccountContact` and `updateAccountContact` are both exported and capability-checked
 * (`contacts.create` / `contacts.update`), and this page had no contact control at all — the
 * stakeholder map was read-only over two live server paths. The dialog writes only the fields
 * a person types; the enum columns keep their database defaults rather than being guessed at
 * here.
 */
function ContactDialog({
  open,
  mode,
  contact,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  contact: AccountContact | null;
  onClose: () => void;
  onSave: (values: ContactFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!name.trim()) {
      toast.error("A stakeholder name is required.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        title: title.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      toast.success(mode === "edit" ? "Stakeholder updated" : "Stakeholder added");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit stakeholder" : "Add stakeholder"}</DialogTitle>
          <DialogDescription>
            Stakeholder coverage is what the relationship signals on this account are computed from.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="contact-name" className="text-xs">
              Name
            </Label>
            <Input
              id="contact-name"
              className="mt-1"
              value={name}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="contact-title" className="text-xs">
              Job title
            </Label>
            <Input
              id="contact-title"
              className="mt-1"
              value={title}
              autoComplete="organization-title"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="contact-email" className="text-xs">
              Email
            </Label>
            <Input
              id="contact-email"
              type="email"
              className="mt-1"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="contact-phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="contact-phone"
              className="mt-1"
              value={phone}
              autoComplete="tel"
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save stakeholder" : "Add stakeholder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

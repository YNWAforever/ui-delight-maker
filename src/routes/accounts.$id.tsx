import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { PageHeader } from "@/components/page-header";
import { AccountTimeline } from "@/components/relationship/account-timeline";
import { StakeholderMap } from "@/components/relationship/stakeholder-map";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { seedCompanyWorkspaceCache } from "@/lib/company-workspace/cache";
import { companyWorkspaceSectionOptions } from "@/lib/company-workspace/query-options";
import type {
  ActivityProjection,
  CommercialProjection,
  CoreProjection,
  DeliveryFinanceProjection,
  OverviewProjection,
  StakeholdersProjection,
  WorkspaceSectionResult,
} from "@/lib/company-workspace/types";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { userById } from "@/lib/users";
import type { RelationshipSignal } from "@/lib/types";
import { triggerRelationshipIntelligence } from "@/server-functions/accounts";
import { getCompanyWorkspace } from "@/server-functions/company-workspace";
import { dismissRelationshipSignalFn } from "@/server-functions/relationship-signals";

export const Route = createFileRoute("/accounts/$id")({
  loader: async ({ params, context }) => {
    const response = await getCompanyWorkspace({
      data: {
        accountId: params.id,
        sections: ["overview"],
        freshness: "default",
      },
    });

    seedCompanyWorkspaceCache(context.queryClient, params.id, response);
    return response;
  },
  head: ({ loaderData }) => {
    const core = loaderData?.sections.core;

    return {
      meta: [
        {
          title: `${core?.status === "ready" ? core.data.account.name : "Account"} - Fimmick ClientOps`,
        },
      ],
    };
  },
  component: AccountDetailRoute,
});

type WorkspaceTab = "overview" | "stakeholders" | "timeline" | "events" | "tasks";

function AccountDetailRoute() {
  const loaderData = Route.useLoaderData();
  const coreQuery = useQuery({
    ...companyWorkspaceSectionOptions(loaderData.accountId, "core"),
  });
  const overviewQuery = useQuery({
    ...companyWorkspaceSectionOptions(loaderData.accountId, "overview"),
  });
  const coreSection = (coreQuery.data ?? loaderData.sections.core) as
    | WorkspaceSectionResult<CoreProjection>
    | undefined;
  const overviewSection = (overviewQuery.data ?? loaderData.sections.overview) as
    | WorkspaceSectionResult<OverviewProjection>
    | undefined;
  const core = coreSection?.status === "ready" ? coreSection.data : null;
  const overview =
    overviewSection?.status === "ready" || overviewSection?.status === "empty"
      ? overviewSection.data
      : null;
  const account = core?.account;
  const linkedClients = overview?.linkedClients ?? [];
  const signals = overview?.openSignals;
  const overviewQuotes = overview?.quoteSummaries ?? [];
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const stakeholdersQuery = useQuery({
    ...companyWorkspaceSectionOptions(loaderData.accountId, "stakeholders"),
    enabled: activeTab === "stakeholders",
  });
  const activityQuery = useQuery({
    ...companyWorkspaceSectionOptions(loaderData.accountId, "activity"),
    enabled: activeTab === "timeline" || activeTab === "events",
  });
  const commercialQuery = useQuery({
    ...companyWorkspaceSectionOptions(loaderData.accountId, "commercial"),
    enabled: activeTab === "tasks",
  });
  const deliveryFinanceQuery = useQuery({
    ...companyWorkspaceSectionOptions(loaderData.accountId, "deliveryFinance"),
    enabled: activeTab === "tasks",
  });
  const [dismissedSignalIds, setDismissedSignalIds] = useState<string[]>([]);
  const [activeDismissId, setActiveDismissId] = useState<string | null>(null);
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const [pendingSignalIds, setPendingSignalIds] = useState<string[]>([]);
  const [isTriggeringRelationshipIntelligence, setIsTriggeringRelationshipIntelligence] =
    useState(false);
  const openSignals = (signals ?? []).filter((signal) => !dismissedSignalIds.includes(signal.id));
  const stakeholdersSection = stakeholdersQuery.data as
    | WorkspaceSectionResult<StakeholdersProjection>
    | undefined;
  const stakeholders =
    stakeholdersSection?.status === "ready" ? stakeholdersSection.data.contacts : [];
  const activitySection = activityQuery.data as
    | WorkspaceSectionResult<ActivityProjection>
    | undefined;
  const activity = activitySection?.status === "ready" ? activitySection.data.timeline : [];
  const commercialSection = commercialQuery.data as
    | WorkspaceSectionResult<CommercialProjection>
    | undefined;
  const commercial =
    commercialSection?.status === "ready" || commercialSection?.status === "empty"
      ? commercialSection.data
      : null;
  const deliveryFinanceSection = deliveryFinanceQuery.data as
    | WorkspaceSectionResult<DeliveryFinanceProjection>
    | undefined;
  const deliveryFinance =
    deliveryFinanceSection?.status === "ready" || deliveryFinanceSection?.status === "empty"
      ? deliveryFinanceSection.data
      : null;

  useEffect(() => {
    setDismissedSignalIds([]);
    setActiveDismissId(null);
    setDismissReasons({});
    setPendingSignalIds([]);
  }, [account?.id, signals]);

  if (!account) {
    return (
      <main className="px-6 py-6">
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Account details are unavailable. Try opening this account again.
        </div>
      </main>
    );
  }

  if (overviewSection?.status === "error" || overviewQuery.isError) {
    return (
      <>
        <PageHeader
          title={account.name}
          description={`${account.lifecycle_stage.replace(/_/g, " ")} account relationship`}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/accounts">
                <ArrowLeft className="h-4 w-4" />
                Accounts
              </Link>
            </Button>
          }
        />
        <main className="px-6 py-6">
          <DeferredSectionMessage
            message="Account overview could not be loaded."
            onRetry={() => void overviewQuery.refetch()}
          />
        </main>
      </>
    );
  }

  const owner = account.account_owner ? userById(account.account_owner) : undefined;
  const csOwner = account.cs_owner ? userById(account.cs_owner) : undefined;
  const tasks = deliveryFinance?.tasks ?? [];
  const quotes = commercial?.quotes ?? [];
  const jobSheets = deliveryFinance?.jobSheets ?? [];
  const openTasks = tasks.filter((task) => task.status !== "done");
  const activeEngagements = (commercial?.engagements ?? []).filter(
    (engagement) => engagement.status === "active",
  );
  const campaignTimelineEntries = activity.filter((entry) => entry.kind === "campaign");
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));

  const startDismiss = (signal: RelationshipSignal) => {
    setActiveDismissId(signal.id);
    setDismissReasons((prev) => ({ ...prev, [signal.id]: prev[signal.id] ?? "" }));
  };

  const changeDismissReason = (signalId: string, reason: string) => {
    setDismissReasons((prev) => ({ ...prev, [signalId]: reason }));
  };

  const cancelDismiss = (signalId: string) => {
    if (pendingSignalIds.includes(signalId)) {
      return;
    }

    setActiveDismissId((current) => (current === signalId ? null : current));
  };

  const dismissSignal = async (signal: RelationshipSignal) => {
    if (pendingSignalIds.includes(signal.id)) {
      return;
    }

    const reason = dismissReasons[signal.id] ?? "";
    if (!reason.trim()) {
      toast.error("Dismissal reason is required");
      return;
    }

    setPendingSignalIds((prev) => [...prev, signal.id]);

    try {
      await dismissRelationshipSignalFn({
        data: { id: signal.id, reason: reason.trim() },
      });
      setDismissedSignalIds((prev) => [...prev, signal.id]);
      setActiveDismissId((current) => (current === signal.id ? null : current));
      setDismissReasons((prev) => {
        const next = { ...prev };
        delete next[signal.id];
        return next;
      });
      toast.success("Signal dismissed");
    } catch {
      toast.error("Could not dismiss signal");
    } finally {
      setPendingSignalIds((prev) => prev.filter((id) => id !== signal.id));
    }
  };

  const runRelationshipIntelligence = async () => {
    if (isTriggeringRelationshipIntelligence) {
      return;
    }

    setIsTriggeringRelationshipIntelligence(true);

    try {
      const result = await triggerRelationshipIntelligence({ data: { accountId: account.id } });

      if (!result.triggered) {
        if (result.reason === "already_running") {
          toast.message("Relationship intelligence is already running for this account");
        } else {
          toast.error("Relationship intelligence webhook is not configured");
        }
        return;
      }

      toast.success("Relationship intelligence started");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start relationship intelligence",
      );
    } finally {
      setIsTriggeringRelationshipIntelligence(false);
    }
  };

  const summaryItems = [
    {
      label: "Stakeholders",
      value: core.peopleCount,
      hint: "coverage map",
      icon: Users,
    },
    {
      label: "Open signals",
      value: openSignals.length,
      hint: "needs action",
      icon: BriefcaseBusiness,
    },
    {
      label: "Linked clients",
      value: linkedClients.length,
      hint: `${overview?.activeEngagementCount ?? 0} active engagements`,
      icon: CalendarClock,
    },
    {
      label: "Quotes",
      value: overviewQuotes.length,
      hint: formatCurrencyAmount(
        overviewQuotes.reduce((sum, quote) => sum + (quote.total_value ?? 0), 0),
        overviewQuotes[0]?.currency ?? "HKD",
      ),
      icon: FileText,
    },
  ];

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.lifecycle_stage.replace(/_/g, " ")} account relationship`}
        actions={
          <>
            {linkedClients[0] ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/clients/$id" params={{ id: linkedClients[0].id }}>
                  Client profile
                </Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runRelationshipIntelligence()}
              disabled={isTriggeringRelationshipIntelligence}
            >
              <BrainCircuit className="h-4 w-4" />
              {isTriggeringRelationshipIntelligence ? "Running..." : "Run intelligence"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/accounts">
                <ArrowLeft className="h-4 w-4" />
                Accounts
              </Link>
            </Button>
          </>
        }
      />

      <main className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  <p className="text-2xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkspaceTab)}>
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="events">Events & Campaigns</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
          </div>

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
                    value={<StatusBadge value={account.lifecycle_stage} />}
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

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Open signals</h3>
                    <span className="text-xs text-muted-foreground">
                      {openSignals.length} active
                    </span>
                  </div>
                  {openSignals.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No open relationship signals for this account.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {openSignals.slice(0, 5).map((signal) => (
                        <SignalListItem
                          key={signal.id}
                          signal={signal}
                          dismissReason={dismissReasons[signal.id] ?? ""}
                          isDismissOpen={activeDismissId === signal.id}
                          isDismissing={pendingSignalIds.includes(signal.id)}
                          onStartDismiss={startDismiss}
                          onDismissReasonChange={changeDismissReason}
                          onConfirmDismiss={dismissSignal}
                          onCancelDismiss={cancelDismiss}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ownership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <SummaryRow label="Account owner" value={owner?.name ?? "Unassigned"} />
                  <SummaryRow label="CS owner" value={csOwner?.name ?? "Unassigned"} />
                  <SummaryRow label="Created" value={formatDate(account.created_at)} />
                  <SummaryRow label="Updated" value={formatDate(account.updated_at)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linked clients</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {linkedClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No client profile is linked to this account yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {linkedClients.map((linkedClient) => (
                        <li
                          key={linkedClient.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{linkedClient.company_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Health {linkedClient.health_score} | Renewal{" "}
                              {formatDate(linkedClient.renewal_date)}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/clients/$id" params={{ id: linkedClient.id }}>
                              Open
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="stakeholders">
            {stakeholdersSection?.status === "ready" ? (
              <StakeholderMap contacts={stakeholders} />
            ) : stakeholdersSection?.status === "empty" ? (
              <DeferredSectionMessage message="No stakeholders are mapped to this account yet." />
            ) : stakeholdersSection?.status === "error" || stakeholdersQuery.isError ? (
              <DeferredSectionMessage
                message="Stakeholders could not be loaded."
                onRetry={() => void stakeholdersQuery.refetch()}
              />
            ) : (
              <DeferredSectionMessage message="Loading stakeholders..." />
            )}
          </TabsContent>

          <TabsContent value="timeline">
            {activitySection?.status === "ready" ? (
              <AccountTimeline entries={activity} />
            ) : activitySection?.status === "empty" ? (
              <DeferredSectionMessage message="No timeline activity has been recorded for this account yet." />
            ) : activitySection?.status === "error" || activityQuery.isError ? (
              <DeferredSectionMessage
                message="Timeline activity could not be loaded."
                onRetry={() => void activityQuery.refetch()}
              />
            ) : (
              <DeferredSectionMessage message="Loading timeline activity..." />
            )}
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign follow-up</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activitySection?.status === "empty" ? (
                  <DeferredSectionMessage message="No attendee imports or campaign follow-up entries for this account yet." />
                ) : activitySection?.status === "error" || activityQuery.isError ? (
                  <DeferredSectionMessage
                    message="Campaign follow-up could not be loaded."
                    onRetry={() => void activityQuery.refetch()}
                  />
                ) : activitySection?.status !== "ready" ? (
                  <DeferredSectionMessage message="Loading campaign follow-up..." />
                ) : campaignTimelineEntries.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No attendee imports or campaign follow-up entries for this account yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {campaignTimelineEntries.slice(0, 6).map((entry) => (
                      <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{entry.title}</p>
                            {entry.detail ? (
                              <p className="text-muted-foreground">{entry.detail}</p>
                            ) : null}
                          </div>
                          {entry.status ? <StatusBadge value={String(entry.status)} /> : null}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatDateTime(entry.occurred_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="tasks"
            className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Open tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {deliveryFinanceSection?.status === "error" || deliveryFinanceQuery.isError ? (
                  <DeferredSectionMessage
                    message="Task and delivery data could not be loaded."
                    onRetry={() => void deliveryFinanceQuery.refetch()}
                  />
                ) : deliveryFinanceSection?.status === "empty" ? (
                  <DeferredSectionMessage message="No task or delivery data is available for this account yet." />
                ) : deliveryFinanceSection?.status !== "ready" ? (
                  <DeferredSectionMessage message="Loading tasks and delivery data..." />
                ) : openTasks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No open account tasks right now.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {[...openTasks]
                      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
                      .map((task) => (
                        <li key={task.id} className="rounded-md border border-border p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{task.title}</p>
                              {task.description ? (
                                <p className="text-muted-foreground">{task.description}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <StatusBadge value={task.priority} />
                              <StatusBadge value={task.status} />
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Due {formatDate(task.due_date)} | Owner{" "}
                            {task.assigned_to
                              ? (userById(task.assigned_to)?.name ?? task.assigned_to)
                              : "Unassigned"}
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quotes & revenue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {commercialSection?.status === "error" || commercialQuery.isError ? (
                  <DeferredSectionMessage
                    message="Commercial data could not be loaded."
                    onRetry={() => void commercialQuery.refetch()}
                  />
                ) : commercialSection?.status === "empty" ? (
                  <DeferredSectionMessage message="No commercial data is available for this account yet." />
                ) : commercialSection?.status !== "ready" ? (
                  <DeferredSectionMessage message="Loading commercial data..." />
                ) : (
                  <>
                    <SummaryRow label="Total quotes" value={String(quotes.length)} />
                    <SummaryRow
                      label="Active engagements"
                      value={String(activeEngagements.length)}
                    />
                    <SummaryRow
                      label="Account ARR"
                      value={formatCurrencyAmount(
                        account.arr ?? null,
                        quotes[0]?.currency ?? "HKD",
                      )}
                    />
                    {quotes.length === 0 ? (
                      <p className="text-muted-foreground">No quotes linked to this account yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {quotes.slice(0, 5).map((quote) => (
                          <li key={quote.id} className="rounded-md border border-border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{quote.number ?? "Draft quote"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrencyAmount(quote.total_value, quote.currency)}
                                </p>
                              </div>
                              <StatusBadge value={quote.status} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">Accounting handoff</p>
                    <span className="text-xs text-muted-foreground">
                      {jobSheets.length} job sheet{jobSheets.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {deliveryFinanceSection?.status === "error" || deliveryFinanceQuery.isError ? (
                    <DeferredSectionMessage
                      message="Accounting handoff data could not be loaded."
                      onRetry={() => void deliveryFinanceQuery.refetch()}
                    />
                  ) : deliveryFinanceSection?.status === "empty" ? (
                    <DeferredSectionMessage message="No accounting handoff data is available for this account yet." />
                  ) : deliveryFinanceSection?.status !== "ready" ? (
                    <DeferredSectionMessage message="Loading accounting handoff data..." />
                  ) : jobSheets.length === 0 ? (
                    <p className="text-muted-foreground">
                      No accepted quote job sheets for this account yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {jobSheets.slice(0, 5).map((sheet) => {
                        const quote = quoteById.get(sheet.quote_id);

                        return (
                          <li key={sheet.id}>
                            <Link
                              to="/job-sheets/$id"
                              params={{ id: sheet.id }}
                              className="block rounded-md border border-border p-3 hover:bg-muted/50"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">{sheet.number}</span>
                                <JobSheetStatusBadge status={sheet.status} />
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>Quote {quote?.number ?? sheet.quote_id}</span>
                                <span>
                                  {formatCurrencyAmount(sheet.total_amount, sheet.currency)}
                                </span>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function DeferredSectionMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      <span>{message}</span>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function SignalListItem({
  signal,
  dismissReason,
  isDismissOpen,
  isDismissing,
  onStartDismiss,
  onDismissReasonChange,
  onConfirmDismiss,
  onCancelDismiss,
}: {
  signal: RelationshipSignal;
  dismissReason: string;
  isDismissOpen: boolean;
  isDismissing: boolean;
  onStartDismiss: (signal: RelationshipSignal) => void;
  onDismissReasonChange: (signalId: string, reason: string) => void;
  onConfirmDismiss: (signal: RelationshipSignal) => void;
  onCancelDismiss: (signalId: string) => void;
}) {
  const inputId = `dismiss-reason-${signal.id}`;

  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{signal.title}</p>
          <p className="text-muted-foreground">{signal.reason}</p>
          {signal.suggested_action ? (
            <p className="mt-1 text-xs text-muted-foreground">{signal.suggested_action}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge value={signal.severity} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onStartDismiss(signal)}
            disabled={isDismissing}
          >
            {isDismissing ? "Dismissing..." : "Dismiss"}
          </Button>
        </div>
      </div>

      {isDismissOpen ? (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={inputId}>Dismissal reason</Label>
              <Input
                id={inputId}
                value={dismissReason}
                onChange={(event) => onDismissReasonChange(signal.id, event.target.value)}
                placeholder="Why is this signal being dismissed?"
                disabled={isDismissing}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => onConfirmDismiss(signal)} disabled={isDismissing}>
                Confirm dismiss
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancelDismiss(signal.id)}
                disabled={isDismissing}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

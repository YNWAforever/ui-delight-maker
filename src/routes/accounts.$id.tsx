import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { CompanyWorkspaceSectionState } from "@/components/relationship/company-workspace-section-state";
import { StakeholderMap } from "@/components/relationship/stakeholder-map";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountDetailSearchSchema } from "@/lib/admin-ux-search";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { useCompanyWorkspaceSection } from "@/hooks/use-company-workspace-section";
import { userById } from "@/lib/users";
import type { RelationshipSignal } from "@/lib/types";
import { triggerRelationshipIntelligence } from "@/server-functions/accounts";
import { getCompanyWorkspaceCore } from "@/server-functions/company-workspace";
import { dismissRelationshipSignalFn } from "@/server-functions/relationship-signals";

export const Route = createFileRoute("/accounts/$id")({
  validateSearch: accountDetailSearchSchema,
  loader: ({ params }) => getCompanyWorkspaceCore({ data: { accountId: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.company.name ?? "Account"} - Fimmick ClientOps` }],
  }),
  component: AccountDetailRoute,
});

function AccountDetailRoute() {
  const { company: account, contacts } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const commercialQuery = useCompanyWorkspaceSection(account.id, "commercial");
  const deliveryFinanceQuery = useCompanyWorkspaceSection(account.id, "delivery_finance");
  const activityQuery = useCompanyWorkspaceSection(account.id, "activity");
  const intelligenceQuery = useCompanyWorkspaceSection(account.id, "intelligence");
  const [dismissedSignalIds, setDismissedSignalIds] = useState<string[]>([]);
  const [activeDismissId, setActiveDismissId] = useState<string | null>(null);
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const [pendingSignalIds, setPendingSignalIds] = useState<string[]>([]);
  const [isTriggeringRelationshipIntelligence, setIsTriggeringRelationshipIntelligence] =
    useState(false);
  const owner = account.account_owner ? userById(account.account_owner) : undefined;
  const csOwner = account.cs_owner ? userById(account.cs_owner) : undefined;

  useEffect(() => {
    setDismissedSignalIds([]);
    setActiveDismissId(null);
    setDismissReasons({});
    setPendingSignalIds([]);
  }, [account.id]);

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
      value: contacts.length,
      hint: "coverage map",
      icon: Users,
    },
    {
      label: "Open signals",
      value:
        intelligenceQuery.data?.status === "ready" || intelligenceQuery.data?.status === "empty"
          ? intelligenceQuery.data.data.signals.filter(
              (signal) => !dismissedSignalIds.includes(signal.id),
            ).length
          : "—",
      hint:
        intelligenceQuery.data?.status === "error"
          ? "unavailable"
          : intelligenceQuery.data
            ? "needs action"
            : "loading",
      icon: BriefcaseBusiness,
    },
    {
      label: "Linked clients",
      value:
        commercialQuery.data?.status === "ready" || commercialQuery.data?.status === "empty"
          ? commercialQuery.data.data.clients.length
          : "—",
      hint:
        commercialQuery.data?.status === "ready" || commercialQuery.data?.status === "empty"
          ? commercialQuery.data.data.engagements.filter(
              (engagement) => engagement.status === "active",
            ).length + " active engagements"
          : commercialQuery.data?.status === "error"
            ? "unavailable"
            : "loading",
      icon: CalendarClock,
    },
    {
      label: "Quotes",
      value:
        commercialQuery.data?.status === "ready" || commercialQuery.data?.status === "empty"
          ? commercialQuery.data.data.quotes.length
          : "—",
      hint:
        commercialQuery.data?.status === "ready" || commercialQuery.data?.status === "empty"
          ? formatCurrencyAmount(
              commercialQuery.data.data.quotes.reduce(
                (sum, quote) => sum + (quote.total_value ?? 0),
                0,
              ),
              commercialQuery.data.data.quotes[0]?.currency ?? "HKD",
            )
          : commercialQuery.data?.status === "error"
            ? "unavailable"
            : "loading",
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
            {(commercialQuery.data?.status === "ready" ||
              commercialQuery.data?.status === "empty") &&
            commercialQuery.data.data.clients[0] ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/clients/$id" params={{ id: commercialQuery.data.data.clients[0].id }}>
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
            <TabsList className="w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="stakeholders">People</TabsTrigger>
              <TabsTrigger value="timeline">Activity</TabsTrigger>
              <TabsTrigger value="events">Commercial</TabsTrigger>
              <TabsTrigger value="tasks">Delivery & Finance</TabsTrigger>
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

                <CompanyWorkspaceSectionState
                  state={intelligenceQuery.data}
                  isLoading={intelligenceQuery.isLoading}
                  emptyMessage="No open relationship signals for this account."
                  onRetry={() => void intelligenceQuery.refetch()}
                >
                  {(data) => {
                    const openSignals = data.signals.filter(
                      (signal) => !dismissedSignalIds.includes(signal.id),
                    );

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">Open signals</h3>
                          <span className="text-xs text-muted-foreground">
                            {openSignals.length} active
                          </span>
                        </div>
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
                      </div>
                    );
                  }}
                </CompanyWorkspaceSectionState>
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
                  <CompanyWorkspaceSectionState
                    state={commercialQuery.data}
                    isLoading={commercialQuery.isLoading}
                    emptyMessage="No client profile is linked to this account yet."
                    onRetry={() => void commercialQuery.refetch()}
                  >
                    {(data) => (
                      <ul className="space-y-2">
                        {data.clients.map((client) => (
                          <li
                            key={client.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{client.company_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Health {client.health_score} | Renewal{" "}
                                {formatDate(client.renewal_date)}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/clients/$id" params={{ id: client.id }}>
                                Open
                              </Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CompanyWorkspaceSectionState>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="stakeholders">
            <StakeholderMap contacts={contacts} />
          </TabsContent>

          <TabsContent value="timeline">
            <CompanyWorkspaceSectionState
              state={activityQuery.data}
              isLoading={activityQuery.isLoading}
              emptyMessage="No timeline activity yet."
              onRetry={() => void activityQuery.refetch()}
            >
              {(data) => <AccountTimeline entries={data.timeline} />}
            </CompanyWorkspaceSectionState>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads, quotes & approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <CompanyWorkspaceSectionState
                    state={commercialQuery.data}
                    isLoading={commercialQuery.isLoading}
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
                            href: "/leads/" + lead.id,
                          }))}
                        />
                        <CommercialList
                          title="Quotes"
                          empty="No quotes linked to this company."
                          items={data.quotes.map((quote) => ({
                            id: quote.id,
                            title: quote.number ?? "Draft quote",
                            detail: formatCurrencyAmount(quote.total_value, quote.currency),
                            status: quote.status,
                            href: "/quotes/" + quote.id,
                          }))}
                        />
                      </div>
                    )}
                  </CompanyWorkspaceSectionState>
                  <CompanyWorkspaceSectionState
                    state={activityQuery.data}
                    isLoading={activityQuery.isLoading}
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
                            detail: "Due " + formatDate(task.due_date),
                            status: task.status,
                          }))}
                      />
                    )}
                  </CompanyWorkspaceSectionState>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

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
                      );
                    }}
                  </CompanyWorkspaceSectionState>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job sheets & Xero handoff</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <CompanyWorkspaceSectionState
                    state={commercialQuery.data}
                    isLoading={commercialQuery.isLoading}
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
                            value={formatCurrencyAmount(
                              account.arr ?? null,
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
                    emptyMessage="No accepted quote job sheets for this account yet."
                    onRetry={() => void deliveryFinanceQuery.refetch()}
                  >
                    {(deliveryData) => (
                      <div className="space-y-2 border-t border-border/70 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-foreground">Accounting handoff</p>
                          <span className="text-xs text-muted-foreground">
                            {deliveryData.jobSheets.length} job sheet
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
                                    to="/job-sheets/$id"
                                    params={{ id: sheet.id }}
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
        </Tabs>
      </main>
    </>
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

function CommercialList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    id: string;
    title: string;
    detail: string;
    status?: string;
    href?: string;
  }>;
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
                    <a className="font-medium hover:underline" href={item.href}>
                      {item.title}
                    </a>
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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Bot, Mail, Phone, Star } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  ActivityTimeline,
  EmptyWorkspaceState,
  ErrorState,
  LoadingSkeleton,
  MetricStrip,
  PermissionDeniedState,
  SectionHeader,
  StatusBadge,
  WorkspaceHeader,
  type ActivityEvent,
} from "@/components/sales";
import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientDetailSearchSchema } from "@/lib/admin-ux-search";
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
import { useClientWorkspaceSection } from "@/hooks/use-client-workspace-section";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCompactHKD, formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { getRenewalWindow } from "@/lib/engagement-utils";
import { crmQueryKeys } from "@/lib/query-keys";
import {
  createClientContact,
  deleteClientContact,
  updateClientContact,
} from "@/server-functions/client-contacts";
import { getTouchpointsByClient } from "@/server-functions/touchpoints";
import { getTasks } from "@/server-functions/tasks";
import type { TaskListItem } from "@/server-functions/tasks";
import { getProducts } from "@/server-functions/products";
import { getClientWorkspaceRead } from "@/server-functions/client-workspace";
import type { SerializableActivityLog } from "@/lib/serializable";
import type { ClientContact, Engagement, TouchpointRecord } from "@/lib/types";

export const Route = createFileRoute("/clients/$id")({
  validateSearch: clientDetailSearchSchema,
  loader: ({ params }) => getClientWorkspaceRead({ data: { clientId: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.identity.companyName ?? "Client"} — ClientOps` },
      { name: "description", content: `Client profile, tasks, and history.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="px-4 py-6 md:px-6">
      <EmptyWorkspaceState
        title="Client not found"
        description="This client may have been removed, or the link may be out of date."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/clients">All clients</Link>
          </Button>
        }
      />
    </div>
  ),
  errorComponent: ClientDetailErrorState,
  component: ClientDetail,
});

function ClientDetailErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This client did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/clients/$id" });
        }}
      />
    </div>
  );
}

/** The health bands used across the clients surfaces. Words, so colour is never the only signal. */
function healthBandLabel(score: number) {
  if (score >= 75) return "Healthy";
  if (score >= 55) return "Watch";
  return "At risk";
}

const RENEWAL_WINDOW_LABEL: Record<string, string> = {
  overdue: "Renewal date has passed",
  "30": "Renews within 30 days",
  "60": "Renews within 60 days",
  "90": "Renews within 90 days",
  later: "Renews later than 90 days",
};

function ClientDetail() {
  const workspace = Route.useLoaderData();
  const { identity, ownership, relationship, counts } = workspace;
  const clientId = identity.id;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab ?? "overview";

  /**
   * `null` counts are an authorization answer, not a missing number.
   *
   * `getClientWorkspaceRead` returns null for every section the caller lacks, and the tab
   * triggers used to stay enabled anyway: clicking one fired the section read, its capability
   * check threw, and the tab rendered "Client details are temporarily unavailable" with a Retry
   * button that could never succeed — a permanent denial dressed as a transient outage.
   */
  const restricted = {
    contacts: counts.contacts === null,
    engagements: counts.engagements === null,
    quotes: counts.quotes === null,
    jobSheets: counts.jobSheets === null,
  };

  const contactsQuery = useClientWorkspaceSection(clientId, "contacts", {
    enabled: activeTab === "contacts" && !restricted.contacts,
  });
  const commercialQuery = useClientWorkspaceSection(clientId, "commercial", {
    enabled: activeTab === "quotes" && !restricted.quotes,
  });
  /**
   * Enabled on the overview as well as its own tab: the overview explains where the health
   * score came from, and that explanation is only truthful if the engagements it is derived
   * from are actually on hand.
   */
  const engagementsQuery = useClientWorkspaceSection(clientId, "engagements", {
    enabled: (activeTab === "engagements" || activeTab === "overview") && !restricted.engagements,
  });
  const jobSheetsQuery = useClientWorkspaceSection(clientId, "job_sheets", {
    enabled: activeTab === "job-sheets" && !restricted.jobSheets,
  });
  const productsQuery = useQuery({
    queryKey: crmQueryKeys.products.list({ activeOnly: true }),
    queryFn: () => getProducts({ data: { activeOnly: true } }),
    enabled: activeTab === "engagements",
    staleTime: 5 * 60_000,
  });
  const activityQuery = useClientWorkspaceSection(clientId, "activity", {
    enabled: activeTab === "timeline" && !restricted.engagements,
  });
  const tasksQuery = useQuery({
    queryKey: crmQueryKeys.tasks.list({ client_id: clientId }),
    queryFn: () => getTasks({ data: { client_id: clientId } }),
    enabled: activeTab === "tasks",
    staleTime: 60_000,
  });
  const touchpointsQuery = useQuery({
    queryKey: crmQueryKeys.clients.section(clientId, "touchpoints"),
    queryFn: () => getTouchpointsByClient({ data: { clientId } }),
    enabled: activeTab === "timeline",
    staleTime: 60_000,
  });

  const clientContacts =
    contactsQuery.data?.status === "error"
      ? (contactsQuery.data.staleData?.contacts ?? [])
      : (contactsQuery.data?.data.contacts ?? []);
  const clientQuotes =
    commercialQuery.data?.status === "error"
      ? (commercialQuery.data.staleData?.quotes ?? [])
      : (commercialQuery.data?.data.quotes ?? []);
  const engagements =
    engagementsQuery.data?.status === "error"
      ? (engagementsQuery.data.staleData?.engagements ?? [])
      : (engagementsQuery.data?.data.engagements ?? []);
  const jobSheets =
    jobSheetsQuery.data?.status === "error"
      ? (jobSheetsQuery.data.staleData?.jobSheets ?? [])
      : (jobSheetsQuery.data?.data.jobSheets ?? []);
  const activityLogs =
    activityQuery.data?.status === "error"
      ? (activityQuery.data.staleData?.activityLogs ?? [])
      : (activityQuery.data?.data.activityLogs ?? []);
  const clientTasks = tasksQuery.data ?? [];
  const touchpoints = touchpointsQuery.data ?? [];
  const quoteById = new Map(clientQuotes.map((quote) => [quote.id, quote]));
  const products = productsQuery.isError ? [] : (productsQuery.data ?? []);
  const productById = new Map(products.map((product) => [product.id, product]));
  const activeEngagements = engagements.filter((engagement) => engagement.status === "active");
  const activeProductIds = new Set(activeEngagements.map((engagement) => engagement.product_id));
  const missingProducts = products.filter((product) => !activeProductIds.has(product.id));
  const latestAssessment =
    engagements
      .filter((engagement) => engagement.risk_reasoning)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title={identity.companyName}
        description={`${identity.tier ?? "Tier not set"} · ${identity.industry ?? "Industry not set"} · customer since ${formatDate(identity.createdAt)}`}
        backHref={{ to: "/clients", label: "All clients" }}
        secondaryActions={
          identity.accountId
            ? [
                <Button key="account-360" variant="outline" size="sm" asChild>
                  <Link to="/accounts/$id" params={{ id: identity.accountId }}>
                    Account 360
                  </Link>
                </Button>,
              ]
            : []
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              label: "Health",
              value: `${relationship.healthScore}/100`,
              hint: healthBandLabel(relationship.healthScore),
              tone:
                relationship.healthScore >= 75
                  ? "success"
                  : relationship.healthScore >= 55
                    ? "warning"
                    : "destructive",
            },
            {
              label: "ARR",
              value: formatCompactHKD(relationship.arr),
              hint: "annualised active engagements",
            },
            {
              label: "Renewal",
              value: relationship.renewalDate ? formatDate(relationship.renewalDate) : "Not set",
              hint: relationship.renewalDate
                ? RENEWAL_WINDOW_LABEL[getRenewalWindow(relationship.renewalDate, today)]
                : "no active engagement renews",
            },
            {
              label: "Onboarding",
              value: relationship.onboardingStatus.replace(/_/g, " "),
              hint: "current stage",
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="p-4 md:p-6">
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
                    <RestrictableTab
                      value="contacts"
                      label="Contacts"
                      count={counts.contacts}
                      restricted={restricted.contacts}
                    />
                    <RestrictableTab
                      value="engagements"
                      label="Engagements"
                      count={counts.engagements}
                      restricted={restricted.engagements}
                    />
                    <RestrictableTab
                      value="quotes"
                      label="Quotes"
                      count={counts.quotes}
                      restricted={restricted.quotes}
                    />
                    <RestrictableTab
                      value="job-sheets"
                      label="Job Sheets"
                      count={counts.jobSheets}
                      restricted={restricted.jobSheets}
                    />
                    <TabsTrigger value="tasks">Tasks</TabsTrigger>
                    <RestrictableTab
                      value="timeline"
                      label="Timeline"
                      count={null}
                      restricted={restricted.engagements}
                    />
                  </TabsList>
                </div>

                <TabsContent value="overview" className="mt-4 space-y-6">
                  <RelationshipHealthExplanation
                    healthScore={relationship.healthScore}
                    renewalRisk={relationship.renewalRisk}
                    renewalDate={relationship.renewalDate}
                    arr={relationship.arr}
                    onboardingStatus={relationship.onboardingStatus}
                    contactCount={counts.contacts}
                    engagements={engagements}
                    activeEngagements={activeEngagements}
                    restricted={restricted.engagements}
                    isLoading={engagementsQuery.isPending && !restricted.engagements}
                    hasError={
                      engagementsQuery.isError ||
                      (engagementsQuery.data?.status === "error" &&
                        !engagementsQuery.data.staleData)
                    }
                    today={today}
                  />

                  <AgentRiskAssessment
                    engagement={latestAssessment}
                    productName={
                      latestAssessment
                        ? (productById.get(latestAssessment.product_id)?.name ?? null)
                        : null
                    }
                    restricted={restricted.engagements}
                  />
                </TabsContent>

                <TabsContent value="engagements" className="mt-4">
                  <SectionGuard
                    restricted={restricted.engagements}
                    what="this client's engagements"
                    isLoading={engagementsQuery.isPending}
                    hasError={
                      engagementsQuery.isError ||
                      (engagementsQuery.data?.status === "error" &&
                        !engagementsQuery.data.staleData)
                    }
                    onRetry={() => void engagementsQuery.refetch()}
                    label="engagements"
                  >
                    <div className="space-y-4">
                      {engagements.length === 0 ? (
                        <EmptyWorkspaceState
                          title="No engagements yet"
                          description="An engagement is created when a won lead is converted or a quote is accepted."
                        />
                      ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {engagements.map((engagement) => (
                            <Card key={engagement.id} className="p-3">
                              <p className="text-sm font-medium">
                                {productById.get(engagement.product_id)?.name ??
                                  engagement.product_id}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {engagement.status.replace(/_/g, " ")} ·{" "}
                                {engagement.billing_period.replace(/_/g, " ")} ·{" "}
                                {formatCurrencyAmount(engagement.value, "HKD")}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <StatusBadge value={engagement.renewal_risk} />
                                <span className="text-xs text-muted-foreground">
                                  {engagement.renewal_date
                                    ? formatDate(engagement.renewal_date)
                                    : "No renewal date"}
                                </span>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                      {products.length > 0 && (
                        <div className="rounded-md border border-dashed border-border p-4 text-sm">
                          <span className="font-medium">
                            Uses {activeProductIds.size} of {products.length} active products.
                          </span>{" "}
                          {missingProducts.length > 0 && (
                            <span className="text-muted-foreground">
                              Gaps: {missingProducts.map((product) => product.name).join(", ")}.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </SectionGuard>
                </TabsContent>

                <TabsContent value="contacts" className="mt-4">
                  <SectionGuard
                    restricted={restricted.contacts}
                    what="this client's contacts"
                    isLoading={contactsQuery.isPending}
                    hasError={
                      contactsQuery.isError ||
                      (contactsQuery.data?.status === "error" && !contactsQuery.data.staleData)
                    }
                    onRetry={() => void contactsQuery.refetch()}
                    label="contacts"
                  >
                    <ClientContactsPanel clientId={clientId} contacts={clientContacts} />
                  </SectionGuard>
                </TabsContent>

                <TabsContent value="quotes" className="mt-4">
                  <SectionGuard
                    restricted={restricted.quotes}
                    what="this client's quotes"
                    isLoading={commercialQuery.isPending}
                    hasError={
                      commercialQuery.isError ||
                      (commercialQuery.data?.status === "error" && !commercialQuery.data.staleData)
                    }
                    onRetry={() => void commercialQuery.refetch()}
                    label="quotes"
                  >
                    {clientQuotes.length === 0 ? (
                      <EmptyWorkspaceState title="No quotes linked to this client" />
                    ) : (
                      <ul className="divide-y divide-border">
                        {clientQuotes.map((q) => (
                          <li key={q.id} className="flex items-center justify-between gap-3 py-3">
                            <Link
                              to="/quotes/$id"
                              params={{ id: q.id }}
                              className="text-sm font-medium hover:text-primary hover:underline"
                            >
                              {q.number}
                            </Link>
                            <div className="flex items-center gap-2">
                              <span className="text-sm tabular-nums">
                                {formatCurrencyAmount(q.total_value, q.currency)}
                              </span>
                              <StatusBadge value={q.status} domain="quotes" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionGuard>
                </TabsContent>

                <TabsContent value="job-sheets" className="mt-4">
                  <SectionGuard
                    restricted={restricted.jobSheets}
                    what="this client's job sheets"
                    isLoading={jobSheetsQuery.isPending}
                    hasError={
                      jobSheetsQuery.isError ||
                      (jobSheetsQuery.data?.status === "error" && !jobSheetsQuery.data.staleData)
                    }
                    onRetry={() => void jobSheetsQuery.refetch()}
                    label="job sheets"
                  >
                    {jobSheets.length === 0 ? (
                      <EmptyWorkspaceState
                        title="No job sheets yet"
                        description="A job sheet is raised when a quote is accepted."
                      />
                    ) : (
                      <ul className="space-y-2">
                        {jobSheets.map((sheet) => {
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
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
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
                  </SectionGuard>
                </TabsContent>

                <TabsContent value="tasks" className="mt-4">
                  <SectionGuard
                    restricted={false}
                    what="this client's tasks"
                    isLoading={tasksQuery.isPending}
                    hasError={tasksQuery.isError}
                    onRetry={() => void tasksQuery.refetch()}
                    label="tasks"
                  >
                    <ClientTasksPanel tasks={clientTasks} />
                  </SectionGuard>
                </TabsContent>

                <TabsContent value="timeline" className="mt-4">
                  <SectionGuard
                    restricted={restricted.engagements}
                    what="this client's history"
                    isLoading={activityQuery.isPending || touchpointsQuery.isPending}
                    hasError={
                      activityQuery.isError ||
                      (activityQuery.data?.status === "error" && !activityQuery.data.staleData) ||
                      touchpointsQuery.isError
                    }
                    onRetry={() => {
                      void activityQuery.refetch();
                      void touchpointsQuery.refetch();
                    }}
                    label="history"
                  >
                    <ClientTimeline touchpoints={touchpoints} activityLogs={activityLogs} />
                  </SectionGuard>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {/* The owner id, not a fixture lookup: the five hard-coded `APP_USERS` ids are
                  seeded nowhere, so every genuine profile id rendered "—" here. */}
              <Row label="Owner" value={ownership.accountOwnerId ?? "Unassigned"} />
              <Row label="Industry" value={identity.industry ?? "Not set"} />
              <Row label="Tier" value={identity.tier ?? "Not set"} />
              <Row label="Customer since" value={formatDate(identity.createdAt)} />
              <Row
                label="Renewal"
                value={
                  relationship.renewalDate ? formatDate(relationship.renewalDate) : "No renewal set"
                }
              />
              <Row
                label="Contacts"
                value={counts.contacts === null ? "Restricted" : String(counts.contacts)}
              />
              <Row
                label="Engagements"
                value={counts.engagements === null ? "Restricted" : String(counts.engagements)}
              />
              <Row
                label="Quotes"
                value={counts.quotes === null ? "Restricted" : String(counts.quotes)}
              />
              <Row
                label="Job sheets"
                value={counts.jobSheets === null ? "Restricted" : String(counts.jobSheets)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

const RESTRICTED_TAB_REASON = "You do not have access to this part of the client record.";

/**
 * A tab trigger that is disabled, with the reason, when the loader could not count its section.
 *
 * The reason is worded for a person: no capability string reaches the screen, for the same
 * reason `PermissionDeniedState` refuses to print one — telling an unauthorised reader the exact
 * capability to ask for by name is not a kindness.
 */
function RestrictableTab({
  value,
  label,
  count,
  restricted,
}: {
  value: string;
  label: string;
  count: number | null;
  restricted: boolean;
}) {
  const reasonId = `client-tab-${value}-restricted`;

  if (!restricted) {
    return (
      <TabsTrigger value={value}>{count === null ? label : `${label} (${count})`}</TabsTrigger>
    );
  }

  return (
    <span className="inline-flex items-center" title={RESTRICTED_TAB_REASON}>
      <TabsTrigger value={value} disabled aria-describedby={reasonId}>
        {label}
      </TabsTrigger>
      <span id={reasonId} className="sr-only">
        {RESTRICTED_TAB_REASON}
      </span>
    </span>
  );
}

/**
 * The three answers a tab body can give, in the order that keeps them apart.
 *
 * Authorization first: a denial is permanent and a Retry button on it is a lie. Only what is
 * left — a slow read or a failed one — gets the loading and retry treatment.
 */
function SectionGuard({
  restricted,
  what,
  isLoading,
  hasError,
  onRetry,
  label,
  children,
}: {
  restricted: boolean;
  what: string;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  label: string;
  children: ReactNode;
}) {
  if (restricted) {
    return <PermissionDeniedState what={what} />;
  }

  if (isLoading) {
    return <LoadingSkeleton variant="panel" label={label} />;
  }

  if (hasError) {
    return (
      <ErrorState
        kind="server"
        title={`These ${label} did not load`}
        onRetry={onRetry}
        retryLabel="Retry"
      />
    );
  }

  return <>{children}</>;
}

/**
 * Why this client's health score and renewal risk say what they say.
 *
 * A bare "72" is not a relationship signal, it is a number someone has to go and reverse
 * engineer. Both values are *derived*, not entered: `listClientsPage` and `getClient` roll them
 * up in SQL from the client's **active** engagements — health is the lowest engagement score,
 * renewal risk is the highest engagement risk, the renewal date is the earliest one, and ARR
 * annualises the engagement values. Every line below states one of those facts against the
 * records it was computed from, so nothing here is an opinion this page invented.
 */
function RelationshipHealthExplanation({
  healthScore,
  renewalRisk,
  renewalDate,
  arr,
  onboardingStatus,
  contactCount,
  engagements,
  activeEngagements,
  restricted,
  isLoading,
  hasError,
  today,
}: {
  healthScore: number;
  renewalRisk: string | null;
  renewalDate: string | null;
  arr: number | null;
  onboardingStatus: string;
  contactCount: number | null;
  engagements: Engagement[];
  activeEngagements: Engagement[];
  restricted: boolean;
  isLoading: boolean;
  hasError: boolean;
  today: string;
}) {
  const reasons: string[] = [];

  if (!restricted && !isLoading && !hasError) {
    if (activeEngagements.length === 0) {
      reasons.push(
        engagements.length === 0
          ? "There is no engagement on this client, so health falls back to the default of 50 and risk to Low."
          : `None of this client's ${engagements.length} engagements is active, so health falls back to the default of 50 and risk to Low.`,
      );
    } else {
      const lowest = activeEngagements.reduce((left, right) =>
        right.health_score < left.health_score ? right : left,
      );
      reasons.push(
        `Health is the lowest score across ${activeEngagements.length} active engagement${
          activeEngagements.length === 1 ? "" : "s"
        } — the lowest is ${lowest.health_score}.`,
      );

      const highRisk = activeEngagements.filter((e) => e.renewal_risk === "high").length;
      const mediumRisk = activeEngagements.filter((e) => e.renewal_risk === "medium").length;
      reasons.push(
        highRisk > 0
          ? `Renewal risk is the highest across active engagements: ${highRisk} scored High.`
          : mediumRisk > 0
            ? `Renewal risk is the highest across active engagements: ${mediumRisk} scored Medium, none High.`
            : "Every active engagement is scored Low risk.",
      );
    }

    if (renewalDate) {
      reasons.push(
        `The renewal date shown is the earliest across active engagements — ${formatDate(
          renewalDate,
        )}, ${RENEWAL_WINDOW_LABEL[getRenewalWindow(renewalDate, today)].toLowerCase()}.`,
      );
    } else {
      reasons.push("No active engagement carries a renewal date, so no renewal is scheduled.");
    }

    reasons.push(
      `ARR of ${formatCompactHKD(arr)} annualises the value of the active engagements above.`,
    );

    if (contactCount === 0) {
      reasons.push(
        "No contact is on file for this client, so there is nobody to reach for a renewal conversation.",
      );
    }

    reasons.push(`Onboarding is at "${onboardingStatus.replace(/_/g, " ")}".`);
  }

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Relationship health"
        description="Computed from this client's engagements — not entered by hand and not an agent's opinion."
      />
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums">{healthScore}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <span className="text-sm font-medium">{healthBandLabel(healthScore)}</span>
            {renewalRisk && (
              <span className="ml-auto inline-flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Renewal risk</span>
                <StatusBadge value={renewalRisk} />
              </span>
            )}
          </div>

          {restricted ? (
            <p className="text-sm text-muted-foreground">
              This score cannot be explained here: you do not have access to this client's
              engagements, and every part of it is derived from them.
            </p>
          ) : isLoading ? (
            <LoadingSkeleton variant="detail" rows={2} label="the reasons behind this score" />
          ) : hasError ? (
            <p className="text-sm text-muted-foreground">
              The engagement records this score is derived from could not be loaded, so it is shown
              without its reasons.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * The Renewal Risk Agent's written assessment, marked as machine output.
 *
 * `engagements.risk_reasoning` only ever holds text an agent wrote — `applyEngagementScore` is
 * its single writer, and both callers copy the agent run's payload verbatim. Rendering it beside
 * the derived numbers with no attribution invites a reader to take a model's sentence for a
 * decision a colleague made, so the marker here is words and an icon, never a colour.
 */
function AgentRiskAssessment({
  engagement,
  productName,
  restricted,
}: {
  engagement: Engagement | null;
  productName: string | null;
  restricted: boolean;
}) {
  if (restricted) return null;

  return (
    <section className="space-y-3">
      <SectionHeader title="Agent risk assessment" />
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              Agent output
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              Written by the Renewal Risk Agent — not a confirmed human decision.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 text-sm">
          {engagement === null ? (
            <p className="text-muted-foreground">
              No agent assessment is on record for this client. Renewal risk is re-scored from the
              Renewals workspace.
            </p>
          ) : (
            <>
              <p>{engagement.risk_reasoning}</p>
              {engagement.next_action && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Suggested next action:</span>{" "}
                  {engagement.next_action}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {productName ?? "Engagement"} · scored {formatDateTime(engagement.updated_at)}. A
                rise to High risk is held for human approval before it is applied; any other score
                the agent applies itself.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

type ContactDraft = { name: string; title: string; email: string; phone: string };

const EMPTY_DRAFT: ContactDraft = { name: "", title: "", email: "", phone: "" };

function ClientContactsPanel({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ClientContact[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContact | null>(null);
  const [removing, setRemoving] = useState<ClientContact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Both halves of the refresh, because the two numbers live in different places.
   *
   * `invalidateQueries` reaches the contacts section this list renders from. It cannot reach
   * loader data, and the "Contacts (n)" tab label and the Account card's count both come from
   * `Route.useLoaderData()` — which is why they never moved after an add or a remove. The route
   * loads directly rather than through `useQuery`, so the second half has to be a scoped
   * `router.invalidate`; a bare one would refetch every mounted loader in the app.
   */
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: crmQueryKeys.clients.section(clientId, "contacts"),
    });
    await router.invalidate({ filter: (match) => match.routeId === "/clients/$id" });
  };

  const create = async () => {
    if (submitting) return;
    if (!draft.name.trim()) {
      toast.error("Contact name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createClientContact({
        data: {
          client_id: clientId,
          name: draft.name.trim(),
          title: draft.title.trim() || undefined,
          email: draft.email.trim() || undefined,
          phone: draft.phone.trim() || undefined,
        },
      });
      await refresh();
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      toast.success(`Added contact ${created.name}`);
    } catch (error) {
      // The dialog stays open with the fields intact: a rejected create used to be an unhandled
      // promise, so the user saw nothing at all and clicked again.
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * `updateClientContact` has existed, exported and capability-checked, with no caller anywhere
   * in the product. This panel shipped Add and Remove but no way to correct a typo in an email
   * address, so the only route to a fix was delete-and-retype.
   */
  const saveEdit = async () => {
    if (!editing || submitting) return;
    if (!draft.name.trim()) {
      toast.error("Contact name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateClientContact({
        data: {
          id: editing.id,
          updates: {
            name: draft.name.trim(),
            title: draft.title.trim() || null,
            email: draft.email.trim() || null,
            phone: draft.phone.trim() || null,
          },
        },
      });
      await refresh();
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      toast.success(`Updated contact ${updated?.name ?? draft.name.trim()}`);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Confirmed, awaited, and reported.
   *
   * This was a bare ghost button that dropped the row from local state *before* the await
   * resolved and emitted no toast on either path — so a delete the server refused still looked
   * like it had worked, right up until the section query re-seeded the row.
   */
  const remove = async () => {
    if (!removing || busyId !== null) return;

    const target = removing;
    setBusyId(target.id);
    try {
      await deleteClientContact({ data: { id: target.id } });
      await refresh();
      setRemoving(null);
      toast.success(`Removed contact ${target.name}`);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (contact: ClientContact) => {
    setDraft({
      name: contact.name ?? "",
      title: contact.title ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
    setEditing(contact);
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Contacts"
        description="The people this relationship runs through."
        action={
          <Button
            size="sm"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setCreateOpen(true);
            }}
          >
            Add contact
          </Button>
        }
      />

      {contacts.length === 0 ? (
        <EmptyWorkspaceState
          title="No contacts yet"
          description="Add the person who owns this relationship on the client side."
        />
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {c.name}
                  {c.is_primary && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Star className="h-3 w-3" aria-hidden="true" /> Primary
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{c.title ?? "No title"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col items-start text-xs text-muted-foreground sm:items-end">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" aria-hidden="true" /> {c.email ?? "No email"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" aria-hidden="true" /> {c.phone ?? "No phone"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => openEdit(c)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => setRemoving(c)}
                >
                  {busyId === c.id ? "Removing…" : "Remove"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ContactDialog
        open={createOpen}
        title="New contact"
        description="Contacts are stored against this client and appear on its renewal work."
        submitLabel="Create"
        busyLabel="Creating…"
        submitting={submitting}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={create}
        onOpenChange={(next) => {
          if (submitting) return;
          setCreateOpen(next);
        }}
      />

      <ContactDialog
        open={editing !== null}
        title="Edit contact"
        description="Corrects the stored record. Everyone looking at this client sees the change."
        submitLabel="Save changes"
        busyLabel="Saving…"
        submitting={submitting}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={saveEdit}
        onOpenChange={(next) => {
          if (submitting) return;
          if (!next) setEditing(null);
        }}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (busyId !== null) return;
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The contact is deleted from this client. This cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            {/* preventDefault, then close only once the delete settles — otherwise the dialog is
                gone before the failure toast arrives and the toast has no context. */}
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {busyId !== null ? "Removing…" : "Remove contact"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactDialog({
  open,
  title,
  description,
  submitLabel,
  busyLabel,
  submitting,
  draft,
  onDraftChange,
  onSubmit,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  busyLabel: string;
  submitting: boolean;
  draft: ContactDraft;
  onDraftChange: (next: ContactDraft) => void;
  onSubmit: () => Promise<void>;
  onOpenChange: (next: boolean) => void;
}) {
  const idPrefix = title.toLowerCase().replace(/\s+/g, "-");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${idPrefix}-name`} className="text-xs">
              Name
            </Label>
            <Input
              id={`${idPrefix}-name`}
              name="name"
              autoComplete="name"
              className="mt-1"
              value={draft.name}
              onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-title`} className="text-xs">
              Title
            </Label>
            <Input
              id={`${idPrefix}-title`}
              name="organization-title"
              autoComplete="organization-title"
              className="mt-1"
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-email`} className="text-xs">
              Email
            </Label>
            <Input
              id={`${idPrefix}-email`}
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              className="mt-1"
              value={draft.email}
              onChange={(e) => onDraftChange({ ...draft, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-phone`} className="text-xs">
              Phone
            </Label>
            <Input
              id={`${idPrefix}-phone`}
              name="tel"
              type="tel"
              autoComplete="tel"
              className="mt-1"
              value={draft.phone}
              onChange={(e) => onDraftChange({ ...draft, phone: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void onSubmit()}>
            {submitting ? busyLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientTasksPanel({ tasks }: { tasks: TaskListItem[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyWorkspaceState
        title="No tasks for this client"
        description="Tasks raised from the Revenue Desk or the Tasks workspace appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            {/* Same restricted wording `/tasks` uses: `getTasks` nulls `title` for a task this
                reader's own `tasks.view` denies, and `restricted` says so rather than leaving
                the row looking merely untitled. */}
            <p className="text-sm font-medium">{t.restricted ? "Task restricted." : t.title}</p>
            <p className="text-xs text-muted-foreground">
              Due {t.due_date ? formatDate(t.due_date) : "—"} · {t.assigned_to ?? "Unassigned"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={t.priority} domain="priority" />
            <StatusBadge value={t.status} domain="tasks" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Touchpoints and activity log entries, newest first, through the shared timeline.
 *
 * The reason it is the shared one: `ActivityTimeline` marks an agent actor in words next to the
 * name. `activity_logs.actor_type` already distinguishes an agent from a person, and this page
 * used to flatten both into the same grey line — so "Renewal Risk Agent flagged high renewal
 * risk" read exactly like a colleague's note.
 */
function ClientTimeline({
  touchpoints,
  activityLogs,
}: {
  touchpoints: TouchpointRecord[];
  activityLogs: SerializableActivityLog[];
}) {
  const events: ActivityEvent[] = [
    ...touchpoints.map((t) => ({
      id: `tp-${t.id}`,
      at: t.occurred_at,
      kind: t.type,
      title: `${t.type.replace(/_/g, " ")} · ${t.sentiment}`,
      description: t.notes ?? undefined,
      actor: t.created_by_agent
        ? { name: "Agent", isAgent: true }
        : t.logged_by
          ? { name: t.logged_by }
          : undefined,
    })),
    ...activityLogs.map((a) => ({
      id: `al-${a.id}`,
      at: a.created_at,
      kind: a.object_type ?? "activity",
      title: a.action,
      actor: a.actor_name
        ? { name: a.actor_name, isAgent: a.actor_type === "agent" }
        : a.actor_type === "agent"
          ? { name: "Agent", isAgent: true }
          : undefined,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <ActivityTimeline
      events={events}
      groupByDay
      emptyMessage="Nothing has been logged against this client yet."
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}

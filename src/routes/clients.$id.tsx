import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail, Phone, Star, ArrowLeft } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientDetailSearchSchema } from "@/lib/admin-ux-search";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientWorkspaceSection } from "@/hooks/use-client-workspace-section";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { createClientContact, deleteClientContact } from "@/server-functions/client-contacts";
import { getTouchpointsByClient } from "@/server-functions/touchpoints";
import { getTasks } from "@/server-functions/tasks";
import { getProducts } from "@/server-functions/products";
import { getClientWorkspaceRead } from "@/server-functions/client-workspace";
import type { SerializableActivityLog } from "@/lib/serializable";
import { USER_RECORD } from "@/lib/users";
import type { ClientContact, Task, TouchpointRecord } from "@/lib/types";

const userById = (id: string) => (USER_RECORD[id] ? { name: USER_RECORD[id] } : undefined);

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Client not found</h1>
      <Link to="/clients" className="mt-2 inline-block text-sm text-primary hover:underline">
        ← Back to clients
      </Link>
    </div>
  ),
  component: ClientDetail,
});

function ClientDetail() {
  const workspace = Route.useLoaderData();
  const { identity, ownership, relationship, counts } = workspace;
  const clientId = identity.id;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab ?? "overview";
  const contactsQuery = useClientWorkspaceSection(clientId, "contacts", {
    enabled: activeTab === "contacts",
  });
  const commercialQuery = useClientWorkspaceSection(clientId, "commercial", {
    enabled: activeTab === "quotes",
  });
  const engagementsQuery = useClientWorkspaceSection(clientId, "engagements", {
    enabled: activeTab === "engagements",
  });
  const jobSheetsQuery = useClientWorkspaceSection(clientId, "job_sheets", {
    enabled: activeTab === "job-sheets",
  });
  const productsQuery = useQuery({
    queryKey: crmQueryKeys.products.list({ activeOnly: true }),
    queryFn: () => getProducts({ data: { activeOnly: true } }),
    enabled: activeTab === "engagements",
    staleTime: 5 * 60_000,
  });
  const activityQuery = useClientWorkspaceSection(clientId, "activity", {
    enabled: activeTab === "timeline",
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
  const owner = userById(ownership.accountOwnerId ?? "");
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
  const activeProductIds = new Set(
    engagements
      .filter((engagement) => engagement.status === "active")
      .map((engagement) => engagement.product_id),
  );
  const missingProducts = products.filter((product) => !activeProductIds.has(product.id));
  const latestRiskReasoning =
    engagements
      .filter((engagement) => engagement.risk_reasoning)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0]?.risk_reasoning ??
    null;
  return (
    <>
      <PageHeader
        title={identity.companyName}
        description={identity.tier + " | " + (identity.industry ?? "Industry not set")}
        actions={
          <>
            {identity.accountId && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/accounts/$id" params={{ id: identity.accountId }}>
                  Account 360
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/clients">
                <ArrowLeft className="mr-2 h-4 w-4" /> All clients
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
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
                  <TabsTrigger value="contacts">
                    <CountedTabLabel label="Contacts" count={counts.contacts} />
                  </TabsTrigger>
                  <TabsTrigger value="engagements">
                    <CountedTabLabel label="Engagements" count={counts.engagements} />
                  </TabsTrigger>
                  <TabsTrigger value="quotes">
                    <CountedTabLabel label="Quotes" count={counts.quotes} />
                  </TabsTrigger>
                  <TabsTrigger value="job-sheets">
                    <CountedTabLabel label="Job Sheets" count={counts.jobSheets} />
                  </TabsTrigger>
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Health score" value={String(relationship.healthScore)} />
                  <Stat label="ARR" value={formatCurrencyAmount(relationship.arr, "HKD")} />
                  <Stat label="Renewal" value={relationship.renewalDate ?? "Not set"} />
                  <Stat
                    label="Onboarding"
                    value={relationship.onboardingStatus.replace(/_/g, " ")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Contacts" value={formatWorkspaceCount(counts.contacts)} />
                  <Stat label="Engagements" value={formatWorkspaceCount(counts.engagements)} />
                  <Stat label="Quotes" value={formatWorkspaceCount(counts.quotes)} />
                  <Stat label="Job sheets" value={formatWorkspaceCount(counts.jobSheets)} />
                </div>
                {relationship.renewalRisk && (
                  <div className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
                    <span className="text-muted-foreground">Renewal risk</span>
                    <StatusBadge value={relationship.renewalRisk} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="engagements" className="mt-4">
                <DeferredTab
                  isLoading={engagementsQuery.isPending}
                  hasError={
                    engagementsQuery.isError ||
                    (engagementsQuery.data?.status === "error" && !engagementsQuery.data.staleData)
                  }
                  onRetry={() => {
                    void engagementsQuery.refetch();
                  }}
                >
                  <div className="space-y-4">
                    {latestRiskReasoning && (
                      <Card className="bg-muted/30">
                        <CardContent className="p-4 text-sm text-muted-foreground">
                          {latestRiskReasoning}
                        </CardContent>
                      </Card>
                    )}
                    {engagements.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No engagements yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {engagements.map((engagement) => (
                          <Card key={engagement.id} className="p-3">
                            <p className="text-sm font-medium">
                              {productById.get(engagement.product_id)?.name ??
                                engagement.product_id}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {engagement.status} | {engagement.billing_period} |{" "}
                              {formatCurrencyAmount(engagement.value, "HKD")}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <StatusBadge value={engagement.renewal_risk} />
                              <span className="text-xs text-muted-foreground">
                                {engagement.renewal_date ?? "Not set"}
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
                </DeferredTab>
              </TabsContent>
              <TabsContent value="contacts" className="mt-4">
                <DeferredTab
                  isLoading={contactsQuery.isPending}
                  hasError={
                    contactsQuery.isError ||
                    (contactsQuery.data?.status === "error" && !contactsQuery.data.staleData)
                  }
                  onRetry={() => void contactsQuery.refetch()}
                >
                  <ClientContactsPanel clientId={clientId} initialContacts={clientContacts} />
                </DeferredTab>
              </TabsContent>

              <TabsContent value="quotes" className="mt-4">
                <DeferredTab
                  isLoading={commercialQuery.isPending}
                  hasError={
                    commercialQuery.isError ||
                    (commercialQuery.data?.status === "error" && !commercialQuery.data.staleData)
                  }
                  onRetry={() => void commercialQuery.refetch()}
                >
                  {clientQuotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No quotes linked.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {clientQuotes.map((q) => (
                        <li key={q.id} className="flex items-center justify-between py-3">
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
                            <StatusBadge value={q.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </DeferredTab>
              </TabsContent>

              <TabsContent value="job-sheets" className="mt-4">
                <DeferredTab
                  isLoading={jobSheetsQuery.isPending}
                  hasError={
                    jobSheetsQuery.isError ||
                    (jobSheetsQuery.data?.status === "error" && !jobSheetsQuery.data.staleData)
                  }
                  onRetry={() => {
                    void jobSheetsQuery.refetch();
                  }}
                >
                  {jobSheets.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No accepted quote job sheets for this client yet.
                    </p>
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
                </DeferredTab>
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                <DeferredTab
                  isLoading={tasksQuery.isPending}
                  hasError={tasksQuery.isError}
                  onRetry={() => void tasksQuery.refetch()}
                >
                  <ClientTasksPanel tasks={clientTasks} />
                </DeferredTab>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <DeferredTab
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
                >
                  <ClientTimeline touchpoints={touchpoints} activityLogs={activityLogs} />
                </DeferredTab>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Owner" value={owner?.name ?? "—"} />
            <Row label="Industry" value={identity.industry ?? "Not set"} />
            <Row label="Tier" value={identity.tier ?? "Not set"} />
            <Row label="Customer since" value={formatDate(identity.createdAt)} />
            <Row label="Renewal" value={relationship.renewalDate ?? "Not set"} />
            <Row label="Health score" value={String(relationship.healthScore)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function formatWorkspaceCount(count: number | null) {
  return count === null ? "Restricted" : String(count);
}

function CountedTabLabel({ label, count }: { label: string; count: number | null }) {
  return count === null ? label : label + " (" + count + ")";
}
function DeferredTab({
  isLoading,
  hasError,
  onRetry,
  children,
}: {
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading client details...
      </p>
    );
  }

  if (hasError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
      >
        <span>Client details are temporarily unavailable.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return children;
}
function ClientContactsPanel({
  clientId,
  initialContacts,
}: {
  clientId: string;
  initialContacts: ClientContact[];
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState(initialContacts);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // The panel keeps a local copy for immediate feedback, but the section query is the source of
  // truth on remount. Without this invalidation a contact added here vanished the moment you
  // switched tabs and came back inside the stale time — the panel re-seeded from a cache that
  // still held the pre-write list — and the "Contacts (n)" tab count never moved.
  const refreshContacts = () =>
    queryClient.invalidateQueries({
      queryKey: crmQueryKeys.clients.section(clientId, "contacts"),
    });

  const create = async () => {
    const created = await createClientContact({
      data: { client_id: clientId, name: name || "Unnamed", title, email, phone },
    });
    setRows((prev) => [...prev, created]);
    setOpen(false);
    setName("");
    setTitle("");
    setEmail("");
    setPhone("");
    toast.success(`Added contact ${created.name}`);
    await refreshContacts();
  };

  const remove = async (id: string) => {
    await deleteClientContact({ data: { id } });
    setRows((prev) => prev.filter((c) => c.id !== id));
    await refreshContacts();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Add contact</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New contact</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="new-contact-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="new-contact-name"
                  name="name"
                  autoComplete="name"
                  className="mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-contact-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="new-contact-title"
                  name="organization-title"
                  autoComplete="organization-title"
                  className="mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-contact-email" className="text-xs">
                  Email
                </Label>
                <Input
                  id="new-contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  className="mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-contact-phone" className="text-xs">
                  Phone
                </Label>
                <Input
                  id="new-contact-phone"
                  name="tel"
                  type="tel"
                  autoComplete="tel"
                  className="mt-1"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">
                  {c.name}
                  {c.is_primary && <Star className="ml-1 inline h-3 w-3 text-warning-foreground" />}
                </p>
                <p className="text-xs text-muted-foreground">{c.title}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {c.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientTasksPanel({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">{t.title}</p>
            <p className="text-xs text-muted-foreground">
              Due {t.due_date ?? "—"} · {userById(t.assigned_to ?? "")?.name ?? "Unassigned"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={t.priority} />
            <StatusBadge value={t.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type TimelineEntry = {
  id: string;
  kind: "touchpoint" | "activity";
  occurredAt: string;
  label: string;
  detail: string | null;
};

function ClientTimeline({
  touchpoints,
  activityLogs,
}: {
  touchpoints: TouchpointRecord[];
  activityLogs: SerializableActivityLog[];
}) {
  const entries: TimelineEntry[] = [
    ...touchpoints.map((t) => ({
      id: `tp-${t.id}`,
      kind: "touchpoint" as const,
      occurredAt: t.occurred_at,
      label: `${t.type.replace("_", " ")} (${t.sentiment})`,
      detail: t.notes,
    })),
    ...activityLogs.map((a) => ({
      id: `al-${a.id}`,
      kind: "activity" as const,
      occurredAt: a.created_at,
      label: `${a.actor_name ?? a.actor_type ?? "System"} ${a.action}`,
      detail: null,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline events yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="text-sm">
          <span className="font-medium capitalize">{e.label}</span>
          {e.detail && <p className="text-muted-foreground">{e.detail}</p>}
          <div className="text-xs text-muted-foreground">{formatDateTime(e.occurredAt)}</div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold capitalize">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="capitalize">{value}</span>
    </div>
  );
}

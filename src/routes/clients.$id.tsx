import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { FileText, Mail, Phone, Star, ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/format";
import { getClient } from "@/server-functions/clients";
import { getQuotes } from "@/server-functions/quotes";
import { getEngagementsByClient } from "@/server-functions/engagements";
import { getClientContacts } from "@/server-functions/client-contacts";
import { getTouchpointsByClient } from "@/server-functions/touchpoints";
import { getProducts } from "@/server-functions/products";
import { USER_RECORD } from "@/lib/users";

const userById = (id: string) => (USER_RECORD[id] ? { name: USER_RECORD[id] } : undefined);

// Static placeholder data for tabs not yet backed by server functions
type FileAsset = { id: string; client_id: string; name: string; size: string; uploaded_at: string; uploaded_by: string };
type ActivityLog = { id: string; actor_type: string; actor_name: string; action: string; object_type: string; object_id: string; created_at: string };
type TaskStub = { id: string; title: string; description: string; assigned_to: string; client_id: string | null; due_date: string; priority: string; status: string };

const clientFiles: FileAsset[] = [];
const activityLogs: ActivityLog[] = [];
const tasks: TaskStub[] = [];

export const Route = createFileRoute("/clients/$id")({
  loader: async ({ params }) => {
    const [client, allQuotes, engagements, contacts, touchpoints, products] = await Promise.all([
      getClient({ data: { id: params.id } }),
      getQuotes({}),
      getEngagementsByClient({ data: { clientId: params.id } }),
      getClientContacts({ data: { clientId: params.id } }),
      getTouchpointsByClient({ data: { clientId: params.id } }),
      getProducts({ data: { activeOnly: true } }),
    ]);
    return {
      client,
      quotes: allQuotes.filter((q) => q.client_id === params.id),
      engagements,
      contacts,
      touchpoints,
      products,
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.client?.company_name ?? "Client"} — ClientOps` },
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
  const { client, quotes: clientQuotes, engagements, contacts, products } = Route.useLoaderData();
  const owner = userById(client.account_owner ?? "");
  const clientTasks = tasks.filter((t) => t.client_id === client.id);
  const clientHistory = activityLogs.filter(
    (a) => a.object_type === "client" && a.object_id === client.id,
  );
  const clientContacts = contacts.filter((c) => c.client_id === client.id);
  const files = clientFiles.filter((f) => f.client_id === client.id);

  const productById = (id: string) => products.find((p) => p.id === id);
  const activeProductIds = new Set(engagements.filter((e) => e.status === "active").map((e) => e.product_id));
  const missingProducts = products.filter((p) => !activeProductIds.has(p.id));
  const latestRiskReasoning = engagements
    .filter((e) => e.risk_reasoning)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.risk_reasoning ?? null;

  return (
    <>
      <PageHeader
        title={client.company_name}
        description={`${client.tier} · ${client.industry}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/clients">
              <ArrowLeft className="mr-2 h-4 w-4" /> All clients
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="contacts">Contacts ({clientContacts.length})</TabsTrigger>
                <TabsTrigger value="quotes">Quotes ({clientQuotes.length})</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({clientTasks.length})</TabsTrigger>
                <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Health score" value={String(client.health_score)} />
                  <Stat label="ARR" value={`HKD ${(client.arr ?? 0).toLocaleString()}`} />
                  <Stat label="Renewal" value={client.renewal_date ?? "—"} />
                  <Stat label="Onboarding" value={client.onboarding_status.replace(/_/g, " ")} />
                </div>

                {latestRiskReasoning && (
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 text-sm text-muted-foreground">{latestRiskReasoning}</CardContent>
                  </Card>
                )}

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Engagements</h3>
                  {engagements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No engagements yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {engagements.map((e) => (
                        <Card key={e.id} className="p-3">
                          <p className="text-sm font-medium">{productById(e.product_id)?.name ?? e.product_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {e.status} · {e.billing_period} · HKD {(e.value ?? 0).toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <StatusBadge value={e.renewal_risk} />
                            <span className="text-xs text-muted-foreground">{e.renewal_date ?? "—"}</span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <Card className="border-dashed">
                  <CardContent className="p-4 text-sm">
                    <span className="font-medium">Uses {activeProductIds.size} of {products.length} products.</span>{" "}
                    {missingProducts.length > 0 && (
                      <span className="text-muted-foreground">Gaps: {missingProducts.map((p) => p.name).join(", ")}.</span>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contacts" className="mt-4">
                {clientContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contacts yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {clientContacts.map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium">
                            {c.name}
                            {c.is_primary && (
                              <Star className="ml-1 inline h-3 w-3 text-warning-foreground" />
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{c.title}</p>
                        </div>
                        <div className="flex flex-col items-end text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="quotes" className="mt-4">
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
                            {q.currency} {q.total_value.toLocaleString()}
                          </span>
                          <StatusBadge value={q.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                {clientTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {clientTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {t.due_date} · {userById(t.assigned_to)?.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge value={t.priority} />
                          <StatusBadge value={t.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="files" className="mt-4">
                {files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {files.map((f) => (
                      <li key={f.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.size} · uploaded by {f.uploaded_by} · {formatDate(f.uploaded_at)}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                {clientHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history events yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {clientHistory.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="font-medium">{a.actor_name}</span>{" "}
                        <span className="text-muted-foreground">{a.action}</span>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(a.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
            <Row label="Industry" value={client.industry} />
            <Row label="Tier" value={client.tier} />
            <Row label="Customer since" value={formatDate(client.created_at)} />
            <Row label="Health score" value={String(client.health_score)} />
          </CardContent>
        </Card>
      </div>
    </>
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

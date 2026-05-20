import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, FileText, Mail, Phone, Star } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  activityLogs,
  clientById,
  clientFiles,
  contacts,
  quotes,
  tasks,
  userById,
} from "@/lib/mock-data";

export const Route = createFileRoute("/clients/$id")({
  loader: ({ params }) => {
    const client = clientById(params.id);
    if (!client) throw notFound();
    return { client };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.client.company_name ?? "Client"} — ClientOps` },
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
  const { client } = Route.useLoaderData();
  const owner = userById(client.account_owner);
  const clientTasks = tasks.filter((t) => t.client_id === client.id);
  const clientHistory = activityLogs.filter(
    (a) => a.object_type === "client" && a.object_id === client.id,
  );
  const clientContacts = contacts.filter((c) => c.client_id === client.id);
  const clientQuotes = quotes.filter((q) => q.client_id === client.id);
  const files = clientFiles.filter((f) => f.client_id === client.id);

  const [health, setHealth] = useState(client.health_score);

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
                  <Stat label="Health score" value={String(health)} />
                  <Stat label="ARR" value={`HKD ${client.arr.toLocaleString()}`} />
                  <Stat label="Renewal" value={client.renewal_date} />
                  <Stat label="Onboarding" value={client.onboarding_status.replace(/_/g, " ")} />
                </div>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    Client Success Agent notes: account is on track for renewal. Last QBR captured
                    strong NPS but flagged a gap in adoption among R&D team. Recommended action:
                    schedule enablement workshop in Q3.
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
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Health score</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-secondary/70">
                    {health} · edit
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48">
                  <Label className="text-xs">Set score (0-100)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1"
                    value={health}
                    onChange={(e) => setHealth(Number(e.target.value) || 0)}
                  />
                  <Button
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => toast.success("Health score updated")}
                  >
                    Save
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
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

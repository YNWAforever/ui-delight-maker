import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Bot, Mail, Phone, Sparkles, User } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { activityLogs, leadById, quotes, userById } from "@/lib/mock-data";

export const Route = createFileRoute("/leads/$id")({
  loader: ({ params }) => {
    const lead = leadById(params.id);
    if (!lead) throw notFound();
    return { lead };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.lead.company_name ?? "Lead"} — ClientOps` },
      {
        name: "description",
        content: `Lead profile for ${loaderData?.lead.company_name}, including qualification data and activity.`,
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-muted-foreground">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Lead not found</h1>
      <Link to="/leads" className="mt-2 inline-block text-sm text-primary hover:underline">
        ← Back to leads
      </Link>
    </div>
  ),
  component: LeadDetail,
});

const fmt = new Intl.DateTimeFormat("en-HK", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function LeadDetail() {
  const { lead } = Route.useLoaderData();
  const owner = userById(lead.assigned_to);
  const relatedQuotes = quotes.filter((q) => q.lead_id === lead.id);
  const leadActivity = activityLogs.filter(
    (a) => a.object_type === "lead" && a.object_id === lead.id,
  );

  return (
    <>
      <PageHeader
        title={lead.company_name}
        description={`${lead.id} · created ${fmt.format(new Date(lead.created_at))}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/leads">
                <ArrowLeft className="mr-2 h-4 w-4" /> All leads
              </Link>
            </Button>
            <Button size="sm">Convert to client</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enquiry</CardTitle>
            </CardHeader>
            <CardContent>
              <blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-foreground">
                {lead.enquiry_text}
              </blockquote>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Qualification Agent output</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.qualification_data ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <KV label="Lead type" value={lead.qualification_data.lead_type} />
                  <KV label="Urgency" value={lead.qualification_data.urgency} />
                  <KV label="Budget range" value={lead.qualification_data.estimated_budget_range} />
                  <KV
                    label="Qualification score"
                    value={`${lead.qualification_data.qualification_score} / 100`}
                  />
                  <KV
                    label="Service interest"
                    value={lead.qualification_data.service_interest.join(", ")}
                  />
                  <KV
                    label="Confidence"
                    value={`${(lead.qualification_data.confidence * 100).toFixed(0)}%`}
                  />
                  <KV
                    label="Recommended next action"
                    value={lead.qualification_data.recommended_next_action.replace(/_/g, " ")}
                  />
                  <KV
                    label="Human review"
                    value={lead.qualification_data.human_review_required ? "Required" : "Not required"}
                  />
                  {lead.qualification_data.missing_information.length > 0 && (
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Missing information
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {lead.qualification_data.missing_information.map((m: string) => (
                          <span
                            key={m}
                            className="rounded-md bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground"
                          >
                            {m.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This lead has not yet been qualified. The Qualification Agent will run shortly.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related quotes</CardTitle>
            </CardHeader>
            <CardContent>
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
                          {q.line_items.length} items · valid until {q.valid_until}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">
                          {q.currency} {q.total_value.toLocaleString()}
                        </span>
                        <StatusBadge value={q.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge value={lead.status} />
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
                <p className="mt-1">{owner?.name ?? "Unassigned"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {leadActivity.length === 0 && (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              )}
              {leadActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <div
                    className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                      a.actor_type === "agent"
                        ? "bg-primary/10 text-primary"
                        : "bg-accent text-accent-foreground"
                    }`}
                  >
                    {a.actor_type === "agent" ? (
                      <Bot className="h-3 w-3" />
                    ) : (
                      <User className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1 text-sm">
                    <p>
                      <span className="font-medium">{a.actor_name}</span>{" "}
                      <span className="text-muted-foreground">{a.action}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.format(new Date(a.created_at))}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm capitalize">{value}</p>
    </div>
  );
}

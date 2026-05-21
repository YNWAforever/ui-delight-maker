import { useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Download,
  File as FileIcon,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import {
  activityLogs,
  leadById,
  leadComments,
  leadFiles,
  leadNotes,
  quotes,
  userById,
  type LeadComment,
  type LeadFile,
  type LeadStatus,
} from "@/lib/mock-data";

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
        content: `Lead profile for ${loaderData?.lead.company_name}, with qualification data and activity.`,
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

const STATUSES: LeadStatus[] = ["new", "qualified", "replied", "quoted", "approved", "won", "lost"];

function LeadDetail() {
  const { lead } = Route.useLoaderData();
  const navigate = useNavigate();
  const owner = userById(lead.assigned_to);
  const relatedQuotes = quotes.filter((q) => q.lead_id === lead.id);
  const leadActivity = activityLogs.filter(
    (a) => a.object_type === "lead" && a.object_id === lead.id,
  );
  const initialNotes = leadNotes.filter((n) => n.lead_id === lead.id);
  const initialComments = leadComments.filter((c) => c.lead_id === lead.id);
  const initialFiles = leadFiles.filter((f) => f.lead_id === lead.id);

  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(initialNotes);
  const [composer, setComposer] = useState("");
  const [comments, setComments] = useState<LeadComment[]>(initialComments);
  const [commentDraft, setCommentDraft] = useState("");
  const [files, setFiles] = useState<LeadFile[]>(initialFiles);

  const addNote = () => {
    if (!composer.trim()) return;
    setNotes((prev) => [
      {
        id: `LN-${Math.random().toString(36).slice(2, 7)}`,
        lead_id: lead.id,
        author: "Ada Wong",
        body: composer.trim(),
        created_at: new Date("2026-05-20T10:00:00Z").toISOString(),
      },
      ...prev,
    ]);
    setComposer("");
    toast.success("Note added");
  };

  const addComment = () => {
    if (!commentDraft.trim()) return;
    setComments((prev) => [
      ...prev,
      {
        id: `LC-${Math.random().toString(36).slice(2, 7)}`,
        lead_id: lead.id,
        author: "Ada Wong",
        body: commentDraft.trim(),
        created_at: new Date("2026-05-20T10:00:00Z").toISOString(),
      },
    ]);
    setCommentDraft("");
    toast.success("Comment posted");
  };

  const uploadMockFile = () => {
    const stamp = Math.floor(Math.random() * 900 + 100);
    const f: LeadFile = {
      id: `LF-${Math.random().toString(36).slice(2, 7)}`,
      lead_id: lead.id,
      name: `Attachment_${stamp}.pdf`,
      size: `${(Math.random() * 2 + 0.1).toFixed(1)} MB`,
      kind: "pdf",
      uploaded_at: new Date("2026-05-20T10:00:00Z").toISOString(),
      uploaded_by: "Ada Wong",
    };
    setFiles((prev) => [f, ...prev]);
    toast.success(`Uploaded ${f.name}`);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    toast.message("File removed");
  };

  return (
    <>
      <PageHeader
        title={lead.company_name}
        description={`${lead.id} · created ${formatDateTime(lead.created_at)}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/leads">
                <ArrowLeft className="mr-2 h-4 w-4" /> All leads
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate({ to: "/quotes/new", search: { leadId: lead.id } as never })}
            >
              <FileText className="mr-2 h-4 w-4" /> Generate quote
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="quotes">Quotes ({relatedQuotes.length})</TabsTrigger>
                  <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
                  <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
                  <TabsTrigger value="insights">AI insights</TabsTrigger>
                </TabsList>

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
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Textarea
                        placeholder="Add a note…"
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        className="min-h-[60px] flex-1"
                      />
                      <Button size="sm" onClick={addNote}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <ul className="mt-3 space-y-3">
                      {notes.map((n) => (
                        <li
                          key={n.id}
                          className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{n.author}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(n.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 leading-snug">{n.body}</p>
                        </li>
                      ))}
                      {notes.length === 0 && (
                        <p className="text-xs text-muted-foreground">No notes yet.</p>
                      )}
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-4 space-y-3">
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
                          {formatDateTime(a.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
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
                </TabsContent>

                <TabsContent value="files" className="mt-4">
                  <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Drop discovery decks, RFPs, and emails here.
                  </div>
                </TabsContent>

                <TabsContent value="insights" className="mt-4">
                  {lead.qualification_data ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <KV label="Lead type" value={lead.qualification_data.lead_type} />
                      <KV label="Urgency" value={lead.qualification_data.urgency} />
                      <KV label="Budget" value={lead.qualification_data.estimated_budget_range} />
                      <KV
                        label="Score"
                        value={`${lead.qualification_data.qualification_score} / 100`}
                      />
                      <KV
                        label="Interest"
                        value={lead.qualification_data.service_interest.join(", ")}
                      />
                      <KV
                        label="Confidence"
                        value={`${(lead.qualification_data.confidence * 100).toFixed(0)}%`}
                      />
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Recommended next action
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">
                          <Sparkles className="h-3.5 w-3.5" />
                          {lead.qualification_data.recommended_next_action.replace(/_/g, " ")}
                        </p>
                      </div>
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
                      Qualification pending. Run the Qualification Agent from the agents page.
                    </p>
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
                  onValueChange={(v) => {
                    setStatus(v as LeadStatus);
                    toast.success(`Status updated to ${v.replace(/_/g, " ")}`);
                  }}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

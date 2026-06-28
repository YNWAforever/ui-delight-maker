import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
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
import { useSupabaseSubscription } from "@/hooks/use-supabase-subscription";
import type { Lead, LeadStatus } from "@/lib/types";
import { getLead, triggerLeadAgent, updateLead } from "@/server-functions/leads";
import { getQuotes, triggerQuoteAgent } from "@/server-functions/quotes";

// Local types for UI-only state (files/comments not yet in Supabase)
type LeadComment = {
  id: string;
  lead_id: string;
  author: string;
  body: string;
  created_at: string;
};
type LeadFile = {
  id: string;
  lead_id: string;
  name: string;
  size: string;
  kind: string;
  uploaded_at: string;
  uploaded_by: string;
};

export const Route = createFileRoute("/leads/$id")({
  loader: async ({ params }) => {
    const [leadData, quotes] = await Promise.all([
      getLead({ data: { id: params.id } }),
      getQuotes({ data: { lead_id: params.id } }),
    ]);
    return { ...leadData, quotes };
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
  const { lead, activityLogs, quotes: relatedQuotes } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();

  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState<
    { id: string; lead_id: string; author: string; body: string; created_at: string }[]
  >([]);
  const [composer, setComposer] = useState("");
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [files, setFiles] = useState<LeadFile[]>([]);

  useSupabaseSubscription("leads", "UPDATE", `id=eq.${lead.id}`, () => router.invalidate());

  const handleGenerateQuote = async () => {
    await triggerQuoteAgent({ data: { leadId: lead.id } });
    toast.success("Quote agent triggered — quote will appear shortly");
  };

  const handleStatusChange = async (nextStatus: LeadStatus) => {
    setStatus(nextStatus);
    await updateLead({ data: { id: lead.id, updates: { status: nextStatus } } });
    toast.success(`Status updated to ${nextStatus.replace(/_/g, " ")}`);
    router.invalidate();
  };

  const handleQualifyLead = async () => {
    await triggerLeadAgent({ data: { leadId: lead.id } });
    toast.success("Qualification agent queued");
  };

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
            <Button variant="outline" size="sm" onClick={handleQualifyLead}>
              <Sparkles className="mr-2 h-4 w-4" /> Qualify
            </Button>
            <Button variant="outline" size="sm" onClick={handleGenerateQuote}>
              <Sparkles className="mr-2 h-4 w-4" /> Generate Quote
            </Button>
            <Button
              size="sm"
              onClick={() => navigate({ to: "/quotes/new", search: { leadId: lead.id } as never })}
            >
              <FileText className="mr-2 h-4 w-4" /> New quote
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
                  {activityLogs.length === 0 && (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  )}
                  {activityLogs.map((a) => (
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

                <TabsContent value="files" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Discovery decks, RFPs, signed proposals, and email threads.
                    </p>
                    <Button size="sm" variant="outline" onClick={uploadMockFile}>
                      <Upload className="mr-2 h-3.5 w-3.5" /> Upload
                    </Button>
                  </div>
                  {files.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No files yet. Drop discovery decks, RFPs, and emails here.
                    </div>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {files.map((f) => (
                        <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <FileIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.size} · <span className="uppercase">{f.kind}</span> ·{" "}
                              {f.uploaded_by} · {formatDateTime(f.uploaded_at)}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toast.message(`Downloading ${f.name}…`)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeFile(f.id)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="comments" className="mt-4 space-y-3">
                  <ul className="space-y-3">
                    {comments.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <MessageSquare className="h-3 w-3" />
                          </div>
                          <span className="font-medium">{c.author}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDateTime(c.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 leading-snug">{c.body}</p>
                      </li>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No comments yet. Start the conversation below.
                      </p>
                    )}
                  </ul>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Reply to the thread…"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      className="min-h-[60px] flex-1"
                    />
                    <Button size="sm" onClick={addComment}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="insights" className="mt-4">
                  {lead.qualification_data ? (
                    <div className="space-y-4 p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Urgency</span>
                          <p className="font-medium">
                            {lead.qualification_data.urgency_score} / 10
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fit</span>
                          <p className="font-medium">{lead.qualification_data.fit_score} / 10</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Budget</span>
                          <p className="font-medium">{lead.qualification_data.budget_range}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Confidence</span>
                          <p className="font-medium">
                            {(lead.qualification_data.confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Score</span>
                          <p className="font-medium">
                            {lead.qualification_data.qualification_score} / 100
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Services of interest</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {lead.qualification_data.service_interest.map((s: string) => (
                            <span
                              key={s}
                              className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      {lead.qualification_data.reason && (
                        <div>
                          <p className="text-sm text-muted-foreground">Reason</p>
                          <p className="text-sm">{lead.qualification_data.reason}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Recommended action</p>
                        <p className="text-sm font-medium">{lead.qualification_data.next_action}</p>
                      </div>
                      {lead.qualification_data.human_review_required && (
                        <p className="text-xs bg-amber-500/15 text-amber-700 px-2 py-1 rounded">
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
                  onValueChange={(v) => void handleStatusChange(v as LeadStatus)}
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
                <p className="mt-1">{lead.assigned_to ?? "Unassigned"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

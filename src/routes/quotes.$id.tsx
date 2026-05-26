import { useState } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  File as FileIcon,
  FileText,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { getQuote, getPricingTemplates, requestQuoteApproval, updateQuote } from "@/server-functions/quotes";
import { decideApproval } from "@/server-functions/approvals";
import { USER_RECORD } from "@/lib/users";
import type { QuoteStatus } from "@/lib/types";

type Comment = { id: string; quote_id: string; author: string; body: string; created_at: string };
type QuoteFile = { id: string; quote_id: string; name: string; size: string; kind: "pdf" | "docx" | "image" | "email"; uploaded_at: string; uploaded_by: string };
type QuoteVersion = { version: number; quote_id: string; changed_by: string; summary: string; created_at: string };

const userById = (id: string) => (USER_RECORD[id] ? { name: USER_RECORD[id] } : undefined);
// Lead lookups are not available client-side without a server call; return undefined gracefully
const leadById = (_id: string) => undefined;
const quoteComments: Comment[] = [];
const quoteFiles: QuoteFile[] = [];
const quoteVersions: QuoteVersion[] = [];

export const Route = createFileRoute("/quotes/$id")({
  validateSearch: z.object({
    edit: z.boolean().optional(),
    approvalId: z.string().optional(),
  }),
  loader: async ({ params }) => {
    const [quote, templates] = await Promise.all([
      getQuote({ data: { id: params.id } }),
      getPricingTemplates(),
    ]);
    return { quote, templates };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.quote?.number ?? "Quote"} — ClientOps` },
      { name: "description", content: `Quote details, approval status, and PDF preview.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Quote not found</h1>
      <Link to="/quotes" className="mt-2 inline-block text-sm text-primary hover:underline">
        ← Back to quotes
      </Link>
    </div>
  ),
  component: QuoteDetail,
});

const TIMELINE: QuoteStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "viewed",
  "accepted",
];

function QuoteDetail() {
  const { quote, templates } = Route.useLoaderData();
  const { edit, approvalId } = Route.useSearch();
  const isEditMode = edit === true || quote.status === "draft";
  const router = useRouter();
  const lead = leadById(quote.lead_id ?? "");
  const creator = userById(quote.created_by ?? "");
  const approver = quote.approved_by ? userById(quote.approved_by) : null;
  const initialComments = quoteComments.filter((c) => c.quote_id === quote.id);
  const versions = quoteVersions.filter((v) => v.quote_id === quote.id);
  const initialFiles = quoteFiles.filter((f) => f.quote_id === quote.id);

  const [status, setStatus] = useState<QuoteStatus>(quote.status as QuoteStatus);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [composer, setComposer] = useState("");
  const [files, setFiles] = useState<QuoteFile[]>(initialFiles);

  const reachedIdx = TIMELINE.indexOf(status);

  const advance = async (next: QuoteStatus, msg: string) => {
    await updateQuote({ data: { id: quote.id, updates: { status: next } } });
    setStatus(next);
    router.invalidate();
    toast.success(msg);
  };

  const handleRequestApproval = async () => {
    await requestQuoteApproval({ data: { id: quote.id } });
    setStatus("pending_approval");
    router.invalidate();
    toast.success("Submitted for approval");
  };

  const addComment = () => {
    if (!composer.trim()) return;
    setComments((prev) => [
      ...prev,
      {
        id: `QC-${Math.random().toString(36).slice(2, 7)}`,
        quote_id: quote.id,
        author: "Ada Wong",
        body: composer.trim(),
        created_at: new Date("2026-05-20T10:00:00Z").toISOString(),
      },
    ]);
    setComposer("");
    toast.success("Comment posted");
  };

  const uploadMockFile = () => {
    const stamp = Math.floor(Math.random() * 900 + 100);
    const f: QuoteFile = {
      id: `QF-${Math.random().toString(36).slice(2, 7)}`,
      quote_id: quote.id,
      name: `${quote.number}_attachment_${stamp}.pdf`,
      size: `${(Math.random() * 1.5 + 0.1).toFixed(1)} MB`,
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
        title={quote.number}
        description={`${lead?.company_name ?? "—"} · ${quote.currency} ${(quote.total_value ?? 0).toLocaleString()}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/quotes">
                <ArrowLeft className="mr-2 h-4 w-4" /> All
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.message("PDF download mocked")}>
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
            {status === "draft" && (
              <Button size="sm" onClick={handleRequestApproval}>
                <Send className="mr-2 h-4 w-4" /> Submit for approval
              </Button>
            )}
            {status === "pending_approval" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => advance("rejected", "Quote rejected")}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button size="sm" onClick={() => advance("approved", "Quote approved")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                </Button>
              </>
            )}
            {status === "approved" && (
              <Button size="sm" onClick={() => advance("sent", "Sent to client")}>
                <Send className="mr-2 h-4 w-4" /> Send to client
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <Tabs defaultValue="items">
                <TabsList>
                  <TabsTrigger value="items">Line items</TabsTrigger>
                  <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
                  <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
                  <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
                  <TabsTrigger value="preview">PDF preview</TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Service</th>
                        <th className="py-2 text-right font-medium">Qty</th>
                        <th className="py-2 text-right font-medium">Unit</th>
                        <th className="py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {quote.line_items.map((li: typeof quote.line_items[number]) => (
                        <tr key={li.id}>
                          <td className="py-3">
                            <div className="font-medium">{li.service}</div>
                            <div className="text-xs text-muted-foreground">{li.description}</div>
                          </td>
                          <td className="py-3 text-right tabular-nums">{li.qty}</td>
                          <td className="py-3 text-right tabular-nums">
                            {li.unit_price.toLocaleString()}
                          </td>
                          <td className="py-3 text-right font-medium tabular-nums">
                            {(li.qty * li.unit_price).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={3} className="py-3 text-right text-sm font-semibold">
                          Total
                        </td>
                        <td className="py-3 text-right text-base font-semibold tabular-nums">
                          {quote.currency} {quote.total_value.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </TabsContent>

                <TabsContent value="comments" className="mt-4">
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div key={c.id} className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.author}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(c.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 leading-snug">{c.body}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-sm text-muted-foreground">No comments yet.</p>
                    )}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Add a comment…"
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        className="min-h-[60px] flex-1"
                      />
                      <Button size="sm" onClick={addComment}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="versions" className="mt-4">
                  <ol className="space-y-3">
                    {versions.map((v) => (
                      <li key={v.version} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                          v{v.version}
                        </span>
                        <div className="text-sm">
                          <p className="font-medium">{v.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.changed_by} · {formatDateTime(v.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                    {versions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No version history.</p>
                    )}
                  </ol>
                </TabsContent>

                <TabsContent value="files" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Signed PDFs, scope addenda, and cover emails for this quote.
                    </p>
                    <Button size="sm" variant="outline" onClick={uploadMockFile}>
                      <Upload className="mr-2 h-3.5 w-3.5" /> Upload
                    </Button>
                  </div>
                  {files.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No files attached to this quote yet.
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


                <TabsContent value="preview" className="mt-4">
                  <div className="flex aspect-[1/1.2] items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30">
                    <div className="text-center">
                      <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">{quote.number}.pdf</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Generated when the quote is approved.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {TIMELINE.map((stage, idx) => {
                  const reached = idx <= reachedIdx;
                  const current = idx === reachedIdx;
                  return (
                    <li key={stage} className="flex items-center gap-3">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          reached
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {reached ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span className="text-[10px]">{idx + 1}</span>
                        )}
                      </div>
                      <span
                        className={`text-sm capitalize ${
                          current
                            ? "font-semibold"
                            : reached
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }`}
                      >
                        {stage.replace(/_/g, " ")}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Status">
                <StatusBadge value={status} />
              </Row>
              <Row label="Lead">
                {lead ? (
                  <Link
                    to="/leads/$id"
                    params={{ id: lead.id }}
                    className="text-primary hover:underline"
                  >
                    {lead.company_name}
                  </Link>
                ) : quote.lead_id ? (
                  quote.lead_id
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Created by">{creator?.name ?? "—"}</Row>
              <Row label="Approved by">{approver?.name ?? "Pending"}</Row>
              <Separator />
              <Row label="Valid until">{quote.valid_until}</Row>
              <Row label="Created">{formatDateTime(quote.created_at)}</Row>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

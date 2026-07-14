import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  File as FileIcon,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import {
  QuotePdfPreview,
  QuotePdfPreviewUnavailable,
  resolveQuotePdfSource,
} from "@/components/quotes/quote-pdf-preview";
import { StatusBadge } from "@/components/status-badge";
import type {
  Client,
  Lead,
  PricingTemplate,
  QuoteLineItem,
  QuoteStatus,
  QuoteVersion,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quoteDetailSearchSchema } from "@/lib/admin-ux-search";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyAmount, formatDateTime } from "@/lib/format";
import { calculateTotal, newLineItem } from "@/lib/quote-utils";
import {
  acceptQuoteAndCreateJobSheet,
  approveAndIssueQuote,
  approveQuote,
  getQuoteVersions,
  getQuote,
  getPricingTemplates,
  issueQuoteVersion,
  rejectQuote,
  requestQuoteApproval,
  updateQuote,
} from "@/server-functions/quotes";
import { getClient } from "@/server-functions/clients";
import { getLead } from "@/server-functions/leads";
import { USER_RECORD } from "@/lib/users";

type Comment = { id: string; quote_id: string; author: string; body: string; created_at: string };
type QuoteFile = {
  id: string;
  quote_id: string;
  name: string;
  size: string;
  kind: "pdf" | "docx" | "image" | "email";
  uploaded_at: string;
  uploaded_by: string;
};
const userById = (id: string) => (USER_RECORD[id] ? { name: USER_RECORD[id] } : undefined);
const quoteComments: Comment[] = [];
const quoteFiles: QuoteFile[] = [];

export const Route = createFileRoute("/quotes/$id")({
  validateSearch: quoteDetailSearchSchema,
  loader: async ({ params }) => {
    const [quote, templates] = await Promise.all([
      getQuote({ data: { id: params.id } }),
      getPricingTemplates(),
    ]);
    const clientPromise = quote.client_id
      ? getClient({ data: { id: quote.client_id } }).catch(() => null)
      : Promise.resolve(null);
    const leadPromise = quote.lead_id
      ? getLead({ data: { id: quote.lead_id } }).catch(() => null)
      : Promise.resolve(null);
    const [versions, client, leadResult] = await Promise.all([
      getQuoteVersions({ data: { quoteId: quote.id } }),
      clientPromise,
      leadPromise,
    ]);
    return { quote, templates, versions, client, lead: leadResult?.lead ?? null };
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

const VERSION_REASON_LABELS: Record<QuoteVersion["reason"], string> = {
  issued: "Issued snapshot",
  revised: "Revision snapshot",
  accepted: "Accepted snapshot",
  change_order: "Change order snapshot",
};

function QuoteDetail() {
  const { quote, templates, versions, lead, client } = Route.useLoaderData();
  const search = Route.useSearch();
  const { edit, approvalId } = search;
  const isEditMode = edit === true || quote.status === "draft";
  const router = useRouter();
  const creator = userById(quote.created_by ?? "");
  const approver = quote.approved_by ? userById(quote.approved_by) : null;
  const initialComments = quoteComments.filter((c) => c.quote_id === quote.id);
  const initialFiles = quoteFiles.filter((f) => f.quote_id === quote.id);

  const navigate = useNavigate({ from: Route.fullPath });
  const [status, setStatus] = useState<QuoteStatus>(quote.status as QuoteStatus);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [composer, setComposer] = useState("");
  const [files, setFiles] = useState<QuoteFile[]>(initialFiles);
  const [editItems, setEditItems] = useState<QuoteLineItem[]>(quote.line_items ?? []);
  const [saving, setSaving] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const totalValue = calculateTotal(editItems);
  const resolvedPdfSource = resolveQuotePdfSource(quote, versions);
  const previewSource =
    resolvedPdfSource.state !== "live"
      ? resolvedPdfSource
      : {
          ...resolvedPdfSource,
          quote: isEditMode
            ? { ...resolvedPdfSource.quote, total_value: totalValue }
            : resolvedPdfSource.quote,
          lineItems: isEditMode ? editItems : resolvedPdfSource.lineItems,
        };
  const clientName =
    client?.company_name ?? lead?.company_name ?? quote.client_id ?? quote.lead_id ?? "Client";
  const currentPreviewVersionId = resolvedPdfSource.sourceVersion?.id ?? null;

  const updateItemQty = (idx: number, qty: number) => {
    setEditItems((prev) =>
      prev.map((li, i) => (i === idx ? { ...li, qty: Math.max(1, qty) } : li)),
    );
  };

  const updateItemPrice = (idx: number, unit_price: number) => {
    setEditItems((prev) =>
      prev.map((li, i) => (i === idx ? { ...li, unit_price: Math.max(0, unit_price) } : li)),
    );
  };

  const removeItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addFromTemplate = (template: PricingTemplate) => {
    setEditItems((prev) => [...prev, newLineItem(template)]);
    setCatalogueOpen(false);
  };

  const saveEditableQuoteFields = async () => {
    await updateQuote({
      data: { id: quote.id, updates: { line_items: editItems, total_value: totalValue } },
    });
  };

  const approveAndIssueReviewedQuote = async () => {
    if (!approvalId) {
      throw new Error("Approval context missing");
    }

    await saveEditableQuoteFields();
    const result = await approveAndIssueQuote({ data: { id: quote.id, approvalId } });
    setStatus(result.quote.status);
    toast.success("Quote approved and issued");
    navigate({ to: "/approvals" });
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await saveEditableQuoteFields();
      toast.success("Draft saved");
      router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    setSaving(true);
    try {
      if (approvalId) {
        // Coming from Approvals "Review & Edit" flow:
        await approveAndIssueReviewedQuote();
      } else {
        // Plain draft edit: save + request approval (moves to pending_approval + triggers n8n)
        await saveEditableQuoteFields();
        await requestQuoteApproval({ data: { id: quote.id } });
        setStatus("pending_approval");
        toast.success("Quote submitted for approval");
        router.invalidate();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  };

  const reachedIdx = TIMELINE.indexOf(status);

  const handleRequestApproval = async () => {
    await requestQuoteApproval({ data: { id: quote.id } });
    setStatus("pending_approval");
    router.invalidate();
    toast.success("Submitted for approval");
  };

  const handleRejectQuote = async () => {
    try {
      setSaving(true);
      const result = await rejectQuote({ data: { id: quote.id, approvalId } });
      setStatus(result.status);
      toast.success("Quote rejected");
      if (approvalId) {
        navigate({ to: "/approvals" });
      } else {
        router.invalidate();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveQuote = async () => {
    try {
      setSaving(true);
      if (approvalId) {
        await approveAndIssueReviewedQuote();
        return;
      }

      const result = await approveQuote({ data: { id: quote.id } });
      setStatus(result.status);
      router.invalidate();
      toast.success("Quote approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setSaving(false);
    }
  };

  const handleIssueQuote = async () => {
    try {
      setSaving(true);
      const result = await issueQuoteVersion({ data: { id: quote.id } });
      setStatus(result.quote.status);
      router.invalidate();
      toast.success("Quote issued and PDF version created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptQuote = async () => {
    try {
      setSaving(true);
      const result = await acceptQuoteAndCreateJobSheet({ data: { id: quote.id } });
      setStatus(result.quote.status);
      router.invalidate();
      toast.success(`Quote accepted. Job sheet ${result.jobSheet.number} is ready for accounting.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Acceptance failed");
    } finally {
      setSaving(false);
    }
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
        title={quote.number ?? ""}
        description={`${clientName} · ${formatCurrencyAmount(quote.total_value, quote.currency)}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/quotes">
                <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> All
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/quotes/$id/pdf" params={{ id: quote.id }}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" /> PDF
              </Link>
            </Button>
            {status === "draft" && (
              <Button size="sm" onClick={handleRequestApproval}>
                <Send aria-hidden="true" className="mr-2 h-4 w-4" /> Submit for approval
              </Button>
            )}
            {status === "pending_approval" && (
              <>
                <Button variant="outline" size="sm" onClick={handleRejectQuote} disabled={saving}>
                  <XCircle aria-hidden="true" className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button size="sm" onClick={handleApproveQuote} disabled={saving}>
                  <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" /> Approve
                </Button>
              </>
            )}
            {status === "approved" && (
              <Button size="sm" onClick={handleIssueQuote} disabled={saving}>
                <Send aria-hidden="true" className="mr-2 h-4 w-4" /> Issue quote
              </Button>
            )}
            {["sent", "viewed"].includes(status) && (
              <Button size="sm" onClick={handleAcceptQuote} disabled={saving}>
                <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" /> Mark accepted
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <Tabs
                value={search.tab ?? "items"}
                onValueChange={(tab) =>
                  navigate({
                    search: (current) => ({
                      ...current,
                      tab: tab === "items" ? undefined : (tab as NonNullable<typeof search.tab>),
                    }),
                    replace: true,
                  })
                }
              >
                <div className="max-w-full overflow-x-auto pb-1">
                  <TabsList className="w-max">
                    <TabsTrigger value="items">Line items</TabsTrigger>
                    <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
                    <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
                    <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
                    <TabsTrigger value="preview">PDF preview</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="items" className="mt-4">
                  {isEditMode ? (
                    <div className="space-y-4">
                      <div className="max-w-full overflow-x-auto">
                        <table className="min-w-[640px] w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="py-2 text-left font-medium">Service</th>
                              <th className="py-2 text-right font-medium w-20">Qty</th>
                              <th className="py-2 text-right font-medium w-28">Unit (HKD)</th>
                              <th className="py-2 text-right font-medium w-28">Subtotal</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {editItems.map((li, idx) => (
                              <tr key={li.id}>
                                <td className="py-3">
                                  <div className="font-medium">{li.service}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {li.description}
                                  </div>
                                </td>
                                <td className="py-2 text-right">
                                  <Input
                                    aria-label={`Quantity for ${li.service}`}
                                    name={`line-${idx}-qty`}
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    value={li.qty}
                                    onChange={(e) =>
                                      updateItemQty(idx, parseInt(e.target.value, 10) || 1)
                                    }
                                    className="h-8 w-16 text-right tabular-nums"
                                  />
                                </td>
                                <td className="py-2 text-right">
                                  <Input
                                    aria-label={`Unit price for ${li.service}`}
                                    name={`line-${idx}-unit-price`}
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={li.unit_price}
                                    onChange={(e) =>
                                      updateItemPrice(idx, parseFloat(e.target.value) || 0)
                                    }
                                    className="h-8 w-24 text-right tabular-nums"
                                  />
                                </td>
                                <td className="py-3 text-right tabular-nums font-medium">
                                  {formatCurrencyAmount(li.qty * li.unit_price, quote.currency)}
                                </td>
                                <td className="py-3 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Remove ${li.service}`}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeItem(idx)}
                                  >
                                    ×
                                  </Button>
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
                                {formatCurrencyAmount(totalValue, quote.currency)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <Sheet open={catalogueOpen} onOpenChange={setCatalogueOpen}>
                        <SheetTrigger asChild>
                          <Button variant="outline" size="sm">
                            + Add service from catalogue
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Service Catalogue</SheetTitle>
                          </SheetHeader>
                          <ScrollArea className="mt-4 h-[calc(100vh-120px)]">
                            <ul className="space-y-2 pr-4">
                              {templates.map((tpl) => (
                                <li key={tpl.id}>
                                  <button
                                    onClick={() => addFromTemplate(tpl)}
                                    className="w-full rounded-md border border-border p-3 text-left text-sm hover:bg-muted/50 transition-colors"
                                  >
                                    <div className="font-medium">{tpl.service}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {tpl.description}
                                    </div>
                                    <div className="text-xs font-medium text-primary mt-1">
                                      {formatCurrencyAmount(tpl.unit_price, "HKD")}
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </ScrollArea>
                        </SheetContent>
                      </Sheet>

                      <div className="flex gap-2 pt-2 border-t border-border">
                        <Button
                          onClick={handleSubmitForApproval}
                          disabled={saving || editItems.length === 0}
                        >
                          <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                          {approvalId ? "Approve & Issue" : "Save & Request Approval"}
                        </Button>
                        <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
                          Save draft
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-full overflow-x-auto">
                      <table className="min-w-[560px] w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 text-left font-medium">Service</th>
                            <th className="py-2 text-right font-medium">Qty</th>
                            <th className="py-2 text-right font-medium">Unit</th>
                            <th className="py-2 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {quote.line_items.map((li: (typeof quote.line_items)[number]) => (
                            <tr key={li.id}>
                              <td className="py-3">
                                <div className="font-medium">{li.service}</div>
                                <div className="text-xs text-muted-foreground">
                                  {li.description}
                                </div>
                              </td>
                              <td className="py-3 text-right tabular-nums">{li.qty}</td>
                              <td className="py-3 text-right tabular-nums">
                                {formatCurrencyAmount(li.unit_price, quote.currency)}
                              </td>
                              <td className="py-3 text-right font-medium tabular-nums">
                                {formatCurrencyAmount(li.qty * li.unit_price, quote.currency)}
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
                              {formatCurrencyAmount(quote.total_value, quote.currency)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="comments" className="mt-4">
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                      >
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
                        aria-label="Add a quote comment"
                        name="quote-comment"
                        placeholder="Add a comment…"
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        className="min-h-[60px] flex-1"
                      />
                      <Button size="sm" aria-label="Send quote comment" onClick={addComment}>
                        <Send aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="versions" className="mt-4">
                  <ol className="space-y-3">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                          v{v.version_number}
                        </span>
                        <div className="text-sm">
                          <p className="font-medium">
                            {VERSION_REASON_LABELS[v.reason]}
                            {v.id === currentPreviewVersionId ? " (current preview)" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(v.created_by ? userById(v.created_by)?.name : null) ??
                              v.created_by ??
                              "System"}{" "}
                            · {formatDateTime(v.created_at)}
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
                      <Upload aria-hidden="true" className="mr-2 h-3.5 w-3.5" /> Upload
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
                            <FileIcon aria-hidden="true" className="h-4 w-4" />
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
                            aria-label={`Download ${f.name}`}
                            onClick={() => toast.message(`Downloading ${f.name}…`)}
                          >
                            <Download aria-hidden="true" className="h-3.5 w-3.5" />
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
                  <div className="overflow-hidden rounded-md border border-border bg-muted/20 p-3">
                    {previewSource.state === "invalid" ? (
                      <QuotePdfPreviewUnavailable error={previewSource.error} />
                    ) : (
                      <QuotePdfPreview
                        quote={previewSource.quote}
                        lineItems={previewSource.lineItems}
                        clientName={clientName}
                      />
                    )}
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
                          <Check aria-hidden="true" className="h-3 w-3" />
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

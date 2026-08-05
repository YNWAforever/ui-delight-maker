import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { normalizeQuoteDocumentSections, type QuoteDocumentDraft } from "@/lib/quote-document";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatHKD } from "@/lib/format";
import { roundToMoney } from "@/lib/money";
import { calculateQuoteTotal } from "@/lib/quote-to-cash";
import {
  createQuote,
  requestQuoteApproval,
  type CreateQuoteInput,
} from "@/server-functions/quotes";
import { getQuoteCreateBootstrap } from "@/server-functions/quote-workspace";
import { useQuoteReferenceData } from "@/hooks/use-quote-reference-data";
import { crmQueryKeys } from "@/lib/query-keys";
import { APP_USERS } from "@/lib/users";

const QuoteDocumentTools = lazy(() =>
  import("@/components/quotes/quote-document-tools").then((module) => ({
    default: module.QuoteDocumentTools,
  })),
);

const searchSchema = z.object({
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  productId: z.string().optional(),
});

export const Route = createFileRoute("/quotes/new")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    leadId: search.leadId,
    clientId: search.clientId,
    productId: search.productId,
  }),
  loader: ({ deps }) => getQuoteCreateBootstrap({ data: deps }),
  head: () => ({
    meta: [
      { title: "New quote — Fimmick ClientOps" },
      { name: "description", content: "Build a draft quote with templates and pricing rules." },
    ],
  }),
  component: QuoteBuilder,
});

type LineItem = {
  id: string;
  service: string;
  description: string;
  qty: number;
  unit_price: number;
};

const STEPS = [
  { id: 1, label: "Client" },
  { id: 2, label: "Items" },
  { id: 3, label: "Terms" },
  { id: 4, label: "PDF" },
  { id: 5, label: "Review" },
] as const;

function QuoteBuilder() {
  const {
    leadId: initialLeadId,
    clientId: initialClientId,
    productId: initialProductId,
  } = Route.useSearch();
  const bootstrap = Route.useLoaderData();
  const templates = bootstrap.pricingTemplates;
  const quoteTemplates = bootstrap.quoteTemplates;
  const pdfTemplates = bootstrap.pdfTemplates;
  const [leadId, setLeadId] = useState(initialLeadId ?? bootstrap.leads.items[0]?.id ?? "");
  const [clientId, setClientId] = useState(initialClientId ?? bootstrap.clients.items[0]?.id ?? "");
  const leadReferences = useQuoteReferenceData("lead", bootstrap.leads, leadId);
  const clientReferences = useQuoteReferenceData("client", bootstrap.clients, clientId);
  const productReferences = useQuoteReferenceData("product", bootstrap.products, initialProductId);
  const leads = leadReferences.data.items;
  const clients = clientReferences.data.items;
  const products = productReferences.data.items;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialQuoteTemplate = quoteTemplates[0];

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"lead" | "client">(initialClientId ? "client" : "lead");
  const [approver, setApprover] = useState(APP_USERS[1]?.id ?? APP_USERS[0]?.id ?? "");
  const [validUntil, setValidUntil] = useState("2026-06-30");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<LineItem[]>([]);
  const [quoteTemplateId, setQuoteTemplateId] = useState(initialQuoteTemplate?.id ?? "");
  const [documentDraft, setDocumentDraft] = useState<QuoteDocumentDraft>({
    cover_text: initialQuoteTemplate?.default_cover_text ?? "",
    assumptions: initialQuoteTemplate?.default_assumptions ?? "",
    payment_terms: initialQuoteTemplate?.default_payment_terms ?? "",
    document_sections: initialQuoteTemplate?.default_scope_sections ?? [],
  });

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.qty * i.unit_price, 0), [items]);

  /**
   * The discount is applied to the line items themselves, not just to the headline total.
   *
   * `total_value` used to be `subtotal * (1 - discount/100)` while `line_items` were saved at
   * full price, so the quote contradicted itself the moment it was persisted: /quotes/$id
   * showed the discounted figure in the header and the undiscounted one in the line-item
   * footer, and the next save from that page recomputed `total_value` from the items and
   * silently dropped the discount. Deriving the total from the discounted items with the same
   * helper the detail page uses makes the two agree by construction.
   */
  const pricedItems = useMemo(
    () =>
      discount === 0
        ? items
        : items.map((item) => ({
            ...item,
            unit_price: roundToMoney(item.unit_price * (1 - discount / 100)),
          })),
    [items, discount],
  );
  const total = useMemo(() => calculateQuoteTotal(pricedItems), [pricedItems]);
  const lead = leads.find((l) => l.id === leadId);
  const client = clients.find((c) => c.id === clientId);
  const activeQuoteTemplate = quoteTemplates.find((item) => item.id === quoteTemplateId) ?? null;
  const activePdfTemplateName =
    pdfTemplates.find((item) => item.id === activeQuoteTemplate?.default_pdf_template_id)?.name ??
    "Standard quote PDF";
  const documentSections = normalizeQuoteDocumentSections(documentDraft.document_sections);
  const visibleDocumentSections = documentSections.filter((section) => section.visible);

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        id: `li-${prev.length + 1}-${Math.random().toString(36).slice(2, 5)}`,
        service: "",
        description: "",
        qty: 1,
        unit_price: 0,
      },
    ]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setItems((prev) => [
      ...prev,
      {
        id: `li-${prev.length + 1}-${Math.random().toString(36).slice(2, 5)}`,
        service: tpl.service,
        description: tpl.description ?? "",
        qty: 1,
        unit_price: tpl.unit_price ?? 0,
      },
    ]);
    toast.success(`Added template: ${tpl.service}`);
  };

  const applyQuoteTemplate = (templateId: string) => {
    const template = quoteTemplates.find((item) => item.id === templateId);
    setQuoteTemplateId(templateId);
    if (!template) return;
    setDocumentDraft({
      cover_text: template.default_cover_text ?? "",
      assumptions: template.default_assumptions ?? "",
      payment_terms: template.default_payment_terms ?? "",
      document_sections: template.default_scope_sections,
    });
  };

  // Auto-apply the pricing template matching the pre-selected product (from the
  // Renewals preview panel's "Draft renewal quote" action) exactly once on mount.
  // pricing_templates.product_id is a real FK to products(id) (added in
  // 002_retention_client_360.sql), so match on that first. Fall back to a
  // name-based match (template.service vs product.name) for legacy templates
  // that predate the FK backfill. If neither matches, surface it — otherwise a
  // salesperson lands on the builder with no visible sign the product wasn't applied.
  const appliedInitialProduct = useRef(false);
  useEffect(() => {
    if (appliedInitialProduct.current) return;
    if (!initialProductId) return;
    const product = products.find((p) => p.id === initialProductId);
    if (!product) return;
    appliedInitialProduct.current = true;
    const tpl =
      templates.find((t) => t.product_id === initialProductId) ??
      templates.find((t) => t.service.trim().toLowerCase() === product.name.trim().toLowerCase());
    if (!tpl) {
      toast.warning(`No pricing template found for "${product.name}" — add line items manually.`);
      return;
    }
    applyTemplate(tpl.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId, products, templates]);

  const submit = async () => {
    if (items.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }
    if (mode === "lead" && !leadId) {
      toast.error("Select a lead.");
      return;
    }
    if (mode === "client" && !clientId) {
      toast.error("Select a client.");
      return;
    }
    const payload = {
      lead_id: mode === "lead" ? leadId || null : null,
      client_id: mode === "client" ? clientId || null : null,
      currency: "HKD",
      valid_until: validUntil,
      quote_template_id: quoteTemplateId || null,
      cover_text: documentDraft.cover_text,
      assumptions: documentDraft.assumptions,
      payment_terms: documentDraft.payment_terms,
      document_sections: documentDraft.document_sections,
      line_items: pricedItems.map(({ id: _id, ...rest }) => ({
        id: _id,
        ...rest,
      })),
      total_value: total,
    } satisfies CreateQuoteInput;

    const quote = await createQuote({ data: payload });

    /**
     * The button says "Submit for approval", so actually request one. This used to create a
     * draft and then toast "Quote submitted for approval" — no `human_approvals` row was
     * written and the quote never appeared in /approvals, so the deal stalled until somebody
     * opened the quote and noticed. If the approval request fails the quote still exists, so
     * say what happened rather than losing the work.
     */
    let approvalRequested = true;
    try {
      await requestQuoteApproval({ data: { id: quote.id } });
    } catch (error) {
      approvalRequested = false;
      toast.error(
        error instanceof Error
          ? `Quote saved as a draft, but requesting approval failed: ${error.message}`
          : "Quote saved as a draft, but requesting approval failed.",
      );
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.quotes.lists() }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.approvals.all() }),
      leadId
        ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.detail(leadId) })
        : Promise.resolve(),
      clientId
        ? queryClient.invalidateQueries({
            queryKey: crmQueryKeys.clients.section(clientId, "commercial"),
          })
        : Promise.resolve(),
    ]);
    if (approvalRequested) toast.success("Quote submitted for approval.");
    navigate({ to: "/quotes/$id", params: { id: quote.id } });
  };

  return (
    <>
      <PageHeader
        title="New quote"
        description={
          mode === "client"
            ? client
              ? `For ${client.company_name}`
              : "Draft a quote using approved templates."
            : lead
              ? `For ${lead.company_name}`
              : "Draft a quote using approved templates."
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/quotes">
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> All quotes
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-4">
            <div className="max-w-full overflow-x-auto">
              <ol className="flex min-w-max items-center gap-2">
                {STEPS.map((s, i) => {
                  const reached = step >= s.id;
                  return (
                    <li key={s.id} className="flex flex-1 items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Go to step ${s.id}: ${s.label}`}
                        onClick={() => setStep(s.id)}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                          reached
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {step > s.id ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : s.id}
                      </button>
                      <span
                        className={cn(
                          "text-sm",
                          reached ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                      {i < STEPS.length - 1 && <div className="ml-1 h-px flex-1 bg-border" />}
                    </li>
                  );
                })}
              </ol>
            </div>
          </Card>

          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "lead" ? "default" : "outline"}
                    onClick={() => setMode("lead")}
                  >
                    From lead
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "client" ? "default" : "outline"}
                    onClick={() => setMode("client")}
                  >
                    From client
                  </Button>
                </div>

                {mode === "client" ? (
                  <div className="sm:col-span-2">
                    <Label htmlFor="quote-client" className="text-xs">
                      Client
                    </Label>
                    <Input
                      value={clientReferences.search}
                      onChange={(event) => clientReferences.setSearch(event.target.value)}
                      placeholder="Search clients"
                      className="mt-1.5 mb-2"
                    />
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger id="quote-client" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ReferencePager reference={clientReferences} label="client" />
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <Label htmlFor="quote-lead" className="text-xs">
                      Lead
                    </Label>
                    <Input
                      value={leadReferences.search}
                      onChange={(event) => leadReferences.setSearch(event.target.value)}
                      placeholder="Search leads"
                      className="mt-1.5 mb-2"
                    />
                    <Select value={leadId} onValueChange={setLeadId}>
                      <SelectTrigger id="quote-lead" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {leads.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.company_name} ({l.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ReferencePager reference={leadReferences} label="lead" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Line items</CardTitle>
                <div className="flex items-center gap-2">
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="h-9 w-[220px]" aria-label="Apply pricing template">
                      <SelectValue placeholder="Apply template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.service}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addItem}>
                    <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Row
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No line items yet — add one from a template or start blank.
                  </p>
                )}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-2 rounded-md border border-border p-3"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <Label htmlFor={`item-${item.id}-service`} className="text-xs">
                        Service
                      </Label>
                      <Input
                        id={`item-${item.id}-service`}
                        name={`item-${item.id}-service`}
                        autoComplete="off"
                        className="mt-1"
                        value={item.service}
                        onChange={(e) => updateItem(item.id, { service: e.target.value })}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Label htmlFor={`item-${item.id}-description`} className="text-xs">
                        Description
                      </Label>
                      <Input
                        id={`item-${item.id}-description`}
                        name={`item-${item.id}-description`}
                        autoComplete="off"
                        className="mt-1"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label htmlFor={`item-${item.id}-qty`} className="text-xs">
                        Qty
                      </Label>
                      <Input
                        id={`item-${item.id}-qty`}
                        name={`item-${item.id}-qty`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        className="mt-1"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label htmlFor={`item-${item.id}-unit`} className="text-xs">
                        Unit (HKD)
                      </Label>
                      <Input
                        id={`item-${item.id}-unit`}
                        name={`item-${item.id}-unit`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        className="mt-1"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(item.id, { unit_price: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex items-end justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="quote-discount" className="text-xs">
                      Discount %
                    </Label>
                    <Input
                      id="quote-discount"
                      name="discount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      className="mt-1"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    />
                    {discount > 10 && (
                      <p className="mt-1 text-xs text-warning-foreground">
                        Discount &gt;10% requires manager approval.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Commercial terms</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="quote-valid-until" className="text-xs">
                    Valid until
                  </Label>
                  <Input
                    id="quote-valid-until"
                    name="valid-until"
                    type="date"
                    className="mt-1.5"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="quote-approver" className="text-xs">
                    Approver
                  </Label>
                  <Select value={approver} onValueChange={setApprover}>
                    <SelectTrigger id="quote-approver" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_USERS.filter((u) => ["manager", "admin"].includes(u.role)).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} · {u.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="quote-template" className="text-xs">
                    Quote template
                  </Label>
                  <Select value={quoteTemplateId} onValueChange={applyQuoteTemplate}>
                    <SelectTrigger id="quote-template" className="mt-1.5">
                      <SelectValue placeholder="Select quote template" />
                    </SelectTrigger>
                    <SelectContent>
                      {quoteTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    PDF template: {activePdfTemplateName}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">PDF sections</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<QuoteDocumentToolsSkeleton />}>
                  <QuoteDocumentTools value={documentDraft} onChange={setDocumentDraft} />
                </Suspense>
              </CardContent>
            </Card>
          )}

          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <KV
                    label="Client"
                    value={
                      mode === "client"
                        ? (client?.company_name ?? "—")
                        : (lead?.company_name ?? "—")
                    }
                  />
                  {mode === "client" ? (
                    <KV label="Client ID" value={clientId} />
                  ) : (
                    <KV label="Lead ID" value={leadId} />
                  )}
                  <KV label="Valid until" value={validUntil} />
                  <KV
                    label="Approver"
                    value={APP_USERS.find((u) => u.id === approver)?.name ?? "—"}
                  />
                  <KV label="Quote template" value={activeQuoteTemplate?.name ?? "—"} />
                  <KV label="PDF template" value={activePdfTemplateName} />
                  <KV label="Items" value={String(items.length)} />
                  <KV label="Discount" value={`${discount}%`} />
                </div>
                <Separator />
                <ul className="space-y-2">
                  {items.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between rounded-md border border-border p-2"
                    >
                      <div className="text-sm">
                        <p className="font-medium">{i.service || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">{i.description}</p>
                      </div>
                      <span className="tabular-nums">
                        {i.qty} × {formatHKD(i.unit_price)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-3">
                  <ReviewBlock label="Cover text" value={documentDraft.cover_text} />
                  <ReviewBlock label="Assumptions" value={documentDraft.assumptions} />
                  <ReviewBlock label="Payment terms" value={documentDraft.payment_terms} />
                </div>
                <ReviewBlock
                  label="Document sections"
                  value={
                    documentSections.length === 0
                      ? "No document sections"
                      : `${visibleDocumentSections.length} visible of ${documentSections.length}`
                  }
                />
                {documentSections.length > 0 ? (
                  <ul className="space-y-2">
                    {documentSections.map((section, index) => (
                      <li
                        key={`review-section-${index}`}
                        className="flex items-start justify-between rounded-md border border-border p-2"
                      >
                        <div>
                          <p className="font-medium">
                            {section.title || section.label || `Section ${index + 1}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {section.body || "No body copy yet."}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {section.visible ? "Visible" : "Hidden"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 1}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> Back
            </Button>
            {step < STEPS.length ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toast.message("Draft saved")}>
                  Save draft
                </Button>
                <Button size="sm" onClick={submit}>
                  <Send aria-hidden="true" className="mr-2 h-4 w-4" /> Submit for approval
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{items.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatHKD(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-warning-foreground">
                  <span>Discount ({discount}%)</span>
                  <span className="tabular-nums">−{formatHKD(subtotal - total)}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatHKD(total)}</span>
              </div>
              {total > 400000 && (
                <p className="text-xs text-warning-foreground">
                  Above HKD 400K — director approval required.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>• Discounts &gt; 10% require manager approval.</p>
              <p>• Quote value &gt; HKD 400K requires director approval.</p>
              <p>• Custom scope must reference a template or pricing rule.</p>
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
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

function ReviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</p>
    </div>
  );
}

function ReferencePager({
  reference,
  label,
}: {
  reference: {
    data: { total: number; limit: number };
    page: number;
    setPage: Dispatch<SetStateAction<number>>;
    isFetching: boolean;
  };
  label: string;
}) {
  const totalPages = Math.max(1, Math.ceil(reference.data.total / reference.data.limit));
  if (totalPages <= 1) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        Page {reference.page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Previous ${label} page`}
          disabled={reference.page <= 1 || reference.isFetching}
          onClick={() => reference.setPage((page) => Math.max(1, page - 1))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Next ${label} page`}
          disabled={reference.page >= totalPages || reference.isFetching}
          onClick={() => reference.setPage((page) => Math.min(totalPages, page + 1))}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QuoteDocumentToolsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading quote document editor">
      <div className="h-28 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

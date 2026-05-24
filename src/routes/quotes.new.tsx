import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
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
import { users } from "@/lib/mock-data";
import { createQuote, getPricingTemplates } from "@/server-functions/quotes";
import { getLeads } from "@/server-functions/leads";

const searchSchema = z.object({ leadId: z.string().optional() });

export const Route = createFileRoute("/quotes/new")({
  validateSearch: searchSchema,
  loader: async () => {
    const [templates, leads] = await Promise.all([
      getPricingTemplates(),
      getLeads({}),
    ]);
    return { templates, leads };
  },
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
  { id: 2, label: "Services" },
  { id: 3, label: "Review" },
];

function QuoteBuilder() {
  const { leadId: initialLeadId } = Route.useSearch();
  const { templates, leads } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [leadId, setLeadId] = useState(initialLeadId ?? leads[0]?.id ?? "");
  const [approver, setApprover] = useState(users[1]?.id ?? users[0]?.id ?? "");
  const [validUntil, setValidUntil] = useState("2026-06-30");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<LineItem[]>([]);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.qty * i.unit_price, 0),
    [items],
  );
  const total = Math.round(subtotal * (1 - discount / 100));
  const lead = leads.find((l) => l.id === leadId);

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

  const submit = async () => {
    if (items.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }
    await createQuote({
      data: {
        lead_id: leadId || null,
        currency: "HKD",
        valid_until: validUntil,
        line_items: items.map(({ id: _id, ...rest }) => ({
          id: _id,
          ...rest,
        })),
        total_value: total,
      },
    });
    router.invalidate();
    toast.success("Quote submitted for approval.");
    navigate({ to: "/quotes" });
  };

  return (
    <>
      <PageHeader
        title="New quote"
        description={lead ? `For ${lead.company_name}` : "Draft a quote using approved templates."}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/quotes">
              <ArrowLeft className="mr-2 h-4 w-4" /> All quotes
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-4">
            <ol className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const reached = step >= s.id;
                return (
                  <div key={s.id} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(s.id)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                        reached
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
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
                  </div>
                );
              })}
            </ol>
          </Card>

          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client & terms</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Lead</Label>
                  <Select value={leadId} onValueChange={setLeadId}>
                    <SelectTrigger className="mt-1.5">
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
                </div>
                <div>
                  <Label className="text-xs">Valid until</Label>
                  <Input
                    type="date"
                    className="mt-1.5"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Approver</Label>
                  <Select value={approver} onValueChange={setApprover}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => ["manager", "admin"].includes(u.role))
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} · {u.role}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Line items</CardTitle>
                <div className="flex items-center gap-2">
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="h-9 w-[220px]">
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
                    <Plus className="mr-2 h-4 w-4" /> Row
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
                      <Label className="text-xs">Service</Label>
                      <Input
                        className="mt-1"
                        value={item.service}
                        onChange={(e) => updateItem(item.id, { service: e.target.value })}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="mt-1"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        className="mt-1"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Unit (HKD)</Label>
                      <Input
                        type="number"
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
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Discount %</Label>
                    <Input
                      type="number"
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
                <CardTitle className="text-base">Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <KV label="Client" value={lead?.company_name ?? "—"} />
                  <KV label="Lead ID" value={leadId} />
                  <KV label="Valid until" value={validUntil} />
                  <KV label="Approver" value={users.find((u) => u.id === approver)?.name ?? "—"} />
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
                        {i.qty} × {i.unit_price.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
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
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            {step < 3 ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toast.message("Draft saved")}>
                  Save draft
                </Button>
                <Button size="sm" onClick={submit}>
                  <Send className="mr-2 h-4 w-4" /> Submit for approval
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

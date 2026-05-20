import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { leads, serviceTemplates, users } from "@/lib/mock-data";

export const Route = createFileRoute("/quotes/new")({
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

function QuoteBuilder() {
  const [leadId, setLeadId] = useState(leads[0].id);
  const [approver, setApprover] = useState(users[1].id);
  const [validUntil, setValidUntil] = useState("2026-06-30");
  const [items, setItems] = useState<LineItem[]>([
    { id: "li-1", service: "", description: "", qty: 1, unit_price: 0 },
  ]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.qty * i.unit_price, 0),
    [items],
  );

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { id: `li-${prev.length + 1}`, service: "", description: "", qty: 1, unit_price: 0 },
    ]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const applyTemplate = (templateId: string) => {
    const tpl = serviceTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    setItems((prev) => [
      ...prev,
      {
        id: `li-${prev.length + 1}`,
        service: tpl.name,
        description: tpl.description,
        qty: 1,
        unit_price: tpl.base_price,
      },
    ]);
    toast.success(`Added template: ${tpl.name}`);
  };

  return (
    <>
      <PageHeader
        title="New quote"
        description="Draft a quote using approved service templates."
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client & terms</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
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
              <div className="sm:col-span-2">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Line items</CardTitle>
              <div className="flex items-center gap-2">
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="Apply template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
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
                      placeholder="e.g. CRM rollout"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    <Label className="text-xs">Description</Label>
                    <Input
                      className="mt-1"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      placeholder="Scope summary"
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
                    <Label className="text-xs">Unit price (HKD)</Label>
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
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
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
                <span className="tabular-nums">HKD {total.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">HKD {total.toLocaleString()}</span>
              </div>
              <Button
                className="mt-2 w-full"
                onClick={() => toast.success("Approval requested. Manager notified.")}
              >
                <Send className="mr-2 h-4 w-4" /> Request approval
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => toast.message("Draft saved locally.")}
              >
                Save draft
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>• Discounts {`>`} 10% require manager approval.</p>
              <p>• Quote value {`>`} HKD 400K requires director approval.</p>
              <p>• Custom scope must reference a template or pricing rule.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

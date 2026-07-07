import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getEngagementsForRenewals } from "@/server-functions/engagements";
import { getProducts } from "@/server-functions/products";
import { annualizeValue, getRenewalWindow } from "@/lib/engagement-utils";
import { formatCompactHKD } from "@/lib/format";
import { RenewalsPreviewPanel } from "@/components/renewals/renewals-preview-panel";
import { RenewalCard } from "@/components/renewals/renewal-card";
import type { Engagement, RenewalRisk, RenewalWindowBucket } from "@/lib/types";

type RenewalRow = Engagement & {
  client_company_name: string;
  client_tier: string | null;
  product_name: string;
};

const COLUMNS: { key: RenewalWindowBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "30", label: "≤30 days" },
  { key: "60", label: "≤60 days" },
  { key: "90", label: "≤90 days" },
  { key: "later", label: "Later" },
];

export const Route = createFileRoute("/renewals")({
  loader: async () => {
    const [engagements, products] = await Promise.all([
      getEngagementsForRenewals({}),
      getProducts({ data: { activeOnly: true } }),
    ]);
    return { engagements, products };
  },
  head: () => ({
    meta: [
      { title: "Renewals — Fimmick ClientOps" },
      {
        name: "description",
        content: "Engagements by renewal window with risk and health signals.",
      },
    ],
  }),
  component: RenewalsPage,
});

function RenewalsPage() {
  const { engagements, products } = Route.useLoaderData();
  const [risk, setRisk] = useState<"all" | RenewalRisk>("all");
  const [productId, setProductId] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const rows = engagements as RenewalRow[];

  const filtered = useMemo(
    () =>
      rows.filter(
        (e) =>
          (risk === "all" || e.renewal_risk === risk) &&
          (productId === "all" || e.product_id === productId),
      ),
    [rows, risk, productId],
  );

  const byColumn = useMemo(() => {
    const grouped: Record<RenewalWindowBucket, RenewalRow[]> = {
      overdue: [],
      "30": [],
      "60": [],
      "90": [],
      later: [],
    };
    for (const e of filtered) {
      grouped[getRenewalWindow(e.renewal_date, today)].push(e);
    }
    return grouped;
  }, [filtered, today]);

  const arrAtRisk = filtered
    .filter((e) => e.renewal_risk === "high")
    .reduce((sum, e) => sum + annualizeValue(e.value, e.billing_period), 0);
  const annualizedValue = filtered.reduce(
    (sum, e) => sum + annualizeValue(e.value, e.billing_period),
    0,
  );
  const dueSoon = filtered.filter((e) =>
    ["overdue", "30", "60", "90"].includes(getRenewalWindow(e.renewal_date, today)),
  ).length;
  const stale = filtered.filter((e) => {
    if (!e.last_touch_at) return true;
    const days = Math.floor((Date.parse(today) - Date.parse(e.last_touch_at)) / 86400000);
    return days >= 30;
  }).length;

  const selected = filtered.find((e) => e.id === selectedId) ?? null;

  return (
    <>
      <CommandHeader
        title="Renewal Board"
        status="Retain"
        description={`${filtered.length} of ${rows.length} active engagements by renewal window, product, and risk.`}
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            {
              label: "Annualized value",
              value: formatCompactHKD(annualizedValue),
              hint: "filtered active work",
            },
            {
              label: "ARR at risk",
              value: formatCompactHKD(arrAtRisk),
              hint: "high-risk engagements",
            },
            { label: "Due within 90 days", value: dueSoon, hint: "overdue + 30/60/90" },
            { label: "Stale engagements", value: stale, hint: "30+ days without touch" },
          ]}
        />

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={risk} onValueChange={(v) => setRisk(v as typeof risk)}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Filter renewals by risk">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filter renewals by product">
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {rows.length === 0 ? (
          <WorkSurfaceEmpty
            title="No engagements yet"
            description="Bring in your existing client book or convert a won lead to get started."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" asChild>
                  <Link to="/clients">Go to Clients</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/">Go to Pipeline</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {COLUMNS.map((col) => (
              <div key={col.key} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <span className="text-xs text-muted-foreground">{byColumn[col.key].length}</span>
                </div>
                <div className="space-y-2">
                  {byColumn[col.key].length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      No renewals in this window.
                    </p>
                  ) : (
                    byColumn[col.key].map((e) => (
                      <RenewalCard
                        key={e.id}
                        engagement={e}
                        selected={e.id === selectedId}
                        onSelect={() => setSelectedId(e.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RenewalsPreviewPanel engagement={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { z } from "zod";

import { RenewalsPreviewPanel } from "@/components/renewals/renewals-preview-panel";
import { RenewalCard } from "@/components/renewals/renewal-card";
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
import { getRenewalWindow } from "@/lib/engagement-utils";
import { formatCompactHKD } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getRenewalsRead } from "@/server-functions/operations";
import type { Engagement, RenewalRisk, RenewalWindowBucket } from "@/lib/types";

type RenewalRow = Engagement & {
  client_company_name: string;
  client_tier: string | null;
  product_name: string;
};

type RenewalsView = {
  rows: RenewalRow[];
  total: number;
  page: number;
  limit: number;
  products: Array<{ id: string; name: string }>;
  metrics: RenewalMetrics;
};

type RenewalMetrics = {
  annualizedValue: number;
  arrAtRisk: number;
  dueSoon: number;
  stale: number;
};

const COLUMNS: { key: RenewalWindowBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "30", label: "<=30 days" },
  { key: "60", label: "<=60 days" },
  { key: "90", label: "<=90 days" },
  { key: "later", label: "Later" },
];

const renewalSearchSchema = z.object({
  risk: z.enum(["all", "high", "medium", "low"]).default("all").catch("all"),
  productId: z.string().default("all").catch("all"),
  renewalWindow: z.enum(["all", "overdue", "30", "60", "90", "later"]).default("all").catch("all"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(50).default(50).catch(50),
});

export const Route = createFileRoute("/renewals")({
  validateSearch: renewalSearchSchema,
  loaderDeps: ({ search }) => ({
    risk: search.risk,
    productId: search.productId,
    renewalWindow: search.renewalWindow,
    page: search.page,
    limit: 50,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.renewals.list(deps),
        queryFn: () => getRenewalsRead({ data: deps }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Renewals - Fimmick ClientOps" },
      {
        name: "description",
        content: "Engagements by renewal window with risk and health signals.",
      },
    ],
  }),
  component: RenewalsPage,
});

function RenewalsPage() {
  const renewalRead = Route.useLoaderData() as unknown as RenewalsView;
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const rows = renewalRead.rows;
  const metrics = renewalRead.metrics;

  const setFilters = (patch: Partial<typeof filters>) =>
    navigate({ search: (current) => ({ ...current, ...patch, page: 1 }), replace: true });
  const setPage = (page: number) =>
    navigate({ search: (current) => ({ ...current, page }), replace: true });

  const byColumn = useMemo(() => {
    const grouped: Record<RenewalWindowBucket, RenewalRow[]> = {
      overdue: [],
      "30": [],
      "60": [],
      "90": [],
      later: [],
    };
    for (const engagement of rows) {
      grouped[getRenewalWindow(engagement.renewal_date, today)].push(engagement);
    }
    return grouped;
  }, [rows, today]);

  const selected = rows.find((engagement) => engagement.id === selectedId) ?? null;
  const lastPage = Math.max(1, Math.ceil(renewalRead.total / renewalRead.limit));

  return (
    <>
      <CommandHeader
        title="Renewal Board"
        status="Retain"
        description={`${rows.length} shown of ${renewalRead.total} matching active engagements.`}
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            {
              label: "Annualized value",
              value: formatCompactHKD(metrics.annualizedValue),
              hint: "matching active work",
            },
            {
              label: "ARR at risk",
              value: formatCompactHKD(metrics.arrAtRisk),
              hint: "high-risk engagements",
            },
            { label: "Due within 90 days", value: metrics.dueSoon, hint: "including overdue" },
            { label: "Stale engagements", value: metrics.stale, hint: "30+ days without touch" },
          ]}
        />

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.risk}
              onValueChange={(risk) => setFilters({ risk: risk as "all" | RenewalRisk })}
            >
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
            <Select
              value={filters.productId}
              onValueChange={(productId) => setFilters({ productId })}
            >
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filter renewals by product">
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {renewalRead.products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.renewalWindow}
              onValueChange={(renewalWindow) =>
                setFilters({ renewalWindow: renewalWindow as typeof filters.renewalWindow })
              }
            >
              <SelectTrigger className="h-9 w-[190px]" aria-label="Filter by renewal window">
                <SelectValue placeholder="Renewal window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All renewal windows</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="30">Next 30 days</SelectItem>
                <SelectItem value="60">Next 31-60 days</SelectItem>
                <SelectItem value="90">Next 61-90 days</SelectItem>
                <SelectItem value="later">Later than 90 days</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">
                Page {renewalRead.page} of {lastPage}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous renewal page"
                disabled={renewalRead.page <= 1}
                onClick={() => setPage(renewalRead.page - 1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next renewal page"
                disabled={renewalRead.page >= lastPage}
                onClick={() => setPage(renewalRead.page + 1)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {renewalRead.total === 0 ? (
          <WorkSurfaceEmpty
            title="No matching engagements"
            description="Adjust the renewal filters or bring in an existing client engagement."
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
            {COLUMNS.map((column) => (
              <div key={column.key} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold">{column.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {byColumn[column.key].length}
                  </span>
                </div>
                <div className="space-y-2">
                  {byColumn[column.key].length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      No renewals in this window.
                    </p>
                  ) : (
                    byColumn[column.key].map((engagement) => (
                      <RenewalCard
                        key={engagement.id}
                        engagement={engagement}
                        selected={engagement.id === selectedId}
                        onSelect={() => setSelectedId(engagement.id)}
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

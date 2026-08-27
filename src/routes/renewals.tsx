import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import { RenewalsPreviewPanel } from "@/components/renewals/renewals-preview-panel";
import {
  AttentionQueue,
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type AttentionItem,
  type ColumnDef,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { annualizeValue, getRenewalWindow } from "@/lib/engagement-utils";
import { formatCompactHKD, formatCount, formatDate } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getDerivedStatusLabel, isAtRisk, isOverdue, isStuck } from "@/lib/status-labels";
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
  /**
   * The business date the server filtered and aggregated with.
   *
   * This is the fix for the render-time `new Date().toISOString().slice(0, 10)` that used
   * to compute "today" independently on the server and on the client: across a midnight
   * boundary the two disagreed and cards hydrated into a different window than they were
   * server-rendered in. Reading the date the *server* used also keeps the window column and
   * the renewal-window filter answering to the same day, which a locally computed date
   * could not guarantee.
   */
  asOf: string;
};

type RenewalMetrics = {
  annualizedValue: number;
  arrAtRisk: number;
  dueSoon: number;
  stale: number;
};

/** Days without a touchpoint before an engagement reads as Stuck. Matches the server aggregate. */
const STALE_TOUCH_DAYS = 30;

const RENEWALS_PAGE_SIZE = 50;

/**
 * Window labels. "Overdue" comes from the derived-status helper rather than a literal,
 * because it is one of the three canonical labels with no stored column behind it — the
 * comparison below is the only thing that produces it.
 */
const WINDOW_LABELS: Record<RenewalWindowBucket, string> = {
  overdue: getDerivedStatusLabel("overdue").label,
  "30": "Within 30 days",
  "60": "31–60 days",
  "90": "61–90 days",
  later: "Later than 90 days",
};

/**
 * `limit` is deliberately absent.
 *
 * It used to be parsed here and then thrown away — `loaderDeps` hard-coded 50 — so the URL
 * advertised a page-size knob that no control set and no loader honoured. The page size is
 * a constant until something on screen can change it.
 */
const renewalSearchSchema = z.object({
  risk: z.enum(["all", "high", "medium", "low"]).default("all").catch("all"),
  productId: z.string().default("all").catch("all"),
  renewalWindow: z.enum(["all", "overdue", "30", "60", "90", "later"]).default("all").catch("all"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

type RenewalSearch = z.infer<typeof renewalSearchSchema>;

const toRenewalFilters = (search: RenewalSearch) => ({
  risk: search.risk,
  productId: search.productId,
  renewalWindow: search.renewalWindow,
  page: search.page,
  limit: RENEWALS_PAGE_SIZE,
});

export const Route = createFileRoute("/renewals")({
  validateSearch: renewalSearchSchema,
  loaderDeps: ({ search }) => toRenewalFilters(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.renewals.list(deps),
        queryFn: () => getRenewalsRead({ data: deps }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Renewals — Fimmick ClientOps" },
      {
        name: "description",
        content: "Engagements by renewal window with risk and health signals.",
      },
    ],
  }),
  errorComponent: RenewalsErrorState,
  component: RenewalsPage,
});

/**
 * `getRenewalsRead` requires both `engagements.view` and `products.view` and throws on the
 * first one missing, while the sidebar renders the entry to everyone. Without a boundary
 * here that denial reached the root handler, which prints the thrown text into the page.
 */
function RenewalsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Renewals did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/renewals" });
        }}
      />
    </div>
  );
}

function RenewalsPage() {
  const loaderRead = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = toRenewalFilters(search);
  const renewalsQueryKey = crmQueryKeys.renewals.list(filters);
  /**
   * The single most important change on this route.
   *
   * The board used to render straight from `Route.useLoaderData()` with no `useQuery` and
   * no `useRouter` anywhere in the file, while every write beneath it — "Mark renewed",
   * "Mark ended", "Log touchpoint", "Re-score risk" — refreshed through
   * `invalidateQueries({ queryKey: crmQueryKeys.renewals.lists() })`. Invalidating a React
   * Query entry cannot push data into a router loader snapshot, so all four fired a success
   * toast and left the row exactly where it was, with its old risk badge and renewal date,
   * until the user navigated away and back.
   *
   * Subscribing to the same key the loader primes closes that gap: the children's existing
   * `renewals.lists()` invalidation now prefix-matches this query and the board repaints.
   * `onChanged` below additionally refreshes the loader snapshot itself, so a remount does
   * not seed from pre-write data.
   */
  const renewalsQuery = useQuery({
    ...routeQueryOptions({
      queryKey: renewalsQueryKey,
      queryFn: () => getRenewalsRead({ data: filters }),
    }),
    initialData: loaderRead,
  });

  const renewalRead = renewalsQuery.data as unknown as RenewalsView;
  const rows = renewalRead.rows;
  const metrics = renewalRead.metrics;
  const asOf = renewalRead.asOf;

  const setFilters = (patch: Partial<RenewalSearch>) =>
    navigate({ search: (current) => ({ ...current, ...patch, page: 1 }), replace: true });
  const setPage = (page: number) =>
    navigate({ search: (current) => ({ ...current, page }), replace: true });

  const hasActiveFilters =
    search.risk !== "all" || search.productId !== "all" || search.renewalWindow !== "all";
  const clearFilters = () => setFilters({ risk: "all", productId: "all", renewalWindow: "all" });
  const productName = (id: string) =>
    renewalRead.products.find((product) => product.id === id)?.name ?? id;
  const filterSummary = [
    search.risk !== "all"
      ? `Risk: ${search.risk.charAt(0).toUpperCase()}${search.risk.slice(1)}`
      : null,
    search.productId !== "all" ? `Product: ${productName(search.productId)}` : null,
    search.renewalWindow !== "all" ? `Window: ${WINDOW_LABELS[search.renewalWindow]}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const windowOf = (row: RenewalRow) => getRenewalWindow(row.renewal_date, asOf);

  /**
   * Every write in the preview panel lands here.
   *
   * Two refreshes because there are two sources of truth on this page: the query the board
   * renders from, and the loader snapshot that seeds it on a fresh mount. The router
   * invalidation is scoped by `routeId` — a bare `router.invalidate()` would refetch every
   * mounted loader in the app for one renewal.
   */
  const refreshAfterWrite = async () => {
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.renewals.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/renewals" });
  };

  /**
   * The exception queue, in the order a renewals owner works it.
   *
   * All three states are derived, never stored: `isOverdue` compares the renewal date with
   * the server's business date, `isAtRisk` reads the health score against the shared
   * threshold, and `isStuck` measures the gap since the last touchpoint. One row per
   * engagement — the first reason that matches wins, so an overdue high-risk renewal is
   * listed once as overdue rather than twice.
   */
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const overdue: AttentionItem[] = [];
    const atRisk: AttentionItem[] = [];
    const stale: AttentionItem[] = [];

    for (const row of rows) {
      const base = {
        id: row.id,
        title: `${row.client_company_name} — ${row.product_name}`,
        owner: row.owner ?? undefined,
        href: `/clients/${row.client_id}`,
      };

      if (isOverdue(row.renewal_date, asOf)) {
        overdue.push({
          ...base,
          severity: "risk",
          reason:
            row.next_action?.trim() ||
            "The renewal date has passed and the engagement is still active.",
          age: `Renewal due ${formatDate(row.renewal_date)}`,
        });
        continue;
      }

      if (row.renewal_risk === "high" || isAtRisk(row.health_score)) {
        atRisk.push({
          ...base,
          severity: "risk",
          reason:
            row.risk_reasoning?.trim() ||
            `Health score ${row.health_score}/100 on an active engagement.`,
          age: `Renewal due ${formatDate(row.renewal_date)}`,
        });
        continue;
      }

      if (isStuck(row.last_touch_at, asOf, STALE_TOUCH_DAYS)) {
        stale.push({
          ...base,
          severity: "stuck",
          reason: `No touchpoint logged in ${STALE_TOUCH_DAYS} days or more.`,
          age: row.last_touch_at
            ? `Last touch ${formatDate(row.last_touch_at)}`
            : "No touchpoint recorded",
        });
      }
    }

    return [...overdue, ...atRisk, ...stale];
  }, [rows, asOf]);

  const attentionWithActions = attentionItems.map((item) => ({
    ...item,
    action: (
      <Button variant="outline" size="sm" onClick={() => setSelectedId(item.id)}>
        Review
      </Button>
    ),
  }));

  const columns: ColumnDef<RenewalRow>[] = [
    {
      id: "renewal",
      header: "Renewal date",
      priority: "primary",
      width: "11rem",
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setSelectedId(row.id)}
            aria-current={selectedId === row.id ? "true" : undefined}
            className="block w-full rounded-sm text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {formatDate(row.renewal_date)}
          </button>
          <span className="block text-xs text-muted-foreground">
            {WINDOW_LABELS[windowOf(row)]}
          </span>
        </div>
      ),
    },
    {
      id: "risk",
      header: "Risk",
      priority: "primary",
      cell: (row) => <StatusBadge value={row.renewal_risk} />,
    },
    {
      id: "client",
      header: "Client",
      priority: "primary",
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{row.client_company_name}</span>
          <span className="block truncate text-xs text-muted-foreground">{row.product_name}</span>
        </div>
      ),
    },
    {
      id: "value",
      header: "Annualized",
      priority: "secondary",
      numeric: true,
      cell: (row) => formatCompactHKD(annualizeValue(row.value, row.billing_period)),
    },
    {
      id: "health",
      header: "Health",
      priority: "tertiary",
      numeric: true,
      cell: (row) => `${row.health_score}/100`,
    },
    {
      id: "touch",
      header: "Last touch",
      priority: "tertiary",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.last_touch_at ? formatDate(row.last_touch_at) : "Never"}
        </span>
      ),
    },
    {
      id: "next",
      header: "Next action",
      priority: "tertiary",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{row.next_action ?? "—"}</span>
      ),
    },
  ];

  const selected = rows.find((engagement) => engagement.id === selectedId) ?? null;

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Renewal Board"
        description={`${formatCount(rows.length)} shown of ${formatCount(renewalRead.total)} matching active engagements.`}
        status={
          <StaleDataIndicator
            updatedAt={new Date(renewalsQuery.dataUpdatedAt).toISOString()}
            isRefetching={renewalsQuery.isFetching}
          />
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "annualized",
              label: "Annualized value",
              value: formatCompactHKD(metrics.annualizedValue),
              hint: "matching active work",
            },
            {
              id: "arr-at-risk",
              label: "ARR at risk",
              value: formatCompactHKD(metrics.arrAtRisk),
              hint: "high-risk engagements",
              tone: metrics.arrAtRisk > 0 ? "destructive" : "neutral",
            },
            {
              id: "due-soon",
              label: "Due within 90 days",
              value: metrics.dueSoon,
              hint: "including overdue",
              tone: metrics.dueSoon > 0 ? "warning" : "neutral",
            },
            {
              id: "stale",
              label: "Stale engagements",
              value: metrics.stale,
              hint: `${STALE_TOUCH_DAYS}+ days without touch`,
            },
          ]}
          columns={4}
        />

        {renewalsQuery.isError && (
          <ErrorState
            kind="stale"
            error={renewalsQuery.error}
            title="The latest renewals did not load"
            description="You are looking at the last results that loaded successfully for these filters."
            retryLabel="Retry"
            onRetry={() => void renewalsQuery.refetch()}
          />
        )}

        <FilterToolbar
          filters={[
            {
              id: "risk",
              label: "Risk",
              value: search.risk,
              onChange: (value) => setFilters({ risk: value as "all" | RenewalRisk }),
              options: [
                { value: "all", label: "All risk" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ],
            },
            {
              id: "productId",
              label: "Product",
              value: search.productId,
              onChange: (productId) => setFilters({ productId }),
              options: [
                { value: "all", label: "All products" },
                ...renewalRead.products.map((product) => ({
                  value: product.id,
                  label: product.name,
                })),
              ],
            },
            {
              id: "renewalWindow",
              label: "Renewal window",
              value: search.renewalWindow,
              onChange: (value) =>
                setFilters({ renewalWindow: value as RenewalSearch["renewalWindow"] }),
              options: [
                { value: "all", label: "All renewal windows" },
                { value: "overdue", label: WINDOW_LABELS.overdue },
                { value: "30", label: WINDOW_LABELS["30"] },
                { value: "60", label: WINDOW_LABELS["60"] },
                { value: "90", label: WINDOW_LABELS["90"] },
                { value: "later", label: WINDOW_LABELS.later },
              ],
            },
          ]}
          onClear={clearFilters}
          resultCount={rows.length}
        />

        {attentionWithActions.length > 0 && (
          <section className="space-y-3">
            <SectionHeader
              title="Needs attention"
              description="Overdue renewals first, then high risk, then engagements nobody has touched."
            />
            <AttentionQueue
              items={attentionWithActions}
              emptyTitle="Nothing needs attention"
              emptyDescription="No renewal on this page is overdue, high risk or out of touch."
            />
          </section>
        )}

        <section className="space-y-3">
          <SectionHeader
            title="Renewal book"
            description="Ordered by renewal date. Open a row to score risk, log a touchpoint, renew or end it."
          />

          {rows.length === 0 ? (
            hasActiveFilters ? (
              <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
            ) : (
              <EmptyWorkspaceState
                title="No active engagements"
                description="Renewals appear here once a client has an active engagement against a product."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" asChild>
                      <Link to="/clients">Go to Clients</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/">Go to Revenue Desk</Link>
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <ResponsiveRecordList
              caption="Active engagements by renewal date"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              selectedRowKey={selectedId ?? undefined}
              renderCard={(row) => (
                // Date and risk lead the card: on a phone the only two things that decide
                // whether this row is today's problem are when it renews and how risky it is.
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatDate(row.renewal_date)}
                    </span>
                    <StatusBadge value={row.renewal_risk} />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {WINDOW_LABELS[windowOf(row)]}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium">
                    {row.client_company_name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.product_name}
                  </span>
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                    {formatCompactHKD(annualizeValue(row.value, row.billing_period))} annualized ·
                    health {row.health_score}/100
                  </span>
                  {row.next_action && (
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {row.next_action}
                    </span>
                  )}
                </button>
              )}
            />
          )}

          <ListPagination
            page={renewalRead.page}
            limit={renewalRead.limit}
            total={renewalRead.total}
            onPageChange={setPage}
          />
        </section>
      </div>

      <RenewalsPreviewPanel
        engagement={selected}
        onClose={() => setSelectedId(null)}
        onChanged={refreshAfterWrite}
      />
    </>
  );
}

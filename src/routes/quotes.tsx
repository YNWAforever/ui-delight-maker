import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { Copy, FileText, Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
  type FilterOption,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatCurrencyAmount, formatDate } from "@/lib/format";
import { toAmount } from "@/lib/money";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import { getStatusLabel } from "@/lib/status-labels";
import { createQuote, getQuotesPage, updateQuote } from "@/server-functions/quotes";
import type { Quote, QuoteStatus } from "@/lib/types";

/**
 * Every lifecycle value `quotes_status_check` allows, plus the neutral choice.
 *
 * There is deliberately no "Archive" here. The constraint in
 * `neon/migrations/005_quote_lifecycle.sql` permits nine states and none of them is
 * `archived`; there is no `archived_at` column and no soft delete. The row menu used to
 * offer Archive, drop the row out of local state and toast "Quote archived" — so the user
 * watched a destructive action succeed and then watched the next loader run undo it. The
 * item is gone rather than disabled, because a control for a concept the schema does not
 * have is not a control that is temporarily unavailable.
 */
const QUOTE_STATUS_VALUES: QuoteStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "revised",
];

const ALL_STATUSES = "all";

const STATUS_OPTIONS: FilterOption[] = [
  { value: ALL_STATUSES, label: "All statuses" },
  ...QUOTE_STATUS_VALUES.map((value) => ({
    value,
    label: getStatusLabel("quotes", value).label,
  })),
];

/**
 * `status` is a search param, not component state.
 *
 * It used to be a `useState` tab strip filtering `rows`, which is only the current
 * fifty-row page while `ListPagination` reported the true server total — so "Accepted"
 * could read empty while page three was full of accepted quotes. `listQuotesPage` has
 * filtered on `status` all along; the tab simply never reached it.
 */
const quoteListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  status: z.string().default(ALL_STATUSES).catch(ALL_STATUSES),
});

type QuoteListSearch = z.infer<typeof quoteListSearchSchema>;

/**
 * Any string parses as a status, so a hand-edited `?status=bogus` would reach the query and
 * empty the workspace while the Select showed nothing selected. Unknown values fall back to
 * the neutral choice rather than being sent on.
 */
function normalizeStatus(value: string): string {
  return QUOTE_STATUS_VALUES.includes(value as QuoteStatus) ? value : ALL_STATUSES;
}

function toPageFilters(search: QuoteListSearch) {
  const status = normalizeStatus(search.status);
  return {
    page: search.page,
    limit: search.limit,
    // "all" is a UI word, not a stored status. Sending it would filter for a value no row
    // holds and empty the workspace.
    status: status === ALL_STATUSES ? undefined : status,
  };
}

export const Route = createFileRoute("/quotes")({
  validateSearch: quoteListSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.quotes.list(search),
        queryFn: () => getQuotesPage({ data: toPageFilters(search) }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Quotes — Fimmick ClientOps" },
      { name: "description", content: "All quotes with status, value, and approval state." },
    ],
  }),
  errorComponent: QuotesErrorBoundary,
  component: QuotesPage,
});

/**
 * The route's own failure surface.
 *
 * Without it a loader failure fell through to the root boundary, which prints
 * `error.message` into the page body — so a Neon driver error or a capability denial was
 * shown to the user verbatim. `ErrorState` runs every string it renders through
 * `toSafeErrorMessage`, and retrying here re-runs this route's loader rather than the
 * whole router.
 */
function QuotesErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="px-4 py-10 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Quotes did not load"
        onRetry={() => {
          reset();
          void router.invalidate({ filter: (match) => match.routeId === "/quotes" });
        }}
      />
    </div>
  );
}

function QuotesPage() {
  const isIndexRoute = useIsExactPath("/quotes");

  if (!isIndexRoute) return <Outlet />;

  return <QuotesIndex />;
}

/**
 * Money summed per currency, never flattened into one symbol.
 *
 * The old strip ran `formatHKD` over a sum taken across rows whose `currency` the table
 * itself rendered per row, so a page holding one USD quote reported a total in HKD that no
 * quote agreed with. Grouping is the only honest option without a server-side aggregate.
 */
function totalsByCurrency(rows: Quote[]): string {
  const totals = new Map<string, number>();
  for (const quote of rows) {
    const currency = quote.currency || "HKD";
    totals.set(currency, (totals.get(currency) ?? 0) + toAmount(quote.total_value));
  }
  if (totals.size === 0) return "—";

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatCurrencyAmount(amount, currency))
    .join(" · ");
}

/**
 * What a quote is attached to.
 *
 * The old Lead cell called a stub that returned `undefined` for every id, so it printed an
 * em dash above the raw `lead_id` UUID on every row, forever. `listQuotesPage` still does
 * not join a company name, so rather than dress the id up as data this offers the one
 * truthful thing the row does carry: a way to open the record it belongs to.
 */
type LinkedRecord = { kind: "client" | "lead"; label: string; id: string };

function linkedRecord(quote: Quote): LinkedRecord | null {
  if (quote.client_id) return { kind: "client", label: "Client", id: quote.client_id };
  if (quote.lead_id) return { kind: "lead", label: "Lead", id: quote.lead_id };
  return null;
}

/** Quotes created through the product carry no number until one is issued. */
function quoteTitle(quote: Quote): string {
  return quote.number?.trim() || "Untitled quote";
}

function QuotesIndex() {
  const quotePage = Route.useLoaderData();
  const search = Route.useSearch();
  const status = normalizeStatus(search.status);
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();

  const rows = quotePage.items;

  /**
   * A page-scoped filter, and it says so.
   *
   * `listQuotesPage` has no text search, so this can only ever narrow the fifty rows the
   * loader returned. It used to be labelled "Search number, lead…" and matched against
   * `lead_id` — a raw UUID — so searching for a company name never matched anything and
   * the box quietly implied it searched the whole workspace.
   */
  const [pageQuery, setPageQuery] = useState("");

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = pageQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((quote) => quoteTitle(quote).toLowerCase().includes(needle));
  }, [rows, pageQuery]);

  const metrics = useMemo(() => {
    const byStatus = (statuses: QuoteStatus[]) =>
      rows.filter((quote) => statuses.includes(quote.status));

    return [
      {
        id: "quotes-in-view",
        label: "Quotes in view",
        value: formatCount(quotePage.total),
        hint: status === ALL_STATUSES ? "every status" : getStatusLabel("quotes", status).label,
      },
      {
        id: "active-value",
        label: "Active value",
        value: totalsByCurrency(byStatus(["pending_approval", "sent", "viewed"])),
        hint: "pending, sent, viewed · this page",
      },
      {
        id: "accepted-value",
        label: "Accepted value",
        value: totalsByCurrency(byStatus(["accepted"])),
        hint: "accepted · this page",
      },
      {
        id: "draft-value",
        label: "Draft value",
        value: totalsByCurrency(byStatus(["draft"])),
        hint: "not yet submitted · this page",
      },
    ];
  }, [rows, quotePage.total, status]);

  const setSearchParams = (next: Partial<QuoteListSearch>) => {
    void navigate({ search: (current) => ({ ...current, ...next }), replace: true });
  };

  const clearFilters = () => {
    setPageQuery("");
    setSearchParams({ status: ALL_STATUSES, page: 1 });
  };

  /**
   * Duplicate, actually writing something.
   *
   * It used to toast `Duplicated …` while nothing was persisted. No new server function is
   * needed: `createQuote` already accepts every field a copy carries and `parent_quote_id`
   * is one of `editableQuoteUpdateColumns`, so a duplicate is a create plus an update, both
   * capability-checked server side.
   *
   * `number` is deliberately not copied. It is not unique in the schema, so cloning it
   * would put two different quotes on screen under one reference; the copy is a fresh draft
   * and gets its number when it is issued, exactly like every other quote the builder
   * creates.
   *
   * The parent link is reported separately because it is a second write: a user who holds
   * `quotes.create` but not `quotes.update` still gets their copy, and is told the lineage
   * is missing rather than being shown an unqualified success.
   */
  const duplicateQuote = async (source: Quote) => {
    if (duplicatingId) return;
    setDuplicatingId(source.id);

    try {
      const copy = await createQuote({
        data: {
          lead_id: source.lead_id,
          client_id: source.client_id,
          contact_id: source.contact_id,
          account_id: source.account_id,
          deal_id: source.deal_id,
          currency: source.currency,
          valid_until: source.valid_until,
          quote_template_id: source.quote_template_id,
          document_sections: source.document_sections,
          cover_text: source.cover_text,
          assumptions: source.assumptions,
          payment_terms: source.payment_terms,
          line_items: source.line_items,
          total_value: source.total_value,
        },
      });

      let lineageRecorded = true;
      try {
        await updateQuote({ data: { id: copy.id, updates: { parent_quote_id: source.id } } });
      } catch (error) {
        lineageRecorded = false;
        console.error("Quote duplicated but parent link failed", error);
      }

      // The component reads Route.useLoaderData(), so invalidating the query alone would
      // repaint nothing: the cache entry has to be marked stale AND this route's loader has
      // to re-run. The filter keeps it to this route rather than every mounted loader.
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.quotes.lists() });
      await router.invalidate({ filter: (match) => match.routeId === "/quotes" });

      toast.success(
        lineageRecorded
          ? `Duplicated ${quoteTitle(source)} as a new draft.`
          : `Duplicated ${quoteTitle(source)}, but it could not be linked to the original.`,
      );

      await navigate({ to: "/quotes/$id", params: { id: copy.id } });
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setDuplicatingId(null);
    }
  };

  const columns: ColumnDef<Quote>[] = [
    {
      id: "number",
      header: "Quote",
      priority: "primary",
      cell: (quote) => (
        <span className="block">
          <span className="block">{quoteTitle(quote)}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {formatCount(quote.line_items.length)} line items
          </span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (quote) => <StatusBadge value={quote.status} domain="quotes" />,
    },
    {
      id: "total_value",
      header: "Value",
      priority: "primary",
      numeric: true,
      cell: (quote) => formatCurrencyAmount(quote.total_value, quote.currency),
    },
    {
      id: "linked",
      header: "Linked record",
      priority: "secondary",
      cell: (quote) => {
        const linked = linkedRecord(quote);
        if (!linked) return <span className="text-muted-foreground">—</span>;
        const linkClass =
          "rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
        return linked.kind === "client" ? (
          <Link to="/clients/$id" params={{ id: linked.id }} className={linkClass}>
            {linked.label}
          </Link>
        ) : (
          <Link to="/leads/$id" params={{ id: linked.id }} className={linkClass}>
            {linked.label}
          </Link>
        );
      },
    },
    {
      id: "valid_until",
      header: "Valid until",
      priority: "secondary",
      cell: (quote) => formatDate(quote.valid_until),
    },
    {
      id: "created_at",
      header: "Created",
      priority: "tertiary",
      cell: (quote) => formatDate(quote.created_at),
    },
  ];

  /**
   * "Nothing here yet" and "your filter matched nothing" look identical on screen and need
   * opposite actions, so the workspace only claims to be empty when the server says the
   * whole result set is empty *and* nothing is narrowing it. An out-of-range page or a page
   * filter that matched nothing is a filtered empty, and its way out is Clear — which also
   * returns to page 1.
   */
  const hasActiveFilter = status !== ALL_STATUSES || pageQuery.trim() !== "";
  const isEmptyWorkspace = quotePage.total === 0 && !hasActiveFilter;

  return (
    <>
      <WorkspaceHeader
        context="Convert"
        title="Quotes"
        description={`${formatCount(quotePage.total)} quotes match this view, across draft, approval, sent and accepted states.`}
        primaryAction={
          <Button size="sm" asChild>
            <Link to="/quotes/new">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> New quote
            </Link>
          </Button>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip metrics={metrics} columns={4} />

        <Card className="min-w-0 p-3">
          <FilterToolbar
            search={{
              value: pageQuery,
              onChange: setPageQuery,
              placeholder: "Filter this page by quote number",
            }}
            filters={[
              {
                id: "status",
                label: "Status",
                options: STATUS_OPTIONS,
                value: status,
                // Any status change starts a new result set, so page 1 or the user lands
                // on an out-of-range page and sees an empty workspace that has data.
                onChange: (nextStatus) => setSearchParams({ status: nextStatus, page: 1 }),
              },
            ]}
            onClear={clearFilters}
            resultCount={filtered.length}
          />
        </Card>

        {filtered.length === 0 ? (
          isEmptyWorkspace ? (
            <EmptyWorkspaceState
              icon={FileText}
              title="No quotes yet"
              description="A quote is created from an active lead or an existing client."
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link to="/quotes/new">Create quote</Link>
                </Button>
              }
            />
          ) : (
            <FilteredEmptyState
              onClear={clearFilters}
              filterSummary={[
                status === ALL_STATUSES
                  ? null
                  : `Status: ${getStatusLabel("quotes", status).label}`,
                pageQuery.trim() ? `Number contains "${pageQuery.trim()}"` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )
        ) : (
          <ResponsiveRecordList
            caption="Quotes"
            columns={columns}
            rows={filtered}
            rowKey={(quote) => quote.id}
            rowHref={(quote) => `/quotes/${quote.id}`}
            rowActions={(quote) => (
              <DropdownMenuItem
                disabled={duplicatingId !== null}
                onSelect={(event) => {
                  event.preventDefault();
                  void duplicateQuote(quote);
                }}
              >
                <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
                {duplicatingId === quote.id ? "Duplicating…" : "Duplicate"}
              </DropdownMenuItem>
            )}
            renderCard={(quote) => (
              <div className="space-y-1">
                <p className="font-medium">{quoteTitle(quote)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCount(quote.line_items.length)} line items ·{" "}
                  {linkedRecord(quote)?.label ?? "No linked record"}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge value={quote.status} domain="quotes" />
                  <span className="text-sm tabular-nums">
                    {formatCurrencyAmount(quote.total_value, quote.currency)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Valid until {formatDate(quote.valid_until)}
                </p>
              </div>
            )}
          />
        )}

        <ListPagination
          page={quotePage.page}
          limit={quotePage.limit}
          total={quotePage.total}
          onPageChange={(page) => setSearchParams({ page })}
        />
      </div>
    </>
  );
}

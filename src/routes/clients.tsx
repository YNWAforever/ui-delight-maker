import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCompactHKD, formatCount, formatCurrencyAmount, formatDate } from "@/lib/format";
import { getRenewalWindow } from "@/lib/engagement-utils";
import { getClientPortfolioMetrics } from "@/lib/sales-workspace";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getClientsPage, createClient } from "@/server-functions/clients";
import { useIsExactPath } from "@/lib/routing-utils";
import type { Client, RenewalRisk } from "@/lib/types";

type ClientRow = Client & { renewal_risk: RenewalRisk };

const clientListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  tier: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/clients")({
  validateSearch: clientListSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.clients.list(search),
        queryFn: () => getClientsPage({ data: search }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Clients — Fimmick ClientOps" },
      { name: "description", content: "Active clients with health score, tier, and renewal date." },
    ],
  }),
  errorComponent: ClientsErrorState,
  component: ClientsPage,
});

/**
 * Loader failures used to fall through to the root boundary. `ErrorState` filters whatever it
 * is handed, so a Neon driver string cannot become page copy here.
 */
function ClientsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Clients did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/clients" });
        }}
      />
    </div>
  );
}

/** Health bands. Colour is the second channel — `healthLabel` carries the same meaning in words. */
function healthClass(score: number) {
  if (score >= 75) return "bg-success/15 text-success border-success/30";
  if (score >= 55) return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

function healthBandLabel(score: number) {
  if (score >= 75) return "Healthy";
  if (score >= 55) return "Watch";
  return "At risk";
}

const RENEWAL_WINDOW_LABEL: Record<string, string> = {
  overdue: "Overdue",
  "30": "30 days or less",
  "60": "60 days or less",
  "90": "90 days or less",
  later: "Later",
};

const RISK_FILTER_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * The owner picker used to be a Select fed by `APP_USERS`: five hard-coded fixtures with
 * synthetic ids that are seeded nowhere. `clients.account_owner` is
 * `text references profiles(id)`, and the Select defaulted to the first fixture — so the
 * default path of this dialog raised a foreign-key violation. There is no profiles read a
 * salesperson may call (the admin users read needs a capability sales does not hold), so the
 * control is disabled with its reason rather than left live over data that cannot exist.
 */
const OWNER_REASON_ID = "new-client-owner-unavailable";
const OWNER_REASON =
  "Owner cannot be set here yet — this workspace has no owner directory to read. The client is created unassigned.";

function ClientsPage() {
  const isIndexRoute = useIsExactPath("/clients");

  if (!isIndexRoute) return <Outlet />;

  return <ClientsIndex />;
}

function ClientsIndex() {
  const clientPage = Route.useLoaderData();
  const loaderClients = clientPage.items;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const setTier = (value: string) =>
    navigate({
      search: (current) => ({
        ...current,
        page: 1,
        tier: value === "all" ? undefined : value,
      }),
      replace: true,
    });
  const [rows, setRows] = useState<ClientRow[]>(loaderClients);
  useEffect(() => setRows(loaderClients), [loaderClients]);
  const tier = search.tier ?? "all";
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | RenewalRisk>("all");
  const [windowFilter, setWindowFilter] = useState<"all" | "overdue" | "30" | "60" | "90">("all");
  const [sortKey, setSortKey] = useState<"arr" | "health" | "renewal">("arr");
  const [newOpen, setNewOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const portfolio = getClientPortfolioMetrics(rows, today);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out = rows.filter((c) => {
      if (tier !== "all" && c.tier !== tier) return false;
      if (riskFilter !== "all" && c.renewal_risk !== riskFilter) return false;
      if (windowFilter !== "all" && getRenewalWindow(c.renewal_date, today) !== windowFilter)
        return false;
      if (needle && !`${c.company_name} ${c.industry ?? ""}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
    const sortFn = {
      arr: (a: ClientRow, b: ClientRow) => (b.arr ?? 0) - (a.arr ?? 0),
      health: (a: ClientRow, b: ClientRow) => a.health_score - b.health_score,
      renewal: (a: ClientRow, b: ClientRow) =>
        (a.renewal_date ?? "").localeCompare(b.renewal_date ?? ""),
    }[sortKey];
    return [...out].sort(sortFn);
  }, [rows, tier, riskFilter, windowFilter, today, sortKey, query]);

  /**
   * Resets every control the toolbar owns, `sortKey` included.
   *
   * "Clear filters" used to skip the sort and lived only inside the empty state, so it could be
   * reached only once the filters had already hidden every row, and it then left a non-default
   * sort in place after "clearing".
   */
  const clearFilters = () => {
    setQuery("");
    setTier("all");
    setRiskFilter("all");
    setWindowFilter("all");
    setSortKey("arr");
  };
  const hasActiveFilters =
    query.trim() !== "" || tier !== "all" || riskFilter !== "all" || windowFilter !== "all";
  const filterSummary = [
    tier !== "all" ? `Tier: ${tier}` : null,
    riskFilter !== "all" ? `Risk: ${RISK_FILTER_LABEL[riskFilter] ?? riskFilter}` : null,
    windowFilter !== "all"
      ? `Renewal: ${RENEWAL_WINDOW_LABEL[windowFilter] ?? windowFilter}`
      : null,
    query.trim() !== "" ? `Search: ${query.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleCreateClient = async (payload: CreateClientPayload) => {
    const created = await createClient({ data: payload });
    // No optimistic prepend. The old one spread `{ ...created, renewal_risk: "low" }` and
    // `createClient` returns a bare Client — the grade was invented here, so a brand new row
    // wore a green "Low" badge the server had never produced.
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.clients.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/clients" });
    setNewOpen(false);
    toast.success(`Created client ${created.company_name}`);
  };

  const columns: ColumnDef<ClientRow>[] = [
    {
      id: "company",
      header: "Company",
      priority: "primary",
      sticky: true,
      width: "16rem",
      cell: (c) => (
        <div className="min-w-0">
          <span className="font-medium">{c.company_name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {c.industry ?? "Industry not set"}
          </span>
        </div>
      ),
    },
    {
      id: "tier",
      header: "Tier",
      priority: "secondary",
      cell: (c) => (
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
          {c.tier ?? "Not set"}
        </span>
      ),
    },
    {
      id: "onboarding",
      header: "Onboarding",
      priority: "tertiary",
      cell: (c) => <StatusBadge value={c.onboarding_status} />,
    },
    {
      id: "health",
      header: "Health",
      priority: "primary",
      numeric: true,
      cell: (c) => (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${healthClass(
              c.health_score,
            )}`}
          >
            {c.health_score}
          </span>
          {/* The number never travels alone: colour is not the signal. */}
          <span className="text-xs text-muted-foreground">{healthBandLabel(c.health_score)}</span>
        </span>
      ),
    },
    {
      id: "arr",
      header: "ARR",
      priority: "primary",
      numeric: true,
      cell: (c) => formatCurrencyAmount(c.arr, "HKD"),
    },
    {
      id: "renewal",
      header: "Renewal",
      priority: "secondary",
      cell: (c) => (
        <div className="min-w-0">
          <span className="block text-sm">{formatDate(c.renewal_date)}</span>
          <span className="block text-xs text-muted-foreground">
            {RENEWAL_WINDOW_LABEL[getRenewalWindow(c.renewal_date, today)]}
          </span>
        </div>
      ),
    },
    {
      id: "risk",
      header: "Renewal risk",
      priority: "primary",
      cell: (c) => <StatusBadge value={c.renewal_risk} />,
    },
    {
      id: "owner",
      header: "Owner",
      priority: "tertiary",
      // The fixture lookup this replaces resolved five synthetic ids and nothing else, so a
      // genuine profile id always rendered "—". The stored value is the honest thing to show.
      cell: (c) => (
        <span className="block truncate text-sm">{c.account_owner ?? "Unassigned"}</span>
      ),
    },
  ];

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Active Clients"
        description={`${formatCount(clientPage.total)} clients. Tier filters the whole portfolio; search, risk, renewal window and sort narrow only the ${formatCount(rows.length)} rows on this page.`}
        primaryAction={
          <NewClientDialog open={newOpen} onOpenChange={setNewOpen} onCreate={handleCreateClient} />
        }
        secondaryActions={[
          <Button key="import-csv" variant="outline" size="sm" asChild>
            <Link to="/clients/import">
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> Import CSV
            </Link>
          </Button>,
        ]}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              label: "ARR",
              value: formatCompactHKD(portfolio.totalArr),
              hint: "on this page",
            },
            {
              label: "Avg health",
              value: `${portfolio.averageHealth}/100`,
              hint: "on this page",
            },
            {
              label: "At risk",
              value: portfolio.atRiskAccounts,
              hint: "health below 55, on this page",
              tone: portfolio.atRiskAccounts > 0 ? "warning" : "neutral",
            },
            {
              label: "Renewals 90d",
              value: portfolio.renewalsNext90Days,
              hint: "upcoming decisions, on this page",
            },
          ]}
        />

        <section className="space-y-3">
          <SectionHeader
            title="Clients"
            description="Open a client to see how its health and renewal risk were arrived at, plus contacts, engagements and history."
          />

          <Card className="p-3">
            <FilterToolbar
              search={{
                value: query,
                onChange: setQuery,
                placeholder: "Search this page by company or industry",
              }}
              filters={[
                {
                  id: "tier",
                  label: "Tier",
                  value: tier,
                  onChange: setTier,
                  options: [
                    { value: "all", label: "All tiers" },
                    { value: "SME", label: "SME" },
                    { value: "mid-market", label: "Mid-market" },
                    { value: "enterprise", label: "Enterprise" },
                  ],
                },
                {
                  id: "risk",
                  label: "Renewal risk",
                  value: riskFilter,
                  onChange: (value) => setRiskFilter(value as "all" | RenewalRisk),
                  options: [
                    { value: "all", label: "All risk" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ],
                },
                {
                  id: "renewal-window",
                  label: "Renewal window",
                  value: windowFilter,
                  onChange: (value) => setWindowFilter(value as typeof windowFilter),
                  options: [
                    { value: "all", label: "All renewal windows" },
                    { value: "overdue", label: "Overdue" },
                    { value: "30", label: "30 days or less" },
                    { value: "60", label: "60 days or less" },
                    { value: "90", label: "90 days or less" },
                  ],
                },
              ]}
              sort={{
                value: sortKey,
                onChange: (value) => setSortKey(value as typeof sortKey),
                options: [
                  { value: "arr", label: "Highest ARR" },
                  { value: "health", label: "Lowest health" },
                  { value: "renewal", label: "Soonest renewal" },
                ],
              }}
              onClear={clearFilters}
              resultCount={filtered.length}
            />
          </Card>

          {filtered.length === 0 ? (
            hasActiveFilters ? (
              <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
            ) : (
              <EmptyWorkspaceState
                title="No clients yet"
                description="Clients arrive when a won lead is converted, or through a CSV import."
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/clients/import">
                      <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> Import CSV
                    </Link>
                  </Button>
                }
              />
            )
          ) : (
            <ResponsiveRecordList
              caption="Clients"
              columns={columns}
              rows={filtered}
              rowKey={(c) => c.id}
              rowHref={(c) => `/clients/${c.id}`}
              renderCard={(c) => (
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{c.company_name}</span>
                    <StatusBadge value={c.renewal_risk} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.industry ?? "Industry not set"} · {c.tier ?? "Tier not set"}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Health {c.health_score} ({healthBandLabel(c.health_score)}) ·{" "}
                    {formatCurrencyAmount(c.arr, "HKD")} · Renews {formatDate(c.renewal_date)}
                  </p>
                </div>
              )}
            />
          )}

          <ListPagination
            page={clientPage.page}
            limit={clientPage.limit}
            total={clientPage.total}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }), replace: true })
            }
          />
        </section>
      </div>
    </>
  );
}

type CreateClientPayload = {
  company_name: string;
  industry?: string;
  tier?: Client["tier"];
};

function NewClientDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreate: (payload: CreateClientPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [tier, setTier] = useState<Client["tier"]>("SME");
  /**
   * `onCreate` used to be called un-awaited from `onClick` with no `disabled`: two clicks
   * created two identical company rows, and a rejection — which the fixture-backed owner made
   * the normal case — was an unhandled promise, with the dialog still open and nothing on screen.
   */
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!name.trim()) {
      toast.error("Company name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        company_name: name.trim(),
        industry: industry.trim() || undefined,
        tier,
      });
      setName("");
      setIndustry("");
      setTier("SME");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            Health, ARR and renewal risk are rolled up from active engagements, so a new client
            carries none of them until it has one.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="new-client-company" className="text-xs">
              Company
            </Label>
            <Input
              id="new-client-company"
              name="company"
              autoComplete="organization"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-client-industry" className="text-xs">
              Industry
            </Label>
            <Input
              id="new-client-industry"
              name="industry"
              autoComplete="off"
              className="mt-1"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-client-tier" className="text-xs">
              Tier
            </Label>
            <Select value={tier ?? "SME"} onValueChange={(v) => setTier(v as Client["tier"])}>
              <SelectTrigger id="new-client-tier" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SME">SME</SelectItem>
                <SelectItem value="mid-market">Mid-market</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="new-client-owner" className="text-xs">
              Account owner
            </Label>
            <Input
              id="new-client-owner"
              className="mt-1"
              value="Unassigned"
              readOnly
              disabled
              aria-describedby={OWNER_REASON_ID}
            />
            <p id={OWNER_REASON_ID} className="mt-1 text-xs text-muted-foreground">
              {OWNER_REASON}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Creating…" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

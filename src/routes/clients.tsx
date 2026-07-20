import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCompactHKD, formatCount, formatDate } from "@/lib/format";
import { getRenewalWindow } from "@/lib/engagement-utils";
import { getClientPortfolioMetrics } from "@/lib/sales-workspace";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getClientsPage, createClient } from "@/server-functions/clients";
import { APP_USERS, userById } from "@/lib/users";
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
    ),  head: () => ({
    meta: [
      { title: "Clients — Fimmick ClientOps" },
      { name: "description", content: "Active clients with health score, tier, and renewal date." },
    ],
  }),
  component: ClientsPage,
});

function healthClass(score: number) {
  if (score >= 75) return "bg-success/15 text-success border-success/30";
  if (score >= 55) return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

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
  const tier = search.tier ?? "all";
  const [riskFilter, setRiskFilter] = useState<"all" | RenewalRisk>("all");
  const [windowFilter, setWindowFilter] = useState<"all" | "overdue" | "30" | "60" | "90">("all");
  const [sortKey, setSortKey] = useState<"arr" | "health" | "renewal">("arr");
  const [newOpen, setNewOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const portfolio = getClientPortfolioMetrics(rows, today);

  const filtered = useMemo(() => {
    const out = rows.filter((c) => {
      if (tier !== "all" && c.tier !== tier) return false;
      if (riskFilter !== "all" && c.renewal_risk !== riskFilter) return false;
      if (windowFilter !== "all" && getRenewalWindow(c.renewal_date, today) !== windowFilter)
        return false;
      return true;
    });
    const sortFn = {
      arr: (a: ClientRow, b: ClientRow) => (b.arr ?? 0) - (a.arr ?? 0),
      health: (a: ClientRow, b: ClientRow) => b.health_score - a.health_score,
      renewal: (a: ClientRow, b: ClientRow) =>
        (a.renewal_date ?? "").localeCompare(b.renewal_date ?? ""),
    }[sortKey];
    return [...out].sort(sortFn);
  }, [rows, tier, riskFilter, windowFilter, today, sortKey]);

  return (
    <>
      <CommandHeader
        title="Account 360"
        status="Retain"
        description={`${rows.length} active accounts with health, renewal, and owner signals.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/clients/import">Import CSV</Link>
            </Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> New client
                </Button>
              </DialogTrigger>
              <NewClientDialog
                onCreate={async (c) => {
                  const created = await createClient({ data: c });
                  setRows((prev) => [{ ...created, renewal_risk: "low" }, ...prev]);
                  setNewOpen(false);
                  router.invalidate();
                  toast.success(`Created client ${created.company_name}`);
                }}
              />
            </Dialog>
          </div>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <ListPagination
          page={clientPage.page}
          limit={clientPage.limit}
          total={clientPage.total}
          onPageChange={(page) =>
            navigate({ search: (current) => ({ ...current, page }), replace: true })
          }
        />
        <MetricStrip
          metrics={[
            {
              label: "Total ARR",
              value: formatCompactHKD(portfolio.totalArr),
              hint: "all active accounts",
            },
            {
              label: "Avg health",
              value: `${portfolio.averageHealth}/100`,
              hint: "portfolio health",
            },
            { label: "At risk", value: portfolio.atRiskAccounts, hint: "health below 55" },
            {
              label: "Renewals 90d",
              value: portfolio.renewalsNext90Days,
              hint: "upcoming decisions",
            },
          ]}
        />

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={tier}
              onValueChange={(value) =>
                navigate({
                  search: (current) => ({
                    ...current,
                    page: 1,
                    tier: value === "all" ? undefined : value,
                  }),
                  replace: true,
                })
              }
            >
              <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by tier">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="SME">SME</SelectItem>
                <SelectItem value="mid-market">Mid-market</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by renewal risk">
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
              value={windowFilter}
              onValueChange={(v) => setWindowFilter(v as typeof windowFilter)}
            >
              <SelectTrigger className="h-9 w-[180px]" aria-label="Filter by renewal window">
                <SelectValue placeholder="Renewal window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All renewal windows</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="30">≤30 days</SelectItem>
                <SelectItem value="60">≤60 days</SelectItem>
                <SelectItem value="90">≤90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
              <SelectTrigger className="h-9 w-[180px]" aria-label="Sort clients">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="arr">Sort: ARR</SelectItem>
                <SelectItem value="health">Sort: Health</SelectItem>
                <SelectItem value="renewal">Sort: Renewal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <Table className="min-w-[1040px]">
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead className="text-right">ARR (HKD)</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const owner = c.account_owner ? userById(c.account_owner) : undefined;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/clients/$id"
                        params={{ id: c.id }}
                        className="hover:text-primary hover:underline"
                      >
                        {c.company_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{c.id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{c.industry}</TableCell>
                    <TableCell>
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                        {c.tier}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={c.onboarding_status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${healthClass(c.health_score)}`}
                      >
                        {c.health_score}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(c.arr)}</TableCell>
                    <TableCell className="text-sm">{formatDate(c.renewal_date)}</TableCell>
                    <TableCell>
                      <StatusBadge value={c.renewal_risk} />
                    </TableCell>
                    <TableCell className="text-sm">{owner?.name ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="p-4">
                    <WorkSurfaceEmpty
                      title="No accounts match this Account 360 view"
                      description="Clear filters or import clients to review retention work."
                      action={
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTier("all");
                            setRiskFilter("all");
                            setWindowFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

type CreateClientPayload = {
  company_name: string;
  industry?: string;
  tier?: Client["tier"];
  account_owner?: string;
};

function NewClientDialog({ onCreate }: { onCreate: (c: CreateClientPayload) => Promise<void> }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [tier, setTier] = useState<Client["tier"]>("SME");
  const [owner, setOwner] = useState(APP_USERS[0]?.id ?? "");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New client</DialogTitle>
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
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger id="new-client-owner" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_USERS.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onCreate({
              company_name: name || "Untitled",
              industry: industry || undefined,
              tier,
              account_owner: owner || undefined,
            })
          }
        >
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/list-pagination";
import { AccountPreviewPanel } from "@/components/relationship/account-preview-panel";
import type { AccountPreviewSummary } from "@/components/relationship/account-preview-panel";
import { WorkspaceViewSwitcher } from "@/components/relationship/workspace-view-switcher";
import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  LifecycleBadge,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { Card } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { getAccountsIndexRead } from "@/server-functions/accounts-index";
import { getCompanyWorkspaceRead } from "@/server-functions/company-workspace";
import { togglePersonalWorkspaceFavorite } from "@/server-functions/workspace-preferences";
import { companyWorkspaceQueryKey } from "@/lib/company-workspace/invalidation";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import { getLifecycleLabel, getDerivedStatusLabel, isAtRisk } from "@/lib/status-labels";
import { userById } from "@/lib/users";
import {
  companiesSearchSchema,
  companySortFromKey,
  companySortToKey,
  type CompaniesSearch,
} from "@/lib/admin-ux-search";
import type { Account, AccountLifecycleStage, WorkspaceViewConfig } from "@/lib/types";

/**
 * The saved-view column list.
 *
 * `WorkspaceViewConfig["columns"]` accepts five names, and all five are real columns in the
 * table below, so what a saved view persists describes something a reader actually saw.
 * Column choice is not editable here yet; the three further columns this table renders
 * (open signals, linked clients, owner) have no name in that union and are deliberately not
 * invented into one.
 */
const ACCOUNT_VIEW_COLUMNS: WorkspaceViewConfig["columns"] = [
  "name",
  "lifecycle_stage",
  "relationship_health",
  "last_activity_at",
  "next_action",
];

const DEFAULT_ACCOUNT_VIEW_CONFIG: WorkspaceViewConfig = {
  filters: {},
  columns: ACCOUNT_VIEW_COLUMNS,
  sort: { field: "last_activity_at", direction: "desc" },
};

const LIFECYCLE_OPTIONS: Array<{ value: "all" | AccountLifecycleStage; label: string }> = [
  { value: "all", label: "All companies" },
  { value: "prospect", label: getLifecycleLabel("prospect").label },
  { value: "active_client", label: getLifecycleLabel("active_client").label },
  { value: "at_risk", label: getLifecycleLabel("at_risk").label },
  { value: "churned", label: getLifecycleLabel("churned").label },
  { value: "partner", label: getLifecycleLabel("partner").label },
  { value: "vendor", label: getLifecycleLabel("vendor").label },
];

const SORT_OPTIONS = [
  { value: "last_activity_at:desc", label: "Recent activity" },
  { value: "name:asc", label: "Name A-Z" },
  { value: "relationship_health:asc", label: "Lowest health" },
  { value: "relationship_health:desc", label: "Highest health" },
];

/** How long a typed search waits before it becomes a URL change and a server read. */
const SEARCH_COMMIT_DELAY_MS = 300;

/**
 * The part of the URL the list read depends on.
 *
 * `account` is deliberately absent. It only says which preview panel is open, and while it
 * was a loader dep every preview click minted a new `accounts.list` cache entry and
 * refetched the entire index to render a side panel. `sort` *is* here, because sorting is
 * now done by `listAccountsPage` rather than over the rows of one page.
 */
function accountListFilters(search: CompaniesSearch) {
  return {
    q: search.q,
    lifecycle: search.lifecycle,
    sort: search.sort,
    page: search.page,
    limit: search.limit,
  };
}

export const Route = createFileRoute("/accounts")({
  validateSearch: companiesSearchSchema,
  loaderDeps: ({ search }) => ({ search: accountListFilters(search) }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.accounts.list(search),
        queryFn: () =>
          getAccountsIndexRead({
            data: {
              query: search.q,
              lifecycle_stage: search.lifecycle,
              sort: search.sort,
              page: search.page,
              limit: search.limit,
            },
          }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Accounts — Fimmick ClientOps" },
      {
        name: "description",
        content: "Every organisation record, from prospect through to client and partner.",
      },
    ],
  }),
  errorComponent: AccountsErrorState,
  component: AccountsRoute,
});

/**
 * Loader failures used to fall through to the root boundary, which prints the thrown text
 * into the page body — a Neon driver string rendered as page content.
 */
function AccountsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Accounts did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/accounts" });
        }}
      />
    </div>
  );
}

function AccountsRoute() {
  const isIndexRoute = useIsExactPath("/accounts");

  if (!isIndexRoute) return <Outlet />;

  return <AccountsIndex />;
}

/**
 * `APP_USERS` is five hard-coded fixtures whose ids appear in no migration and no seed
 * (IF-D1-10), so a real `profiles.id` never resolves through it. Printing "Unassigned" for
 * an account that genuinely has an owner is the lie this avoids: an id that will not
 * resolve is reported as assigned-but-unnamed until a profile-name read exists.
 */
function ownerLabel(profileId: string | null | undefined): string {
  if (!profileId) return "Unassigned";
  return userById(profileId)?.name ?? "Assigned";
}

function AccountsIndex() {
  const loaderData = Route.useLoaderData();
  const { accounts, accountCounts, preferences } = loaderData;
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const listFilters = accountListFilters(search);
  const pagination = loaderData.pagination ?? {
    page: search.page ?? 1,
    limit: search.limit ?? 50,
    total: accounts.length,
  };

  const [savedViewConfig, setSavedViewConfig] = useState(DEFAULT_ACCOUNT_VIEW_CONFIG);
  const activeConfig = useMemo<WorkspaceViewConfig>(
    () => ({
      ...savedViewConfig,
      filters: { ...savedViewConfig.filters, lifecycle_stage: search.lifecycle },
      sort: companySortFromKey(search.sort),
    }),
    [savedViewConfig, search.lifecycle, search.sort],
  );

  const lifecycle = search.lifecycle ?? "all";
  const sortKey = search.sort ?? "last_activity_at:desc";
  const activeQuery = search.q ?? "";
  const hasActiveFilters = lifecycle !== "all" || activeQuery !== "";

  /**
   * The search box is committed to the URL, not held locally, because `listAccountsPage`
   * filters by name in SQL — a page-local search would silently search 50 of N rows. The
   * delay is what keeps a keystroke from being a round trip.
   */
  const [searchDraft, setSearchDraft] = useState(activeQuery);
  useEffect(() => setSearchDraft(activeQuery), [activeQuery]);
  useEffect(() => {
    const next = searchDraft.trim();
    if (next === activeQuery) return;

    const timer = setTimeout(() => {
      navigate({
        search: (current) => {
          const nextSearch = { ...current };
          delete nextSearch.q;
          if (next) nextSearch.q = next;
          nextSearch.page = 1;
          return nextSearch;
        },
        replace: true,
      });
    }, SEARCH_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, activeQuery, navigate]);

  const setLifecycle = (value: string) =>
    navigate({
      search: (current) => {
        const nextSearch = { ...current };
        delete nextSearch.lifecycle;
        if (value !== "all") nextSearch.lifecycle = value as AccountLifecycleStage;
        nextSearch.page = 1;
        return nextSearch;
      },
      replace: true,
    });

  const setSort = (value: string) =>
    navigate({
      search: (current) => {
        const nextSearch = { ...current };
        delete nextSearch.sort;
        if (value !== "last_activity_at:desc") {
          nextSearch.sort = value as NonNullable<CompaniesSearch["sort"]>;
        }
        nextSearch.page = 1;
        return nextSearch;
      },
      replace: true,
    });

  const clearFilters = () => {
    setSavedViewConfig(DEFAULT_ACCOUNT_VIEW_CONFIG);
    navigate({
      search: (current) => {
        const nextSearch = { ...current };
        delete nextSearch.q;
        delete nextSearch.lifecycle;
        delete nextSearch.sort;
        nextSearch.page = 1;
        return nextSearch;
      },
      replace: true,
    });
  };

  const filterSummary = [
    lifecycle !== "all" ? `Lifecycle: ${getLifecycleLabel(lifecycle).label}` : null,
    activeQuery ? `Search: ${activeQuery}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* ---------------------------------------------------------------------------------
   * Preview panel
   * ------------------------------------------------------------------------------ */

  const selectedAccountId = search.account ?? null;
  const selectedAccount = selectedAccountId
    ? (accounts.find((account) => account.id === selectedAccountId) ?? null)
    : null;

  /**
   * The preview read is a query, under the key Account 360 uses for the same data.
   *
   * It used to be a bare `Promise.all` in a `useEffect` — uncached, refired whenever the
   * `accounts` array identity changed, and impossible to invalidate. Sharing the overview
   * key means a preview also warms the full workspace the reader is about to open, instead
   * of the two screens fetching the same rows under two different names.
   */
  const previewQuery = useQuery({
    queryKey: companyWorkspaceQueryKey(selectedAccountId ?? "none", "overview"),
    queryFn: () =>
      getCompanyWorkspaceRead({ data: { accountId: selectedAccountId as string, sections: [] } }),
    enabled: Boolean(selectedAccountId) && Boolean(selectedAccount),
    staleTime: 30_000,
  });

  const previewSummary = useMemo<AccountPreviewSummary | null>(() => {
    if (!selectedAccount) return null;

    const read = previewQuery.data;
    const company = read?.core.company ?? selectedAccount;
    const overview =
      read && (read.overview.status === "ready" || read.overview.status === "empty")
        ? read.overview.data
        : null;

    return {
      id: company.id,
      name: company.name,
      lifecycleStage: company.lifecycle_stage,
      relationshipHealth: company.relationship_health ?? 0,
      lastActivityAt: company.last_activity_at ?? null,
      nextAction: company.next_action ?? null,
      counts: overview
        ? {
            contacts: read?.core.contacts.length ?? 0,
            clients: overview.linkedClientCount,
            engagements: overview.activeEngagementCount,
            quotes: overview.quoteCount,
            openSignals: overview.openSignalCount,
          }
        : null,
    };
  }, [previewQuery.data, selectedAccount]);

  const openPreview = (accountId: string) =>
    navigate({ search: (current) => ({ ...current, account: accountId }) });

  const closePreview = () =>
    navigate({
      search: (current) => {
        const nextSearch = { ...current };
        delete nextSearch.account;
        return nextSearch;
      },
    });

  /* ---------------------------------------------------------------------------------
   * Writes
   * ------------------------------------------------------------------------------ */

  /**
   * A ref, not just the state flag, because the guard has to hold inside a handler that was
   * captured before the re-render — a state read there is the value from the render the
   * handler closed over, which is exactly the click a locked control is trying to reject.
   */
  const favoriteLock = useRef(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const selectedFavorite = previewSummary
    ? preferences.favorites.some((favorite) => favorite.href === `/accounts/${previewSummary.id}`)
    : false;

  /** The list is loader-owned, so its refresh needs the router as well as the cache (PC-4). */
  const refreshAccountList = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: crmQueryKeys.accounts.list(listFilters),
        exact: true,
      }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.shell(), exact: true }),
    ]);
    await router.invalidate({
      filter: (match) => match.routeId === "__root__" || match.routeId === "/accounts",
    });
  };

  const toggleFavorite = async () => {
    if (!previewSummary || favoriteLock.current) return;

    const wasFavorite = selectedFavorite;
    favoriteLock.current = true;
    setFavoritePending(true);
    try {
      await togglePersonalWorkspaceFavorite({
        data: {
          kind: "account",
          label: previewSummary.name,
          href: `/accounts/${previewSummary.id}`,
          accountId: previewSummary.id,
        },
      });
      await refreshAccountList();
      toast.success(wasFavorite ? "Removed from favorites" : "Added to favorites");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      favoriteLock.current = false;
      setFavoritePending(false);
    }
  };

  /* ---------------------------------------------------------------------------------
   * Table
   * ------------------------------------------------------------------------------ */

  const countsFor = (accountId: string) =>
    accountCounts?.[accountId] ?? { openSignalCount: 0, linkedClientCount: 0 };

  const pageSignals = accounts.reduce(
    (total, account) => total + countsFor(account.id).openSignalCount,
    0,
  );
  const pageClients = accounts.reduce(
    (total, account) => total + countsFor(account.id).linkedClientCount,
    0,
  );
  const pageAtRisk = accounts.filter((account) => account.lifecycle_stage === "at_risk").length;

  const columns: ColumnDef<Account>[] = [
    {
      id: "name",
      header: "Company",
      priority: "primary",
      sticky: true,
      width: "16rem",
      cell: (account) => (
        <div className="min-w-0">
          <span className="font-medium">{account.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {account.industry ?? "Industry not set"}
          </span>
        </div>
      ),
    },
    {
      id: "lifecycle_stage",
      header: "Lifecycle",
      priority: "primary",
      cell: (account) => <LifecycleBadge stage={account.lifecycle_stage} />,
    },
    {
      id: "relationship_health",
      header: "Health",
      priority: "primary",
      cell: (account) => {
        const health = account.relationship_health ?? 0;
        return (
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums">{health}</span>
            {isAtRisk(health) && (
              <span className="text-xs text-warning-foreground">
                {getDerivedStatusLabel("at_risk").label}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "open_signals",
      header: "Open signals",
      priority: "primary",
      numeric: true,
      cell: (account) => formatCount(countsFor(account.id).openSignalCount),
    },
    {
      id: "linked_clients",
      header: "Clients",
      priority: "secondary",
      numeric: true,
      cell: (account) => formatCount(countsFor(account.id).linkedClientCount),
    },
    {
      id: "owner",
      header: "Owner",
      priority: "tertiary",
      cell: (account) => (
        <div className="min-w-0">
          <span className="block truncate text-sm">{ownerLabel(account.account_owner)}</span>
          <span className="block truncate text-xs text-muted-foreground">
            CS: {ownerLabel(account.cs_owner)}
          </span>
        </div>
      ),
    },
    {
      id: "last_activity_at",
      header: "Last activity",
      priority: "secondary",
      cell: (account) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(account.last_activity_at)}
        </span>
      ),
    },
    {
      id: "next_action",
      header: "Next action",
      priority: "tertiary",
      cell: (account) => (
        <span className="block max-w-[18rem] truncate text-sm text-muted-foreground">
          {account.next_action ?? "Not set"}
        </span>
      ),
    },
  ];

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Accounts"
        description={`${formatCount(pagination.total)} organisation records — prospects, clients, partners, vendors and event participants. Search, lifecycle and sort run on the server, so they narrow the whole workspace rather than this page.`}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "accounts",
              label: "Accounts",
              value: pagination.total,
              hint: hasActiveFilters ? "matching these filters" : "in this workspace",
            },
            {
              id: "signals",
              label: "Open signals",
              value: pageSignals,
              hint: "on this page",
              tone: pageSignals > 0 ? "warning" : "neutral",
            },
            {
              id: "at-risk",
              label: "At risk",
              value: pageAtRisk,
              hint: "on this page",
              tone: pageAtRisk > 0 ? "destructive" : "neutral",
            },
            {
              id: "clients",
              label: "Linked clients",
              value: pageClients,
              hint: "on this page",
            },
          ]}
          columns={4}
        />

        <section className="space-y-3">
          <SectionHeader
            title="Companies"
            description="Open a company for its stakeholders, commercial history, delivery state and open signals."
            action={
              <WorkspaceViewSwitcher
                objectType="account"
                activeConfig={activeConfig}
                views={preferences.views}
                onSelect={(config) => {
                  setSavedViewConfig(config);
                  navigate({
                    search: (current) => {
                      const nextSearch = { ...current };
                      delete nextSearch.lifecycle;
                      delete nextSearch.sort;
                      if (config.filters.lifecycle_stage) {
                        nextSearch.lifecycle = config.filters.lifecycle_stage;
                      }
                      const sort = companySortToKey(config.sort);
                      if (sort) nextSearch.sort = sort;
                      nextSearch.page = 1;
                      return nextSearch;
                    },
                    replace: true,
                  });
                }}
                onClearView={clearFilters}
                onSaved={async (name) => {
                  // Saved views arrive with the loader, so the cache alone cannot show one.
                  await refreshAccountList();
                  toast.success(`Saved the view “${name}”`);
                }}
              />
            }
          />

          <Card className="p-3">
            <FilterToolbar
              search={{
                value: searchDraft,
                onChange: setSearchDraft,
                placeholder: "Search every company by name",
              }}
              filters={[
                {
                  id: "lifecycle",
                  label: "Lifecycle",
                  value: lifecycle,
                  onChange: setLifecycle,
                  options: LIFECYCLE_OPTIONS,
                },
              ]}
              sort={{ value: sortKey, onChange: setSort, options: SORT_OPTIONS }}
              onClear={clearFilters}
              resultCount={pagination.total}
            />
          </Card>

          {accounts.length === 0 ? (
            hasActiveFilters ? (
              <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
            ) : (
              <EmptyWorkspaceState
                icon={Building2}
                title="No companies yet"
                description="Accounts arrive from lead conversion, the client importer and event imports. One of those has to run before relationship tracking has anything to track."
              />
            )
          ) : (
            <ResponsiveRecordList
              caption="Companies"
              columns={columns}
              rows={accounts}
              rowKey={(account) => account.id}
              rowHref={(account) => `/accounts/${account.id}`}
              selectedRowKey={selectedAccountId ?? undefined}
              rowActions={(account) => (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    openPreview(account.id);
                  }}
                >
                  <Eye aria-hidden="true" className="mr-2 h-4 w-4" />
                  Quick preview
                </DropdownMenuItem>
              )}
              renderCard={(account) => (
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{account.name}</span>
                    <LifecycleBadge stage={account.lifecycle_stage} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {account.industry ?? "Industry not set"} · Owner{" "}
                    {ownerLabel(account.account_owner)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Health {account.relationship_health ?? 0} ·{" "}
                    {formatCount(countsFor(account.id).openSignalCount)} open signals · last
                    activity {formatDate(account.last_activity_at)}
                  </p>
                </div>
              )}
            />
          )}

          <ListPagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }), replace: true })
            }
          />
        </section>
      </div>

      <AccountPreviewPanel
        account={previewSummary}
        open={Boolean(selectedAccount)}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
        loading={previewQuery.isFetching}
        error={previewQuery.isError ? toSafeErrorMessage(previewQuery.error) : null}
        onRetry={() => void previewQuery.refetch()}
        isFavorite={selectedFavorite}
        onToggleFavorite={previewSummary ? () => void toggleFavorite() : undefined}
        favoritePending={favoritePending}
      />
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ListPagination } from "@/components/list-pagination";
import { AccountSummaryCard } from "@/components/relationship/account-summary-card";
import { AccountPreviewPanel } from "@/components/relationship/account-preview-panel";
import { WorkspaceViewSwitcher } from "@/components/relationship/workspace-view-switcher";
import { getCompanyWorkspaceCore } from "@/server-functions/company-workspace";
import { getClientsPage } from "@/server-functions/clients";
import { getAccountsIndexRead } from "@/server-functions/accounts-index";
import { togglePersonalWorkspaceFavorite } from "@/server-functions/workspace-preferences";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { toCompanyWorkspaceSummary } from "@/lib/relationship/company-workspace";
import { useIsExactPath } from "@/lib/routing-utils";
import { companiesSearchSchema, companySortFromKey, companySortToKey } from "@/lib/admin-ux-search";
import type { AccountLifecycleStage, WorkspaceViewConfig } from "@/lib/types";

const DEFAULT_ACCOUNT_VIEW_CONFIG: WorkspaceViewConfig = {
  filters: {},
  columns: ["name", "lifecycle_stage", "relationship_health", "last_activity_at", "next_action"],
  sort: { field: "last_activity_at", direction: "desc" },
};

export const Route = createFileRoute("/accounts")({
  validateSearch: companiesSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.accounts.list(search),
        queryFn: () =>
          getAccountsIndexRead({
            data: { lifecycle_stage: search.lifecycle, page: search.page, limit: search.limit },
          }),
      }),
    ),
  head: () => ({
    meta: [{ title: "Accounts - Fimmick ClientOps" }],
  }),
  component: AccountsRoute,
});

function AccountsRoute() {
  const isIndexRoute = useIsExactPath("/accounts");

  if (!isIndexRoute) return <Outlet />;

  return <AccountsIndex />;
}

function AccountsIndex() {
  const loaderData = Route.useLoaderData();
  const { accounts, accountCounts, preferences } = loaderData;
  const router = useRouter();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const pagination = loaderData.pagination ?? {
    page: search.page ?? 1,
    limit: search.limit ?? 50,
    total: accounts.length,
  };
  const [savedViewConfig, setSavedViewConfig] = useState(DEFAULT_ACCOUNT_VIEW_CONFIG);
  const activeConfig = useMemo<WorkspaceViewConfig>(
    () => ({
      ...savedViewConfig,
      filters: {
        ...savedViewConfig.filters,
        lifecycle_stage: search.lifecycle,
      },
      sort: companySortFromKey(search.sort),
    }),
    [savedViewConfig, search.lifecycle, search.sort],
  );
  const selectedAccountId = search.account ?? null;
  const hasSelectedAccount =
    selectedAccountId !== null && accounts.some((account) => account.id === selectedAccountId);
  const [selectedSummary, setSelectedSummary] = useState<ReturnType<
    typeof toCompanyWorkspaceSummary
  > | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const rows = useMemo(() => {
    const filtered = accounts.filter((account) => {
      const filters = activeConfig.filters;
      if (filters.lifecycle_stage && account.lifecycle_stage !== filters.lifecycle_stage)
        return false;
      if (filters.account_owner && account.account_owner !== filters.account_owner) return false;
      if (filters.cs_owner && account.cs_owner !== filters.cs_owner) return false;
      return true;
    });
    const direction = activeConfig.sort.direction === "asc" ? 1 : -1;

    return [...filtered].sort((left, right) => {
      const field = activeConfig.sort.field;
      if (field === "relationship_health") {
        return ((left.relationship_health ?? 0) - (right.relationship_health ?? 0)) * direction;
      }
      const leftValue = field === "name" ? left.name : (left.last_activity_at ?? "");
      const rightValue = field === "name" ? right.name : (right.last_activity_at ?? "");
      return leftValue.localeCompare(rightValue) * direction;
    });
  }, [accounts, activeConfig]);

  useEffect(() => {
    if (!selectedAccountId) {
      setSelectedSummary(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    const account = accounts.find((candidate) => candidate.id === selectedAccountId);
    if (!account) {
      setSelectedSummary(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setSelectedSummary(
      toCompanyWorkspaceSummary({
        account,
        contacts: [],
        clients: [],
        leads: [],
        quotes: [],
        tasks: [],
      }),
    );
    setPreviewLoading(true);
    setPreviewError(null);

    void Promise.all([
      getCompanyWorkspaceCore({ data: { accountId: selectedAccountId } }),
      getClientsPage({ data: { account_id: selectedAccountId, page: 1, limit: 100 } }),
    ])
      .then(([core, clientPage]) => {
        if (!cancelled) {
          setSelectedSummary(
            toCompanyWorkspaceSummary({
              account: core.company,
              contacts: core.contacts,
              clients: clientPage.items,
              leads: [],
              quotes: [],
              tasks: [],
            }),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Company details could not be refreshed.");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, retryKey, selectedAccountId]);

  const selectedFavorite = selectedSummary
    ? preferences.favorites.some((favorite) => favorite.href === `/accounts/${selectedSummary.id}`)
    : false;

  return (
    <>
      <PageHeader
        title="Companies"
        description="Company records across prospects, clients, partners, vendors, and event participants."
      />
      <main className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <ListPagination
          page={pagination.page}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={(page) =>
            navigate({ search: (current) => ({ ...current, page }), replace: true })
          }
        />
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label htmlFor="account-lifecycle" className="text-sm font-medium">
                Lifecycle
              </label>
              <select
                id="account-lifecycle"
                value={activeConfig.filters.lifecycle_stage ?? "all"}
                className="block h-11 min-w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  const lifecycle =
                    event.target.value === "all"
                      ? undefined
                      : (event.target.value as AccountLifecycleStage);
                  navigate({
                    search: (current) => {
                      const nextSearch = { ...current };
                      delete nextSearch.lifecycle;
                      if (lifecycle) nextSearch.lifecycle = lifecycle;
                      nextSearch.page = 1;
                      return nextSearch;
                    },
                    replace: true,
                  });
                }}
              >
                <option value="all">All companies</option>
                <option value="prospect">Leads</option>
                <option value="active_client">Clients</option>
                <option value="at_risk">At risk</option>
                <option value="churned">Former clients</option>
                <option value="partner">Partners</option>
                <option value="vendor">Vendors</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="account-sort" className="text-sm font-medium">
                Sort
              </label>
              <select
                id="account-sort"
                value={`${activeConfig.sort.field}:${activeConfig.sort.direction}`}
                className="block h-11 min-w-44 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  const sort =
                    event.target.value === "last_activity_at:desc"
                      ? undefined
                      : (event.target.value as NonNullable<typeof search.sort>);
                  navigate({
                    search: (current) => {
                      const nextSearch = { ...current };
                      delete nextSearch.sort;
                      if (sort) nextSearch.sort = sort;
                      return nextSearch;
                    },
                    replace: true,
                  });
                }}
              >
                <option value="last_activity_at:desc">Recent activity</option>
                <option value="name:asc">Name A-Z</option>
                <option value="relationship_health:asc">Lowest health</option>
                <option value="relationship_health:desc">Highest health</option>
              </select>
            </div>
          </div>
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
                  return nextSearch;
                },
                replace: true,
              });
            }}
          />
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No accounts yet. Create or import a company record to start relationship tracking.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No companies match this view.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((account) => (
              <button
                key={account.id}
                type="button"
                aria-label={`Preview ${account.name}`}
                onClick={() =>
                  navigate({ search: (current) => ({ ...current, account: account.id }) })
                }
                className="block cursor-pointer rounded-lg text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <AccountSummaryCard
                  account={account}
                  openSignalCount={accountCounts?.[account.id]?.openSignalCount ?? 0}
                  linkedClientCount={accountCounts?.[account.id]?.linkedClientCount ?? 0}
                />
              </button>
            ))}
          </div>
        )}
      </main>
      <AccountPreviewPanel
        account={selectedSummary}
        open={hasSelectedAccount}
        onOpenChange={(open) => {
          if (!open) {
            navigate({
              search: (current) => {
                const nextSearch = { ...current };
                delete nextSearch.account;
                return nextSearch;
              },
            });
          }
        }}
        loading={previewLoading}
        error={previewError}
        onRetry={() => setRetryKey((value) => value + 1)}
        isFavorite={selectedFavorite}
        onToggleFavorite={
          selectedSummary
            ? async () => {
                await togglePersonalWorkspaceFavorite({
                  data: {
                    kind: "account",
                    label: selectedSummary.displayName,
                    href: `/accounts/${selectedSummary.id}`,
                    accountId: selectedSummary.id,
                  },
                });
                await router.invalidate();
              }
            : undefined
        }
      />
    </>
  );
}

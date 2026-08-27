import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AdminOverview } from "@/components/admin/admin-overview";
import { ErrorState, StaleDataIndicator, WorkspaceHeader } from "@/components/sales";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getAdminAuditSummaryFn } from "@/server-functions/admin-access";
import { getAdminOverviewFn as getOverview } from "@/server-functions/admin-users";

const adminOverviewQueryKey = crmQueryKeys.admin.section("overview", "summary");

const adminOverviewQueryOptions = () =>
  routeQueryOptions({
    queryKey: adminOverviewQueryKey,
    queryFn: async () => {
      const [overview, auditLogs] = await Promise.all([
        getOverview(),
        // Degrades to [] for an actor without `audit.view`, server-side, so this page does
        // not need its own capability branch for the security-events list.
        getAdminAuditSummaryFn({ data: { limit: 5 } }),
      ]);
      return { overview, auditLogs };
    },
  });

export const Route = createFileRoute("/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminOverviewQueryOptions()),
  errorComponent: AdminOverviewErrorState,
  component: AdminOverviewRoute,
});

/**
 * Without this the loader's thrown value fell through to the root boundary, which renders
 * `{error.message}` straight into the page body — and `getAdminOverview` runs raw SQL.
 */
function AdminOverviewErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The admin overview did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/" });
        }}
      />
    </div>
  );
}

function AdminOverviewRoute() {
  const loaded = Route.useLoaderData();
  const overviewQuery = useQuery({ ...adminOverviewQueryOptions(), initialData: loaded });
  const { overview, auditLogs } = overviewQuery.data;

  const needsAttention =
    overview.pendingAccessRequests + overview.suspendedUsers + overview.managerlessTeams;

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title="Organization health"
        description={
          needsAttention === 0
            ? "Nothing is waiting on an administrator right now."
            : "People, access and security work that needs an administrator."
        }
        status={
          <StaleDataIndicator
            updatedAt={new Date(overviewQuery.dataUpdatedAt).toISOString()}
            isRefetching={overviewQuery.isFetching}
          />
        }
      />
      <AdminOverview overview={overview} auditLogs={auditLogs} />
    </>
  );
}

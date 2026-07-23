import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminOverview } from "@/components/admin/admin-overview";
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
        getAdminAuditSummaryFn({ data: { limit: 5 } }),
      ]);
      return { overview, auditLogs };
    },
  });

export const Route = createFileRoute("/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminOverviewQueryOptions()),
  component: AdminOverviewRoute,
});

function AdminOverviewRoute() {
  const loaded = Route.useLoaderData();
  const { data } = useQuery({ ...adminOverviewQueryOptions(), initialData: loaded });
  return <AdminOverview overview={data.overview} auditLogs={data.auditLogs} />;
}

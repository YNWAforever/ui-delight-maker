import { createFileRoute } from "@tanstack/react-router";
import { AdminOverview } from "@/components/admin/admin-overview";
import { getAdminAuditLogsFn } from "@/server-functions/admin-access";
import { getAdminOverviewFn as getOverview } from "@/server-functions/admin-users";

export const Route = createFileRoute("/admin/")({
  loader: async () => {
    const overview = await getOverview();
    let auditLogs: Awaited<ReturnType<typeof getAdminAuditLogsFn>>["items"] = [];
    try {
      auditLogs = (await getAdminAuditLogsFn({ data: { limit: 5 } })).items;
    } catch {
      // The overview remains useful to scoped administrators without audit access.
    }
    return { overview, auditLogs };
  },
  component: AdminOverviewRoute,
});

function AdminOverviewRoute() {
  const { overview, auditLogs } = Route.useLoaderData();
  return <AdminOverview overview={overview} auditLogs={auditLogs} />;
}

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminError } from "@/lib/admin/errors";
import { getAdminNavigationFn } from "@/server-functions/admin-users";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    try {
      return { navigation: await getAdminNavigationFn() };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        throw redirect({ to: "/" });
      }
      throw error;
    }
  },
  head: () => ({
    meta: [
      { title: "Admin workspace · Fimmick ClientOps" },
      {
        name: "description",
        content: "Manage people, teams, access, and administrative audit history.",
      },
    ],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const { navigation } = Route.useRouteContext();
  return (
    <AdminShell navigation={navigation}>
      <Outlet />
    </AdminShell>
  );
}

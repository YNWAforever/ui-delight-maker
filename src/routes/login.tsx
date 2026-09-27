import { createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { LoginAuthPage } from "@/components/auth/login-auth-page";
import { getLoginAuthPath } from "@/lib/auth/auth-routes";
import { getCurrentWorkspaceAccess } from "@/server-functions/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Login - Fimmick ClientOps" }],
  }),
  loader: async () => {
    const access = await getCurrentWorkspaceAccess();
    if (access.state === "active") throw redirect({ to: "/" });
    return access;
  },
  component: LoginPage,
});

function LoginPage() {
  const access = Route.useLoaderData();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return <LoginAuthPage authPath={getLoginAuthPath(pathname)} accessState={access.state} />;
}

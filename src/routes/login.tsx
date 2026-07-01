import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { LoginAuthPage } from "@/components/auth/login-auth-page";
import { getLoginAuthPath } from "@/lib/auth/auth-routes";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Login - Fimmick ClientOps" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return <LoginAuthPage authPath={getLoginAuthPath(pathname)} />;
}

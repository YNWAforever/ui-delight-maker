import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginAuthPage } from "@/components/auth/login-auth-page";
import { getCurrentWorkspaceAccess } from "@/server-functions/auth";

export const Route = createFileRoute("/login/$authPath")({
  head: () => ({
    meta: [{ title: "Login - Fimmick ClientOps" }],
  }),
  loader: async () => {
    const access = await getCurrentWorkspaceAccess();
    if (access.state === "active") throw redirect({ to: "/" });
    return access;
  },
  component: LoginAuthPathPage,
});

function LoginAuthPathPage() {
  const { authPath } = Route.useParams();
  const access = Route.useLoaderData();
  return <LoginAuthPage authPath={authPath} accessState={access.state} />;
}

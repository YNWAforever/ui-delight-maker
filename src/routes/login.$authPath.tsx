import { createFileRoute } from "@tanstack/react-router";
import { LoginAuthPage } from "@/components/auth/login-auth-page";

export const Route = createFileRoute("/login/$authPath")({
  head: () => ({
    meta: [{ title: "Login - Fimmick ClientOps" }],
  }),
  component: LoginAuthPathPage,
});

function LoginAuthPathPage() {
  const { authPath } = Route.useParams();
  return <LoginAuthPage authPath={authPath} />;
}

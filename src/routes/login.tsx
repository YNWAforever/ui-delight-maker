import { createFileRoute } from "@tanstack/react-router";
import { LoginAuthPage } from "@/components/auth/login-auth-page";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Login - Fimmick ClientOps" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  return <LoginAuthPage authPath="sign-in" />;
}

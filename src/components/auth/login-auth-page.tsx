import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  WorkspaceAccessState,
  type WorkspaceAccessStateName,
} from "@/components/auth/workspace-access-state";
import { signOut } from "@/server-functions/auth";

const LoginAuthForm = lazy(() =>
  import("@/components/auth/login-auth-form").then((module) => ({
    default: module.LoginAuthForm,
  })),
);

type LoginAuthPageProps = {
  authPath?: string;
  redirectTo?: string;
  title?: string;
  description?: string;
  accessState?: "anonymous" | "active" | WorkspaceAccessStateName;
};

export function LoginAuthPage({
  authPath = "sign-in",
  redirectTo = "/",
  title = "Fimmick ClientOps",
  description,
  accessState = "anonymous",
}: LoginAuthPageProps) {
  const [signOutError, setSignOutError] = useState(false);
  const isSignUp = authPath === "sign-up" && redirectTo.startsWith("/invite/");
  const supportingCopy =
    description ??
    (isSignUp
      ? "Use the invited email address to create your account. Access begins after invitation activation."
      : authPath === "forgot-password"
        ? "Enter your email to receive a password reset link."
        : authPath === "reset-password"
          ? "Set a new password for your invited account."
          : "Sign in with your administrator-invited account.");

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{supportingCopy}</p>
        </div>
        {accessState !== "anonymous" && accessState !== "active" ? (
          <>
            <WorkspaceAccessState
              state={accessState}
              onSignOut={() => {
                void signOut()
                  .then(() => window.location.replace("/login"))
                  .catch(() => setSignOutError(true));
              }}
            />
            {signOutError && (
              <p role="alert" className="text-center text-sm text-destructive">
                Sign out failed. Please try again.
              </p>
            )}
          </>
        ) : (
          <>
            <ClientOnly fallback={<LoginAuthFormSkeleton />}>
              <Suspense fallback={<LoginAuthFormSkeleton />}>
                <LoginAuthForm authPath={authPath} redirectTo={redirectTo} />
              </Suspense>
            </ClientOnly>
            {(authPath === "forgot-password" || authPath === "reset-password") && (
              <a
                href="/login/sign-in"
                className="block rounded-sm text-center text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Back to sign in
              </a>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function LoginAuthFormSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading sign-in form">
      <p className="text-center text-sm text-muted-foreground">Loading sign-in form…</p>
      <div className="h-10 animate-pulse rounded-md bg-muted" />
      <div className="h-10 animate-pulse rounded-md bg-muted" />
      <div className="h-10 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

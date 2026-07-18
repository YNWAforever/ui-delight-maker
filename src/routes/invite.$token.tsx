import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, LogIn } from "lucide-react";
import { LoginAuthPage } from "@/components/auth/login-auth-page";
import { getInvitationPreview } from "@/server-functions/admin-invitations";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [{ title: "Accept invitation - Fimmick ClientOps" }],
  }),
  loader: async ({ params }) => {
    try {
      const preview = await getInvitationPreview({ data: { token: params.token } });
      return { state: "ready" as const, preview };
    } catch {
      return { state: "unavailable" as const };
    }
  },
  component: InvitationPage,
});

function roleLabel(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function InvitationUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Invitation unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This invitation is invalid, expired, revoked, or already used. Ask your administrator for
          a new invitation.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Go to sign in
        </Link>
      </section>
    </main>
  );
}

function InvitationPage() {
  const data = Route.useLoaderData();
  const { token } = Route.useParams();

  if (data.state === "unavailable") {
    return <InvitationUnavailable />;
  }

  return (
    <LoginAuthPage
      authPath="sign-up"
      redirectTo={`/invite/${encodeURIComponent(token)}/complete`}
      title="Join Fimmick ClientOps"
      description={`Invitation for ${data.preview.email} as ${roleLabel(data.preview.intendedRole)}`}
    />
  );
}

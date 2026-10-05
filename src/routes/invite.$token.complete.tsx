import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, LogIn } from "lucide-react";
import {
  acceptUserInvitation,
  getInvitationLandingState,
} from "@/server-functions/admin-invitations";

export const Route = createFileRoute("/invite/$token/complete")({
  head: () => ({
    meta: [{ title: "Activate account - Fimmick ClientOps" }],
  }),
  loader: async ({ params }) => {
    try {
      await acceptUserInvitation({ data: { token: params.token } });
    } catch {
      try {
        const landing = await getInvitationLandingState({ data: { token: params.token } });
        if (landing.state === "expired" || landing.state === "used") {
          return { state: landing.state };
        }
      } catch {
        // Preserve generic failure if the token cannot be inspected.
      }
      return { state: "error" as const };
    }

    throw redirect({ href: "/account?welcome=1" });
  },
  component: InvitationCompletionPage,
});

function InvitationCompletionPage() {
  const { state } = Route.useLoaderData();
  const description = {
    expired: "This invitation has expired. Ask your administrator for a new invitation.",
    used: "This invitation has already been used. Sign in with your account or ask your administrator for help.",
    error:
      "Sign in with the invited email address, or ask your administrator for a new invitation.",
  }[state];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-destructive/10 text-tone-danger-fg">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">We could not activate this invitation</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
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

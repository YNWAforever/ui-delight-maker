import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, LogIn } from "lucide-react";
import { acceptUserInvitation } from "@/server-functions/admin-invitations";

export const Route = createFileRoute("/invite/$token/complete")({
  head: () => ({
    meta: [{ title: "Activate account - Fimmick ClientOps" }],
  }),
  loader: async ({ params }) => {
    try {
      await acceptUserInvitation({ data: { token: params.token } });
    } catch {
      return { state: "error" as const };
    }

    throw redirect({ href: "/account?welcome=1" });
  },
  component: InvitationCompletionPage,
});

function InvitationCompletionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">We could not activate this invitation</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Sign in with the invited email address, or ask your administrator for a new invitation.
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

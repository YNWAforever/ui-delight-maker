import { AccountView } from "@neondatabase/auth-ui";
import { createFileRoute } from "@tanstack/react-router";
import { NeonAuthProvider } from "@/components/auth/neon-auth-provider";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [{ title: "Account - Fimmick ClientOps" }],
  }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <NeonAuthProvider redirectTo="/">
      <PageHeader title="Account" description="Manage your profile and sign-in settings." />
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <AccountView />
      </div>
    </NeonAuthProvider>
  );
}

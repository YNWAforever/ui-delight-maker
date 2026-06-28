import { AccountView } from "@neondatabase/auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [{ title: "Account - Fimmick ClientOps" }],
  }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Account</h1>
      <AccountView />
    </div>
  );
}

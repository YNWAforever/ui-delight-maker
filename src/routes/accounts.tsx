import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { AccountSummaryCard } from "@/components/relationship/account-summary-card";
import { getClients } from "@/server-functions/clients";
import { getAccounts } from "@/server-functions/accounts";
import { getRelationshipSignals } from "@/server-functions/relationship-signals";

export const Route = createFileRoute("/accounts")({
  loader: async () => {
    const [accounts, clients, signals] = await Promise.all([
      getAccounts({}),
      getClients({}),
      getRelationshipSignals({ data: { openOnly: true } }),
    ]);

    return { accounts, clients, signals };
  },
  head: () => ({
    meta: [{ title: "Accounts - Fimmick ClientOps" }],
  }),
  component: AccountsRoute,
});

function AccountsRoute() {
  const { accounts, clients, signals } = Route.useLoaderData();
  const signalCountByAccount = new Map<string, number>();
  const clientCountByAccount = new Map<string, number>();

  for (const signal of signals) {
    signalCountByAccount.set(
      signal.account_id,
      (signalCountByAccount.get(signal.account_id) ?? 0) + 1,
    );
  }

  for (const client of clients) {
    if (!client.account_id) continue;
    clientCountByAccount.set(
      client.account_id,
      (clientCountByAccount.get(client.account_id) ?? 0) + 1,
    );
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Company records across prospects, clients, partners, vendors, and event participants."
      />
      <main className="px-6 py-6">
        {accounts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No accounts yet. Create or import a company record to start relationship tracking.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {accounts.map((account) => (
              <Link
                key={account.id}
                to="/accounts/$id"
                params={{ id: account.id }}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <AccountSummaryCard
                  account={account}
                  openSignalCount={signalCountByAccount.get(account.id) ?? 0}
                  linkedClientCount={clientCountByAccount.get(account.id) ?? 0}
                />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

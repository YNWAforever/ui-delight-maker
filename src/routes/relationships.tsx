import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { RelationshipCommandCenter } from "@/components/relationship/relationship-command-center";
import { getAccounts } from "@/server-functions/accounts";
import { getRelationshipSignals } from "@/server-functions/relationship-signals";

export const Route = createFileRoute("/relationships")({
  loader: async () => {
    const [accounts, signals] = await Promise.all([
      getAccounts({}),
      getRelationshipSignals({ data: { openOnly: true } }),
    ]);

    return { accounts, signals };
  },
  head: () => ({
    meta: [{ title: "Relationship Command Center - Fimmick ClientOps" }],
  }),
  component: RelationshipsRoute,
});

function RelationshipsRoute() {
  const { accounts, signals } = Route.useLoaderData();

  return (
    <>
      <PageHeader
        title="Relationship Command Center"
        description="Act on missing stakeholders, event follow-ups, stale relationships, risks, and cross-sell opportunities."
      />
      <main className="px-6 py-6">
        <RelationshipCommandCenter accounts={accounts} signals={signals} />
      </main>
    </>
  );
}

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ImportSessionPanel } from "@/components/imports/import-session-panel";
import { ErrorState, WorkspaceHeader } from "@/components/sales";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getProducts } from "@/server-functions/products";

const clientImportSearchSchema = z.object({
  show: z.enum(["all", "valid", "errors"]).default("all").catch("all"),
});

export const Route = createFileRoute("/clients/import")({
  validateSearch: clientImportSearchSchema,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.products.list({ activeOnly: true }),
        queryFn: () => getProducts({ data: { activeOnly: true } }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Import clients — Fimmick ClientOps" },
      {
        name: "description",
        content: "Preview and resume a CSV import of clients, contacts and engagements.",
      },
    ],
  }),
  errorComponent: ImportErrorState,
  component: ImportWizard,
});

function ImportErrorState({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The import screen did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/clients/import" });
        }}
      />
    </div>
  );
}

function ImportWizard() {
  const products = Route.useLoaderData();
  const queryClient = useQueryClient();
  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Import clients"
        description="Preview each CSV row, then commit and resume in 20-row batches."
        backHref={{ to: "/clients", label: "All clients" }}
      />
      <div className="space-y-4 px-4 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">
          company_name is required. Use a stable source namespace and external_id for known
          customers. An existing company name without a trusted ID requires review; the importer
          does not merge customers by name.
        </p>
        {products.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Active product_name values: {products.map((product) => product.name).join(", ")}.
          </p>
        )}
        <ImportSessionPanel
          kind="client"
          title="Client CSV"
          onProgress={async (result) => {
            if (!result.rows.some((row) => row.status === "succeeded")) return;
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: crmQueryKeys.clients.lists() }),
              queryClient.invalidateQueries({ queryKey: crmQueryKeys.accounts.lists() }),
              queryClient.invalidateQueries({ queryKey: crmQueryKeys.engagements.lists() }),
            ]);
          }}
        />
      </div>
    </>
  );
}

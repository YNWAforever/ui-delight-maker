import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ImportSessionPanel } from "@/components/imports/import-session-panel";
import { ErrorState, WorkspaceHeader } from "@/components/sales";
import { crmQueryKeys } from "@/lib/query-keys";

const leadImportSearchSchema = z.object({
  show: z.enum(["all", "valid", "errors"]).default("all").catch("all"),
});

export const Route = createFileRoute("/leads/import")({
  validateSearch: leadImportSearchSchema,
  head: () => ({
    meta: [
      { title: "Import leads — Fimmick ClientOps" },
      {
        name: "description",
        content: "Preview and resume a CSV import of leads and contacts.",
      },
    ],
  }),
  errorComponent: LeadImportErrorState,
  component: LeadImportWizard,
});

function LeadImportErrorState({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The import screen did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/leads/import" });
        }}
      />
    </div>
  );
}

function LeadImportWizard() {
  const queryClient = useQueryClient();
  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title="Import leads"
        description="Preview each CSV row, then commit and resume in 20-row batches."
        backHref={{ to: "/leads", label: "Lead Inbox" }}
      />
      <div className="space-y-4 px-4 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">
          company_name and contact_email are required. Use a stable source namespace and external_id
          to reimport known records. An existing name without a trusted ID requires review; no
          customer or lead is merged by name alone.
        </p>
        <ImportSessionPanel
          kind="lead"
          title="Lead CSV"
          onProgress={async (result) => {
            if (result.rows.some((row) => row.status === "succeeded"))
              await queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.lists() });
          }}
        />
      </div>
    </>
  );
}

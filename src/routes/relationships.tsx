import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { RelationshipCommandCenter } from "@/components/relationship/relationship-command-center";
import { Button } from "@/components/ui/button";
import { crmQueryKeys } from "@/lib/query-keys";
import { getRelationshipIndexRead } from "@/server-functions/relationship-workspaces";

const RELATIONSHIP_PAGE_SIZE = 50;
const initialRelationshipFilters = { page: 1, limit: RELATIONSHIP_PAGE_SIZE } as const;

export const Route = createFileRoute("/relationships")({
  loader: () => getRelationshipIndexRead({ data: initialRelationshipFilters }),
  head: () => ({
    meta: [{ title: "Relationship Command Center - Fimmick ClientOps" }],
  }),
  component: RelationshipsRoute,
});

function RelationshipsRoute() {
  const initialRead = Route.useLoaderData();
  const queryClient = useQueryClient();
  const [relationshipPage, setRelationshipPage] = useState(1);
  const relationshipFilters = { page: relationshipPage, limit: RELATIONSHIP_PAGE_SIZE };
  const relationshipQuery = useQuery({
    queryKey: crmQueryKeys.relationships.list(relationshipFilters),
    queryFn: () => getRelationshipIndexRead({ data: relationshipFilters }),
    initialData: relationshipPage === 1 ? initialRead : undefined,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });
  const relationshipData = relationshipQuery.data ?? initialRead;
  const accounts = relationshipData.items.map((item) => item.account);
  const signals = relationshipData.items.flatMap((item) => item.signalSummaries);
  const hiddenSignalCount = relationshipData.items.reduce(
    (total, item) => total + Math.max(0, item.openSignalCount - item.signalSummaries.length),
    0,
  );
  const totalPages = Math.max(1, Math.ceil(relationshipData.total / relationshipData.limit));

  const refreshAfterDismiss = () => {
    void queryClient.invalidateQueries({ queryKey: crmQueryKeys.relationships.lists() });
  };

  return (
    <>
      <PageHeader
        title="Relationship Command Center"
        description="Act on missing stakeholders, event follow-ups, stale relationships, risks, and cross-sell opportunities."
      />
      <main className="space-y-4 px-6 py-6">
        {relationshipQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            The latest relationship page could not be loaded. Showing the previous results.
          </p>
        ) : null}
        <RelationshipCommandCenter
          accounts={accounts}
          signals={signals}
          hiddenSignalCount={hiddenSignalCount}
          onDismissed={refreshAfterDismiss}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Page {relationshipPage} of {totalPages} · {relationshipData.total} accounts with open
            signals
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous relationship page"
              disabled={relationshipPage <= 1 || relationshipQuery.isFetching}
              onClick={() => setRelationshipPage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next relationship page"
              disabled={relationshipPage >= totalPages || relationshipQuery.isFetching}
              onClick={() => setRelationshipPage((page) => Math.min(totalPages, page + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getNoteTidyRuns } from "@/server-functions/auxiliary-agent-runs";
import { crmQueryKeys } from "@/lib/query-keys";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PolicyPanel } from "./policy-panel";
export function AuxiliaryWorkflowPanel({ runId }: { runId?: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: crmQueryKeys.agents.section("note_tidy", "runs", { page, runId }),
    queryFn: () => getNoteTidyRuns({ data: { page, limit: 25, runId } }),
  });
  const history = query.data;
  return (
    <section className="space-y-3 rounded-md border p-4" aria-label="Auxiliary AI">
      <h2 className="text-lg font-semibold">Auxiliary AI · Note Tidy</h2>
      <p className="text-sm text-muted-foreground">
        Direct model calls; no n8n worker/callback. Your invocation metadata only. Manual notes
        remain independent. A timeout does not establish provider cancellation.
      </p>
      <PolicyPanel workflowType="note_tidy" />
      {runId && (
        <Link to="/agents" search={{ auxiliaryRun: undefined }}>
          Show my Note Tidy history
        </Link>
      )}
      {history ? (
        <>
          <p className="text-sm">
            This page: {history.items.length} / {history.total} matching invocations
          </p>
          {history.items.length === 0 && <p>No accessible Note Tidy runs match this page.</p>}
          <ul className="space-y-2">
            {history.items.map((run) => (
              <li key={run.id} className="rounded border p-3 text-sm">
                <Link to="/agents" search={{ auxiliaryRun: run.id }} className="font-medium">
                  Note Tidy · {formatDateTime(run.created_at)}
                </Link>
                <p>
                  {run.status} · {run.outcome_code ?? "Outcome unknown"}
                </p>
                <p>
                  Actual model: {run.model_used ?? "Unknown"}; tokens:{" "}
                  {run.tokens_used ?? "Unknown"}; cost: {run.usage?.cost ?? "Unknown"}
                  {run.usage?.currency ? ` ${run.usage.currency}` : ""}
                </p>
                <details>
                  <summary>Invocation details</summary>
                  <p>Run ID: {run.id}</p>
                </details>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous Note Tidy page
            </Button>
            <Button
              variant="outline"
              disabled={page * 25 >= history.total || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next Note Tidy page
            </Button>
          </div>
        </>
      ) : (
        <p>{query.isError ? "Note Tidy history unavailable." : "Loading Note Tidy metadata…"}</p>
      )}
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh Note Tidy history
      </Button>
    </section>
  );
}

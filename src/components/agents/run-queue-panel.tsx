import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAgentQueue } from "@/server-functions/agent-runs";
import { agentSlugForWorkflowType } from "@/lib/agents";
import { crmQueryKeys } from "@/lib/query-keys";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { QueueToolbar, type QueueSearch } from "./queue-toolbar";
import { DemoOriginLabel } from "./data-scope";
export function RunQueuePanel({
  filters,
  onChange,
}: {
  filters: QueueSearch;
  onChange: (value: QueueSearch) => void;
}) {
  const query = useQuery({
    queryKey: crmQueryKeys.agentQueue({ ...filters, queue: "runs" }),
    queryFn: () => getAgentQueue({ data: { ...filters, queue: "runs" } }),
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;
  const refresh = () => {
    if (filters.cursor) onChange({ ...filters, cursor: undefined });
    else void query.refetch();
  };
  return (
    <section className="space-y-3" aria-label="Complete AI run queue">
      <h2 className="text-lg font-semibold">All accessible AI runs</h2>
      <QueueToolbar queue="runs" value={filters} onChange={onChange} />
      {query.isError && <p role="alert">Run queue did not load. Refresh or clear its filters.</p>}
      {data?.queue === "runs" ? (
        <>
          <p className="text-sm">
            This page: {data.items.length} / {data.totalMatching} matching runs. Created before{" "}
            {formatDateTime(data.asOf)}; current states are rechecked.
          </p>
          {data.items.length === 0 && (
            <p>
              {filters.cursor
                ? "This page no longer matches. Refresh starts from the first page."
                : "No accessible runs match these filters."}
            </p>
          )}
          <ul className="space-y-2">
            {data.items.map((run) => {
              const slug = agentSlugForWorkflowType(run.workflow_type);
              return (
                <li key={run.id} className="rounded border p-3 text-sm">
                  {slug ? (
                    <Link
                      to="/agents/$name"
                      params={{ name: slug }}
                      search={{ runId: run.id, page: 1 }}
                      className="font-medium"
                    >
                      {run.agent_name}
                    </Link>
                  ) : (
                    <Link
                      to="/agents"
                      search={
                        run.workflow_type === "note_tidy"
                          ? { auxiliaryRun: run.id }
                          : { ...filters, runId: run.id, cursor: undefined }
                      }
                      className="font-medium"
                    >
                      {run.agent_name} · {run.workflow_type}
                    </Link>
                  )}
                  <p>
                    {run.status} · {formatDateTime(run.created_at)} ·{" "}
                    <DemoOriginLabel value={run.is_demo} />
                  </p>
                  <p>
                    {run.subject_restricted
                      ? "Summary restricted."
                      : (run.output_summary ?? "No summary recorded.")}
                  </p>
                  <details>
                    <summary>Run details</summary>
                    <p>Run ID: {run.id}</p>
                    <p>Workflow: {run.workflow_type}</p>
                    <p>Tokens: {run.tokens_used ?? "Unknown"}</p>
                  </details>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!filters.cursor || query.isFetching}
              onClick={() => onChange({ ...filters, cursor: undefined })}
            >
              First run page
            </Button>
            <Button
              variant="outline"
              disabled={!data.nextCursor || query.isFetching}
              onClick={() => onChange({ ...filters, cursor: data.nextCursor ?? undefined })}
            >
              Next run page
            </Button>
          </div>
        </>
      ) : (
        !query.isError && <p>Loading accessible runs…</p>
      )}
      <Button variant="outline" disabled={query.isFetching} onClick={refresh}>
        Refresh run queue
      </Button>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BulkRecoveryDialog } from "./bulk-recovery-dialog";
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
  actorId = "unknown",
}: {
  filters: QueueSearch;
  onChange: (value: QueueSearch) => void;
  actorId?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const selectionEpoch = useRef(0);
  // Pagination stays in the same selection scope; URL/filter changes start a new scope.
  const selectionQuery = JSON.stringify({ ...filters, cursor: undefined });
  useEffect(() => {
    selectionEpoch.current++;
    setSelected([]);
    setSelectionError(null);
    setSelecting(false);
  }, [selectionQuery]);
  const change = (next: QueueSearch) => {
    selectionEpoch.current++;
    setSelected([]);
    setSelectionError(null);
    setSelecting(false);
    onChange(next);
  };
  const selectAll = async () => {
    if (selecting) return;
    const epoch = selectionEpoch.current;
    setSelecting(true);
    setSelectionError(null);
    try {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await getAgentQueue({
          data: { ...filters, queue: "runs", limit: 50, cursor },
        });
        if (epoch !== selectionEpoch.current) return;
        if (
          page.queue !== "runs" ||
          page.totalMatching > 100 ||
          ids.length + page.items.length > 100
        )
          throw Error("Too many matching runs");
        ids.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      setSelected([...new Set(ids)]);
    } catch {
      if (epoch === selectionEpoch.current)
        setSelectionError(
          "Selection could not be confirmed within 100 items. Narrow the query or refresh; no IDs were truncated.",
        );
    } finally {
      if (epoch === selectionEpoch.current) setSelecting(false);
    }
  };
  const query = useQuery({
    queryKey: crmQueryKeys.agentQueue({ ...filters, queue: "runs" }),
    queryFn: () => getAgentQueue({ data: { ...filters, queue: "runs" } }),
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;
  const refresh = () => {
    if (filters.cursor) change({ ...filters, cursor: undefined });
    else void query.refetch();
  };
  return (
    <section className="space-y-3" aria-label="Complete AI run queue">
      <h2 className="text-lg font-semibold">All accessible AI runs</h2>
      <QueueToolbar queue="runs" value={filters} onChange={change} />
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
                  <label className="mr-3">
                    <input
                      type="checkbox"
                      aria-label={"Select run " + run.id}
                      checked={selected.includes(run.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked ? [...old, run.id] : old.filter((id) => id !== run.id),
                        )
                      }
                    />{" "}
                    Select
                  </label>
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setSelected([...new Set([...selected, ...data.items.map((r) => r.id)])])
              }
            >
              Select this page
            </Button>
            <Button
              variant="outline"
              disabled={selecting || query.isFetching || data.totalMatching > 100}
              onClick={() => void selectAll()}
            >
              Select all {data.totalMatching} matching runs
            </Button>
            <Button variant="outline" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
          {data.totalMatching > 100 && (
            <p>Narrow filters to at most 100 before selecting all matching runs.</p>
          )}
          {selectionError && <p role="alert">{selectionError}</p>}
          <p className="text-xs text-muted-foreground">
            Selected IDs may span pages and stay selected on same-page refresh. Clear selection
            before starting another query.
          </p>
          <BulkRecoveryDialog
            runIds={selected}
            actorId={actorId}
            onComplete={() => void query.refetch()}
          />
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

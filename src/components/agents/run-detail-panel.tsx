import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatCount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import type { AgentRunDetailRead, AgentTraceCursor, AgentTraceEvent } from "@/lib/agent-run-detail";
import { getAgentRunDetailRead } from "@/server-functions/agent-runs";

type DetailProps = { runId: string; actorId: string };

/** The query does not mount until the native, keyboard-accessible disclosure is opened. */
export function AgentRunDetails({
  runId,
  actorId,
  label = "Run details",
  children,
}: DetailProps & {
  label?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">{label}</summary>
      {children}
      {open && <AgentRunDetailPanel key={`${actorId}:${runId}`} runId={runId} actorId={actorId} />}
    </details>
  );
}

export function AgentRunDetailPanel({ runId, actorId }: DetailProps) {
  const [cursors, setCursors] = useState<Array<AgentTraceCursor | undefined>>([undefined]);
  const [page, setPage] = useState(0);
  const cursor = cursors[page];
  const actorKnown = actorId !== "unknown" && actorId.length > 0;
  const query = useQuery({
    ...routeQueryOptions({
      queryKey: crmQueryKeys.agents.section(runId, "run-detail", { actorId, cursor }),
      queryFn: () => getAgentRunDetailRead({ data: { runId, cursor } }),
      staleTime: 0,
    }),
    enabled: actorKnown,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
  });
  // A cached success cannot authorize a newly opened panel or a failed background refresh.
  const data = !query.isError && !query.isFetching ? query.data : undefined;
  const visible =
    data?.available === true && data.actorId === actorId
      ? (data as Extract<AgentRunDetailRead, { available: true }>)
      : null;
  const refresh = () => {
    if (page === 0) void query.refetch();
    else {
      setCursors([undefined]);
      setPage(0);
    }
  };
  return (
    <section
      className="mt-3 space-y-3 rounded-md border border-border p-3"
      aria-label="Run evidence"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Run evidence</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={query.isFetching || !actorKnown}
          onClick={refresh}
        >
          Refresh run details
        </Button>
      </div>
      {query.isFetching || (actorKnown && query.isPending) ? (
        <p role="status" className="text-sm">
          Loading run evidence…
        </p>
      ) : !visible ? (
        <p role="alert" className="text-sm">
          Run details are unavailable. Refresh to check your access.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all text-xs">
            <dt>Run ID</dt>
            <dd>{visible.run.id}</dd>
            <dt>State</dt>
            <dd>
              {visible.run.status}
              {visible.run.outcome_code ? ` · ${visible.run.outcome_code}` : ""}
            </dd>
            <dt>Workflow</dt>
            <dd>{visible.run.workflow_type}</dd>
            <dt>Started</dt>
            <dd>{formatDateTime(visible.run.created_at)}</dd>
            <dt>Run duration</dt>
            <dd>
              {visible.run.duration_ms == null
                ? "Unrecorded"
                : `${formatCount(visible.run.duration_ms)} ms`}
            </dd>
            <dt>Actual model</dt>
            <dd>{visible.run.model_used ?? "Unknown"}</dd>
            <dt>Attempt ID</dt>
            <dd>{visible.run.attempt_id ?? "Unrecorded"}</dd>
          </dl>
          <h4 className="text-sm font-medium">Tool-call trace</h4>
          {visible.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recorded trace events. Older runs may predate tracing.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Newest first. Callback rows count delivery attempts, including retries.
              </p>
              <ol className="space-y-2" aria-label="Recorded trace events">
                {visible.events.map((event) => (
                  <TraceEvent key={event.id} event={event} />
                ))}
              </ol>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Newer trace events
            </Button>
            <span className="text-xs text-muted-foreground">Trace page {page + 1}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!visible.nextCursor || query.isFetching}
              onClick={() => {
                if (!visible.nextCursor) return;
                setCursors([...cursors.slice(0, page + 1), visible.nextCursor]);
                setPage(page + 1);
              }}
            >
              Older trace events
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

const SOURCE_LABELS = {
  mcp: "MCP",
  governed_ai: "Governed AI",
  n8n_dispatch: "n8n dispatch",
  n8n_writeback: "n8n callback",
};
function TraceEvent({ event }: { event: AgentTraceEvent }) {
  const outcome =
    event.source === "n8n_dispatch" && event.error_code === "dispatch_ambiguous"
      ? "Dispatch outcome unknown"
      : event.status === "error"
        ? "Error recorded"
        : event.status !== "ok"
          ? "Outcome unknown"
          : event.source === "n8n_dispatch"
            ? "Accepted"
            : event.source === "n8n_writeback"
              ? "Processed"
              : "Succeeded";
  return (
    <li className="space-y-1 rounded-md border border-border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {event.source ? (SOURCE_LABELS[event.source] ?? "Unknown source") : "Unknown source"}
        </span>
        <span>{event.tool_name}</span>
        <span>{outcome}</span>
        <span>
          {event.duration_ms == null
            ? "Duration unrecorded"
            : `${formatCount(event.duration_ms)} ms`}
        </span>
      </div>
      <p className="text-muted-foreground">{formatDateTime(event.called_at)}</p>
      {event.error_code && <p>Error code: {event.error_code}</p>}
      <details className="break-all text-muted-foreground">
        <summary className="cursor-pointer">Trace metadata</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Event ID</dt>
          <dd>{event.id}</dd>
          <dt>Argument keys</dt>
          <dd>{event.args_keys?.join(", ") || "Unrecorded"}</dd>
          <dt>Argument digest</dt>
          <dd>{event.args_digest ?? "Unrecorded"}</dd>
        </dl>
      </details>
    </li>
  );
}

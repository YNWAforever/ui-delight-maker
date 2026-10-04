import type { z } from "zod";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { Button } from "@/components/ui/button";
export type QueueSearch = z.output<typeof agentQueueSearchSchema>;
export function QueueToolbar({
  queue,
  value,
  onChange,
}: {
  queue: "runs" | "approvals";
  value: QueueSearch;
  onChange: (value: QueueSearch) => void;
}) {
  const update = (patch: Partial<QueueSearch>) =>
    onChange({ ...value, ...patch, cursor: undefined, runId: undefined });
  const statuses =
    queue === "runs"
      ? ["running", "waiting_approval", "failed", "completed"]
      : ["pending", "escalated", "approved", "rejected", "superseded"];
  const style =
    "mt-1 block w-full rounded border bg-background p-2 focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          Workflow
          <select
            className={style}
            value={value.workflowType ?? ""}
            onChange={(e) =>
              update({ workflowType: (e.target.value as QueueSearch["workflowType"]) || undefined })
            }
          >
            <option value="">All workflows</option>
            {AGENT_DEFINITIONS.map((agent) => (
              <option key={agent.workflow_type} value={agent.workflow_type}>
                {agent.display_name}
              </option>
            ))}
            <option value="note_tidy">Note Tidy</option>
            <option value="unknown">Unknown workflow</option>
          </select>
        </label>
        <label className="text-sm">
          Queue status
          <select
            className={style}
            value={value.status ?? ""}
            onChange={(e) =>
              update({ status: (e.target.value as QueueSearch["status"]) || undefined })
            }
          >
            <option value="">
              {queue === "approvals" ? "Open: pending and escalated" : "All run statuses"}
            </option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Data origin
          <select
            className={style}
            value={value.origin}
            onChange={(e) => update({ origin: e.target.value as QueueSearch["origin"] })}
          >
            {["all", "demo", "non-demo", "unknown"].map((origin) => (
              <option key={origin} value={origin}>
                {origin}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          From (UTC)
          <input
            className={style}
            type="datetime-local"
            value={value.from?.slice(0, 16) ?? ""}
            onChange={(e) => update({ from: e.target.value ? e.target.value + ":00Z" : undefined })}
          />
        </label>
        <label className="text-sm">
          To (UTC)
          <input
            className={style}
            type="datetime-local"
            value={value.to?.slice(0, 16) ?? ""}
            onChange={(e) => update({ to: e.target.value ? e.target.value + ":00Z" : undefined })}
          />
        </label>
        <label className="text-sm">
          Rows per page
          <select
            className={style}
            value={value.limit}
            onChange={(e) => update({ limit: Number(e.target.value) as 25 | 50 })}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      {queue === "runs" && (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.attention}
            onChange={(e) => update({ attention: e.target.checked })}
          />
          Needs attention (failed in 7 days, waiting, or stuck ≥60m)
        </label>
      )}
      <Button
        variant="outline"
        onClick={() =>
          onChange({
            // Route search merges patches; omitted optional fields would retain old filters.
            workflowType: undefined,
            status: undefined,
            from: undefined,
            to: undefined,
            cursor: undefined,
            runId: undefined,
            ...agentQueueSearchSchema.parse({}),
          })
        }
      >
        Clear queue filters
      </Button>
      <p className="text-xs text-muted-foreground">
        Filters and counts apply on the server to accessible rows. Changing filters starts a new
        page; queue states may change between requests.
      </p>
    </div>
  );
}

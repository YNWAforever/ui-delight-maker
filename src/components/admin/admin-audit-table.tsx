import { Download } from "lucide-react";

import {
  DataTableShell,
  EmptyWorkspaceState,
  SectionHeader,
  StatusBadge,
  type ColumnDef,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { formatCount, formatDateTime } from "@/lib/format";
import type { AdminAuditLog, Paginated } from "@/server/repositories/admin-access";

type AdminAuditTableProps = {
  data: Paginated<AdminAuditLog>;
  onPageChange?: (page: number) => void;
  /**
   * Runs the export. Omit for an actor whose role does not hold `audit.export` — the button
   * used to render whenever the prop existed, with no capability check at all, so a reader
   * who could open this page got a live Export button that always failed.
   */
  onExport?: () => void;
  /** True while an export is in flight, so repeated clicks cannot fire concurrent exports. */
  exporting?: boolean;
  /**
   * What the export actually produces, in the caller's words.
   *
   * Passed in rather than written here because the honest sentence depends on what the
   * server returned: `exportAdminAuditLogsFn` re-runs the same paginated query, so the file
   * is the rows currently on screen, not the audit history. The label and this sentence are
   * the only thing standing between a reader and a file named after a history it is not.
   */
  exportHint?: string;
  exportLabel?: string;
};

function snapshot(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function AdminAuditTable({
  data,
  onPageChange,
  onExport,
  exporting = false,
  exportHint,
  exportLabel = "Export",
}: AdminAuditTableProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.limit)));

  const columns: ColumnDef<AdminAuditLog>[] = [
    {
      id: "time",
      header: "Time",
      priority: "primary",
      cell: (entry) => (
        // `CLAUDE.md` requires every date to go through src/lib/format.ts so the server and
        // the client agree. This one column printed the raw Postgres timestamp — on the one
        // screen where timestamps are the entire point.
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(entry.created_at)}
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      priority: "primary",
      cell: (entry) => <span className="font-medium text-foreground">{entry.action}</span>,
    },
    {
      id: "severity",
      header: "Severity",
      priority: "primary",
      cell: (entry) => <StatusBadge domain="auditSeverity" value={entry.severity} />,
    },
    {
      id: "target",
      header: "Target",
      priority: "secondary",
      cell: (entry) => (
        <span className="block max-w-[18rem] break-words text-foreground">
          {entry.target_type}
          {entry.target_id ? ` · ${entry.target_id}` : ""}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      priority: "secondary",
      cell: (entry) => (
        <span className="block max-w-[16rem] break-words text-foreground">
          {entry.actor_profile_id ?? "System"}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      priority: "tertiary",
      cell: (entry) => (
        <span className="block max-w-[18rem] text-muted-foreground">
          {entry.reason ?? "No reason recorded"}
        </span>
      ),
    },
  ];

  return (
    <section aria-label="Admin audit review" className="space-y-4 px-4 py-6 md:px-6">
      <SectionHeader
        title="Administrative history"
        description="Immutable and redacted. Open a row to compare the before and after snapshots."
        action={
          onExport ? (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={exporting || data.items.length === 0}
                onClick={onExport}
              >
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                {exporting ? "Preparing…" : exportLabel}
              </Button>
              {exportHint ? (
                <span className="max-w-xs text-xs text-muted-foreground">{exportHint}</span>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {data.items.length === 0 ? (
        <EmptyWorkspaceState
          title="No audit entries match these filters"
          description="Administrative writes are recorded here as they happen. Widen the filters above to see more."
        />
      ) : (
        <>
          <div className="rounded-md border border-border">
            <DataTableShell
              columns={columns}
              rows={data.items}
              rowKey={(entry) => entry.id}
              caption="Administrative audit entries"
              expandable={{
                renderDetails: (entry) => (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Before
                      </p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
                        {snapshot(entry.before_snapshot)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        After
                      </p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
                        {snapshot(entry.after_snapshot)}
                      </pre>
                    </div>
                  </div>
                ),
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Page {formatCount(data.page)} of {formatCount(totalPages)} · {formatCount(data.total)}{" "}
              entries
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => onPageChange?.(data.page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={data.page >= totalPages}
                onClick={() => onPageChange?.(data.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

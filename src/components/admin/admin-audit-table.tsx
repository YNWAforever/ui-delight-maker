import type { AdminAuditLog, Paginated } from "@/server/repositories/admin-access";

type AdminAuditTableProps = {
  data: Paginated<AdminAuditLog>;
  onPageChange?: (page: number) => void;
  onExport?: () => void;
};

function snapshot(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function AdminAuditTable({ data, onPageChange, onExport }: AdminAuditTableProps) {
  return (
    <section aria-label="Admin audit review" className="space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Admin audit review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable, redacted administrative changes with before and after snapshots.
          </p>
        </div>
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Export audit
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[58rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Time</th>
              <th className="px-3 py-3 font-medium">Actor</th>
              <th className="px-3 py-3 font-medium">Target</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Severity</th>
              <th className="px-3 py-3 font-medium">Reason</th>
              <th className="px-3 py-3 font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.map((entry) => (
              <tr key={entry.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {entry.created_at}
                </td>
                <td className="px-3 py-3 text-foreground">{entry.actor_profile_id ?? "System"}</td>
                <td className="px-3 py-3 text-foreground">
                  {entry.target_type}
                  {entry.target_id ? ":" + entry.target_id : ""}
                </td>
                <td className="px-3 py-3 font-medium text-foreground">{entry.action}</td>
                <td className="px-3 py-3 capitalize text-foreground">{entry.severity}</td>
                <td className="max-w-[16rem] px-3 py-3 text-muted-foreground">
                  {entry.reason ?? "No reason recorded"}
                </td>
                <td className="px-3 py-3">
                  <details>
                    <summary className="cursor-pointer font-medium text-primary">
                      View change
                    </summary>
                    <div className="mt-2 grid gap-2 text-xs">
                      <pre className="max-w-[28rem] overflow-x-auto rounded-md bg-muted p-2">
                        {snapshot(entry.before_snapshot)}
                      </pre>
                      <pre className="max-w-[28rem] overflow-x-auto rounded-md bg-muted p-2">
                        {snapshot(entry.after_snapshot)}
                      </pre>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => onPageChange?.(data.page - 1)}
            className="min-h-9 rounded-md border border-border px-3 py-2 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={data.page >= Math.ceil(data.total / data.limit)}
            onClick={() => onPageChange?.(data.page + 1)}
            className="min-h-9 rounded-md border border-border px-3 py-2 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

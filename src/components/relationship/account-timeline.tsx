import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import type { AccountTimelineEntry } from "@/lib/relationship/types";

export function AccountTimeline({ entries }: { entries: AccountTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No timeline activity yet. Log a touchpoint, create a task, import event attendees, or run
        relationship intelligence.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{entry.title}</p>
              {entry.detail && <p className="text-muted-foreground">{entry.detail}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {entry.kind.replace(/_/g, " ")}
              </span>
              {entry.status ? <StatusBadge value={String(entry.status)} /> : null}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(entry.occurred_at)}</p>
        </li>
      ))}
    </ul>
  );
}

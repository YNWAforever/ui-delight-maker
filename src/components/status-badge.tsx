import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // leads
  new: "bg-info/10 text-info border-info/20",
  qualified: "bg-primary/10 text-primary border-primary/20",
  replied: "bg-accent text-accent-foreground border-border",
  quoted: "bg-warning/15 text-warning-foreground border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  won: "bg-success/20 text-success border-success/40",
  lost: "bg-muted text-muted-foreground border-border",
  // quotes
  draft: "bg-muted text-muted-foreground border-border",
  pending_approval: "bg-warning/15 text-warning-foreground border-warning/30",
  sent: "bg-info/15 text-info border-info/30",
  viewed: "bg-primary/10 text-primary border-primary/20",
  accepted: "bg-success/20 text-success border-success/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  // tasks
  open: "bg-info/10 text-info border-info/20",
  in_progress: "bg-warning/15 text-warning-foreground border-warning/30",
  done: "bg-success/15 text-success border-success/30",
  // approvals
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  escalated: "bg-destructive/15 text-destructive border-destructive/30",
  // agent runs
  running: "bg-info/10 text-info border-info/20",
  ready_for_review: "bg-info/10 text-info border-info/20",
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  waiting_approval: "bg-warning/15 text-warning-foreground border-warning/30",
  idle: "bg-muted text-muted-foreground border-border",
  // priority
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  value,
  className,
  label,
}: {
  value: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const normalizedValue = value?.trim() || "Unknown";
  const style = STATUS_STYLES[normalizedValue] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        // whitespace-nowrap because a badge is one token, not a sentence. Without it a
        // two-word status broke across lines inside its own pill — "Active Client" rendered
        // as "Active" over "Client" — whenever the row it sits in got tight.
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize",
        style,
        className,
      )}
    >
      {label ?? normalizedValue.replace(/_/g, " ")}
    </span>
  );
}

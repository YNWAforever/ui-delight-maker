import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  PauseCircle,
  ShieldAlert,
  TimerOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { WorkSurfaceEmpty } from "@/components/sales/work-surface-empty";
import { cn } from "@/lib/utils";

/**
 * The exception queue: the small set of records that need a human today.
 *
 * Two rules are load-bearing and are the reason this is a component rather than a snippet
 * repeated per route.
 *
 * 1. Severity is rendered as an icon **and** a text label, never as colour alone. A row
 *    tinted red tells a colour-blind user, a greyscale printout and a screen reader
 *    nothing at all, and this queue is the one surface where missing the signal has a
 *    cost. The tone classes below always pair a background token with its matching
 *    `-foreground` token, which is what keeps the chip legible in both schemes.
 * 2. Ordering is the caller's. Attention order is a product decision made from data this
 *    component cannot see — SLA clock, deal value, risk score — so it renders `items`
 *    in the order given and never sorts. A component that quietly re-sorted would make
 *    every caller's ranking a lie.
 */
export type AttentionSeverity =
  | "sla"
  | "approval"
  | "value"
  | "ai-review"
  | "risk"
  | "failure"
  | "stuck";

export type AttentionItem = {
  id: string;
  severity: AttentionSeverity;
  /** The record's name, e.g. "QT-1042 — Acme Media". Becomes the row's link text. */
  title: string;
  /** Why it is in the queue, in one sentence. Not a restatement of the severity label. */
  reason: string;
  /** Who owns it now. Omit when genuinely unassigned rather than inventing a placeholder. */
  owner?: string;
  /** Pre-formatted age, e.g. "3 days". A string because the caller knows the clock. */
  age: string;
  /** Where the row goes. Every attention item must be actionable. */
  href: string;
  /** One inline action, e.g. an Approve button. The row link stays the main path. */
  action?: ReactNode;
};

export type AttentionQueueProps = {
  /** Rendered in the given order. See the note above: this component does not sort. */
  items: AttentionItem[];
  /** Shown when the queue is empty. An empty queue is good news — say so. */
  emptyTitle: string;
  emptyDescription: string;
  className?: string;
};

type SeverityPresentation = { label: string; icon: LucideIcon; chip: string };

/**
 * Labels come from the canonical status vocabulary. "SLA breached", "At risk" and "Stuck"
 * are derived states — computed from a clock, a risk score and a threshold — which is
 * exactly why they live here as presentation and not as a database enum.
 */
const SEVERITY: Record<AttentionSeverity, SeverityPresentation> = {
  sla: {
    label: "SLA breached",
    icon: TimerOff,
    chip: "bg-destructive text-destructive-foreground",
  },
  approval: {
    label: "Waiting approval",
    icon: ClipboardCheck,
    chip: "bg-warning text-warning-foreground",
  },
  value: { label: "High value", icon: CircleDollarSign, chip: "bg-info text-info-foreground" },
  "ai-review": { label: "AI review", icon: Bot, chip: "bg-info text-info-foreground" },
  risk: { label: "At risk", icon: ShieldAlert, chip: "bg-warning text-warning-foreground" },
  failure: { label: "Failed", icon: XCircle, chip: "bg-destructive text-destructive-foreground" },
  stuck: { label: "Stuck", icon: PauseCircle, chip: "bg-muted text-muted-foreground" },
};

export function AttentionQueue({
  items,
  emptyTitle,
  emptyDescription,
  className,
}: AttentionQueueProps) {
  if (items.length === 0) {
    return (
      <WorkSurfaceEmpty icon={CheckCircle2} title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <ul className={cn("divide-y divide-border rounded-md border border-border bg-card", className)}>
      {items.map((item) => {
        const severity = SEVERITY[item.severity];
        const Icon = severity.icon;

        return (
          <li
            key={item.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                    severity.chip,
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {severity.label}
                </span>
                <Link
                  to={item.href}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {item.title}
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">{item.reason}</p>
              <p className="text-xs text-muted-foreground">
                {item.owner && (
                  <>
                    <span>{item.owner}</span>
                    <span aria-hidden="true"> · </span>
                  </>
                )}
                <span>{item.age}</span>
              </p>
            </div>
            {item.action && <div className="shrink-0">{item.action}</div>}
          </li>
        );
      })}
    </ul>
  );
}

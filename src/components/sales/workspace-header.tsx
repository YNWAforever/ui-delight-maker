import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The single command header for every workspace.
 *
 * It replaces two headers that had drifted apart: `PageHeader` (15 routes) and
 * `CommandHeader` (10 routes), with no overlap and ten further routes using neither.
 * That split is the mechanical reason the product reads as unrelated templates rather
 * than one system, so the fix is to converge rather than add a third.
 *
 * What it takes from each: `CommandHeader` already rendered an eyebrow above the title,
 * which is the lifecycle context this design needs, and `PageHeader` had the tighter
 * `min-w-0` overflow discipline. Both capped the title at 20px, below the 24-30px the
 * type scale calls for, so both are raised here.
 *
 * `secondaryActions` is an array rather than one node so the "at most two" rule is
 * actually enforceable. A node would let three buttons through inside a fragment.
 */
export type WorkspaceHeaderProps = {
  /** Lifecycle or operating context, e.g. "Convert". Rendered above the title. */
  context: string;
  /** The page's only h1. */
  title: string;
  /** One operational sentence. Not marketing copy. */
  description?: string;
  /** Exactly one primary action. */
  primaryAction?: ReactNode;
  /** At most two. Anything further belongs in an overflow menu the caller supplies. */
  secondaryActions?: ReactNode[];
  /** Freshness or state indicator, e.g. StaleDataIndicator. Distinct from `context`. */
  status?: ReactNode;
  /** Detail pages return to their list. */
  backHref?: { to: string; label: string };
  className?: string;
};

const MAX_SECONDARY_ACTIONS = 2;

export function WorkspaceHeader({
  context,
  title,
  description,
  primaryAction,
  secondaryActions,
  status,
  backHref,
  className,
}: WorkspaceHeaderProps) {
  const secondary = secondaryActions?.filter(Boolean) ?? [];

  if (import.meta.env.DEV && secondary.length > MAX_SECONDARY_ACTIONS) {
    // Loud in development, silent in production: an over-full header is a design
    // problem to fix at the call site, not a reason to break the page for a user.
    console.warn(
      `WorkspaceHeader "${title}" was given ${secondary.length} secondary actions. ` +
        `At most ${MAX_SECONDARY_ACTIONS} may be visible — move the rest into an overflow menu.`,
    );
  }

  const hasActions = Boolean(primaryAction) || secondary.length > 0;

  return (
    <header
      className={cn(
        "border-b border-border bg-background/80 px-4 py-5 backdrop-blur md:px-6",
        className,
      )}
    >
      {backHref && (
        <Link
          to={backHref.to}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backHref.label}
        </Link>
      )}

      {/* Stacks below md so actions wrap under the title instead of overflowing. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {context}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl break-words text-sm text-muted-foreground">
              {description}
            </p>
          )}
          {status && <div className="mt-2">{status}</div>}
        </div>

        {hasActions && (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {/* Secondary first so the primary sits closest to the page edge on desktop
                and last in the tab order — the strongest position in both. */}
            {secondary.map((action, index) => (
              <span key={index}>{action}</span>
            ))}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}

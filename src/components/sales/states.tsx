import type { ReactNode } from "react";
import {
  AlertTriangle,
  History,
  Inbox,
  Lock,
  RefreshCw,
  SearchX,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientNow } from "@/hooks/use-client-now";
import { toSafeErrorMessage, type SafeErrorKind } from "@/lib/errors";
import { formatDate, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { COLUMN_PRIORITY_CLASS, type ColumnPriority } from "./data-table-shell";
import { MetricStrip, type MetricColumns } from "./metric-strip";

/**
 * The states a workspace can be in besides "showing data": loading, empty, filtered to
 * nothing, not permitted, and failed — plus the freshness marker that says how old the
 * data on screen is.
 *
 * They live in one file because they are one decision, not five. A route picks exactly one
 * of them, and the copy only works if each is written against the others: "no records
 * exist" and "your filter matched nothing" look identical on screen and need opposite
 * actions, so they are written side by side or they drift.
 */

/* -------------------------------------------------------------------------------------
 * LoadingSkeleton
 * ---------------------------------------------------------------------------------- */

export type LoadingSkeletonVariant = "metrics" | "table" | "cards" | "detail" | "panel";

export type LoadingSkeletonProps = {
  variant: LoadingSkeletonVariant;
  /** Named in the single sentence a screen reader hears, e.g. "leads". */
  label?: string;
  /** `table` body rows, `cards` cards, `detail`/`panel` sections. Ignored by `metrics`. */
  rows?: number;
  /** `metrics`: cards in the strip, clamped to 4. `table`: columns, unless `priorities`. */
  columns?: number;
  /**
   * `table` only, and the prop worth passing: the real table's own column priorities,
   * `columns.map((column) => column.priority)`. Without it the skeleton guesses, and a
   * wrong guess reserves a column at 375px that the loaded table then hides.
   */
  priorities?: ColumnPriority[];
  className?: string;
};

const DEFAULT_ROWS: Record<LoadingSkeletonVariant, number> = {
  metrics: 0,
  table: 5,
  cards: 4,
  detail: 3,
  panel: 3,
};

function clampMetricColumns(count: number): MetricColumns {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

/**
 * The fallback when a caller does not hand over its real priorities. Two identity-ish
 * columns that survive a phone, one that appears at `md`, everything else at `lg` — the
 * shape most of these workspace tables actually use.
 */
function guessPriorities(count: number): ColumnPriority[] {
  return Array.from({ length: count }, (_, index) =>
    index < 2 ? "primary" : index === 2 ? "secondary" : "tertiary",
  );
}

/** Keys for lists that have no data yet and so have nothing better to key on. */
function indexes(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/**
 * The metrics variant renders MetricStrip's own loading state rather than a copy of it.
 *
 * The point of a skeleton is that the box is exactly where the number lands, and the only
 * way to keep that true through a future change to the strip is to be the same component.
 * A hand-drawn imitation is correct on the day it is written and silently wrong afterwards,
 * which is worse than showing nothing.
 */
function MetricsSkeleton({ columns }: { columns: number }) {
  return <MetricStrip metrics={[]} isLoading columns={clampMetricColumns(columns)} />;
}

/**
 * Mirrors DataTableShell: the same bare `table` element and classes, the same primitives,
 * the same `px-3 py-2.5` cells, and the priority classes imported from it rather than
 * copied. Heights are the line boxes of the text they stand in for — `h-4` for the
 * `text-xs` header, `h-5` for `text-sm` body cells.
 */
function TableSkeleton({ rows, priorities }: { rows: number; priorities: ColumnPriority[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {priorities.map((priority, index) => (
            <TableHead
              key={index}
              scope="col"
              className={cn("px-3 py-2.5 text-xs", COLUMN_PRIORITY_CLASS[priority])}
            >
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {indexes(rows).map((row) => (
          <TableRow key={row}>
            {priorities.map((priority, index) => (
              <TableCell key={index} className={cn("px-3 py-2.5", COLUMN_PRIORITY_CLASS[priority])}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </table>
  );
}

/** Mirrors the card surface of ResponsiveRecordList: the same `ul`, `li` and body classes. */
function CardsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="space-y-3">
      {indexes(rows).map((row) => (
        <li key={row} className="rounded-lg border border-border bg-card">
          <div className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A record page's body, not a whole record page: the header is deliberately not skeletoned,
 * because WorkspaceHeader's title comes from the route and resolves before the query does.
 * Drawing a grey box where a title we already have will appear is a shift for nothing.
 */
function DetailSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {indexes(rows).map((section) => (
          <Card key={section} className="space-y-3 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </Card>
        ))}
      </div>
      <Card className="h-fit space-y-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </Card>
    </div>
  );
}

/** Mirrors RecordSummaryPanel's section list: `space-y-6`, an xs label, `mt-2` content. */
function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-6">
      {indexes(rows).map((section) => (
        <div key={section}>
          <Skeleton className="h-4 w-24" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The placeholder that holds a workspace's shape while its query is in flight.
 *
 * Every variant reserves the dimensions of the thing it stands in for, because a skeleton
 * of the wrong size is worse than no skeleton at all: it moves the page twice instead of
 * once, and the second move lands under the reader's cursor.
 *
 * Assistive technology hears one sentence, not the boxes. The boxes are `aria-hidden` and
 * the wrapper is a polite `status` with `aria-busy`, so a screen-reader user is told
 * "Loading leads" once rather than walked through forty empty cells.
 */
export function LoadingSkeleton({
  variant,
  label = "content",
  rows,
  columns,
  priorities,
  className,
}: LoadingSkeletonProps) {
  const rowCount = rows ?? DEFAULT_ROWS[variant];
  const columnPriorities = priorities ?? guessPriorities(columns ?? 4);

  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading {label}…</span>
      <div aria-hidden="true">
        {variant === "metrics" && <MetricsSkeleton columns={columns ?? 4} />}
        {variant === "table" && <TableSkeleton rows={rowCount} priorities={columnPriorities} />}
        {variant === "cards" && <CardsSkeleton rows={rowCount} />}
        {variant === "detail" && <DetailSkeleton rows={rowCount} />}
        {variant === "panel" && <PanelSkeleton rows={rowCount} />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------
 * Empty states
 * ---------------------------------------------------------------------------------- */

const SURFACE_CLASS =
  "flex min-h-[160px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-8 text-center";
const MEDALLION_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground";

export type EmptyWorkspaceStateProps = {
  icon?: LucideIcon;
  /** What is not here, as a fact. Not an apology. */
  title: string;
  /** One sentence: what would put something here. */
  description?: string;
  /** The action that creates the first record. Omit when the user cannot create one. */
  action?: ReactNode;
  className?: string;
};

/**
 * Nothing exists here yet.
 *
 * This supersedes `components/empty-state.tsx` and `sales/work-surface-empty.tsx`, which
 * were the same component drawn twice with different padding. Both now delegate here
 * instead of a third variant being added beside them: their prop shapes are unchanged, so
 * none of the thirteen existing call sites move, and there is one set of classes to keep
 * consistent rather than three.
 *
 * The distinction from `FilteredEmptyState` is the reason both exist. This one says the
 * workspace has no records, and its action creates one. That one says records exist but
 * the filter hid them, and its action clears the filter. Offering "New lead" to someone
 * whose only mistake was a stale status filter sends them off to create a duplicate of a
 * record they already have.
 */
export function EmptyWorkspaceState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyWorkspaceStateProps) {
  return (
    <div className={cn(SURFACE_CLASS, className)}>
      <div className={MEDALLION_CLASS}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export type FilteredEmptyStateProps = {
  /** Resets the filters this surface owns. Required: the state exists to offer the way out. */
  onClear: () => void;
  /** The active filters in one line, e.g. "Status: Draft · Owner: You". */
  filterSummary?: string;
  title?: string;
  description?: string;
  /** Wording of the reset control, when "Clear filters" is wrong for the surface. */
  clearLabel?: string;
  className?: string;
};

/**
 * Records exist; this filter matched none of them.
 *
 * Deliberately never says "No leads yet". The user has narrowed a list that has data in
 * it, and the only useful action is the one that widens it again — so the button clears
 * the filter rather than creating a record.
 */
export function FilteredEmptyState({
  onClear,
  filterSummary,
  title = "No results match these filters",
  description = "Widen or clear the filters to see the rest of this workspace.",
  clearLabel = "Clear filters",
  className,
}: FilteredEmptyStateProps) {
  return (
    <div className={cn(SURFACE_CLASS, className)}>
      <div className={MEDALLION_CLASS}>
        <SearchX className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {filterSummary && (
        <p className="mt-2 max-w-sm text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Filters:</span> {filterSummary}
        </p>
      )}
      <div className="mt-4">
        <Button type="button" variant="outline" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      </div>
    </div>
  );
}

export type PermissionDeniedStateProps = {
  /**
   * The workspace, in the words the navigation uses for it, e.g. "Approvals".
   *
   * Filtered before it is rendered — see `toSafeWorkspaceName`. A capability string here
   * is a mistake, not a label, and it is treated as one.
   */
  what: string;
  /** Somewhere this user can actually go. */
  action?: ReactNode;
  className?: string;
};

/** Rendered in place of anything that does not read like a workspace's name. */
const GENERIC_WORKSPACE = "this workspace";

/**
 * The longest a navigation label plausibly gets. Past this it is not a name.
 */
const MAX_WORKSPACE_NAME_LENGTH = 40;

/**
 * Identifier punctuation and camelCase — `leads.view`, `quotes:approve`, `admin_users`,
 * `leadsView`. Every capability, role and table name in this codebase has one of these
 * shapes; no label in the navigation has any of them.
 */
const IDENTIFIER_SHAPE = /[._:/\\]|[a-z][A-Z]/;

/**
 * A workspace name a person would say out loud, or a neutral stand-in.
 *
 * The doc below promises that no capability string reaches the screen, and `what: string`
 * cannot carry that promise — the same gap `ErrorState` closes by filtering its own props
 * rather than trusting call sites. Without this, `what={capability}` at one route prints
 * "You do not have access to leads.view", which is the exact leak the component exists to
 * prevent, handed to the reader in the component's own voice.
 */
function toSafeWorkspaceName(what: string): string {
  const trimmed = what.trim();
  if (trimmed === "" || trimmed.length > MAX_WORKSPACE_NAME_LENGTH) return GENERIC_WORKSPACE;
  return IDENTIFIER_SHAPE.test(trimmed) ? GENERIC_WORKSPACE : trimmed;
}

/**
 * This user cannot see this workspace.
 *
 * It names the workspace and nothing else. No capability string, no role, no group: an
 * authorization model is not something to teach a person through an error message, and
 * printing `leads.view` on screen tells an unauthorised reader exactly which capability to
 * go and ask for by name. What is left is the part that helps — what they cannot see, and
 * that a person rather than a retry button is what unblocks it.
 */
export function PermissionDeniedState({ what, action, className }: PermissionDeniedStateProps) {
  const name = toSafeWorkspaceName(what);

  return (
    <div className={cn(SURFACE_CLASS, className)}>
      <div className={MEDALLION_CLASS}>
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">You do not have access to {name}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Ask whoever set up your account to give you access to {name}.
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------------------
 * ErrorState
 * ---------------------------------------------------------------------------------- */

/** The failures a workspace can render. A subset of `SafeErrorKind` by construction. */
export type ErrorStateKind = Extract<SafeErrorKind, "server" | "offline" | "stale">;

export type ErrorStateProps = {
  kind: ErrorStateKind;
  onRetry: () => void;
  /** Overrides the default heading. Still filtered — see the note in the body. */
  title?: string;
  /** Human-written copy. Still filtered, because "safe" is not enforceable at a type. */
  description?: string;
  /** The caught value, of any shape. Never rendered as it arrived. */
  error?: unknown;
  /** Accessible and visible name of the retry control. */
  retryLabel?: string;
  className?: string;
};

const KIND_TITLE: Record<ErrorStateKind, string> = {
  server: "This did not load",
  offline: "You appear to be offline",
  stale: "This view is out of date",
};

const KIND_ICON: Record<ErrorStateKind, LucideIcon> = {
  server: AlertTriangle,
  offline: WifiOff,
  stale: History,
};

/**
 * Something failed, and the user needs to know what to do about it.
 *
 * Every string that reaches the screen goes through `toSafeErrorMessage`, including the
 * ones a caller passed as `title` and `description`. That looks like distrust of our own
 * call sites, and it is: `description: string` cannot express "and this one is safe", so
 * the only place that guarantee can live is here. A caller who forwards `error.message`
 * into `description` — the exact mistake this component exists to make impossible — gets
 * the generic sentence instead of a Postgres error quoting the failing query at the user.
 *
 * The kind is stated in words, never by the icon or a colour alone, because "offline" and
 * "the server failed" call for completely different things from the reader.
 */
export function ErrorState({
  kind,
  onRetry,
  title,
  description,
  error,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  const Icon = KIND_ICON[kind];
  const heading = title ? toSafeErrorMessage(title, kind) : KIND_TITLE[kind];
  // `toSafeErrorMessage(undefined, kind)` is the generic sentence for this kind, so an
  // ErrorState given neither a description nor an error still says something actionable.
  const body = description
    ? toSafeErrorMessage(description, kind)
    : toSafeErrorMessage(error, kind);

  return (
    <div className={cn(SURFACE_CLASS, className)} role="alert">
      <div className={MEDALLION_CLASS}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">{heading}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
      <div className="mt-4">
        <Button type="button" variant="outline" size="sm" onClick={onRetry} aria-label={retryLabel}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------
 * StaleDataIndicator
 * ---------------------------------------------------------------------------------- */

export type StaleDataIndicatorProps = {
  /** ISO timestamp of the data currently on screen. */
  updatedAt: string;
  isRefetching?: boolean;
  /** Age past which the data is called out as out of date. Default five minutes. */
  staleAfterMs?: number;
  className?: string;
};

const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

/**
 * How old the numbers on screen are.
 *
 * Hydration-safe by the route MetricStrip already takes, not a second one: `useClientNow`
 * returns null on the server and on the first client render, so both emit the absolute
 * date and only the mounted client swaps in "2m ago". Reading the clock during render
 * would make the server and the client disagree on every timestamp in the app.
 *
 * That null also settles the staleness question. Age cannot be computed without a clock,
 * so before mount the data is dated rather than judged — a server render that guessed
 * would announce "Out of date" on a page that had only just loaded.
 */
export function StaleDataIndicator({
  updatedAt,
  isRefetching = false,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  className,
}: StaleDataIndicatorProps) {
  const now = useClientNow();
  const timestamp = new Date(updatedAt).getTime();
  const isStale =
    now !== null && !Number.isNaN(timestamp) && now - timestamp > staleAfterMs && !isRefetching;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        isStale ? "text-warning-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-3 w-3 shrink-0", isRefetching && "animate-spin")}
        aria-hidden="true"
      />
      {isRefetching ? (
        <span>Refreshing…</span>
      ) : (
        <span>
          {/* The state is a word, not the amber. "Out of date" is what a reader who cannot
              see the colour — or who is holding a printout — needs to be told. */}
          {isStale && <span className="font-medium">Out of date · </span>}
          Updated{" "}
          <time dateTime={updatedAt}>
            {now === null ? formatDate(updatedAt) : relativeTime(updatedAt, now)}
          </time>
        </span>
      )}
      {/* Announced only when the refetch flag flips, so the 30s clock tick stays silent. */}
      <span role="status" className="sr-only">
        {isRefetching ? "Refreshing" : ""}
      </span>
    </span>
  );
}

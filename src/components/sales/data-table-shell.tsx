import { Fragment, useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, MoreHorizontal } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The one record table for every workspace list.
 *
 * Two decisions here are not obvious.
 *
 * It renders a raw `table` element rather than `ui/table`'s `Table`, even though every
 * other part of that primitive is reused. `Table` wraps its child in
 * `div.relative.w-full.overflow-auto` unconditionally, and an always-on scroll container
 * is the thing this component exists to stop: a table that can scroll sideways never has
 * to admit it has too many columns, so nobody ever prunes them and a narrow viewport
 * silently loses the right-hand half of every row. Columns are dropped by priority
 * instead, and `allowHorizontalScroll` is the deliberate, named exception.
 *
 * Priority is expressed in Tailwind responsive classes, never a measured width. The server
 * has no viewport, so any JS width check renders one set of columns during SSR and a
 * different set on hydration — a visible column swap on every first paint.
 */
export type ColumnPriority = "primary" | "secondary" | "tertiary";

export type ColumnDef<T> = {
  /** Stable id. Also the value handed back to `sort.onChange`. */
  id: string;
  /** Visible column label, and the accessible name of its sort button. */
  header: string;
  cell: (row: T) => ReactNode;
  /** `tertiary` is hidden below lg, `secondary` below md, `primary` is always shown. */
  priority: ColumnPriority;
  /** Right-align. No `tabular-nums` is added: `table` already sets it globally. */
  numeric?: boolean;
  /** Identity column only. Pins the cell while a scrollable table moves sideways. */
  sticky?: boolean;
  /** CSS width for the column, e.g. `"12rem"`. */
  width?: string;
};

export type DataTableShellProps<T> = {
  columns: ColumnDef<T>[];
  rows: T[];
  /** Stable identity per row. Also seeds the accessible names of the per-row controls. */
  rowKey: (row: T) => string;
  /** Makes the identity cell a real link. See the anchor note in the body. */
  rowHref?: (row: T) => string;
  /** `DropdownMenuItem`s for the row's overflow menu, not raw buttons. */
  rowActions?: (row: T) => ReactNode;
  /** Omit entirely when no bulk action exists — see the guard note in the body. */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
  /** The row currently open in a detail panel. Marks the row; does not scroll to it. */
  selectedRowKey?: string;
  expandable?: { renderDetails: (row: T) => ReactNode };
  /** Visually hidden `caption` naming the table for screen readers. */
  caption?: string;
  /** When given, every column header becomes a sort button. */
  sort?: { columnId: string; direction: "asc" | "desc"; onChange: (columnId: string) => void };
  /** Finance-heavy detail tables ONLY. Everywhere else, prune columns by priority. */
  allowHorizontalScroll?: boolean;
  className?: string;
};

/**
 * Exported because `LoadingSkeleton` has to reserve exactly the columns this table will
 * end up showing at every breakpoint. A second copy of these classes in the skeleton
 * would drift the first time a priority changes, and the symptom would be a column
 * appearing or vanishing on load — the layout shift the skeleton exists to prevent.
 */
export const COLUMN_PRIORITY_CLASS: Record<ColumnPriority, string> = {
  primary: "",
  secondary: "hidden md:table-cell",
  tertiary: "hidden lg:table-cell",
};

/**
 * The row overflow menu, shared by the table and the card list so both surfaces offer the
 * same actions. Radix's `DropdownMenuTrigger` is already a real button with roving focus
 * and Escape handling, which is why row actions are one menu rather than a strip of icon
 * buttons that would each need their own accessible name inside every row.
 */
export function RowActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataTableShell<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowActions,
  selection,
  selectedRowKey,
  expandable,
  caption,
  sort,
  allowHorizontalScroll = false,
  className,
}: DataTableShellProps<T>) {
  const instanceId = useId();
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set<string>());

  /**
   * The anchor lives in one cell, not on the row. A click handler on a `tr` is unreachable
   * by keyboard, and the usual patch — `tabIndex` plus an Enter handler — announces the
   * whole row as one control and swallows the checkbox and overflow menu inside it. A real
   * anchor in the identity cell is focusable, activates on Enter, middle-clicks and copies
   * as a link, none of which needs any code.
   */
  const identityColumnId = (columns.find((column) => column.sticky) ?? columns[0])?.id;

  const rowKeys = rows.map(rowKey);
  const selectedOnPage = selection ? rowKeys.filter((key) => selection.selected.has(key)) : [];
  const headerChecked =
    selectedOnPage.length === 0
      ? false
      : selectedOnPage.length === rowKeys.length
        ? true
        : "indeterminate";

  const toggleRow = (key: string, checked: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) next.add(key);
    else next.delete(key);
    selection.onChange(next);
  };

  const toggleAllRows = (checked: boolean) => {
    if (!selection) return;
    // Only the visible rows move, so a selection made on another page survives paging.
    const next = new Set(selection.selected);
    for (const key of rowKeys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    selection.onChange(next);
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const totalColumnCount =
    columns.length + (selection ? 1 : 0) + (expandable ? 1 : 0) + (rowActions ? 1 : 0);

  // Sticky only means anything while the table can move sideways, and an opaque pinned
  // cell would otherwise sit dead through the row hover. So it is tied to the scroll flag.
  const stickyClass = allowHorizontalScroll ? "sticky left-0 z-10 bg-background" : "";

  const table = (
    <table className={cn("w-full border-collapse text-left text-sm", className)}>
      {caption && <caption className="sr-only">{caption}</caption>}

      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {/* Selection is rendered only when asked for: a checkbox with no bulk action
              behind it is a control that promises something the page cannot do. */}
          {selection && (
            <TableHead scope="col" className="w-10 px-3">
              <Checkbox
                checked={headerChecked}
                onCheckedChange={(next) => toggleAllRows(next === true)}
                aria-label="Select all rows"
              />
            </TableHead>
          )}

          {expandable && (
            <TableHead scope="col" className="w-10 px-3">
              <span className="sr-only">Details</span>
            </TableHead>
          )}

          {columns.map((column) => {
            const isSorted = sort?.columnId === column.id;
            const SortIcon = !sort
              ? null
              : !isSorted
                ? ChevronsUpDown
                : sort.direction === "asc"
                  ? ArrowUp
                  : ArrowDown;

            return (
              <TableHead
                key={column.id}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                aria-sort={
                  sort
                    ? isSorted
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined
                }
                className={cn(
                  "px-3 py-2.5 text-xs",
                  COLUMN_PRIORITY_CLASS[column.priority],
                  column.numeric && "text-right",
                  column.sticky && stickyClass,
                )}
              >
                {sort && SortIcon ? (
                  <button
                    type="button"
                    onClick={() => sort.onChange(column.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      column.numeric && "flex-row-reverse",
                    )}
                  >
                    {column.header}
                    <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            );
          })}

          {rowActions && (
            <TableHead scope="col" className="w-12 px-3">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => {
          const key = rowKey(row);
          const isExpanded = expandedKeys.has(key);
          const detailsId = `${instanceId}-${key}-details`;

          return (
            <Fragment key={key}>
              <TableRow data-state={selectedRowKey === key ? "selected" : undefined}>
                {selection && (
                  <TableCell className="px-3 py-2.5">
                    <Checkbox
                      checked={selection.selected.has(key)}
                      onCheckedChange={(next) => toggleRow(key, next === true)}
                      aria-label={`Select row ${key}`}
                    />
                  </TableCell>
                )}

                {expandable && (
                  <TableCell className="px-3 py-2.5">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => toggleExpanded(key)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")}
                        aria-hidden="true"
                      />
                      {/* A rotated chevron is the only visual cue, so state is also spelt out. */}
                      <span className="sr-only">
                        {isExpanded ? `Hide details for ${key}` : `Show details for ${key}`}
                      </span>
                    </button>
                  </TableCell>
                )}

                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      "px-3 py-2.5",
                      COLUMN_PRIORITY_CLASS[column.priority],
                      column.numeric && "text-right",
                      column.sticky && stickyClass,
                    )}
                  >
                    {rowHref && column.id === identityColumnId ? (
                      <Link
                        to={rowHref(row)}
                        aria-current={selectedRowKey === key ? "true" : undefined}
                        className="rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}

                {rowActions && (
                  <TableCell className="px-3 py-2.5 text-right">
                    <RowActionsMenu label={`Actions for row ${key}`}>
                      {rowActions(row)}
                    </RowActionsMenu>
                  </TableCell>
                )}
              </TableRow>

              {expandable && isExpanded && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    id={detailsId}
                    colSpan={totalColumnCount}
                    className="bg-muted/30 px-3 py-3"
                  >
                    {expandable.renderDetails(row)}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </table>
  );

  // An empty `rows` renders header-only on purpose: which empty state belongs here
  // (nothing yet, versus nothing matching the filter) is a caller decision.
  if (!allowHorizontalScroll) {
    return table;
  }

  return <div className="w-full overflow-x-auto">{table}</div>;
}

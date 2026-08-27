import { useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { DataTableShell, RowActionsMenu, type DataTableShellProps } from "./data-table-shell";

/**
 * A record list that is a table on wide viewports and a card list on narrow ones.
 *
 * Both surfaces are always in the DOM and one is hidden with a Tailwind responsive class.
 * That is the point: a `window.innerWidth` check has no answer during SSR, so the server
 * would emit one shape and hydration would replace it with the other — a full re-render of
 * the page's main content on first paint, and a hydration mismatch warning with it.
 * The cost is that both shapes render, so `renderCard` must stay cheap.
 *
 * The card gets the same `rowHref`, `rowActions` and `selection` as the table, because a
 * phone that cannot open a record or run its actions is not a responsive layout, it is a
 * read-only downgrade. Expansion state is per-surface rather than lifted, since only one
 * surface is ever visible; selection is genuinely shared because the caller owns it.
 */
export type ResponsiveRecordListProps<T> = DataTableShellProps<T> & {
  /** The narrow-viewport body for one row. Rendered inside the row's link when there is one. */
  renderCard: (row: T) => ReactNode;
  /** The width at which the table takes over from the cards. */
  breakpoint?: "md" | "lg";
};

export function ResponsiveRecordList<T>({
  renderCard,
  breakpoint = "md",
  className,
  ...shell
}: ResponsiveRecordListProps<T>) {
  const { rows, rowKey, rowHref, rowActions, selection, selectedRowKey, expandable, caption } =
    shell;

  const instanceId = useId();
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set<string>());

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const toggleRow = (key: string, checked: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) next.add(key);
    else next.delete(key);
    selection.onChange(next);
  };

  const tableClass = breakpoint === "lg" ? "hidden lg:block" : "hidden md:block";
  const cardsClass = breakpoint === "lg" ? "lg:hidden" : "md:hidden";

  return (
    <div className={className}>
      <div className={tableClass}>
        <DataTableShell {...shell} />
      </div>

      <ul className={cn("space-y-3", cardsClass)} aria-label={caption}>
        {rows.map((row) => {
          const key = rowKey(row);
          const isExpanded = expandedKeys.has(key);
          const detailsId = `${instanceId}-${key}-card-details`;
          const isCurrent = selectedRowKey === key;

          return (
            <li
              key={key}
              className={cn(
                "rounded-lg border border-border bg-card",
                isCurrent && "border-primary",
              )}
            >
              <div className="flex items-start gap-3 p-4">
                {selection && (
                  <Checkbox
                    checked={selection.selected.has(key)}
                    onCheckedChange={(next) => toggleRow(key, next === true)}
                    aria-label={`Select row ${key}`}
                    className="mt-0.5"
                  />
                )}

                {/* The link wraps the card body, not the whole card: the checkbox and the
                    overflow menu are siblings, so neither ends up nested in an anchor. */}
                <div className="min-w-0 flex-1 text-sm">
                  {rowHref ? (
                    <Link
                      to={rowHref(row)}
                      aria-current={isCurrent ? "true" : undefined}
                      className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {renderCard(row)}
                    </Link>
                  ) : (
                    renderCard(row)
                  )}
                </div>

                {rowActions && (
                  <RowActionsMenu label={`Actions for row ${key}`}>
                    {rowActions(row)}
                  </RowActionsMenu>
                )}
              </div>

              {expandable && (
                <div className="border-t border-border px-4 py-2">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onClick={() => toggleExpanded(key)}
                    className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")}
                      aria-hidden="true"
                    />
                    {/* The row key is an opaque id: it belongs in the accessible name, which
                        has to distinguish one card's toggle from the next, but not on screen.
                        Split this way the button reads "Show details" and announces "Show
                        details for a-1" — the same name the table's toggle carries, so both
                        surfaces sound identical to a screen reader. */}
                    {isExpanded ? "Hide details" : "Show details"}
                    <span className="sr-only"> for {key}</span>
                  </button>
                  {isExpanded && (
                    <div id={detailsId} className="pt-2 text-sm">
                      {expandable.renderDetails(row)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The one filter row for every list workspace.
 *
 * It is **fully controlled**. Values live in the route's URL search params so a filtered
 * view can be shared, reloaded and navigated back to; the route owns that binding and this
 * component owns none of it. Holding filter state in here would make the URL a lie the
 * moment a user pressed back.
 *
 * The only state it does own is whether the mobile filter sheet is open, which is
 * transient UI and has no business in a URL.
 */
export type FilterOption = {
  /**
   * Must be a non-empty string — Radix Select rejects `""` because it reserves that value
   * for "nothing selected". Spell the neutral choice explicitly, e.g. `"all"`.
   */
  value: string;
  label: string;
};

export type FilterControl = {
  id: string;
  /** The control's accessible name, e.g. "Status". Also the trigger's placeholder. */
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

export type FilterToolbarProps = {
  search?: {
    value: string;
    onChange: (value: string) => void;
    /** Say what is searched, e.g. "Search quotes or clients". */
    placeholder?: string;
  };
  filters: FilterControl[];
  sort?: {
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
    /** Defaults to "Sort". */
    label?: string;
  };
  /** Resets every filter, the search box and the sort. The route performs the reset. */
  onClear: () => void;
  /** Number of rows after filtering. Announced politely when it changes. */
  resultCount?: number;
  className?: string;
};

/**
 * Above this many filters the row stops fitting a 375px viewport, so below `md` the
 * filters move into a sheet. At or below it they stay inline and wrap, because a sheet
 * that hides two dropdowns costs a tap and buys nothing.
 */
const COLLAPSE_ABOVE = 2;

function FilterSelect({ filter, className }: { filter: FilterControl; className?: string }) {
  return (
    <Select value={filter.value} onValueChange={filter.onChange}>
      {/* aria-label rather than a <label for>: the collapsing layout renders this control
          twice (inline row plus sheet), and duplicate ids would break both associations. */}
      <SelectTrigger aria-label={filter.label} className={cn("w-auto min-w-36", className)}>
        <SelectValue placeholder={filter.label} />
      </SelectTrigger>
      <SelectContent>
        {filter.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterToolbar({
  search,
  filters,
  sort,
  onClear,
  resultCount,
  className,
}: FilterToolbarProps) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const sheetDescriptionId = useId();
  const collapsesOnMobile = filters.length > COLLAPSE_ABOVE;

  const filterControls = filters.map((filter) => <FilterSelect key={filter.id} filter={filter} />);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {search && (
        <Input
          type="search"
          aria-label="Search"
          value={search.value}
          placeholder={search.placeholder ?? "Search"}
          onChange={(event) => search.onChange(event.target.value)}
          className="w-full sm:w-64"
        />
      )}

      {collapsesOnMobile ? (
        <>
          <div className="hidden flex-wrap items-center gap-2 md:flex">{filterControls}</div>
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="md:hidden">
                <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              aria-describedby={sheetDescriptionId}
              className="max-h-[85vh] overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription id={sheetDescriptionId}>
                  Changes apply to the list immediately.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {filters.map((filter) => (
                  <div key={filter.id} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{filter.label}</p>
                    <FilterSelect filter={filter} className="w-full" />
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        filterControls
      )}

      {sort && (
        <Select value={sort.value} onValueChange={sort.onChange}>
          <SelectTrigger aria-label={sort.label ?? "Sort"} className="w-auto min-w-36">
            <SelectValue placeholder={sort.label ?? "Sort"} />
          </SelectTrigger>
          <SelectContent>
            {sort.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Always rendered. This component cannot know which option a caller means by "no
          filter", so it does not guess at an active count and hide the control — a clear
          on an already-clear toolbar is a harmless no-op, a control that appears and
          disappears under the cursor is not. */}
      <Button type="button" variant="ghost" onClick={onClear}>
        Clear
      </Button>

      {resultCount !== undefined && (
        // role="status" so the count is announced when a filter changes; without it the
        // only feedback for "your filter matched nothing" is silence.
        <p role="status" className="ml-auto text-xs tabular-nums text-muted-foreground">
          {formatCount(resultCount)} {resultCount === 1 ? "result" : "results"}
        </p>
      )}
    </div>
  );
}

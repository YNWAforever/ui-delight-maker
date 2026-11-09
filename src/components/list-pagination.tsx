import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { clampPageNumber, totalPageCount } from "@/lib/pagination";

export interface ListPaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function ListPagination({ page, limit, total, onPageChange }: ListPaginationProps) {
  const totalPages = totalPageCount(total, limit);
  // `?page=99` passes the route schemas (`min(1)` only) and the server never clamps it, so the
  // old range arithmetic rendered a backwards line — "4,901–120 of 120" — and Next was disabled
  // against a page that could not be reached. Both the range and the controls use this value.
  const safePage = clampPageNumber(page, total, limit);
  const start = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const end = total === 0 ? 0 : Math.min(safePage * limit, total);

  // A page past the end is a dead end: the server keeps returning an empty page and only the URL
  // can move the user, while Next is disabled by the same out-of-range page. Rewrite the search
  // param once through the caller's existing navigation handler. The ref latches on the
  // out-of-range value so a parent re-render with a fresh inline `onPageChange` callback — the
  // normal pattern at the call sites — cannot fire a second navigation while data is in flight.
  const redirectedPage = useRef<number | null>(null);
  useEffect(() => {
    if (total > 0 && page > totalPages) {
      if (redirectedPage.current === page) return;
      redirectedPage.current = page;
      onPageChange(totalPages);
      return;
    }
    redirectedPage.current = null;
  }, [total, page, totalPages, onPageChange]);

  return (
    <nav aria-label="List pagination" className="flex items-center justify-end gap-2 py-1">
      <p
        aria-live="polite"
        className="min-w-28 text-right text-xs tabular-nums text-muted-foreground"
      >
        {/* Grouped like every other count on the page: "5,036", not "5036" (UX-35). */}
        {formatCount(start)}–{formatCount(end)} of {formatCount(total)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Previous page"
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Next page"
        disabled={safePage >= totalPages}
        onClick={() => onPageChange(safePage + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

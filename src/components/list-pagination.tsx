import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ListPaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function ListPagination({ page, limit, total, onPageChange }: ListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <nav aria-label="List pagination" className="flex items-center justify-end gap-2 py-1">
      <p
        aria-live="polite"
        className="min-w-28 text-right text-xs tabular-nums text-muted-foreground"
      >
        {start}-{end} of {total}
      </p>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

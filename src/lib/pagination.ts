/**
 * Page arithmetic shared by the paginated reads and the list pagination control.
 *
 * Route search schemas validate `page` with `min(1)` only and the reads never clamp it, so an
 * out-of-range page (`?page=99` after rows were deleted, or a shared bookmark) reaches the
 * component. Both the displayed range and the Previous/Next controls derive from the clamped
 * value, and `ListPagination` rewrites the search param to the last real page.
 */
export function totalPageCount(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

export function clampPageNumber(page: number, total: number, limit: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), totalPageCount(total, limit));
}

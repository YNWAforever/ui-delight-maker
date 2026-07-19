export type PaginationInput = {
  page?: number;
  limit?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

export function normalizePagination(input: PaginationInput = {}) {
  const page = normalizePositiveInteger(input.page, DEFAULT_PAGE);
  const requestedLimit = normalizePositiveInteger(input.limit, DEFAULT_PAGE_LIMIT);
  const limit = Math.min(requestedLimit, MAX_PAGE_LIMIT);

  return { page, limit, offset: (page - 1) * limit };
}

export function parseCount(row: { total: number | string } | null) {
  return Number(row?.total ?? 0);
}

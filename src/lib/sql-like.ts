/**
 * Escape user text for a parameterised `LIKE`/`ILIKE` pattern.
 *
 * Values stay bound parameters, so this is not an injection guard. What it prevents is the
 * search box being read as a pattern language: an unescaped `%` matches every row, so typing
 * one character turns a filtered workspace list into a workspace-wide total, and `_` silently
 * matches any single character. The backslash is the escape character because every call site
 * uses a plain `ilike $n`/`like $n` with the default escape; callers add their own surrounding
 * `%` wildcards around the returned fragment.
 *
 * Trimmed and capped: a search term is user input, and the repository predicates are not the
 * place to decide how long one may be. The cap keeps an overlong paste from becoming a
 * pathological pattern while matching what the quote-list search already did.
 */
export const MAX_LIKE_PATTERN_LENGTH = 100;

export function escapeLikePattern(
  value: string,
  maxLength: number = MAX_LIKE_PATTERN_LENGTH,
): string {
  return value
    .trim()
    .slice(0, Math.max(0, Math.trunc(maxLength)))
    .replace(/[\\%_]/g, (char) => `\\${char}`);
}

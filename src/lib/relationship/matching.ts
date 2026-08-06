export type AccountMatchCandidate = {
  id: string;
  name: string;
  domain?: string | null;
};

export type AccountMatchInput = {
  companyName: string;
  domain?: string | null;
  accounts: AccountMatchCandidate[];
};

export type AccountMatchResult =
  | { kind: "matched"; accountId: string; matchedBy: "name" | "domain" }
  | { kind: "ambiguous"; accountIds: string[] }
  | { kind: "new" };

const COMPANY_SUFFIX_PATTERN =
  /\b(limited|ltd|ltd\.|inc|inc\.|company|co|co\.|corp|corporation)\b/gi;

export function normalizeAccountName(name: string): string {
  return name
    .trim()
    .replace(/[()]/g, " ")
    .replace(COMPANY_SUFFIX_PATTERN, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeContactEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeDomain(domain?: string | null): string | null {
  const normalized = domain
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  return normalized && normalized.length > 0 ? normalized.split("/")[0] : null;
}

/**
 * The ASCII alphanumerics of a name, lowercased, with everything else dropped.
 *
 * The account-candidate prefilter compares against this in SQL, so the two have to agree for
 * every input, not merely for ASCII ones. Non-alphanumerics are dropped *before* lowercasing —
 * matching the order `normalizeAccountName` uses — so no character can lowercase into an ASCII
 * letter on one side and be stripped on the other. (`'İ'.toLowerCase()` yields an `i` in
 * JavaScript; whether Postgres `lower()` does the same depends on the database collation.
 * Stripping first removes the question.)
 *
 * SQL equivalent: `lower(regexp_replace(name, '[^A-Za-z0-9]+', '', 'g'))`.
 */
export function squashAccountName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
}

/**
 * The longest token of a normalized company name, used to prefilter account candidates in SQL
 * without moving the matcher itself into SQL.
 *
 * The prefilter is sound because `normalizeAccountName` only ever *deletes* — punctuation
 * becomes whitespace and a fixed set of suffix words is removed, and both are bounded by
 * non-word characters. So every token of a normalized name survives as a contiguous substring
 * of `squashAccountName(rawName)`. If two names normalize equal, each one's tokens therefore
 * appear in the other's squashed raw form, and filtering accounts to those containing this
 * token cannot drop a name that would have matched. The exact comparison still happens in
 * {@link findAccountMatch} over the narrowed set, so ambiguity detection is unaffected.
 *
 * Returns null for a name that normalizes to nothing — such a name matches nothing anyway.
 */
export function accountNamePrefilterToken(companyName: string): string | null {
  const tokens = normalizeAccountName(companyName).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  return tokens.reduce((longest, token) => (token.length > longest.length ? token : longest));
}

export function findAccountMatch(input: AccountMatchInput): AccountMatchResult {
  const targetName = normalizeAccountName(input.companyName);
  const nameMatches = input.accounts.filter(
    (account) => normalizeAccountName(account.name) === targetName,
  );

  if (nameMatches.length === 1) {
    return { kind: "matched", accountId: nameMatches[0].id, matchedBy: "name" };
  }

  if (nameMatches.length > 1) {
    return { kind: "ambiguous", accountIds: nameMatches.map((account) => account.id) };
  }

  const targetDomain = normalizeDomain(input.domain);
  if (targetDomain) {
    const domainMatches = input.accounts.filter(
      (account) => normalizeDomain(account.domain) === targetDomain,
    );

    if (domainMatches.length === 1) {
      return { kind: "matched", accountId: domainMatches[0].id, matchedBy: "domain" };
    }

    if (domainMatches.length > 1) {
      return { kind: "ambiguous", accountIds: domainMatches.map((account) => account.id) };
    }
  }

  return { kind: "new" };
}

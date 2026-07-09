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

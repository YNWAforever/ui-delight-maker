import { describe, expect, it } from "vitest";
import {
  accountNamePrefilterToken,
  findAccountMatch,
  normalizeAccountName,
  squashAccountName,
} from "@/lib/relationship/matching";

/**
 * The event import narrows its account read with a SQL prefilter instead of loading every
 * account in the tenant. That is only safe if the prefilter is a *superset* of the exact
 * matcher: it may return accounts that turn out not to match, but it must never omit one that
 * would have.
 *
 * These tests pin that property, because the cost of getting it wrong is silent — a dropped
 * candidate does not error, it just creates a duplicate account, or turns a genuinely ambiguous
 * name into a confident single match.
 */

/** The predicate the SQL applies: squashed account name contains the token. */
const prefilterAccepts = (accountName: string, token: string) =>
  squashAccountName(accountName).includes(token);

const COMPANY_NAMES = [
  "Apex CRM",
  "Apex CRM Limited",
  "Apex C.R.M. Ltd.",
  "  apex crm  ",
  "APEX (CRM) Co.",
  "Apex-CRM Corporation",
  "Acme Industrial Holdings",
  "ACME INDUSTRIAL HOLDINGS INC",
  "Acme Industrial Holdings, Inc.",
  "Ltd Acme Industrial Holdings",
  "The Kowloon Trading Company",
  "Kowloon Trading",
  "Sun Hung Kai Properties Ltd",
  "sun hung kai properties",
  "Zed",
  "Zed Corp.",
  "北京科技 Beijing Tech",
  "Beijing Tech Co",
  "A&B Partners",
  "A and B Partners",
  "3M Hong Kong",
  "3M HK Ltd",
  "Foo_Bar Systems",
  "foo bar systems",
];

describe("account name prefilter", () => {
  it("keeps every token of a normalized name inside the squashed raw name", () => {
    // This is the invariant the whole prefilter rests on: normalization only deletes, and every
    // deletion is bounded by a non-word character, so no token can straddle a removal.
    for (const name of COMPANY_NAMES) {
      const squashed = squashAccountName(name);
      for (const token of normalizeAccountName(name).split(" ").filter(Boolean)) {
        expect(squashed, `"${token}" from "${name}" must survive in "${squashed}"`).toContain(
          token,
        );
      }
    }
  });

  it("never omits an account that the exact matcher would have matched", () => {
    for (const imported of COMPANY_NAMES) {
      const token = accountNamePrefilterToken(imported);

      for (const [index, stored] of COMPANY_NAMES.entries()) {
        const exactlyMatches =
          normalizeAccountName(stored) === normalizeAccountName(imported) &&
          normalizeAccountName(imported) !== "";
        if (!exactlyMatches) continue;

        expect(token, `"${imported}" normalizes to something but yields no token`).not.toBeNull();
        expect(
          prefilterAccepts(stored, token!),
          `prefilter for "${imported}" dropped account ${index} ("${stored}")`,
        ).toBe(true);
      }
    }
  });

  it("preserves ambiguity, which depends on the whole candidate set surviving", () => {
    // Two stored accounts normalize to the same thing. If the prefilter dropped either one the
    // import would silently pick a single account instead of asking for manual review.
    const accounts = [
      { id: "account-1", name: "Apex CRM Limited" },
      { id: "account-2", name: "Apex (CRM) Co." },
      { id: "account-3", name: "Unrelated Holdings" },
    ];
    const token = accountNamePrefilterToken("Apex CRM")!;
    const surviving = accounts.filter((account) => prefilterAccepts(account.name, token));

    expect(surviving).toHaveLength(2);
    expect(findAccountMatch({ companyName: "Apex CRM", accounts: surviving })).toEqual({
      kind: "ambiguous",
      accountIds: ["account-1", "account-2"],
    });
  });

  it("narrows in the common case rather than returning everything", () => {
    // A superset that is always the whole table would be sound and useless.
    const token = accountNamePrefilterToken("Sun Hung Kai Properties Ltd")!;
    const surviving = COMPANY_NAMES.filter((name) => prefilterAccepts(name, token));

    expect(surviving.length).toBeLessThan(COMPANY_NAMES.length / 4);
    expect(surviving).toContain("sun hung kai properties");
  });

  it("returns no token for a name that normalizes to nothing", () => {
    // Such a row matches no account under the exact matcher either, so contributing no token —
    // and therefore no candidates — is correct rather than a lost match.
    for (const empty of ["", "   ", "Ltd", "Co.", "(((", "Inc"]) {
      expect(normalizeAccountName(empty)).toBe("");
      expect(accountNamePrefilterToken(empty)).toBeNull();
    }
  });

  it("picks the longest token, which is the most selective one available", () => {
    expect(accountNamePrefilterToken("The Kowloon Trading Company")).toBe("kowloon");
    expect(accountNamePrefilterToken("3M HK Ltd")).toBe("3m");
  });
});

describe("squashAccountName", () => {
  it("matches the SQL expression the prefilter uses", () => {
    // SQL side: lower(regexp_replace(name, '[^A-Za-z0-9]+', '', 'g'))
    expect(squashAccountName("Apex C.R.M. Ltd.")).toBe("apexcrmltd");
    expect(squashAccountName("A&B Partners")).toBe("abpartners");
    expect(squashAccountName("Foo_Bar Systems")).toBe("foobarsystems");
    expect(squashAccountName("北京科技 Beijing Tech")).toBe("beijingtech");
    // Stripped before lowercasing, so a character whose lowercase form is ASCII cannot leak in
    // on the JavaScript side and be absent on the SQL side.
    expect(squashAccountName("İstanbul Ltd")).toBe("stanbulltd");
  });
});

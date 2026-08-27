import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Archive was a control for a concept the schema does not have.
 *
 * `neon/migrations/005_quote_lifecycle.sql` constrains `quotes.status` to nine values and
 * none of them is `archived`; there is no `archived_at` column and no soft delete. The row
 * menu used to offer Archive, splice the row out of a local `rows` array and toast
 * "Quote archived" — so the user watched a destructive action succeed and then watched the
 * next loader run put the row back.
 *
 * The route render test next door proves the menu item is gone today. This one guards the
 * shape that made the lie possible: a second, client-owned copy of the row set that any
 * handler can edit behind the loader's back. A source assertion is the honest tool for
 * "this pattern must not come back anywhere in the file" — the same reason
 * `-root-shell-cache-security.test.ts` reads `__root.tsx` off disk.
 */
const quotesSource = readFileSync(new URL("../quotes.tsx", import.meta.url), "utf8");

/** The file's doc comments explain at length why Archive went, so only code is searched. */
const executableSource = quotesSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("/quotes has no archive, and no local copy of the row set to fake one with", () => {
  it("mentions archiving nowhere in its code", () => {
    expect(executableSource).not.toMatch(/archiv/i);
  });

  it("holds the visible rows in no state of its own", () => {
    // Any local mirror of the loader's rows is a second source of truth, and the next
    // loader run contradicts it.
    expect(executableSource).not.toMatch(/useState<\s*Quote\[\]\s*>/);
    expect(executableSource).not.toMatch(/\bsetRows\b|\bsetQuotes\b/);
  });

  it("keeps every row-removing filter off the rendered list", () => {
    // `rows.filter((quote) => quote.id !== id)` is the exact expression Archive used.
    expect(executableSource).not.toMatch(/\.filter\([\s\S]{0,80}?\.id\s*!==/);
  });
});

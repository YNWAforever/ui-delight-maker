import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Editing authorization code is exactly when a capability check goes missing, and a
 * missing check is invisible in review — the page simply works for someone it should
 * not. This counts the enforcement surface so a removal has to be deliberate.
 *
 * If a change legitimately adds or removes a check, update the number in the same commit
 * and say why in the message.
 *
 * This number was verified against `git merge-base main HEAD` (5c8590a) rather than
 * assumed: the top-level `src/server-functions/*.ts` count is 214 on both sides of this
 * branch, file by file, with zero net change. The one call-shape refactor on the branch —
 * `quote-workspace.ts`'s `authorizeLinkedQuoteParties` (one `requireCapabilityChecks` call)
 * becoming `resolveLinkedQuoteVisibility` (one `requireCapability` call plus one
 * `evaluateCapabilityChecks` call, which this regex does not match) — nets to zero matches
 * within that file (3 -> 3: the import line still names both `requireCapability` and
 * `requireCapabilityChecks`, and one call site swaps for another). No enforcement was
 * added or removed.
 */
const EXPECTED_REQUIRE_CAPABILITY_CALLS = 214;

describe("authorization surface", () => {
  it("still enforces the same number of capability checks", () => {
    const dir = resolve(process.cwd(), "src/server-functions");
    let count = 0;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const source = readFileSync(resolve(dir, entry.name), "utf8");
      count += source.match(/requireCapability/g)?.length ?? 0;
    }

    expect(count).toBe(EXPECTED_REQUIRE_CAPABILITY_CALLS);
  });
});

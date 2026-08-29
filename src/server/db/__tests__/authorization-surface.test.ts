import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Editing authorization code is exactly when a capability check goes missing, and a
 * missing check is invisible in review - the page simply works for someone it should
 * not. This counts the enforcement surface so a removal has to be deliberate.
 *
 * If a change legitimately adds or removes a check, update the number in the same commit
 * and say why in the message.
 *
 * 214 -> 223 on 2026-08-29, after nine PRs merged to main. Verified before changing:
 * every removal in the diff had a replacement, and no enforcement was dropped.
 *   +3  lead-import.ts  new file - leads.view on validate, leads.create on commit
 *   +2  approvals.ts    assignApprovalFn, gated approvals.decide
 *   +1  leads.ts        getLeadTimelineSummary, gated leads.view
 *   +3  quotes.ts       a widened import line and two comments, not new enforcement
 *
 * The six removals were all replacements: three are mocks in __tests__ (which this scan
 * does not read - it takes top-level files only), `requireCapabilityChecks(checks)` became
 * `requireCapability` plus `evaluateCapabilityChecks`, the import line widened rather than
 * shrank, and `requireCapability("quotes.view")` became `requireCapabilitySet(["quotes.view"],
 * ...)`, which still throws when that capability is absent.
 *
 * Note what this counts. The regex matches the bare string, so an import line naming two
 * helpers counts twice and a comment mentioning requireCapability counts once - three of
 * the nine above are not enforcement at all. That makes the guard noisy in one direction
 * only: it can go red for a documentary change, but it cannot go quiet when a real check
 * disappears. For this particular job, loud and sometimes wrong beats silent and sometimes
 * wrong.
 *
 * 223 -> 225 on 2026-08-29, for BD-3 slice 2 (the agent policy store). Established before
 * changing, not after: git diff main -- src/server-functions/ ':(exclude)*__tests__*'
 * filtered to requireCapability lines shows two + lines and no - lines at all, so nothing
 * that already enforced was moved, renamed or weakened.
 *   +2  agent-policy.ts  new file - the import line, and requireCapability("agents.configure")
 *                        in setAgentPolicyFn
 *
 * That single check is the entire write gate on the policy store. agents.configure is a new
 * capability held by super_admin and admin only; agents.run, which three roles hold, is
 * deliberately not sufficient, because pausing an agent stops it for every user.
 */
const EXPECTED_REQUIRE_CAPABILITY_CALLS = 225;

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

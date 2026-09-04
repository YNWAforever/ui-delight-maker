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
 *
 * 225 -> 227 on 2026-08-29, for BD-3 slice 3 PR A (routes reading the effective catalogue
 * instead of the stale AGENT_DEFINITIONS value). Established before changing: git diff main
 * -- src/server-functions/ ':(exclude)*__tests__*' filtered to requireCapability lines shows
 * two + lines and no - lines at all, so nothing that already enforced was moved, renamed or
 * weakened.
 *   +2  agents-catalogue.ts  new file - the import line, and requireCapability("agents.view")
 *                            in getEffectiveAgentCatalogue
 *
 * Gated on agents.view rather than agents.configure: this is the read every page showing an
 * agent needs (agents, agents/$name, settings), and a paused agent is something anyone who
 * can see the agent should see - not just whoever can pause it.
 *
 * 227 -> 228 on 2026-09-03, for the agent run input redaction. Established before changing:
 * the count over src/server-functions/*.ts is 228, and the only source change is one added
 * import name — nothing that already enforced was removed or weakened.
 *   +1  agent-runs.ts  requireCapabilitySet added to the existing authorization.server import
 *    0  agent-runs.ts  getAgentHistoryPage's requireCapability("agents.view") became
 *                      requireCapabilitySet(["agents.view"], { optional: ... }) — count
 *                      neutral, because this regex matches the substring
 *
 * agents.view is still required and still throws on denial. The optional capabilities are not
 * a second gate: they are read as booleans so the history page can redact each run's content
 * against its own subject, rather than shipping every run's input and summary to anyone who
 * can see the agent.
 *
 * Note for whoever edits that handler's comment next: it deliberately avoids writing the
 * tracked identifier in prose. An earlier draft said "exactly as `requireCapability` did",
 * which this counter matched as a 229th occurrence — a documentary false positive. Keep
 * prose in that directory clear of the literal string, or this number drifts for a reason
 * that has nothing to do with enforcement.
 *
 * 228 -> 226 on 2026-09-03, for the directory and ai-review reads' redaction — the second and
 * third of the three reads this branch redacts, the history page above being the first.
 * Established before changing: git diff origin/main -- src/server-functions/
 * ':(exclude)*__tests__*' shows only agent-runs.ts changed, and every requireCapability line in
 * it is either an import name or a one-for-one call substitution — no bare check dropped
 * without a requireCapabilitySet replacement that still throws on denial for that capability.
 *   -1  agent-runs.ts  getAgentDirectoryRead's redaction. Already on this branch (commit
 *                      b01ad41) before this count was re-derived, and the reason the test went
 *                      red: requireCapability dropped from the import once both
 *                      getAgentHistoryPage and getAgentDirectoryRead called
 *                      requireCapabilitySet instead of requireCapability — the import shrank
 *                      from three names to two. getAgentDirectoryRead's own
 *                      requireCapability("agents.view") became requireCapabilitySet(
 *                      ["agents.view"], { optional: AGENT_SUBJECT_VIEW_CAPABILITIES }) — one
 *                      call for one call, count neutral on its own.
 *   -1  agent-runs.ts  getAiReviewRead's redaction (this change). requireCapabilityChecks
 *                      dropped from the import: it had no remaining caller once
 *                      getAiReviewRead's requireCapabilityChecks([{ capability:
 *                      "approvals.view" }, { capability: "agents.view" }]) became
 *                      requireCapabilitySet(["approvals.view", "agents.view"], { optional:
 *                      AGENT_SUBJECT_VIEW_CAPABILITIES }) — again one call for one call, count
 *                      neutral on its own. The now-dead import is the only reason the total
 *                      moved.
 *
 * approvals.view and agents.view are both still required on the ai-review read and both still
 * throw on denial, exactly as the two-check pair they replaced; agents.view is likewise still
 * required on the directory read, exactly as the single check it replaced. Nothing that
 * previously enforced was removed or weakened. The optional capabilities are not a second gate
 * on either read: they are read as booleans so loadAgentDirectoryRead and loadAiReviewRead can
 * redact each run's content against its own subject, the same as the history page already does
 * — not shipping every run's summary and subject to anyone who can see agents (and, on
 * ai-review, approvals).
 *
 * 226, pattern widened, on 2026-09-04, for row-level agent redaction (BD-3 slice 3 PR C). The
 * count itself did not move: it fell from 226 to 222 on this branch, and the four that
 * disappeared were not four checks that stopped enforcing. They were three call sites in
 * agent-runs.ts (getAgentDirectoryRead, getAgentHistoryPage, getAiReviewRead) that swapped
 * requireCapabilitySet(...) for requirePageAuthorization(...), plus that name's own import
 * line — requirePageAuthorization does not contain the substring "requireCapability", so the
 * old regex went blind to all four the moment the swap landed.
 *
 * requirePageAuthorization is an enforcement call, not a different kind of thing: it takes the
 * same required-capabilities list requireCapabilitySet did and throws on a denied required
 * capability exactly as requireCapabilitySet and requireCapability do. What it adds is the row
 * authorizer (RowAuthorizer) that the read model uses afterward to redact per record — that is
 * additional behavior layered on top of the same required-capability enforcement, not a
 * replacement for it. So the scan below now matches both identifiers, the constant stays at
 * 226 to reflect that the surface itself is unchanged, and a future handler that calls
 * requirePageAuthorization instead of requireCapability/requireCapabilitySet will still be
 * counted rather than silently falling outside the guard's view.
 *
 * Verified before changing: grep -c for requirePageAuthorization across src/server-functions/
 * agent-runs.ts (the only top-level file using it) finds 4 occurrences — the import line plus
 * the three call sites named above — and 222 + 4 = 226, the same total this file already
 * expected before the swap.
 *
 * 226 -> 227 on 2026-09-04, for the tasks list gaining row-level redaction. getTasks swapped
 * its single-capability check for the page authorizer, so tasks.ts now imports both helpers
 * where it previously imported one. Established by measurement: the count over
 * src/server-functions/ reads 227.
 *   +1  tasks.ts  the page-authorizer name added to the existing import
 *    0  tasks.ts  getTasks' call site swapped one counted identifier for the other
 *
 * tasks.view is still required and still throws on denial; createTask and updateTask are
 * untouched. What the swap adds is the row authorizer, so a deny override scoped to one task
 * now redacts that row — the list previously ignored what updateTask already enforced.
 *
 * A caution for whoever edits that handler next, because this has now cost four separate
 * people time: the scan matches these identifiers as bare substrings, so naming them in a
 * COMMENT inflates the count. The first draft of getTasks' docblock mentioned them three
 * times and pushed this to 230, which reads as four new enforcement sites that do not exist.
 * That comment now names behaviour rather than functions, and says why.
 */
/*
 * 227 -> 225 on 2026-09-05, for the quotes list gaining row-level redaction — and this one
 * goes DOWN, which needs explaining, because a falling count normally means enforcement was
 * removed. It was not.
 *
 * getQuotesPage swapped its capability-set call for the page authorizer. That swap is
 * count-neutral: both names are matched, and both appear once in the import and once at the
 * call site. The drop of 2 comes from deleting a two-line COMMENT in that handler which named
 * both helpers in prose. Its replacement follows the convention tasks.ts established and names
 * behaviour instead.
 *
 * Which means this constant has been 2 too high since that comment was written. The guard has
 * been counting two phantom enforcement sites, and only removing the prose revealed it. 225 is
 * the number of real calls and imports, verified by measurement over src/server-functions/.
 *
 * Every quotes.view gate that existed still exists — getQuotesPage still requires it and still
 * throws on denial. What the swap adds is the row authorizer, so a deny override scoped to one
 * lead or client now redacts that quote's company name.
 *
 * Sixth time prose has moved this number on this project, and the first where it had been wrong
 * for weeks rather than minutes. If you are about to write either identifier in a comment under
 * src/server-functions/: don't.
 */
const EXPECTED_REQUIRE_CAPABILITY_CALLS = 225;

describe("authorization surface", () => {
  it("still enforces the same number of capability checks", () => {
    const dir = resolve(process.cwd(), "src/server-functions");
    let count = 0;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const source = readFileSync(resolve(dir, entry.name), "utf8");
      // requirePageAuthorization is counted alongside requireCapability: it is the same kind
      // of call (required capabilities, throws on denial) under a different name, introduced
      // when a call site adds row-level redaction on top of the same enforcement. Without this,
      // the guard would be blind to any handler that uses requirePageAuthorization instead of
      // requireCapability/requireCapabilitySet.
      count += source.match(/requireCapability|requirePageAuthorization/g)?.length ?? 0;
    }

    expect(count).toBe(EXPECTED_REQUIRE_CAPABILITY_CALLS);
  });
});

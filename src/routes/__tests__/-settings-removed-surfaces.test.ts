import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SETTINGS_TABS, settingsSearchSchema } from "@/lib/admin-ux-search";

/**
 * Five of the seven Settings tabs were removed because nothing behind them persisted, and
 * the sixth control on the page - the pair of agent switches - was made read-only. This is a
 * source-level guard because that is the only kind that survives: a render test only covers
 * the surface someone remembered to write one for, and every one of these was a plausible,
 * finished-looking card that a future change could reasonably re-add.
 *
 * Comments are stripped first, so the long note at the top of `settings.tsx` describing
 * exactly what was removed - "Invite mocked", `Math.random()`, the fabricated key literals -
 * does not fail the rule it is documenting. String and JSX text are deliberately left
 * intact: a leaked secret literal is a string, and that is precisely what must not come back.
 */

const SETTINGS_SOURCE = fileURLToPath(new URL("../settings.tsx", import.meta.url));

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const source = withoutComments(readFileSync(SETTINGS_SOURCE, "utf8"));

describe("settings has no unpersisted surface left", () => {
  it("reads the real file, so a broken path cannot pass as a clean result", () => {
    expect(source.length).toBeGreaterThan(2000);
    expect(source).toContain('createFileRoute("/settings")');
  });

  it("offers exactly the two tabs that are backed by something", () => {
    expect([...SETTINGS_TABS]).toEqual(["products", "agents"]);
    // Old links do not land on a blank tab strip: the schema catches the removed values and
    // the page falls back to Products.
    for (const obsolete of ["profile", "team", "pricing", "notifications", "apikeys"]) {
      expect(settingsSearchSchema.parse({ tab: obsolete }).tab).toBeUndefined();
    }
  });

  it("never mints or displays an API key in the browser", () => {
    // IF-E1-24/25/26. The two literals below shipped in the client bundle under the heading
    // "Used for webhooks and external integrations", which is a leaked-secret report waiting
    // to be filed against a value that was never a secret at all.
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("sk_live_");
    expect(source).not.toContain("whk_");
    expect(source).not.toMatch(/API key/i);
  });

  it("does not duplicate Admin's people management", () => {
    // FW-3 / IF-E1-17..19. The real writes exist and are already called by /admin/people;
    // a second, ungated copy here would route around the audit record each one requires.
    expect(source).not.toContain("APP_USERS");
    expect(source).not.toContain("@/lib/users");
    expect(source).not.toContain("inviteUsers");
    expect(source).not.toMatch(/Invite\b/);
  });

  it("makes no promise about approval thresholds or pricing rules", () => {
    // IF-E1-20. `pricing_templates` is a service price list, and `requestQuoteApproval` never
    // sees a discount or a total (BD-10), so nothing could enforce a threshold typed here.
    expect(source).not.toContain("pricingRules");
    expect(source).not.toMatch(/threshold/i);
    expect(source).not.toMatch(/approval threshold/i);
  });

  it("carries no toggle for notification channels, because no preference store exists", () => {
    // IF-E1-23. `src/server-functions/notifications.ts` exports only the read and the two
    // mark-read writes; there is no preference table in any migration.
    expect(source).not.toContain("Checkbox");
    expect(source).not.toMatch(/whatsapp/i);
    expect(source).not.toMatch(/Slack/);
  });

  it("shows agent configuration read-only, with BD-3's reason stated on the page", () => {
    // IF-E1-21/22. Two switches per agent wrote React state only, and the badge beside the
    // second one re-rendered from that state - so the page reported a status the dispatch
    // path never saw. Enforcement has since shipped (BD-3 slice 3), so the page now says
    // these are the enforced values rather than claiming enforcement is not yet on.
    expect(source).not.toContain("Switch");
    expect(source).not.toContain("onCheckedChange");
    expect(source).toContain("These are the values the dispatch path enforces today.");
    expect(source).toContain("agents.configure");
  });

  it("never toasts a success for work that did not happen", () => {
    // Every `toast.message("... mocked")` on this page is gone; the survivors are wrapped in
    // try/catch around a real server function.
    expect(source).not.toContain("toast.message");
    expect(source).not.toMatch(/mocked/i);
    expect(source).toContain("toSafeErrorMessage");
  });

  it("keeps the page's read and its invalidation on the same key family", () => {
    // IF-E1-29. `["settings","detail","products"]` could never be reached by an invalidation
    // aimed at `["products","list"]`.
    expect(source).not.toContain("crmQueryKeys.settings");
    expect(source).toContain("crmQueryKeys.products.list({})");
    expect(source).toContain("crmQueryKeys.products.lists()");
  });

  it("catches its own loader failures instead of leaking them to the root boundary", () => {
    expect(source).toContain("errorComponent");
    expect(source).toContain("ErrorState");
  });
});

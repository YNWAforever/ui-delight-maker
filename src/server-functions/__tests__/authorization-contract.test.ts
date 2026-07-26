import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), "src/server-functions");

/**
 * Every server function that reads or writes must be behind a capability check.
 *
 * This previously worked off a hand-maintained list of 21 filenames plus a substring test
 * for `requireCapability(`. Both halves were broken:
 *
 *  - The substring produced FALSE NEGATIVES. "requireCapabilityChecks(" does not contain
 *    "requireCapability(" — the next character is "C", not "(" — and nor do
 *    requireCapabilitySet( or requireAnyCapability(. 13 correctly-guarded handlers looked
 *    unguarded, which is why their files were left out of the list, which is how
 *    company-workspace.ts escaped the contract entirely and shipped with only a session
 *    check on the primary account screen.
 *  - The list meant a new file was unguarded by default, and silently so.
 *
 * Files are now enumerated from disk, so nothing escapes by omission, and all four helpers
 * count. Guards reached through a same-file helper — authorizeQuote(id),
 * setLifecycle(data, "suspend", "users.suspend") — resolve one hop, because a check that
 * cannot see indirection produces false positives instead of false negatives.
 *
 * KNOWN LIMIT. Reading source text cannot resolve indirection in general, only the one hop
 * implemented here. The honest version executes each handler with authorization denied and
 * asserts it rejects before touching the database; that needs valid validator input per
 * handler, so it is real work tracked separately. This catches the file-level escape that
 * actually happened, not every possible one.
 */
const HANDLER =
  /export const ([A-Za-z0-9_]+)\s*=\s*createServerFn[\s\S]*?(?=export const [A-Za-z0-9_]+\s*=\s*createServerFn|$)/g;
const CAPABILITY_HELPER = /require(?:Capability|CapabilityChecks|CapabilitySet|AnyCapability)\(/;
const CALLS = /\b([a-z][A-Za-z0-9_]*)\s*\(/g;

/** Handlers that legitimately run without a capability check, each with its reason. */
const ACKNOWLEDGED_UNGUARDED: Record<string, string> = {
  "auth.ts::getSession": "returns the caller's own session; no session yet to authorize",
  "auth.ts::signIn": "establishes a session",
  "auth.ts::signOut": "ends a session",
  "admin-invitations.ts::getInvitationPreview": "must work for a signed-out invitee",
  "app-shell.ts::getAppShellRead": "fans out to server functions that each guard themselves",
  ...Object.fromEntries(
    [
      "account.ts::getMyAccount",
      "account.ts::updateMyProfile",
      "account.ts::updateMyAvailability",
      "account.ts::revokeMyAppSessions",
      "account.ts::createMyDelegation",
      "account.ts::cancelMyDelegation",
      "account.ts::createMyAccessRequest",
      "account.ts::getMyWorkload",
      "admin-access.ts::createAdminAccessRequestFn",
      "notifications.ts::getNotifications",
      "notifications.ts::markNotificationReadFn",
      "notifications.ts::markAllNotificationsReadFn",
      "workspace-preferences.ts::getWorkspacePreferences",
      "workspace-preferences.ts::savePersonalWorkspaceView",
      "workspace-preferences.ts::togglePersonalWorkspaceFavorite",
    ].map((key) => [key, "self-scoped by session.user.id; no other subject to authorize"]),
  ),
};

/** Retained for the exact-capability assertions below, which look up one handler by name. */
function serverFunctionBlocks(source: string) {
  return Array.from(source.matchAll(HANDLER)).map((match) => ({
    name: match[1],
    source: match[0],
  }));
}

function handlersIn(file: string) {
  const source = readFileSync(resolve(DIR, file), "utf8");
  return { source, blocks: Array.from(source.matchAll(HANDLER)) };
}

/** Guarded directly, or via a same-file helper that guards. */
function isGuarded(body: string, source: string): boolean {
  if (CAPABILITY_HELPER.test(body)) return true;
  for (const [, callee] of body.matchAll(CALLS)) {
    const definition = new RegExp(
      `(?:async\\s+)?function\\s+${callee}\\b[\\s\\S]*?\\n\\}|const\\s+${callee}\\s*=[\\s\\S]*?\\n\\};`,
    ).exec(source);
    if (definition && CAPABILITY_HELPER.test(definition[0])) return true;
  }
  return false;
}

describe("server-function authorization contract", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts") && f !== "serializers.ts");

  it("guards every handler with a capability, or names why it does not", () => {
    const unaccounted: string[] = [];

    for (const file of files) {
      const { source, blocks } = handlersIn(file);
      for (const match of blocks) {
        const key = `${file}::${match[1]}`;
        if (isGuarded(match[0], source)) continue;
        if (key in ACKNOWLEDGED_UNGUARDED) continue;
        unaccounted.push(key);
      }
    }

    expect(
      unaccounted,
      `No capability check and not accounted for. Add a guard, or an entry to ` +
        `ACKNOWLEDGED_UNGUARDED saying why it is safe:\n  ` +
        unaccounted.join("\n  "),
    ).toEqual([]);
  });

  it("does not acknowledge handlers that no longer exist", () => {
    const existing = new Set(
      files.flatMap((file) => handlersIn(file).blocks.map((m) => `${file}::${m[1]}`)),
    );
    const stale = Object.keys(ACKNOWLEDGED_UNGUARDED).filter((key) => !existing.has(key));
    expect(stale, `Remove from ACKNOWLEDGED_UNGUARDED: ${stale.join(", ")}`).toEqual([]);
  });

  it("locks high-risk mutations to their exact capabilities", () => {
    const expectations = [
      ["approvals.ts", "decideApproval", 'requireCapability("approvals.decide"'],
      ["quotes.ts", "approveQuote", 'requireCapability("quotes.approve"'],
      ["quotes.ts", "rejectQuote", 'requireCapability("quotes.approve"'],
      ["quotes.ts", "issueQuoteVersion", 'requireCapability("quotes.issue"'],
      ["quotes.ts", "approveAndIssueQuote", 'requireCapability("quotes.issue"'],
      ["quotes.ts", "acceptQuoteAndCreateJobSheet", 'requireCapability("job_sheets.accept"'],
      ["job-sheets.ts", "acceptJobSheetForAccounting", 'requireCapability("job_sheets.accept"'],
      ["job-sheets.ts", "updateJobSheetPortions", 'requireCapability("job_sheets.update_billing"'],
      [
        "job-sheets.ts",
        "updatePortionXeroReference",
        'requireCapability("job_sheets.update_billing"',
      ],
      ["products.ts", "createProduct", 'requireCapability("products.manage"'],
      ["products.ts", "updateProduct", 'requireCapability("products.manage"'],
      ["products.ts", "deactivateProductFn", 'requireCapability("products.manage"'],
      [
        "automation-playbooks.ts",
        "createAutomationPlaybook",
        'requireCapability("automation.manage"',
      ],
      [
        "automation-playbooks.ts",
        "updateAutomationPlaybook",
        'requireCapability("automation.manage"',
      ],
      ["automation-playbooks.ts", "createAutomationRun", '"automation.manage"'],
      ["automation-playbooks.ts", "updateAutomationRun", 'requireCapability("automation.manage"'],
      ["leads.ts", "triggerLeadAgent", 'requireCapability("agents.run"'],
      ["leads.ts", "triggerLeadReplyDraft", 'requireCapability("agents.run"'],
      ["accounts.ts", "triggerRelationshipIntelligence", 'requireCapability("agents.run"'],
      ["engagements.ts", "triggerRiskScoreAgent", 'requireCapability("agents.run"'],
    ] as const;

    const failures: string[] = [];
    for (const [file, name, expected] of expectations) {
      const source = readFileSync(resolve(process.cwd(), "src/server-functions", file), "utf8");
      const handler = serverFunctionBlocks(source).find((entry) => entry.name === name);
      if (!handler?.source.includes(expected)) failures.push(file + ":" + name);
    }

    expect(failures).toEqual([]);
  });

  it("requires server-derived targets for representative mutations", () => {
    const expectations = [
      ["accounts.ts", "updateAccount", 'resourceType: "account"', "resourceId: data.id"],
      ["leads.ts", "moveLeadStage", 'resourceType: "lead"', "resourceId: data.id"],
      ["quotes.ts", "approveQuote", 'resourceType: "quote"', "resourceId: data.id"],
      [
        "job-sheets.ts",
        "acceptJobSheetForAccounting",
        'resourceType: "job_sheet"',
        "resourceId: data.id",
      ],
      ["products.ts", "updateProduct", 'requireCapability("products.manage"', ""],
      [
        "automation-playbooks.ts",
        "updateAutomationPlaybook",
        'resourceType: "automation_playbook"',
        "resourceId: data.id",
      ],
    ] as const;

    for (const [file, name, targetType, targetId] of expectations) {
      const source = readFileSync(resolve(process.cwd(), "src/server-functions", file), "utf8");
      const handler = serverFunctionBlocks(source).find((entry) => entry.name === name);
      expect(handler?.source).toContain(targetType);
      if (targetId) expect(handler?.source).toContain(targetId);
    }
  });
});

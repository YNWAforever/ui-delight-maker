import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The executing half of the authorization contract.
 *
 * `authorization-contract.test.ts` reads source text: it checks that each handler *mentions* a
 * capability helper. That catches a handler shipped with no guard at all — the failure that
 * actually happened on company-workspace.ts — but it cannot see whether the guard is awaited,
 * whether the database is read before it resolves, or whether the denial is swallowed and a
 * fallback returned. A grep matches all three of these:
 *
 *     requireCapability("accounts.view");                   // never awaited
 *     const rows = await listAccounts(); await requireCapability("accounts.view");
 *     try { await requireCapability("accounts.view") } catch { return { accounts: [] } }
 *
 * So this test runs the handlers instead. Every capability helper is mocked to reject, the
 * database seam is mocked to record any access, and each handler is invoked. A handler passes
 * only if it rejects with the denial *and* never touched the database.
 *
 * The blocker recorded in the sibling file was needing valid validator input per handler.
 * That turned out not to apply: `createServerFn` is mocked so `.handler(fn)` returns `fn`
 * directly, which means the validator never runs and the handler can be called with whatever
 * shape this file chooses.
 */

const mocks = vi.hoisted(() => {
  class AdminErrorStub extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AdminError";
    }
  }
  const DENIAL = new AdminErrorStub("FORBIDDEN", "denied by the authorization behaviour gate");
  const databaseCalls: string[] = [];
  const deny = () => Promise.reject(DENIAL);
  const record = (label: string) => (text?: unknown) => {
    databaseCalls.push(`${label}: ${String(text).replace(/\s+/g, " ").trim().slice(0, 80)}`);
    // Throwing as well as recording keeps a handler from continuing on a fake result, but the
    // assertion reads `databaseCalls` — a handler that catches this must not be able to hide.
    throw new Error("database reached while authorization was denied");
  };
  const chain = {
    validator() {
      return chain;
    },
    handler<T>(handler: T) {
      return handler;
    },
  };
  return { DENIAL, databaseCalls, deny, record, chain };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => mocks.chain }));

// All four helpers deny. requireNeonAuthSession deliberately SUCCEEDS: if it rejected too,
// every handler would reject and a session-only handler would be indistinguishable from a
// capability-guarded one — which is the exact confusion this gate exists to remove.
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.deny,
  requireCapabilityChecks: mocks.deny,
  requireCapabilitySet: mocks.deny,
  requireAnyCapability: mocks.deny,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: () =>
    Promise.resolve({
      user: { id: "actor-1", email: "actor@example.com" },
      session: { id: "session-1", createdAt: "2026-07-26T00:00:00.000Z" },
      profile: { id: "actor-1", role: "manager", status: "active" },
    }),
  getNeonAuthSession: () => Promise.resolve(null),
  requireNeonAuthIdentity: () =>
    Promise.resolve({ id: "actor-1", email: "actor@example.com", name: "Actor" }),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mocks.record("query"),
  queryOne: mocks.record("queryOne"),
  transaction: mocks.record("transaction"),
  getDatabaseUrl: () => "postgres://gate",
}));

// The five server functions still on the quarantined project reach their data this way.
vi.mock("@/legacy-supabase/server", () => ({
  createSupabaseServerClient: () => {
    mocks.record("supabase")("createSupabaseServerClient");
  },
}));

import { AdminError } from "@/lib/admin/errors";

const DIR = resolve(process.cwd(), "src/server-functions");
const HANDLER = /export const ([A-Za-z0-9_]+)\s*=\s*createServerFn/g;

/**
 * Handlers this gate does not drive, and why. Kept separate from the sibling file's
 * ACKNOWLEDGED_UNGUARDED because the reasons are different: those are safe without a
 * capability, these are ones the gate cannot exercise.
 */
const NOT_DRIVEN: Record<string, string> = {
  "auth.ts::getSession": "no session to authorize yet",
  "auth.ts::signIn": "establishes a session",
  "auth.ts::signOut": "ends a session",
  "admin-invitations.ts::getInvitationPreview": "must work for a signed-out invitee",
  "admin-invitations.ts::acceptUserInvitation":
    "the invitee holds no capability yet; authorized by requireNeonAuthIdentity plus the token",
  "app-shell.ts::getAppShellRead": "calls the other server functions, which deny individually",
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
    ].map((key) => [key, "scoped to session.user.id; denial is not the mechanism"]),
  ),
};

/**
 * One permissive payload for every handler. The validator is bypassed, so this only has to
 * survive whatever the handler reads off `data` before it awaits its guard — which for a
 * correctly-ordered handler is nothing.
 */
const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const ISO = "2026-07-26T00:00:00.000Z";
const DATA: Record<string, unknown> = {
  id: UUID,
  accountId: UUID,
  clientId: UUID,
  leadId: UUID,
  quoteId: UUID,
  campaignId: UUID,
  engagementId: UUID,
  jobSheetId: UUID,
  productId: UUID,
  profileId: UUID,
  departmentId: UUID,
  portionId: UUID,
  playbookId: UUID,
  approvalId: UUID,
  token: "token",
  agent: "lead_qualifier",
  section: "commercial",
  page: 1,
  limit: 25,
  reason: "authorization behaviour gate",
  status: "active",
  name: "gate",
  email: "gate@example.com",
  role: "staff",
  sections: [],
  portions: [],
  filters: {},
};

/**
 * Per-handler payloads for the sixteen handlers that parse `data` with zod before they await
 * their guard. Validating input ahead of authorization is fine — it is not a security
 * boundary — but it means the default payload never reaches the guard, so each of these needs
 * a shape its own schema accepts. Anything still rejecting for a non-denial reason shows up in
 * the `undrivable` list below rather than passing silently.
 */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  "admin-access.ts::getAdminAccessRequestsFn": { status: "pending" },
  "admin-access.ts::decideAdminAccessRequestFn": { decision: "approved" },
  "admin-access.ts::createAdminPermissionOverrideFn": {
    capability: "users.view",
    effect: "allow",
  },
  "admin-access.ts::createAdminWorkDelegationFn": {
    delegatorProfileId: UUID,
    delegateProfileId: UUID_B,
    startsAt: ISO,
    endsAt: "2026-08-26T00:00:00.000Z",
  },
  "admin-teams.ts::getAdminOrganizationUnitFn": { kind: "department" },
  "admin-teams.ts::updateDepartmentFn": { input: { name: "gate" } },
  "admin-teams.ts::updateTeamFn": { input: { name: "gate" } },
  "admin-teams.ts::endAdminTeamMembershipFn": { teamId: UUID, endedAt: ISO },
  "admin-teams.ts::upsertAdminTeamMembershipFn": { teamId: UUID, startedAt: ISO },
  "admin-users.ts::getAdminUsersFn": { role: "sales", status: "active" },
  "admin-users.ts::updateAdminUserFn": { changes: {} },
  "admin-users.ts::changeAdminUserRoleFn": { role: "sales" },
  "admin-users.ts::suspendAdminUserFn": {},
  "admin-users.ts::reactivateAdminUserFn": {},
  "admin-users.ts::deactivateAdminUserWithReassignmentFn": {
    reviewedInventory: { profileId: UUID, buckets: [], totalCount: 0 },
    successors: {},
  },
};

type Outcome =
  | { kind: "denied" }
  | { kind: "reached-database"; calls: string[] }
  | { kind: "resolved" }
  | { kind: "other"; error: string };

async function drive(handler: unknown, key: string): Promise<Outcome> {
  mocks.databaseCalls.length = 0;
  try {
    const data = { ...DATA, ...(PAYLOADS[key] ?? {}) };
    await (handler as (input: unknown) => Promise<unknown>)({ data });
  } catch (error) {
    if (mocks.databaseCalls.length > 0) {
      return { kind: "reached-database", calls: [...mocks.databaseCalls] };
    }
    // Either the denial itself, or a handler that caught it and re-threw its own AdminError —
    // both mean the caller was refused. Anything else never reached the guard.
    const denied = error === mocks.DENIAL || error instanceof AdminError;
    return denied ? { kind: "denied" } : { kind: "other", error: String(error).slice(0, 120) };
  }
  return mocks.databaseCalls.length > 0
    ? { kind: "reached-database", calls: [...mocks.databaseCalls] }
    : { kind: "resolved" };
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

const targets = files.flatMap((file) =>
  Array.from(readFileSync(resolve(DIR, file), "utf8").matchAll(HANDLER))
    .map((match) => ({ file, name: match[1], key: `${file}::${match[1]}` }))
    .map((entry) => ({ ...entry, base: file.replace(/\.ts$/, "") }))
    .filter((entry) => !(entry.key in NOT_DRIVEN)),
);

describe("server-function authorization behaviour", () => {
  beforeEach(() => {
    mocks.databaseCalls.length = 0;
  });

  it("has handlers to drive", () => {
    // A regex that stops matching would otherwise turn this whole file into a silent pass.
    expect(targets.length).toBeGreaterThan(150);
  });

  it("does not exempt handlers that no longer exist", () => {
    const existing = new Set(
      files.flatMap((file) =>
        Array.from(readFileSync(resolve(DIR, file), "utf8").matchAll(HANDLER)).map(
          (m) => `${file}::${m[1]}`,
        ),
      ),
    );
    const stale = Object.keys(NOT_DRIVEN).filter((key) => !existing.has(key));
    expect(stale, `Remove from NOT_DRIVEN: ${stale.join(", ")}`).toEqual([]);
  });

  it("refuses every guarded handler before it reads any data", async () => {
    const reachedDatabase: string[] = [];
    const resolvedAnyway: string[] = [];
    const undrivable: string[] = [];

    for (const target of targets) {
      const module = (await import(`../${target.base}.ts`)) as Record<string, unknown>;
      const handler = module[target.name];
      if (typeof handler !== "function") {
        undrivable.push(`${target.key} — not callable after import`);
        continue;
      }
      const outcome = await drive(handler, target.key);
      if (outcome.kind === "reached-database") {
        reachedDatabase.push(`${target.key} — ${outcome.calls[0]}`);
      } else if (outcome.kind === "resolved") {
        resolvedAnyway.push(target.key);
      } else if (outcome.kind === "other") {
        undrivable.push(`${target.key} — ${outcome.error}`);
      }
    }

    // The two real failures. Either one is a handler that serves data to a caller the policy
    // just refused.
    expect(
      reachedDatabase,
      `Read or wrote the database while authorization was denied. The guard is either not ` +
        `awaited, or it runs after the query:\n  ${reachedDatabase.join("\n  ")}`,
    ).toEqual([]);
    expect(
      resolvedAnyway,
      `Returned successfully while authorization was denied — the denial is being swallowed:` +
        `\n  ${resolvedAnyway.join("\n  ")}`,
    ).toEqual([]);

    // Not a failure, but it bounds what this gate proves. Printed so the number cannot drift
    // upward unnoticed and leave the contract resting on the source-text test alone.
    expect(
      undrivable,
      `Rejected for a reason other than the denial, so this gate did not exercise their ` +
        `guard:\n  ${undrivable.join("\n  ")}`,
    ).toEqual([]);
  });
});

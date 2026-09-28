import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const mocks = vi.hoisted(() => ({
  requireNeonAuthSession: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));
vi.mock("@/server/db/neon.server", () => ({ query: mocks.query }));

import { checkWithContext, loadRequestAuthorization } from "../authorization.server";

function session(id: string, role: AppSession["profile"]["role"]): AppSession {
  return {
    user: { id, email: id + "@example.com" },
    session: { id: "session-" + id, createdAt: "2026-09-27T00:00:00.000Z" },
    profile: {
      id,
      role,
      status: "active",
      primary_department_id: null,
    },
  } as AppSession;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string, values: readonly unknown[]) => {
    if (sql.includes("from permission_overrides")) {
      return values[0] === "actor-denied"
        ? [
            {
              profile_id: values[0],
              capability: "accounts.view",
              effect: "deny",
              department_id: null,
              team_id: null,
              resource_type: null,
              resource_id: null,
              expires_at: null,
              revoked_at: null,
            },
          ]
        : [];
    }
    return [];
  });
});

describe("request-scoped authorization", () => {
  it("loads one context for multiple checks in the same request", async () => {
    mocks.requireNeonAuthSession.mockResolvedValue(session("actor-1", "sales"));
    const context = await loadRequestAuthorization();
    const decisions = await checkWithContext(context, [
      { capability: "accounts.view" },
      { capability: "leads.view" },
      { capability: "quotes.view" },
    ]);
    expect(decisions.map((item) => item.allowed)).toEqual([true, true, true]);
    expect(mocks.requireNeonAuthSession).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledTimes(4);
  });

  it("keeps concurrent actors' decisions separate", async () => {
    mocks.requireNeonAuthSession
      .mockResolvedValueOnce(session("actor-allowed", "sales"))
      .mockResolvedValueOnce(session("actor-denied", "sales"));
    const [allowed, denied] = await Promise.all([
      loadRequestAuthorization(),
      loadRequestAuthorization(),
    ]);
    expect((await checkWithContext(allowed, [{ capability: "accounts.view" }]))[0].allowed).toBe(
      true,
    );
    expect((await checkWithContext(denied, [{ capability: "accounts.view" }]))[0].allowed).toBe(
      false,
    );
  });

  it("observes a revoked capability on the next request", async () => {
    mocks.requireNeonAuthSession.mockResolvedValue(session("actor-1", "sales"));
    const first = await loadRequestAuthorization();
    expect((await checkWithContext(first, [{ capability: "accounts.view" }]))[0].allowed).toBe(
      true,
    );
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("from permission_overrides")
        ? [
            {
              profile_id: "actor-1",
              capability: "accounts.view",
              effect: "deny",
              department_id: null,
              team_id: null,
              resource_type: null,
              resource_id: null,
              expires_at: null,
              revoked_at: null,
            },
          ]
        : [],
    );
    const second = await loadRequestAuthorization();
    expect((await checkWithContext(second, [{ capability: "accounts.view" }]))[0].allowed).toBe(
      false,
    );
    expect(mocks.requireNeonAuthSession).toHaveBeenCalledTimes(2);
  });
});

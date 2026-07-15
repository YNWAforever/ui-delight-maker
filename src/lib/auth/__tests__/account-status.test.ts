import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileByIdMock, requestState } = vi.hoisted(() => ({
  getProfileByIdMock: vi.fn(),
  requestState: { cookie: "__Secure-neon-auth.session_token=abc" as string | null },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({
    headers: { get: (name: string) => (name === "cookie" ? requestState.cookie : null) },
  }),
}));

vi.mock("@/server/repositories/profiles", () => ({
  getProfileById: getProfileByIdMock,
}));

import {
  getNeonAuthIdentity,
  getNeonAuthSession,
  requireNeonAuthIdentity,
} from "../neon-auth.server";

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "ada@example.com",
    name: "Ada",
    role: "sales",
    status: "active",
    avatar_url: null,
    job_title: null,
    phone: null,
    locale: "en-HK",
    timezone: "Asia/Hong_Kong",
    primary_department_id: null,
    manager_profile_id: null,
    last_active_at: null,
    session_invalid_before: null,
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    availability_status: "available",
    leave_starts_at: null,
    leave_ends_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function neonSession(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Response(
          JSON.stringify({
            session: {
              id: "session-1",
              createdAt: "2026-07-15T04:00:00.000Z",
              expiresAt: "2026-07-16T04:00:00.000Z",
              user: { id: "user-1", email: "ada@example.com", name: "Ada" },
              ...overrides,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

describe("ClientOps account status at sign in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.NEON_AUTH_URL = "https://auth.example.com";
    requestState.cookie = "__Secure-neon-auth.session_token=abc";
    neonSession();
    getProfileByIdMock.mockResolvedValue(profile());
  });

  it("returns upstream identity without creating or requiring an app profile", async () => {
    getProfileByIdMock.mockResolvedValue(null);
    await expect(getNeonAuthIdentity()).resolves.toEqual({
      user: { id: "user-1", email: "ada@example.com", name: "Ada" },
      session: {
        id: "session-1",
        createdAt: "2026-07-15T04:00:00.000Z",
        expiresAt: "2026-07-16T04:00:00.000Z",
      },
    });
    expect(getProfileByIdMock).not.toHaveBeenCalled();
    await expect(requireNeonAuthIdentity()).resolves.toMatchObject({
      user: { id: "user-1" },
    });
  });

  it("rejects an authenticated identity without a ClientOps profile", async () => {
    getProfileByIdMock.mockResolvedValue(null);
    await expect(getNeonAuthSession()).resolves.toBeNull();
  });

  it.each(["suspended", "deactivated"])("rejects a %s profile", async (status) => {
    getProfileByIdMock.mockResolvedValue(profile({ status }));
    await expect(getNeonAuthSession()).resolves.toBeNull();
  });

  it("rejects a session created before session_invalid_before", async () => {
    getProfileByIdMock.mockResolvedValue(
      profile({ session_invalid_before: "2026-07-15T03:00:00.000Z" }),
    );
    neonSession({ createdAt: "2026-07-15T02:00:00.000Z" });
    await expect(getNeonAuthSession()).resolves.toBeNull();
  });

  it("fails closed when revocation is set but upstream session creation is missing", async () => {
    getProfileByIdMock.mockResolvedValue(
      profile({ session_invalid_before: "2026-07-15T03:00:00.000Z" }),
    );
    neonSession({ createdAt: null });
    await expect(getNeonAuthSession()).resolves.toBeNull();
  });

  it("merges partial top-level and data session shapes field by field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Response(
            JSON.stringify({
              session: { id: "session-top" },
              data: {
                session: {
                  createdAt: "2026-07-15T04:00:00.000Z",
                  expiresAt: "2026-07-16T04:00:00.000Z",
                  user: { id: "user-1", email: "ada@example.com" },
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    await expect(getNeonAuthIdentity()).resolves.toEqual({
      user: { id: "user-1", email: "ada@example.com" },
      session: {
        id: "session-top",
        createdAt: "2026-07-15T04:00:00.000Z",
        expiresAt: "2026-07-16T04:00:00.000Z",
      },
    });
  });

  it("rejects explicitly expired or malformed upstream expiry metadata", async () => {
    neonSession({ expiresAt: "2020-01-01T00:00:00.000Z" });
    await expect(getNeonAuthIdentity()).resolves.toBeNull();

    neonSession({ expiresAt: "not-a-date" });
    await expect(getNeonAuthIdentity()).resolves.toBeNull();
  });

  it("accepts a session created exactly at the invalidation boundary", async () => {
    getProfileByIdMock.mockResolvedValue(
      profile({ session_invalid_before: "2026-07-15T04:00:00.000Z" }),
    );
    await expect(getNeonAuthSession()).resolves.toMatchObject({
      profile: { status: "active" },
    });
  });
  it("returns active app access with upstream session metadata", async () => {
    await expect(getNeonAuthSession()).resolves.toMatchObject({
      user: { id: "user-1" },
      session: { id: "session-1", createdAt: "2026-07-15T04:00:00.000Z" },
      profile: { id: "user-1", status: "active" },
    });
  });
});

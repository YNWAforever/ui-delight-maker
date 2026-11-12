import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpTokenScope } from "@/lib/mcp/types";

const { queryMock, queryOneMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: queryOneMock,
}));

import {
  createMcpAccessToken,
  hashMcpAccessToken,
  listMcpAccessTokens,
  recordMcpToolCall,
  resolveMcpAccessToken,
  revokeMcpAccessToken,
  touchMcpAccessToken,
} from "../tokens.server";

const TOKEN_PATTERN = /^fmcp_[0-9a-f]{64}$/;

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "token-1",
    name: "Claude Desktop",
    token_prefix: "fmcp_0123abcd",
    scopes: ["read"],
    created_at: "2026-11-12T00:00:00.000Z",
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

function resolutionRow(overrides: Record<string, unknown> = {}) {
  return {
    token_id: "token-1",
    token_name: "Claude Desktop",
    profile_id: "profile-1",
    scopes: ["read"],
    expires_at: null,
    revoked_at: null,
    profile_status: "active",
    ...overrides,
  };
}

describe("MCP access token storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mints an fmcp_ token and stores only its SHA-256 hash, display prefix and scopes", async () => {
    queryOneMock.mockImplementation(async (_sql: string, values: readonly unknown[]) =>
      tokenRow({
        name: values[1],
        token_prefix: values[2],
        expires_at: values[4],
        scopes: values[5],
      }),
    );

    const created = await createMcpAccessToken({
      profileId: "profile-1",
      name: "  Claude Desktop  ",
      expiresInDays: null,
    });

    expect(created.token).toMatch(TOKEN_PATTERN);
    expect(created.tokenPrefix).toBe(created.token.slice(0, 13));
    expect(created.name).toBe("Claude Desktop");
    expect(created.scopes).toEqual(["read"]);

    const [sql, values] = queryOneMock.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain("insert into mcp_access_tokens");
    expect(sql).toContain("scopes");
    expect(values[0]).toBe("profile-1");
    expect(values[1]).toBe("Claude Desktop");
    expect(values[2]).toBe(created.token.slice(0, 13));
    expect(values[3]).toBe(hashMcpAccessToken(created.token));
    expect(values[3]).toBe(createHash("sha256").update(created.token).digest("hex"));
    expect(values[4]).toBeNull();
    // Omitted scopes persist the safe read-only default.
    expect(values[5]).toEqual(["read"]);
    // The raw bearer value is returned once and never written to the database.
    expect(values).not.toContain(created.token);
    expect(JSON.stringify(values)).not.toContain(created.token);
  });

  it("persists an explicit write scope and returns the canonical scope list", async () => {
    queryOneMock.mockImplementation(async (_sql: string, values: readonly unknown[]) =>
      tokenRow({ scopes: values[5] }),
    );

    const created = await createMcpAccessToken({
      profileId: "profile-1",
      name: "Write agent",
      expiresInDays: null,
      scopes: ["read", "write"],
    });

    expect(created.scopes).toEqual(["read", "write"]);
    const [, values] = queryOneMock.mock.calls[0] as [string, readonly unknown[]];
    expect(values[5]).toEqual(["read", "write"]);
  });

  it("normalizes a bare write selection so a write token can always read", async () => {
    queryOneMock.mockResolvedValue(tokenRow({ scopes: ["read", "write"] }));

    const created = await createMcpAccessToken({
      profileId: "profile-1",
      name: "Write-only request",
      expiresInDays: null,
      scopes: ["write"],
    });

    expect(created.scopes).toEqual(["read", "write"]);
    const [, values] = queryOneMock.mock.calls[0] as [string, readonly unknown[]];
    expect(values[5]).toEqual(["read", "write"]);
  });

  it("rejects an empty or unknown scope selection before minting anything", async () => {
    await expect(
      createMcpAccessToken({
        profileId: "profile-1",
        name: "No scopes",
        expiresInDays: null,
        scopes: [],
      }),
    ).rejects.toThrow(/at least one scope/);
    await expect(
      createMcpAccessToken({
        profileId: "profile-1",
        name: "Unknown scope",
        expiresInDays: null,
        scopes: ["root"] as unknown as McpTokenScope[],
      }),
    ).rejects.toThrow(/Unknown MCP token scope/);
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("refuses to mint more than the active-token cap", async () => {
    queryOneMock.mockResolvedValue(null);

    await expect(
      createMcpAccessToken({ profileId: "profile-1", name: "One too many", expiresInDays: null }),
    ).rejects.toThrow(/active agent tokens/);
  });

  it("turns expiresInDays into an absolute expiry and leaves null as never", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T00:00:00.000Z"));
    queryOneMock.mockResolvedValue(tokenRow());

    await createMcpAccessToken({ profileId: "profile-1", name: "Short", expiresInDays: 30 });
    expect((queryOneMock.mock.calls[0] as [string, unknown[]])[1][4]).toBe(
      "2026-12-12T00:00:00.000Z",
    );

    await createMcpAccessToken({ profileId: "profile-1", name: "Long", expiresInDays: 365 });
    expect((queryOneMock.mock.calls[1] as [string, unknown[]])[1][4]).toBe(
      "2027-11-12T00:00:00.000Z",
    );

    await createMcpAccessToken({ profileId: "profile-1", name: "Forever", expiresInDays: null });
    expect((queryOneMock.mock.calls[2] as [string, unknown[]])[1][4]).toBeNull();
  });

  it("rejects a name that is blank or longer than the column allows", async () => {
    await expect(
      createMcpAccessToken({ profileId: "profile-1", name: "   ", expiresInDays: null }),
    ).rejects.toThrow("MCP token name");
    await expect(
      createMcpAccessToken({ profileId: "profile-1", name: "x".repeat(81), expiresInDays: null }),
    ).rejects.toThrow("MCP token name");
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("lists newest first, returns each token's scopes, and keeps revoked/expired history", async () => {
    queryMock.mockResolvedValue([
      tokenRow({
        id: "token-new",
        scopes: ["read", "write"],
        created_at: "2026-11-12T00:00:00.000Z",
      }),
      tokenRow({
        id: "token-old",
        created_at: "2026-01-01T00:00:00.000Z",
        revoked_at: "2026-02-01T00:00:00.000Z",
        expires_at: "2026-03-01T00:00:00.000Z",
        last_used_at: "2026-01-05T00:00:00.000Z",
      }),
    ]);

    const tokens = await listMcpAccessTokens("profile-1");

    expect(tokens.map((token) => token.id)).toEqual(["token-new", "token-old"]);
    expect(tokens[0].scopes).toEqual(["read", "write"]);
    expect(tokens[1].scopes).toEqual(["read"]);
    expect(tokens[1]).toMatchObject({
      revokedAt: "2026-02-01T00:00:00.000Z",
      expiresAt: "2026-03-01T00:00:00.000Z",
      lastUsedAt: "2026-01-05T00:00:00.000Z",
    });
    const [sql, values] = queryMock.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toMatch(/order by created_at desc, id desc/);
    expect(values).toEqual(["profile-1"]);
  });

  it("revokes only the caller's token and treats a repeat as success without moving revoked_at", async () => {
    queryMock.mockResolvedValueOnce([{ id: "token-1" }]);
    await expect(revokeMcpAccessToken("profile-1", "token-1")).resolves.toBe(true);
    const [sql, values] = queryMock.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain("coalesce(revoked_at, now())");
    expect(sql).toContain("profile_id = $2");
    expect(values).toEqual(["token-1", "profile-1"]);

    // The second call reaches the row again but coalesce keeps the first revocation instant,
    // so an idle retry is a success rather than a distinct state.
    queryMock.mockResolvedValueOnce([{ id: "token-1" }]);
    await expect(revokeMcpAccessToken("profile-1", "token-1")).resolves.toBe(true);

    // Another profile's token is indistinguishable from a missing one.
    queryMock.mockResolvedValueOnce([]);
    await expect(revokeMcpAccessToken("profile-2", "token-1")).resolves.toBe(false);
  });

  it("returns null for a malformed bearer token without touching the database", async () => {
    await expect(resolveMcpAccessToken("fmcp_short")).resolves.toBeNull();
    await expect(resolveMcpAccessToken("Bearer fmcp_" + "a".repeat(64))).resolves.toBeNull();
    await expect(resolveMcpAccessToken("")).resolves.toBeNull();
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("resolves an active token to its profile and scopes", async () => {
    queryOneMock.mockResolvedValue(resolutionRow());
    const rawToken = "fmcp_" + "a".repeat(64);

    await expect(resolveMcpAccessToken(rawToken)).resolves.toEqual({
      tokenId: "token-1",
      tokenName: "Claude Desktop",
      profileId: "profile-1",
      scopes: ["read"],
    });

    const [sql, values] = queryOneMock.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain("join profiles");
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain("t.revoked_at is null");
    expect(values).toEqual([hashMcpAccessToken(rawToken)]);
  });

  it("drops a stored scope it does not understand", async () => {
    queryOneMock.mockResolvedValue(resolutionRow({ scopes: ["read", "root"] }));

    const resolution = await resolveMcpAccessToken("fmcp_" + "a".repeat(64));

    expect(resolution?.scopes).toEqual(["read"]);
  });

  it.each([
    ["an unknown token", null],
    ["a revoked token", resolutionRow({ revoked_at: "2026-11-12T00:00:00.000Z" })],
    ["an expired token", resolutionRow({ expires_at: new Date(Date.now() - 1000).toISOString() })],
    ["an invited profile", resolutionRow({ profile_status: "invited" })],
    ["a suspended profile", resolutionRow({ profile_status: "suspended" })],
    ["a deactivated profile", resolutionRow({ profile_status: "deactivated" })],
  ])("refuses to resolve %s", async (_label, row) => {
    queryOneMock.mockResolvedValue(row);

    await expect(resolveMcpAccessToken("fmcp_" + "b".repeat(64))).resolves.toBeNull();
  });

  it("throttles last-use writes to once per five minutes", async () => {
    await touchMcpAccessToken("token-1");

    const [sql, values] = queryMock.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain("set last_used_at = now()");
    expect(sql).toContain("interval '5 minutes'");
    expect(values).toEqual(["token-1"]);
  });

  it("records a tool call without arguments or results and clamps the duration", async () => {
    queryMock.mockResolvedValue([]);

    await recordMcpToolCall({
      tokenId: "token-1",
      profileId: "profile-1",
      tool: "  crm_search  ",
      status: "ok",
      durationMs: 42.9,
    });

    const [sql, values] = queryMock.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain("insert into mcp_tool_calls");
    expect(values).toEqual(["token-1", "profile-1", "crm_search", "ok", null, 42]);
  });

  it("never throws when the audit insert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      recordMcpToolCall({
        tokenId: "token-1",
        profileId: "profile-1",
        tool: "crm_search",
        status: "error",
        errorCode: "internal",
      }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it("skips an empty tool name instead of failing the column check", async () => {
    await recordMcpToolCall({
      tokenId: null,
      profileId: null,
      tool: "   ",
      status: "ok",
    });

    expect(queryMock).not.toHaveBeenCalled();
  });
});

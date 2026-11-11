import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listMcpAccessTokensMock,
  createMcpAccessTokenMock,
  revokeMcpAccessTokenMock,
  requireNeonAuthSessionMock,
  createServerFnChain,
} = vi.hoisted(() => {
  // Mirrors the real createServerFn chain just enough to run the zod validators; the existing
  // repository tests stub the validator away, but this file's contract is "personal only", so
  // the schemas themselves are part of what is under test.
  const createServerFnChain = () => {
    let validate: (data: unknown) => unknown = (data) => data;
    const chain = {
      validator(next: (data: unknown) => unknown) {
        validate = next;
        return chain;
      },
      handler<T extends (args: { data: unknown }) => unknown>(handler: T) {
        return async (options?: { data?: unknown }) => handler({ data: validate(options?.data) });
      },
    };
    return chain;
  };

  return {
    listMcpAccessTokensMock: vi.fn(),
    createMcpAccessTokenMock: vi.fn(),
    revokeMcpAccessTokenMock: vi.fn(),
    requireNeonAuthSessionMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain() }));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));
vi.mock("@/server/mcp/tokens.server", () => ({
  listMcpAccessTokens: listMcpAccessTokensMock,
  createMcpAccessToken: createMcpAccessTokenMock,
  revokeMcpAccessToken: revokeMcpAccessTokenMock,
}));

const TOKEN_ID = "123e4567-e89b-42d3-a456-426614174000";

function session() {
  return {
    user: { id: "profile-1" },
    session: {},
    profile: { id: "profile-1", role: "sales", status: "active" },
  };
}

describe("MCP token server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue(session());
    listMcpAccessTokensMock.mockResolvedValue([]);
    createMcpAccessTokenMock.mockResolvedValue({ id: "token-1", token: "fmcp_raw" });
    revokeMcpAccessTokenMock.mockResolvedValue(true);
  });

  it("lists only the signed-in profile's tokens", async () => {
    const { getMyMcpTokens } = await import("../mcp-tokens");

    await expect(getMyMcpTokens()).resolves.toEqual([]);
    expect(requireNeonAuthSessionMock).toHaveBeenCalledTimes(1);
    expect(listMcpAccessTokensMock).toHaveBeenCalledWith("profile-1");
  });

  it("mints a token for the signed-in profile with a trimmed name and allowed expiry", async () => {
    const { createMyMcpToken } = await import("../mcp-tokens");

    await createMyMcpToken({ data: { name: "  Laptop  ", expiresInDays: 90 } });

    expect(createMcpAccessTokenMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      name: "Laptop",
      expiresInDays: 90,
    });
  });

  it.each([30, 90, 365, null])("accepts the offered %s-day expiry", async (expiresInDays) => {
    const { createMyMcpToken } = await import("../mcp-tokens");

    await createMyMcpToken({ data: { name: "Laptop", expiresInDays } });

    expect(createMcpAccessTokenMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      name: "Laptop",
      expiresInDays,
    });
  });

  it.each([
    ["a blank name", { name: "   ", expiresInDays: null }],
    ["an overlong name", { name: "x".repeat(81), expiresInDays: null }],
    ["an unlisted expiry", { name: "Laptop", expiresInDays: 31 }],
    ["a missing expiry", { name: "Laptop" }],
  ])("rejects %s before creating a token", async (_label, data) => {
    const { createMyMcpToken } = await import("../mcp-tokens");

    await expect(createMyMcpToken({ data })).rejects.toThrow();
    expect(createMcpAccessTokenMock).not.toHaveBeenCalled();
  });

  it("revokes the token only on behalf of the signed-in profile", async () => {
    const { revokeMyMcpToken } = await import("../mcp-tokens");

    await expect(revokeMyMcpToken({ data: { tokenId: TOKEN_ID } })).resolves.toEqual({
      revoked: true,
    });
    expect(revokeMcpAccessTokenMock).toHaveBeenCalledWith("profile-1", TOKEN_ID);
  });

  it("reports a token that was not the caller's as not revoked", async () => {
    revokeMcpAccessTokenMock.mockResolvedValue(false);
    const { revokeMyMcpToken } = await import("../mcp-tokens");

    await expect(revokeMyMcpToken({ data: { tokenId: TOKEN_ID } })).resolves.toEqual({
      revoked: false,
    });
  });

  it("rejects a token id that is not a uuid", async () => {
    const { revokeMyMcpToken } = await import("../mcp-tokens");

    await expect(revokeMyMcpToken({ data: { tokenId: "token-1" } })).rejects.toThrow();
    expect(revokeMcpAccessTokenMock).not.toHaveBeenCalled();
  });

  it("cannot be pointed at another profile from the client", async () => {
    // The personal-only boundary is structural: there is no profileId input to override.
    const { createMyMcpToken, revokeMyMcpToken } = await import("../mcp-tokens");

    await expect(
      createMyMcpToken({
        data: { name: "Laptop", expiresInDays: null, profileId: "profile-2" },
      }),
    ).rejects.toThrow();
    await expect(
      revokeMyMcpToken({ data: { tokenId: TOKEN_ID, profileId: "profile-2" } }),
    ).rejects.toThrow();
    expect(createMcpAccessTokenMock).not.toHaveBeenCalled();
    expect(revokeMcpAccessTokenMock).not.toHaveBeenCalled();
  });

  it("requires a session for every function", async () => {
    requireNeonAuthSessionMock.mockRejectedValue(new Error("Authentication required"));
    const { getMyMcpTokens, createMyMcpToken, revokeMyMcpToken } = await import("../mcp-tokens");

    await expect(getMyMcpTokens()).rejects.toThrow("Authentication required");
    await expect(
      createMyMcpToken({ data: { name: "Laptop", expiresInDays: null } }),
    ).rejects.toThrow("Authentication required");
    await expect(revokeMyMcpToken({ data: { tokenId: TOKEN_ID } })).rejects.toThrow(
      "Authentication required",
    );
    expect(listMcpAccessTokensMock).not.toHaveBeenCalled();
    expect(createMcpAccessTokenMock).not.toHaveBeenCalled();
    expect(revokeMcpAccessTokenMock).not.toHaveBeenCalled();
  });
});

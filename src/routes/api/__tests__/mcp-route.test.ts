import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleMcpRequest: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  loadAuthorizationForProfile: vi.fn(),
  recordMcpToolCallTrace: vi.fn(),
  resolveMcpAccessToken: vi.fn(),
  touchMcpAccessToken: vi.fn(),
  getProfileById: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/server/auth/authorization.server", () => ({
  loadAuthorizationForProfile: mocks.loadAuthorizationForProfile,
}));
vi.mock("@/server/mcp/protocol.server", () => ({
  handleMcpRequest: mocks.handleMcpRequest,
}));
vi.mock("@/server/mcp/tool-call-trace.server", () => ({
  recordMcpToolCallTrace: mocks.recordMcpToolCallTrace,
}));
vi.mock("@/server/mcp/tokens.server", () => ({
  resolveMcpAccessToken: mocks.resolveMcpAccessToken,
  touchMcpAccessToken: mocks.touchMcpAccessToken,
}));
vi.mock("@/server/repositories/profiles", () => ({
  getProfileById: mocks.getProfileById,
}));

import { Route } from "../mcp";

type RouteHandlers = Record<string, (args: { request: Request }) => Promise<Response> | Response>;
type TestRoute = { options?: { server?: { handlers?: RouteHandlers } } };

const handlers = ((Route as unknown as TestRoute).options?.server?.handlers ?? {}) as RouteHandlers;

function request(): Request {
  return new Request("https://clientops.example.com/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer fmcp_${"a".repeat(64)}` },
  });
}

async function mcpDeps() {
  await handlers.POST!({ request: request() });
  expect(mocks.handleMcpRequest).toHaveBeenCalledTimes(1);
  const calls = mocks.handleMcpRequest.mock.calls as unknown as Array<[Request, unknown]>;
  return calls[0]?.[1] as {
    resolveToken(rawToken: string): Promise<unknown>;
    touchToken(tokenId: string): Promise<unknown>;
    recordToolCall(record: unknown): Promise<unknown>;
  };
}

describe("MCP route dependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes every HTTP method to the MCP transport handler", async () => {
    for (const method of ["POST", "GET", "DELETE", "OPTIONS"]) {
      expect(typeof handlers[method]).toBe("function");
    }

    const response = await handlers.POST!({ request: request() });
    expect(response.status).toBe(200);
    expect(mocks.handleMcpRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        touchToken: mocks.touchMcpAccessToken,
        recordToolCall: mocks.recordMcpToolCallTrace,
      }),
    );
  });

  it("resolves a token, re-reads its active profile and builds the authorization context", async () => {
    mocks.resolveMcpAccessToken.mockResolvedValue({
      tokenId: "token-1",
      tokenName: "Claude Code",
      profileId: "profile-1",
      scopes: ["read"],
    });
    mocks.getProfileById.mockResolvedValue({ id: "profile-1", status: "active" });
    mocks.loadAuthorizationForProfile.mockResolvedValue({ actor: { profileId: "profile-1" } });

    const deps = await mcpDeps();
    await expect(deps.resolveToken("fmcp_token")).resolves.toMatchObject({
      token: { tokenId: "token-1" },
      authorization: { actor: { profileId: "profile-1" } },
    });
  });

  it("refuses an inactive profile before building authorization", async () => {
    mocks.resolveMcpAccessToken.mockResolvedValue({
      tokenId: "token-1",
      tokenName: "Claude Code",
      profileId: "profile-1",
      scopes: ["read"],
    });
    mocks.getProfileById.mockResolvedValue({ id: "profile-1", status: "suspended" });

    const deps = await mcpDeps();
    await expect(deps.resolveToken("fmcp_token")).resolves.toBeNull();
    expect(mocks.loadAuthorizationForProfile).not.toHaveBeenCalled();
  });

  it("refuses an unknown token", async () => {
    mocks.resolveMcpAccessToken.mockResolvedValue(null);

    const deps = await mcpDeps();
    await expect(deps.resolveToken("fmcp_token")).resolves.toBeNull();
    expect(mocks.getProfileById).not.toHaveBeenCalled();
  });
});

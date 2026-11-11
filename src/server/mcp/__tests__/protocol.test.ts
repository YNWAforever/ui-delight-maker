import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import {
  LATEST_MCP_PROTOCOL_VERSION,
  MCP_JSON_RPC_ERRORS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_PREFIX_DISPLAY_LENGTH,
  type McpTokenResolution,
} from "@/lib/mcp/types";
import { MCP_TOOL_NAMES } from "@/lib/mcp/tools.server";
import {
  handleMcpRequest,
  MCP_MAX_REQUEST_BYTES,
  McpRateLimiter,
  negotiateMcpProtocolVersion,
  type McpProtocolDeps,
  type McpToolCallRecord,
} from "../protocol.server";

const TEST_TOKEN = `${MCP_TOKEN_PREFIX}${"a".repeat(64)}`;
/** The safe display projection the endpoint derives: `fmcp_` plus the configured hex prefix. */
const TEST_TOKEN_PREFIX = TEST_TOKEN.slice(0, MCP_TOKEN_PREFIX_DISPLAY_LENGTH);

type JsonRpcBody = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

type ToolCallResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

function testProfile(overrides: Partial<AppSession["profile"]> = {}): AppSession["profile"] {
  return {
    id: "profile-1",
    email: "maker@example.com",
    name: "Maker One",
    role: "sales",
    status: "active",
    avatar_url: null,
    job_title: null,
    phone: null,
    locale: "en",
    timezone: "Asia/Hong_Kong",
    primary_department_id: "department-1",
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
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function testSession(overrides: Partial<AppSession["profile"]> = {}): AppSession {
  const profile = testProfile(overrides);
  return {
    user: { id: "auth-user-1", email: "maker@example.com", emailVerified: true },
    session: { id: "session-1", createdAt: "2026-11-01T00:00:00.000Z" },
    profile,
  };
}

function testAuthorization(session: AppSession = testSession()): RequestAuthorization {
  return {
    session,
    actor: {
      profileId: session.profile.id,
      role: session.profile.role,
      status: session.profile.status,
      departmentId: session.profile.primary_department_id,
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date("2026-11-12T00:00:00.000Z"),
  };
}

function testToken(overrides: Partial<McpTokenResolution> = {}): McpTokenResolution {
  return {
    tokenId: "token-1",
    tokenName: "Claude Code",
    profileId: "profile-1",
    scopes: ["read"],
    ...overrides,
  };
}

function testDeps(overrides: Partial<McpProtocolDeps> = {}) {
  const records: McpToolCallRecord[] = [];
  const touched: string[] = [];
  const deps: McpProtocolDeps = {
    resolveToken: vi.fn(async (rawToken: string) =>
      rawToken === TEST_TOKEN ? { token: testToken(), authorization: testAuthorization() } : null,
    ),
    touchToken: vi.fn(async (tokenId: string) => {
      touched.push(tokenId);
    }),
    recordToolCall: vi.fn(async (record: McpToolCallRecord) => {
      records.push(record);
    }),
    rateLimiter: new McpRateLimiter(),
    preAuthRateLimiter: new McpRateLimiter(),
    ...overrides,
  };
  return { deps, records, touched };
}

function jsonRpcRequest(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

async function readJson(response: Response): Promise<JsonRpcBody> {
  return (await response.json()) as JsonRpcBody;
}

async function call(
  deps: McpProtocolDeps,
  body: unknown,
  options: { method?: string; token?: string | null; headers?: Record<string, string> } = {},
): Promise<Response> {
  const token = options.token === undefined ? TEST_TOKEN : options.token;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const method = options.method ?? "POST";
  const request = new Request("https://clientops.example.com/api/mcp", {
    method,
    headers,
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  return handleMcpRequest(request, deps);
}

describe("MCP protocol negotiation", () => {
  it("replies with the client's protocol version when it is supported", async () => {
    const { deps } = testDeps();
    const response = await call(
      deps,
      jsonRpcRequest("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    });
  });

  it("falls back to the newest supported protocol version for an unknown one", async () => {
    const { deps } = testDeps();
    const response = await call(
      deps,
      jsonRpcRequest("initialize", {
        protocolVersion: "1999-01-01",
        capabilities: {},
        clientInfo: { name: "old-client", version: "0.1.0" },
      }),
    );
    const body = await readJson(response);

    expect((body.result as { protocolVersion: string }).protocolVersion).toBe(
      LATEST_MCP_PROTOCOL_VERSION,
    );
  });

  it("negotiates the newest supported version as the fallback constant", () => {
    expect(negotiateMcpProtocolVersion("1999-01-01")).toBe(LATEST_MCP_PROTOCOL_VERSION);
    expect(negotiateMcpProtocolVersion("2025-06-18")).toBe("2025-06-18");
  });

  it("rejects initialize without a protocol version", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("initialize", { capabilities: {} }));
    const body = await readJson(response);

    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.invalidParams);
  });

  it("answers ping with an empty result", async () => {
    const { deps } = testDeps();
    const body = await readJson(await call(deps, jsonRpcRequest("ping")));

    expect(body.result).toEqual({});
  });

  it("accepts the initialized notification without a body", async () => {
    const { deps } = testDeps();
    const response = await call(deps, { jsonrpc: "2.0", method: "notifications/initialized" });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("ignores other client notifications", async () => {
    const { deps } = testDeps();
    const response = await call(deps, {
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    });

    expect(response.status).toBe(202);
  });
});

describe("MCP endpoint transport behaviour", () => {
  it("lists the read-only tool registry with JSON Schemas", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("tools/list", {}));
    const body = await readJson(response);
    const result = body.result as {
      tools: Array<{
        name: string;
        title?: string;
        description?: string;
        inputSchema: { type?: string; properties?: Record<string, unknown> };
      }>;
    };

    expect(response.status).toBe(200);
    expect(result.tools.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.description).toBe("string");
    }
    const search = result.tools.find((tool) => tool.name === "search");
    expect(search?.inputSchema.properties?.query).toBeTruthy();
  });

  it("runs whoami through the registry and audits the call", async () => {
    const { deps, records, touched } = testDeps();
    const response = await call(
      deps,
      jsonRpcRequest("tools/call", { name: "whoami", arguments: {} }),
    );
    const body = await readJson(response);
    const result = body.result as ToolCallResult;
    const data = JSON.parse(result.content[0].text) as {
      profile: { id: string; role: string };
      capabilities: string[];
      token: { id: string; name: string; prefix: string; scopes: readonly string[] };
    };

    expect(response.status).toBe(200);
    expect(result.isError).toBeFalsy();
    expect(data.profile).toMatchObject({ id: "profile-1", role: "sales" });
    expect(data.capabilities).toContain("accounts.view");
    expect(data.token).toMatchObject({
      id: "token-1",
      name: "Claude Code",
      prefix: TEST_TOKEN_PREFIX,
      scopes: ["read"],
    });
    expect(touched).toEqual(["token-1"]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tokenId: "token-1",
      profileId: "profile-1",
      tool: "whoami",
      status: "ok",
      errorCode: null,
    });
    expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns an isError tool result for an unknown tool and audits it", async () => {
    const { deps, records } = testDeps();
    const response = await call(
      deps,
      jsonRpcRequest("tools/call", { name: "not_a_tool", arguments: {} }),
    );
    const body = await readJson(response);
    const result = body.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
    expect(records[0]).toMatchObject({
      tool: "not_a_tool",
      status: "error",
      errorCode: "invalid_input",
    });
  });

  it("keeps invalid tool arguments as a safe isError result and never leaks internals", async () => {
    const { deps, records } = testDeps();
    const response = await call(
      deps,
      jsonRpcRequest("tools/call", {
        name: "get_quote",
        arguments: { id: "definitely-not-a-uuid" },
      }),
    );
    const result = (await readJson(response)).result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/input validation error/i);
    expect(result.content[0].text).not.toMatch(/select |insert |stack|at \w+ \(/i);
    expect(records[0]).toMatchObject({ tool: "get_quote", status: "error" });
    expect(records[0].errorCode).toBe("invalid_input");
  });

  it("rejects a malformed JSON body with a parse error", async () => {
    const { deps } = testDeps();
    const response = await call(deps, "{ not json");
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.parseError);
    expect(body.id).toBeNull();
  });

  it("rejects a body that is not declared as JSON", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("ping"), {
      headers: { "content-type": "text/plain" },
    });
    const body = await readJson(response);

    expect(response.status).toBe(415);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.invalidRequest);
  });

  it("rejects an oversized body before parsing it", async () => {
    const { deps } = testDeps();
    const response = await call(deps, "x".repeat(MCP_MAX_REQUEST_BYTES + 1));
    const body = await readJson(response);

    expect(response.status).toBe(413);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.invalidRequest);
  });

  it("rejects an unsupported MCP-Protocol-Version header", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("ping"), {
      headers: { "mcp-protocol-version": "1999-01-01" },
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.invalidRequest);
  });

  it("accepts a supported MCP-Protocol-Version header", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("ping"), {
      headers: { "mcp-protocol-version": "2025-06-18" },
    });

    expect(response.status).toBe(200);
  });

  it("rejects JSON batches", async () => {
    const { deps } = testDeps();
    const response = await call(deps, [jsonRpcRequest("tools/list", {})]);
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.invalidRequest);
  });

  it("rejects a JSON value that is not a JSON-RPC request", async () => {
    const { deps } = testDeps();
    const response = await call(deps, { jsonrpc: "2.0", id: 1 });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.invalidRequest);
  });

  it("returns method not found for unknown methods", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("resources/list", {}));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.error?.code).toBe(MCP_JSON_RPC_ERRORS.methodNotFound);
  });

  it("allows only POST and OPTIONS", async () => {
    const { deps } = testDeps();
    const getResponse = await call(deps, undefined, { method: "GET", token: null });
    const deleteResponse = await call(deps, undefined, { method: "DELETE", token: null });
    const optionsResponse = await call(deps, undefined, { method: "OPTIONS", token: null });

    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST, OPTIONS");
    expect(deleteResponse.status).toBe(405);
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("requires a bearer token before parsing the body", async () => {
    const { deps } = testDeps();
    const response = await call(deps, "{ not json", { token: null });
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="fimmick-clientops"');
    expect(body.error?.code).toBe(-32000);
  });

  it("rejects tokens that do not look like connector tokens without resolving them", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("initialize", {}), {
      token: "some-other-token",
    });

    expect(response.status).toBe(401);
    expect(deps.resolveToken).not.toHaveBeenCalled();
  });

  it("rejects a token the store refuses to resolve", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("ping"), {
      token: `fmcp_${"b".repeat(64)}`,
    });
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.error?.message).toMatch(/invalid or expired/i);
  });

  it("rate-limits after the configured number of calls per token", async () => {
    const limiter = new McpRateLimiter({ max: 2 });
    const { deps } = testDeps({ rateLimiter: limiter });

    const first = await call(deps, jsonRpcRequest("ping"));
    const second = await call(deps, jsonRpcRequest("ping"));
    const third = await call(deps, jsonRpcRequest("ping"));
    const body = await readJson(third);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("60");
    expect(body.error?.code).toBe(-32000);
  });

  it("shares one rate-limit bucket across every token of the same profile", async () => {
    const limiter = new McpRateLimiter({ max: 1 });
    const { deps } = testDeps({
      rateLimiter: limiter,
      resolveToken: vi.fn(async (rawToken: string) =>
        rawToken === TEST_TOKEN
          ? { token: testToken(), authorization: testAuthorization() }
          : rawToken === `fmcp_${"b".repeat(64)}`
            ? {
                token: testToken({ tokenId: "token-2" }),
                authorization: testAuthorization(),
              }
            : null,
      ),
    });

    const first = await call(deps, jsonRpcRequest("ping"));
    const second = await call(deps, jsonRpcRequest("ping"), {
      token: `fmcp_${"b".repeat(64)}`,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("keeps separate profiles in separate rate-limit buckets", async () => {
    const limiter = new McpRateLimiter({ max: 1 });
    const otherAuthorization = testAuthorization(
      testSession({ id: "profile-2", email: "other@example.com" }),
    );
    const { deps } = testDeps({
      rateLimiter: limiter,
      resolveToken: vi.fn(async (rawToken: string) =>
        rawToken === TEST_TOKEN
          ? { token: testToken(), authorization: testAuthorization() }
          : rawToken === `fmcp_${"b".repeat(64)}`
            ? {
                token: testToken({ tokenId: "token-2", profileId: "profile-2" }),
                authorization: otherAuthorization,
              }
            : null,
      ),
    });

    const first = await call(deps, jsonRpcRequest("ping"));
    const second = await call(deps, jsonRpcRequest("ping"), {
      token: `fmcp_${"b".repeat(64)}`,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("throttles repeated pre-authentication guesses per client", async () => {
    const preAuthRateLimiter = new McpRateLimiter({ max: 1 });
    const { deps } = testDeps({ preAuthRateLimiter });
    const unknownToken = `fmcp_${"c".repeat(64)}`;

    const first = await call(deps, jsonRpcRequest("ping"), { token: unknownToken });
    const second = await call(deps, jsonRpcRequest("ping"), { token: unknownToken });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(deps.resolveToken).toHaveBeenCalledTimes(1);
  });

  it("dispatches a JSON-RPC request and returns the raw response envelope", async () => {
    const { deps } = testDeps();
    const response = await call(deps, jsonRpcRequest("ping", undefined, "req-1"));
    const body = await readJson(response);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({ jsonrpc: "2.0", id: "req-1", result: {} });
  });

  it("does not record tool-call audits for non-tool requests", async () => {
    const { deps, records, touched } = testDeps();
    await call(deps, jsonRpcRequest("tools/list", {}));
    await call(deps, jsonRpcRequest("ping"));

    expect(records).toHaveLength(0);
    expect(touched).toHaveLength(0);
  });
});

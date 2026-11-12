import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";
import {
  LATEST_MCP_PROTOCOL_VERSION,
  MCP_ERROR_CODES,
  MCP_JSON_RPC_ERRORS,
  MCP_PROTOCOL_VERSIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_PREFIX_DISPLAY_LENGTH,
  type McpErrorCode,
  type McpProtocolVersion,
  type McpTokenResolution,
} from "@/lib/mcp/types";
import { toolArgumentDigest } from "@/lib/tool-call-digest";
import {
  executeMcpTool,
  MCP_TOOLS,
  toolErrorCodeFromResult,
  type McpToolContext,
} from "@/lib/mcp/tools.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { McpRequestTransport } from "./transport.server";

/** Implementation-defined JSON-RPC server error used for auth and rate-limit failures. */
const SERVER_ERROR_CODE = -32000;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

/** JSON-RPC bodies are tiny (tool names plus bounded arguments); anything larger is abuse. */
export const MCP_MAX_REQUEST_BYTES = 1_000_000;

/**
 * Server instructions shown to MCP clients after initialize.
 *
 * Read-only wording would be inaccurate once write-scoped tokens exist: a write-scoped token can
 * only *propose* a governed action for human approval, and no tool writes or executes directly.
 */
export const MCP_SERVER_INSTRUCTIONS =
  "Fimmick ClientOps CRM. Read tools are scoped to the token owner's capabilities and row visibility. " +
  "Tokens with the write scope can call propose_manual_message_sent to propose recording a manual " +
  "message-send reference for human approval; a proposal only creates a pending request and never " +
  "writes or executes anything itself. list_my_proposals shows the token owner's proposal status. " +
  "Every action takes effect only after a human approver decides it.";

export const MCP_RATE_LIMIT_PER_MINUTE = 60;
export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;

/** Resolved bearer token plus the same authorization context the BFF builds for its profile. */
export type McpTokenContext = {
  token: McpTokenResolution;
  authorization: RequestAuthorization;
};

/** Audit record for one tools/call; safe fields only, never arguments or results. */
export type McpToolCallRecord = {
  tokenId: string;
  profileId: string;
  tool: string;
  status: "ok" | "error";
  errorCode: McpErrorCode | null;
  durationMs: number;
  /**
   * Redacted evidence of the arguments, derived here so the raw arguments never enter the audit
   * record or the trace table. The trace writer correlates on the digest.
   */
  argsDigest: string;
  argsKeys: string[];
  targetIds: string[];
};

/**
 * Everything `handleMcpRequest` needs from the runtime.
 *
 * Injected so the protocol and its tests never touch the token store or the database: the real
 * wiring resolves `fmcp_...` to a profile and builds the authorization context, the fakes
 * return a fixed context.
 */
export type McpProtocolDeps = {
  resolveToken(rawToken: string): Promise<McpTokenContext | null>;
  touchToken?(tokenId: string): Promise<unknown>;
  recordToolCall?(record: McpToolCallRecord): Promise<unknown>;
  /** Defaults to one module-level limiter, i.e. best-effort per serverless instance. */
  rateLimiter?: McpRateLimiter;
  /** Defaults to the module-level pre-authentication limiter (per client IP). */
  preAuthRateLimiter?: McpRateLimiter;
};

/**
 * Best-effort in-memory sliding-window limiter, keyed by token id.
 *
 * Serverless instances do not share memory, so this is a courtesy bound rather than a hard
 * quota; the token store stays authoritative for revocation and expiry.
 */
export class McpRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: { max?: number; windowMs?: number; now?: () => number } = {}) {
    this.max = options.max ?? MCP_RATE_LIMIT_PER_MINUTE;
    this.windowMs = options.windowMs ?? MCP_RATE_LIMIT_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  allow(key: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}

const sharedRateLimiter = new McpRateLimiter();

/**
 * Cheap per-client guard in front of the token lookup.
 *
 * A well-formed but unknown `fmcp_...` guess would otherwise reach an indexed hash lookup with no
 * throttle at all. This bucket is keyed by the edge-forwarded client IP, so it never reveals
 * whether a token exists, and it is intentionally looser than the authenticated quota.
 */
export const MCP_PRE_AUTH_RATE_LIMIT_PER_MINUTE = 300;
const sharedPreAuthRateLimiter = new McpRateLimiter({
  max: MCP_PRE_AUTH_RATE_LIMIT_PER_MINUTE,
});

/** Clears the module-level limiters; tests that exercise the defaults call this between cases. */
export function resetMcpRateLimitForTests(): void {
  sharedRateLimiter.reset();
  sharedPreAuthRateLimiter.reset();
}

/** First hop of the edge-forwarded client address, or a stable placeholder when absent. */
function clientRateLimitKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor ? `ip:${forwardedFor}` : "ip:unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function rpcResult(
  id: RequestId | null,
  result: unknown,
  headers?: Record<string, string>,
): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result }, 200, headers);
}

function rpcError(
  id: RequestId | null,
  code: number,
  message: string,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } }, status, headers);
}

function unauthorized(message: string): Response {
  return rpcError(null, SERVER_ERROR_CODE, message, 401, {
    "www-authenticate": 'Bearer realm="fimmick-clientops"',
  });
}

/** Reply with the client's version when this server speaks it, else the newest we support. */
export function negotiateMcpProtocolVersion(requested: string): McpProtocolVersion {
  return MCP_PROTOCOL_VERSIONS.includes(requested as McpProtocolVersion)
    ? (requested as McpProtocolVersion)
    : LATEST_MCP_PROTOCOL_VERSION;
}

/**
 * Builds one per-request MCP server over the tool registry.
 *
 * Each HTTP request gets a fresh server: the endpoint is stateless, so there is no initialize
 * handshake state to carry between POSTs and no session to leak across tokens.
 */
export function createMcpServer(context: McpToolContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );

  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.definition.name,
      {
        title: tool.definition.title,
        description: tool.definition.description,
        // The registry keeps the concrete zod type; the SDK's compat union does not accept
        // `ZodObject<ZodRawShape>` nominally, but structurally it is the object schema it wants.
        inputSchema: tool.inputSchema as unknown as AnySchema,
      },
      async (args: unknown) => {
        const { result } = await executeMcpTool(
          tool,
          context,
          (args ?? {}) as Record<string, unknown>,
        );
        return result;
      },
    );
  }

  return server;
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function handleInitialize(id: RequestId | null, params: unknown): Response {
  if (!isRecord(params) || typeof params.protocolVersion !== "string") {
    return rpcError(id, MCP_JSON_RPC_ERRORS.invalidParams, "Invalid params");
  }
  return rpcResult(id, {
    protocolVersion: negotiateMcpProtocolVersion(params.protocolVersion),
    capabilities: { tools: {} },
    serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    // Optional per the MCP spec; without it clients never see the server guidance, because this
    // handler (not the SDK server) owns the initialize reply.
    instructions: MCP_SERVER_INSTRUCTIONS,
  });
}

async function recordToolCall(
  deps: McpProtocolDeps,
  token: McpTokenResolution,
  params: unknown,
  response: JSONRPCMessage | null,
  startedAt: number,
): Promise<void> {
  const tool = isRecord(params) && typeof params.name === "string" ? params.name.slice(0, 80) : "-";
  // Arguments live only long enough to be digested; the canary in the protocol tests proves the
  // raw values never reach the audit record or the trace writer.
  const args = isRecord(params) && "arguments" in params ? params.arguments : undefined;
  const digest = toolArgumentDigest("mcp", tool, args);
  const known = MCP_TOOLS.some((entry) => entry.definition.name === tool);
  let errorCode: McpErrorCode | null = null;
  if (!known) errorCode = MCP_ERROR_CODES.invalidInput;
  else if (!response) errorCode = MCP_ERROR_CODES.internal;
  else if ("error" in response) errorCode = MCP_ERROR_CODES.invalidInput;
  else if ("result" in response) errorCode = toolErrorCodeFromResult(response.result);

  try {
    await deps.touchToken?.(token.tokenId);
  } catch (error) {
    console.error("[mcp] token touch failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }

  try {
    await deps.recordToolCall?.({
      tokenId: token.tokenId,
      profileId: token.profileId,
      tool,
      status: errorCode ? "error" : "ok",
      errorCode,
      durationMs: Math.max(0, Date.now() - startedAt),
      argsDigest: digest.sha256,
      argsKeys: digest.keys,
      targetIds: digest.targetIds,
    });
  } catch (error) {
    console.error("[mcp] tool-call audit failed", {
      tool,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

/**
 * Handles one stateless MCP HTTP request: auth, rate limit, JSON-RPC parse, one dispatch.
 *
 * The method routing is deliberately explicit: `initialize` is answered here so negotiation is
 * bounded by `MCP_PROTOCOL_VERSIONS` rather than the SDK's newest version, `ping` and
 * notifications return their protocol-empty responses, and the tool methods go through
 * `createMcpServer` so tools/list and tools/call share the registry's zod schemas.
 */
export async function handleMcpRequest(request: Request, deps: McpProtocolDeps): Promise<Response> {
  const httpMethod = request.method.toUpperCase();

  if (httpMethod === "OPTIONS") {
    // No CORS headers on purpose: browser clients are phase 2, and the endpoint stays
    // unreachable from a foreign origin by default.
    return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
  }
  if (httpMethod !== "POST") {
    return rpcError(null, MCP_JSON_RPC_ERRORS.invalidRequest, "Method not allowed", 405, {
      allow: "POST, OPTIONS",
    });
  }

  // Accept is intentionally not enforced: clients legitimately advertise both json and SSE.
  const preAuthLimiter = deps.preAuthRateLimiter ?? sharedPreAuthRateLimiter;
  if (!preAuthLimiter.allow(clientRateLimitKey(request))) {
    return rpcError(null, SERVER_ERROR_CODE, "Too many requests. Try again later.", 429, {
      "retry-after": "60",
    });
  }

  const rawToken = readBearerToken(request);
  if (!rawToken || !rawToken.startsWith(MCP_TOKEN_PREFIX)) {
    return unauthorized("Authentication required");
  }

  let tokenContext: McpTokenContext | null;
  try {
    tokenContext = await deps.resolveToken(rawToken);
  } catch (error) {
    console.error("[mcp] token resolution failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return rpcError(null, SERVER_ERROR_CODE, "Authentication is temporarily unavailable", 503);
  }
  if (!tokenContext) return unauthorized("Invalid or expired token");

  // Quota is per profile, not per token: minting another token must not buy another 60 req/min.
  const rateLimiter = deps.rateLimiter ?? sharedRateLimiter;
  if (!rateLimiter.allow(tokenContext.authorization.session.profile.id)) {
    return rpcError(null, SERVER_ERROR_CODE, "Rate limit exceeded. Try again later.", 429, {
      "retry-after": "60",
    });
  }

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return rpcError(null, MCP_JSON_RPC_ERRORS.invalidRequest, "Unsupported media type", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MCP_MAX_REQUEST_BYTES) {
    return rpcError(null, MCP_JSON_RPC_ERRORS.invalidRequest, "Request body too large", 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MCP_MAX_REQUEST_BYTES) {
      return rpcError(null, MCP_JSON_RPC_ERRORS.invalidRequest, "Request body too large", 413);
    }
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    return rpcError(null, MCP_JSON_RPC_ERRORS.parseError, "Parse error", 400);
  }
  if (Array.isArray(body)) {
    return rpcError(
      null,
      MCP_JSON_RPC_ERRORS.invalidRequest,
      "Batch requests are not supported",
      400,
    );
  }
  if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(null, MCP_JSON_RPC_ERRORS.invalidRequest, "Invalid request", 400);
  }

  const method = body.method;
  const id =
    typeof body.id === "string" || typeof body.id === "number" ? (body.id as RequestId) : null;
  const params = body.params;

  // 2025-06-18 clients repeat the negotiated version in a header; reject an unsupported value
  // rather than silently serving a different revision. `initialize` itself negotiates below.
  const protocolHeader = request.headers.get("mcp-protocol-version");
  if (protocolHeader && !MCP_PROTOCOL_VERSIONS.includes(protocolHeader as McpProtocolVersion)) {
    return rpcError(null, MCP_JSON_RPC_ERRORS.invalidRequest, "Unsupported protocol version", 400);
  }

  if (method === "initialize") return handleInitialize(id, params);
  if (method === "ping") return rpcResult(id, {});
  if (method.startsWith("notifications/")) {
    // Stateless: the initialized notification has no state to record, and nothing else here
    // subscribes to client notifications.
    return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  }
  if (method !== "tools/list" && method !== "tools/call") {
    return rpcError(id, MCP_JSON_RPC_ERRORS.methodNotFound, "Method not found");
  }

  const context: McpToolContext = {
    authorization: tokenContext.authorization,
    session: tokenContext.authorization.session,
    tokenId: tokenContext.token.tokenId,
    tokenName: tokenContext.token.tokenName,
    tokenPrefix: rawToken.slice(0, MCP_TOKEN_PREFIX_DISPLAY_LENGTH),
    scopes: tokenContext.token.scopes,
  };

  const server = createMcpServer(context);
  const transport = new McpRequestTransport();
  const startedAt = Date.now();
  let response: JSONRPCMessage | null = null;
  let dispatchFailed = false;
  try {
    await server.connect(transport);
    response = await transport.dispatch({
      jsonrpc: "2.0",
      id: id ?? 0,
      method,
      params,
    } as JSONRPCMessage);
  } catch (error) {
    dispatchFailed = true;
    console.error("[mcp] dispatch failed", {
      method,
      reason: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    try {
      await server.close();
    } catch {
      // Closing a stateless transport cannot fail in a way the response depends on.
    }
  }

  // Audit before replying so a 500/timeout is recorded too: the failures an operator most needs
  // during an incident must not be the ones missing from the ledger.
  if (method === "tools/call") {
    await recordToolCall(deps, tokenContext.token, params, response, startedAt);
  }

  if (dispatchFailed) {
    return rpcError(id, MCP_JSON_RPC_ERRORS.internalError, "Internal error", 500);
  }
  if (!response)
    return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  return jsonResponse(response);
}

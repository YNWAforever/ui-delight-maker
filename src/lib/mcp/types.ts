/**
 * Shared MCP connector contracts.
 *
 * Tokens are read-only by default: every token grants the same CRM reads its owner can see,
 * with the same capability and row-scope authorization. A token that also carries the `write`
 * scope may propose governed actions once those tools land; nothing an agent does writes to a
 * CRM record directly, and every write still requires a human approval.
 */

/** Every raw token starts with this so leaked values are recognisable in logs and scans. */
export const MCP_TOKEN_PREFIX = "fmcp_";

/** 32 random bytes rendered as 64 lowercase hex characters. */
export const MCP_TOKEN_HEX_LENGTH = 64;

/** What a user sees after creation: `fmcp_` + the first 8 hex characters (13 characters). */
export const MCP_TOKEN_PREFIX_DISPLAY_LENGTH = MCP_TOKEN_PREFIX.length + 8;

/**
 * Token scopes stored per token. `write` always implies `read`; it never grants a direct CRM
 * write, only the right to create human-reviewed proposals once those tools exist.
 */
export const MCP_TOKEN_SCOPES = ["read", "write"] as const;
export type McpTokenScope = (typeof MCP_TOKEN_SCOPES)[number];

/** Scope used when a mint request omits a selection: the safe read-only default. */
export const DEFAULT_MCP_TOKEN_SCOPE: McpTokenScope = "read";

/** Human labels for the token scope presets shown in Account → Agent connector. */
export const MCP_TOKEN_SCOPE_LABELS = {
  read: "Read-only",
  write: "Read + propose writes",
} as const satisfies Record<McpTokenScope, string>;

export function isMcpTokenScope(value: string): value is McpTokenScope {
  return (MCP_TOKEN_SCOPES as readonly string[]).includes(value);
}

/**
 * Canonicalizes a scope selection.
 *
 * Omitted means read-only (back-compat for existing mint calls). An explicit empty selection or
 * an unknown scope is rejected: a token without a usable scope would authenticate and then fail
 * every tool. `write` always includes `read` because proposing an action starts by reading the
 * record it targets.
 */
export function normalizeMcpTokenScopes(requested?: readonly string[]): McpTokenScope[] {
  if (requested === undefined) return [DEFAULT_MCP_TOKEN_SCOPE];
  if (requested.length === 0) throw new Error("An MCP token must have at least one scope");
  for (const scope of requested) {
    if (!isMcpTokenScope(scope)) throw new Error("Unknown MCP token scope");
  }

  const selected = new Set<McpTokenScope>(requested as readonly McpTokenScope[]);
  if (selected.has("write")) selected.add("read");
  return MCP_TOKEN_SCOPES.filter((scope) => selected.has(scope));
}

/** Label for a token's scope set; any write scope means the token can propose writes. */
export function mcpTokenScopeLabel(scopes: readonly McpTokenScope[]): string {
  return scopes.includes("write") ? MCP_TOKEN_SCOPE_LABELS.write : MCP_TOKEN_SCOPE_LABELS.read;
}

/** Active (unrevoked, unexpired) tokens one profile may hold; keeps the settings list bounded. */
export const MCP_MAX_ACTIVE_TOKENS_PER_PROFILE = 20;

/** The protocol revisions this server speaks, newest first. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export type McpProtocolVersion = (typeof MCP_PROTOCOL_VERSIONS)[number];
export const LATEST_MCP_PROTOCOL_VERSION: McpProtocolVersion = MCP_PROTOCOL_VERSIONS[0];

export const MCP_SERVER_NAME = "fimmick-clientops";
export const MCP_SERVER_VERSION = "1.0.0";

/** JSON-RPC 2.0 error codes used by the connector. */
export const MCP_JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

/** Stable, non-sensitive error codes returned by tools and logged in the audit trail. */
export const MCP_ERROR_CODES = {
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  notFound: "not_found",
  invalidInput: "invalid_input",
  rateLimited: "rate_limited",
  internal: "internal",
} as const;
export type McpErrorCode = (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];

/** Token metadata safe to show in the settings UI. */
export type McpTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: readonly McpTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

/** Returned exactly once, at creation time; the raw token is never persisted. */
export type McpTokenCreated = McpTokenSummary & { token: string };

/** Input accepted by the settings UI when minting a new connector token. */
export type CreateMcpTokenInput = {
  name: string;
  expiresInDays: 30 | 90 | 365 | null;
  /** Scope selection; omitted means read-only. `write` always includes `read`. */
  scopes?: readonly McpTokenScope[];
};

/** Result of resolving a bearer token to the acting profile. */
export type McpTokenResolution = {
  tokenId: string;
  tokenName: string;
  profileId: string;
  scopes: readonly McpTokenScope[];
};

/** A single MCP tool exposed to agents. */
export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  /** JSON Schema object passed to MCP clients; generated from a zod schema at the server. */
  inputSchema: Record<string, unknown>;
};

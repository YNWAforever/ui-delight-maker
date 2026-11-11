/**
 * Shared MCP connector contracts.
 *
 * The connector is deliberately read-only in v1: a token grants the same CRM reads the
 * signed-in user can see, with the same capability and row-scope authorization. Write tools
 * arrive later behind explicit scopes and the existing approval model.
 */

/** Every raw token starts with this so leaked values are recognisable in logs and scans. */
export const MCP_TOKEN_PREFIX = "fmcp_";

/** 32 random bytes rendered as 64 lowercase hex characters. */
export const MCP_TOKEN_HEX_LENGTH = 64;

/** What a user sees after creation: `fmcp_` + the first 8 hex characters (13 characters). */
export const MCP_TOKEN_PREFIX_DISPLAY_LENGTH = MCP_TOKEN_PREFIX.length + 8;

/** Token scopes stored per token. v1 issues `read` only; `write` is reserved. */
export const MCP_TOKEN_SCOPES = ["read", "write"] as const;
export type McpTokenScope = (typeof MCP_TOKEN_SCOPES)[number];

export const DEFAULT_MCP_TOKEN_SCOPE: McpTokenScope = "read";

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
};

/** Result of resolving a bearer token to the acting profile. */
export type McpTokenResolution = {
  tokenId: string;
  tokenName: string;
  profileId: string;
  scopes: readonly McpTokenScope[];
};

/** A single read tool exposed to agents. */
export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  /** JSON Schema object passed to MCP clients; generated from a zod schema at the server. */
  inputSchema: Record<string, unknown>;
};

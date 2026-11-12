import { createHash, randomBytes } from "node:crypto";
import {
  isMcpTokenScope,
  MCP_MAX_ACTIVE_TOKENS_PER_PROFILE,
  MCP_TOKEN_HEX_LENGTH,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_PREFIX_DISPLAY_LENGTH,
  normalizeMcpTokenScopes,
  type CreateMcpTokenInput,
  type McpErrorCode,
  type McpTokenCreated,
  type McpTokenResolution,
  type McpTokenScope,
  type McpTokenSummary,
} from "@/lib/mcp/types";
import { query, queryOne } from "@/server/db/neon.server";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One day is not a token lifetime; the settings UI offers months or "never". */
const MCP_TOKEN_NAME_MAX_LENGTH = 80;

/**
 * The exact shape a bearer header must carry: `fmcp_` plus 64 lowercase hex characters.
 *
 * Checked before hashing so a malformed header costs no database round-trip, and kept as a
 * RegExp built from the shared constants so the format cannot drift from `src/lib/mcp/types.ts`.
 */
const MCP_ACCESS_TOKEN_PATTERN = new RegExp(
  `^${MCP_TOKEN_PREFIX}[0-9a-f]{${MCP_TOKEN_HEX_LENGTH}}$`,
);

/** Columns every read returns, so the API shapes cannot drift between create/list. */
const MCP_ACCESS_TOKEN_COLUMNS = `
  id, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at
`;

type McpAccessTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type McpAccessTokenResolutionRow = {
  token_id: string;
  token_name: string;
  profile_id: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  profile_status: string;
};

/**
 * The raw token is `fmcp_` + 64 lowercase hex characters (32 random bytes), so the display
 * prefix is `fmcp_` plus the first 8 hex characters (13 characters). Randomness lives here, not
 * in the caller, because every mint path must use the same 256-bit source.
 */
function generateMcpAccessToken() {
  return `${MCP_TOKEN_PREFIX}${randomBytes(MCP_TOKEN_HEX_LENGTH / 2).toString("hex")}`;
}

/**
 * SHA-256 of the raw token. Only this value reaches the database; the raw token is returned
 * once to the creating user and never logged or stored.
 */
export function hashMcpAccessToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function toMcpTokenSummary(row: McpAccessTokenRow): McpTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: row.scopes.filter(isMcpTokenScope),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Mints a token and persists only its hash, display prefix and scopes.
 *
 * Scope selection is canonicalized here rather than trusted from the caller: the UI validator
 * rejects unknown scopes first, but the store is the server-side boundary that a future mint
 * path cannot bypass. Omitted scopes mean read-only; `write` always includes `read`.
 */
export async function createMcpAccessToken(input: {
  profileId: string;
  name: string;
  expiresInDays: CreateMcpTokenInput["expiresInDays"];
  scopes?: CreateMcpTokenInput["scopes"];
}): Promise<McpTokenCreated> {
  const name = input.name.trim();
  if (!name || name.length > MCP_TOKEN_NAME_MAX_LENGTH) {
    throw new Error(`MCP token name must be 1-${MCP_TOKEN_NAME_MAX_LENGTH} characters`);
  }
  const scopes = normalizeMcpTokenScopes(input.scopes);

  const rawToken = generateMcpAccessToken();
  // `now()` in the insert default and this instant can differ by the app/database clock skew,
  // so the expiry is computed from the application clock and is days — never seconds — away.
  const expiresAt =
    input.expiresInDays === null
      ? null
      : new Date(Date.now() + input.expiresInDays * MS_PER_DAY).toISOString();
  const row = await queryOne<McpAccessTokenRow>(
    `
      insert into mcp_access_tokens (profile_id, name, token_prefix, token_hash, expires_at, scopes)
      select $1, $2, $3, $4, $5, $6::text[]
      where (
        select count(*)
        from mcp_access_tokens
        where profile_id = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
      ) < $7
      returning ${MCP_ACCESS_TOKEN_COLUMNS}
    `,
    [
      input.profileId,
      name,
      rawToken.slice(0, MCP_TOKEN_PREFIX_DISPLAY_LENGTH),
      hashMcpAccessToken(rawToken),
      expiresAt,
      scopes,
      MCP_MAX_ACTIVE_TOKENS_PER_PROFILE,
    ],
  );

  if (!row) {
    // The guarded insert is the only way this statement returns no row.
    throw new Error(
      `You already have ${MCP_MAX_ACTIVE_TOKENS_PER_PROFILE} active agent tokens. Revoke one before creating another.`,
    );
  }

  return { ...toMcpTokenSummary(row), token: rawToken };
}

/** Newest first, including revoked and expired rows: the settings list is a history. */
export async function listMcpAccessTokens(profileId: string): Promise<McpTokenSummary[]> {
  const rows = await query<McpAccessTokenRow>(
    `
      select ${MCP_ACCESS_TOKEN_COLUMNS}
      from mcp_access_tokens
      where profile_id = $1
      order by created_at desc, id desc
    `,
    [profileId],
  );

  return rows.map(toMcpTokenSummary);
}

/**
 * Revokes one of the caller's own tokens. Repeating the call succeeds without moving
 * `revoked_at`, so an idempotent retry cannot rewrite the audit-visible revocation time, and
 * another profile's token is indistinguishable from a missing one.
 */
export async function revokeMcpAccessToken(profileId: string, tokenId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
      update mcp_access_tokens
      set revoked_at = coalesce(revoked_at, now())
      where id = $1 and profile_id = $2
      returning id
    `,
    [tokenId, profileId],
  );

  return rows.length > 0;
}

/**
 * Resolves a bearer token to the acting profile.
 *
 * The `join profiles` and its status filter are part of the query, not a follow-up read:
 * `getProfileById` does not filter status, and an invited, suspended or deactivated profile
 * must never authenticate a connector request. Revocation and expiry are filtered in SQL as
 * well; the checks after the query repeat them so this module is the one place the decision is
 * documented and unit tests can prove each rejection independently of the database.
 */
export async function resolveMcpAccessToken(rawToken: string): Promise<McpTokenResolution | null> {
  if (!MCP_ACCESS_TOKEN_PATTERN.test(rawToken)) return null;

  const row = await queryOne<McpAccessTokenResolutionRow>(
    `
      select
        t.id as token_id,
        t.name as token_name,
        t.profile_id,
        t.scopes,
        t.expires_at,
        t.revoked_at,
        p.status as profile_status
      from mcp_access_tokens t
      join profiles p on p.id = t.profile_id
      where t.token_hash = $1
        and t.revoked_at is null
        and (t.expires_at is null or t.expires_at > now())
        and p.status = 'active'
    `,
    [hashMcpAccessToken(rawToken)],
  );

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (row.profile_status !== "active") return null;
  if (row.expires_at !== null && Date.parse(row.expires_at) <= Date.now()) return null;

  const scopes = row.scopes.filter(isMcpTokenScope);
  if (scopes.length === 0) return null;

  return {
    tokenId: row.token_id,
    tokenName: row.token_name,
    profileId: row.profile_id,
    scopes,
  };
}

/**
 * Records last use at most once per five minutes.
 *
 * Every connector request would otherwise write a row version and an index entry, turning a
 * read-only integration into a write amplifier; the settings UI only needs to answer "was
 * this token used recently", which five-minute resolution already does.
 */
export async function touchMcpAccessToken(tokenId: string): Promise<void> {
  await query(
    `
      update mcp_access_tokens
      set last_used_at = now()
      where id = $1
        and (last_used_at is null or last_used_at < now() - interval '5 minutes')
    `,
    [tokenId],
  );
}

export type McpToolCallStatus = "ok" | "error";

export type McpToolCallRecord = {
  /** Null after the token row is deleted; the audit trail outlives the credential. */
  tokenId: string | null;
  /** Null after the profile row is deleted; the audit trail outlives the user. */
  profileId: string | null;
  tool: string;
  status: McpToolCallStatus;
  errorCode?: McpErrorCode | null;
  durationMs?: number | null;
};

/**
 * Best-effort audit insert: a connector read must never fail because its telemetry row could
 * not be written, so failures are logged and swallowed. Only the tool name, outcome and
 * duration are stored — never arguments or results, because those can contain client PII.
 *
 * Returns the inserted row id so the MCP trace seam can link the unified `agent_tool_calls` row
 * to this audit row; `null` means no audit row exists and the trace must be skipped rather than
 * recorded detached from the call it describes.
 */
export async function recordMcpToolCall(input: McpToolCallRecord): Promise<{ id: string } | null> {
  const tool = input.tool.trim().slice(0, MCP_TOKEN_NAME_MAX_LENGTH);
  if (!tool) return null;

  const durationMs =
    input.durationMs === null || input.durationMs === undefined
      ? null
      : Math.max(0, Math.trunc(input.durationMs));

  try {
    const row = await queryOne<{ id: string }>(
      `
        insert into mcp_tool_calls (token_id, profile_id, tool, status, error_code, duration_ms)
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [input.tokenId, input.profileId, tool, input.status, input.errorCode ?? null, durationMs],
    );
    return row ?? null;
  } catch (error) {
    console.error(
      "Failed to record MCP tool call",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
}

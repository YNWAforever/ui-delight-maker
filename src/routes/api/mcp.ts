import { createFileRoute } from "@tanstack/react-router";
import { loadAuthorizationForProfile } from "@/server/auth/authorization.server";
import { handleMcpRequest, type McpProtocolDeps } from "@/server/mcp/protocol.server";
import { recordMcpToolCallTrace } from "@/server/mcp/tool-call-trace.server";
import { resolveMcpAccessToken, touchMcpAccessToken } from "@/server/mcp/tokens.server";
import { getProfileById } from "@/server/repositories/profiles";

/**
 * Real dependencies for the stateless MCP endpoint.
 *
 * Identity is always resolved from the bearer token: the token store hashes and validates the
 * credential, the profile row is re-read and status-checked, and the authorization context is
 * built by the same helper the cookie-authenticated BFF uses. Tool arguments never choose an
 * identity.
 */
const mcpDeps: McpProtocolDeps = {
  async resolveToken(rawToken) {
    const token = await resolveMcpAccessToken(rawToken);
    if (!token) return null;

    const profile = await getProfileById(token.profileId);
    if (!profile || profile.status !== "active") return null;

    return { token, authorization: await loadAuthorizationForProfile(profile) };
  },
  touchToken: touchMcpAccessToken,
  // One seam writes both the MCP audit row and the linked unified trace row; tracing is
  // best-effort and can never change the MCP response.
  recordToolCall: recordMcpToolCallTrace,
};

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request, mcpDeps),
      GET: ({ request }) => handleMcpRequest(request, mcpDeps),
      DELETE: ({ request }) => handleMcpRequest(request, mcpDeps),
      OPTIONS: ({ request }) => handleMcpRequest(request, mcpDeps),
    },
  },
});

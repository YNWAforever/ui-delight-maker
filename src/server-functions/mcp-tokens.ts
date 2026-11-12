import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { MCP_TOKEN_SCOPES, normalizeMcpTokenScopes } from "@/lib/mcp/types";
import {
  createMcpAccessToken,
  listMcpAccessTokens,
  revokeMcpAccessToken,
} from "@/server/mcp/tokens.server";

const createMcpTokenSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
  /**
   * Scope selection from the token dialog. Unknown scopes are rejected by the enum; a bare
   * `["write"]` is normalized below to `["read","write"]` because write implies read.
   */
  scopes: z.array(z.enum(MCP_TOKEN_SCOPES)).min(1).optional(),
});
const revokeMcpTokenSchema = z.strictObject({ tokenId: z.uuid() });

// Connector tokens are personal: every function here reads or writes only the signed-in
// profile's own rows and never accepts a profile id from the client.
export const getMyMcpTokens = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireNeonAuthSession();
  return listMcpAccessTokens(session.profile.id);
});

export const createMyMcpToken = createServerFn({ method: "POST" })
  .validator((data: unknown) => createMcpTokenSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return createMcpAccessToken({
      profileId: session.profile.id,
      name: data.name,
      expiresInDays: data.expiresInDays,
      // Canonical here so the value the store persists and the value returned to the UI agree.
      scopes: normalizeMcpTokenScopes(data.scopes),
    });
  });

export const revokeMyMcpToken = createServerFn({ method: "POST" })
  .validator((data: unknown) => revokeMcpTokenSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const revoked = await revokeMcpAccessToken(session.profile.id, data.tokenId);
    return { revoked };
  });

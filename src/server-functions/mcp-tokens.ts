import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createMcpAccessToken,
  listMcpAccessTokens,
  revokeMcpAccessToken,
} from "@/server/mcp/tokens.server";

const createMcpTokenSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
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
    });
  });

export const revokeMyMcpToken = createServerFn({ method: "POST" })
  .validator((data: unknown) => revokeMcpTokenSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const revoked = await revokeMcpAccessToken(session.profile.id, data.tokenId);
    return { revoked };
  });

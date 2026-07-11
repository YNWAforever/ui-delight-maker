import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { searchWorkspace as searchWorkspaceInNeon } from "@/server/repositories/workspace-search";

export const searchWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { query: string; limit?: number })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return searchWorkspaceInNeon(data.query.trim(), data.limit ?? 20);
  });

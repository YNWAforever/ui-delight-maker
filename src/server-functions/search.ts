import { createServerFn } from "@tanstack/react-start";
import { requireAnyCapability } from "@/server/auth/authorization.server";
import { searchWorkspace as searchWorkspaceInNeon } from "@/server/repositories/workspace-search";

export const searchWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { query: string; limit?: number })
  .handler(async ({ data }) => {
    // The query spans accounts, account_contacts, leads, quotes and clients, so holding any
    // one of those view capabilities is enough to search. requireAnyCapability also brings
    // the permission-override and manager-scope checks a bare session check skipped.
    await requireAnyCapability(["accounts.view", "contacts.view", "leads.view", "quotes.view"]);
    return searchWorkspaceInNeon(data.query.trim(), data.limit ?? 20);
  });

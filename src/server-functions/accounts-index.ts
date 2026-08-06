import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import type { AccountPageFilters } from "@/server/repositories/accounts";
import { getAccountsIndexReadModel } from "@/server/read-models/accounts-index";

export const getAccountsIndex = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as AccountPageFilters)
  .handler(async ({ data }) => {
    const session = await requireCapability("accounts.view");
    return getAccountsIndexReadModel(session.profile.id, data);
  });

export const getAccountsIndexRead = getAccountsIndex;

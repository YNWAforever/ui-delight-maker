import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createAccount as createAccountInNeon,
  getAccount as getAccountInNeon,
  listAccounts,
  type AccountFilters,
  type CreateAccountInput,
  updateAccount as updateAccountInNeon,
} from "@/server/repositories/accounts";
import type { Account } from "@/lib/types";

export const getAccounts = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as AccountFilters)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listAccounts(data);
  });

export const getAccount = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getAccountInNeon(data.id);
  });

export const createAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAccountInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createAccountInNeon(data);
  });

export const updateAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Account> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateAccountInNeon(data.id, data.updates);
  });

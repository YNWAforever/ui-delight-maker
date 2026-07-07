import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createAccountContact as createAccountContactInNeon,
  listAccountContacts,
  updateAccountContact as updateAccountContactInNeon,
  type CreateAccountContactInput,
} from "@/server/repositories/account-contacts";
import type { AccountContact } from "@/lib/types";

export const getAccountContacts = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { accountId: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listAccountContacts(data.accountId);
  });

export const createAccountContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAccountContactInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createAccountContactInNeon(data);
  });

export const updateAccountContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<AccountContact> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateAccountContactInNeon(data.id, data.updates);
  });

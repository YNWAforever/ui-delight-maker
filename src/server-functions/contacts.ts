import { requireCapability } from "@/server/auth/authorization.server";
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
    await requireCapability("contacts.view", {
      resourceType: "account",
      resourceId: data.accountId,
    });
    await requireNeonAuthSession();
    return listAccountContacts(data.accountId);
  });

export const createAccountContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAccountContactInput)
  .handler(async ({ data }) => {
    await requireCapability("contacts.create", {
      resourceType: "account",
      resourceId: data.account_id,
    });
    await requireNeonAuthSession();
    return createAccountContactInNeon(data);
  });

export const updateAccountContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<AccountContact> })
  .handler(async ({ data }) => {
    await requireCapability("contacts.update", {
      resourceType: "account_contact",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    return updateAccountContactInNeon(data.id, data.updates);
  });

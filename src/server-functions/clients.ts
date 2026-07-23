import { requireCapability } from "@/server/auth/authorization.server";
// src/server-functions/clients.ts
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createClient as createClientInNeon,
  getClient as getClientFromNeon,
  listClients,
  listClientsPage,
  type ClientFilters,
  type ClientPageFilters,
  updateClient as updateClientInNeon,
} from "@/server/repositories/clients";
import type { Client } from "@/lib/types";
type CreateClientInput = Pick<Client, "company_name"> &
  Partial<
    Pick<
      Client,
      | "industry"
      | "tier"
      | "account_owner"
      | "health_score"
      | "renewal_date"
      | "arr"
      | "account_id"
      | "primary_contact_id"
    >
  >;

export const getClients = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as ClientFilters)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    await requireNeonAuthSession();
    return listClients(data);
  });

export const getClientsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as ClientPageFilters)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    await requireNeonAuthSession();
    return listClientsPage(data);
  });

export const getClient = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view", { resourceType: "client", resourceId: data.id });
    await requireNeonAuthSession();
    return getClientFromNeon(data.id);
  });

export const createClient = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateClientInput)
  .handler(async ({ data }) => {
    await requireCapability("accounts.create");
    await requireNeonAuthSession();
    return createClientInNeon(data);
  });

export const updateClient = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Client> })
  .handler(async ({ data }) => {
    await requireCapability("accounts.update", { resourceType: "client", resourceId: data.id });
    await requireNeonAuthSession();
    return updateClientInNeon(data.id, data.updates);
  });

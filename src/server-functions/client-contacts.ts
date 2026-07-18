import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createClientContact as createClientContactInNeon,
  deleteClientContact as deleteClientContactInNeon,
  listClientContacts,
  updateClientContact as updateClientContactInNeon,
} from "@/server/repositories/client-contacts";
import type { ClientContact } from "@/lib/types";

export const getClientContacts = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { clientId: string })
  .handler(async ({ data }) => {
    await requireCapability("contacts.view", { resourceType: "client", resourceId: data.clientId });
    await requireNeonAuthSession();
    return listClientContacts(data.clientId);
  });

export const createClientContact = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as Pick<ClientContact, "client_id" | "name"> &
        Partial<Pick<ClientContact, "title" | "email" | "phone" | "is_primary">>,
  )
  .handler(async ({ data }) => {
    await requireCapability("contacts.create", {
      resourceType: "client",
      resourceId: data.client_id,
    });
    await requireNeonAuthSession();
    return createClientContactInNeon(data);
  });

export const updateClientContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<ClientContact> })
  .handler(async ({ data }) => {
    await requireCapability("contacts.update", {
      resourceType: "client_contact",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    return updateClientContactInNeon(data.id, data.updates);
  });

export const deleteClientContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("contacts.delete", {
      resourceType: "client_contact",
      resourceId: data.id,
    });
    await requireNeonAuthSession();
    await deleteClientContactInNeon(data.id);
    return { ok: true };
  });

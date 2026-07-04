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
    await requireNeonAuthSession();
    return createClientContactInNeon(data);
  });

export const updateClientContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<ClientContact> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateClientContactInNeon(data.id, data.updates);
  });

export const deleteClientContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    await deleteClientContactInNeon(data.id);
    return { ok: true };
  });

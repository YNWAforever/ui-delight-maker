import { buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { ClientContact } from "@/lib/types";

type CreateClientContactInput = Pick<ClientContact, "client_id" | "name"> &
  Partial<Pick<ClientContact, "title" | "email" | "phone" | "is_primary">>;

const contactUpdateColumns: Array<keyof Partial<ClientContact> & string> = [
  "name",
  "title",
  "email",
  "phone",
  "is_primary",
];

export async function listClientContacts(clientId: string) {
  return query<ClientContact>(
    "select * from client_contacts where client_id = $1 order by is_primary desc, name",
    [clientId],
  );
}

export async function createClientContact(input: CreateClientContactInput, db?: Queryable) {
  const contact = await queryOne<ClientContact>(
    `
      insert into client_contacts (client_id, name, title, email, phone, is_primary)
      values ($1, $2, $3, $4, $5, coalesce($6, false))
      returning *
    `,
    [
      input.client_id,
      input.name,
      input.title ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.is_primary ?? null,
    ],
    db,
  );

  if (!contact) throw new Error("Failed to create client contact");
  return contact;
}

export async function updateClientContact(id: string, updates: Partial<ClientContact>) {
  const update = buildUpdate(updates, contactUpdateColumns, 1);
  const contact = await queryOne<ClientContact>(
    `
      update client_contacts
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
  );

  if (!contact) throw new Error("Client contact not found");
  return contact;
}

export async function deleteClientContact(id: string) {
  await query("delete from client_contacts where id = $1", [id]);
}

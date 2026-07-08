import { buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { AccountContact } from "@/lib/types";

export type CreateAccountContactInput = Pick<AccountContact, "account_id" | "name"> &
  Partial<
    Pick<
      AccountContact,
      | "title"
      | "department"
      | "email"
      | "phone"
      | "whatsapp"
      | "linkedin_url"
      | "preferred_channel"
      | "relationship_role"
      | "influence_level"
      | "sentiment"
      | "relationship_strength"
      | "is_primary"
      | "notes"
      | "last_contacted_at"
    >
  >;

const contactUpdateColumns: Array<keyof Partial<AccountContact> & string> = [
  "name",
  "title",
  "department",
  "email",
  "phone",
  "whatsapp",
  "linkedin_url",
  "preferred_channel",
  "relationship_role",
  "influence_level",
  "sentiment",
  "relationship_strength",
  "is_primary",
  "active",
  "notes",
  "last_contacted_at",
];

export async function listAccountContacts(accountId: string) {
  return query<AccountContact>(
    `
      select *
      from account_contacts
      where account_id = $1
      order by
        case relationship_role
          when 'decision_maker' then 1
          when 'champion' then 2
          when 'buyer' then 3
          else 4
        end,
        is_primary desc,
        name
    `,
    [accountId],
  );
}

export async function createAccountContact(input: CreateAccountContactInput, db?: Queryable) {
  const contact = await queryOne<AccountContact>(
    `
      insert into account_contacts
        (account_id, name, title, department, email, phone, whatsapp, linkedin_url, preferred_channel, relationship_role, influence_level, sentiment, relationship_strength, is_primary, notes, last_contacted_at)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'unknown'), coalesce($10, 'other'), coalesce($11, 'medium'), coalesce($12, 'unknown'), coalesce($13, 'developing'), coalesce($14, false), $15, $16)
      returning *
    `,
    [
      input.account_id,
      input.name,
      input.title ?? null,
      input.department ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.whatsapp ?? null,
      input.linkedin_url ?? null,
      input.preferred_channel ?? null,
      input.relationship_role ?? null,
      input.influence_level ?? null,
      input.sentiment ?? null,
      input.relationship_strength ?? null,
      input.is_primary ?? null,
      input.notes ?? null,
      input.last_contacted_at ?? null,
    ],
    db,
  );

  if (!contact) throw new Error("Failed to create account contact");
  return contact;
}

export async function updateAccountContact(
  id: string,
  updates: Partial<AccountContact>,
  db?: Queryable,
) {
  const update = buildUpdate(updates, contactUpdateColumns, 1);
  const contact = await queryOne<AccountContact>(
    `
      update account_contacts
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
    db,
  );

  if (!contact) throw new Error("Account contact not found");
  return contact;
}

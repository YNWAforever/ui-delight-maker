import type { EventImportValidRow } from "@/lib/relationship/event-import";
import { transaction } from "@/server/db/neon.server";
import { createAccountContact } from "@/server/repositories/account-contacts";
import { createAccount } from "@/server/repositories/accounts";
import { createCampaignMember } from "@/server/repositories/campaigns";

export type CommitEventImportInput = {
  campaignId: string;
  rows: EventImportValidRow[];
  owner: string | null;
};

export type EventImportCommitResult = {
  createdAccounts: number;
  createdContacts: number;
  createdMembers: number;
};

export async function commitEventImport(
  input: CommitEventImportInput,
): Promise<EventImportCommitResult> {
  return transaction(async (db) => {
    let createdAccounts = 0;
    let createdContacts = 0;
    let createdMembers = 0;

    for (const row of input.rows) {
      let accountId = row.account_match.kind === "matched" ? row.account_match.accountId : null;

      if (!accountId && row.company_name.trim()) {
        const account = await createAccount(
          {
            name: row.company_name.trim(),
            lifecycle_stage: "prospect",
            account_owner: input.owner,
            source: "event",
          },
          db,
        );
        accountId = account.id;
        createdAccounts += 1;
      }

      const contact =
        accountId && row.contact_name.trim()
          ? await createAccountContact(
              {
                account_id: accountId,
                name: row.contact_name.trim(),
                email: row.email || null,
                phone: row.phone || null,
                relationship_role: "event_attendee",
                preferred_channel: row.email ? "email" : "unknown",
              },
              db,
            )
          : null;

      if (contact) {
        createdContacts += 1;
      }

      await createCampaignMember(
        {
          campaign_id: input.campaignId,
          account_id: accountId,
          contact_id: contact?.id ?? null,
          raw_company_name: row.company_name,
          raw_contact_name: row.contact_name,
          raw_email: row.email,
          raw_phone: row.phone,
          attendee_status: row.attendee_status,
          interests: row.interests,
          follow_up_owner: input.owner,
          notes: row.notes,
        },
        db,
      );
      createdMembers += 1;
    }

    return { createdAccounts, createdContacts, createdMembers };
  });
}

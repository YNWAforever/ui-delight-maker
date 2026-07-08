import { buildRelationshipSignals } from "../../src/lib/relationship/signals";
import type { Account, CampaignMember, Engagement, Product, Quote } from "../../src/lib/types";
import { query } from "../../src/server/db/neon.server";
import { listAccountContacts } from "../../src/server/repositories/account-contacts";
import { upsertRelationshipSignals } from "../../src/server/repositories/relationship-signals";

export async function generateRelationshipSignals() {
  const [accounts, products] = await Promise.all([
    query<Account>("select * from accounts order by coalesce(last_activity_at, created_at) desc"),
    query<Product>("select * from products where active = true", []),
  ]);
  let generated = 0;

  for (const account of accounts) {
    const [contacts, engagements, quotes, campaignMembers] = await Promise.all([
      listAccountContacts(account.id),
      query<Engagement>(
        `
          select e.*
          from engagements e
          join clients c on c.id = e.client_id
          where c.account_id = $1
        `,
        [account.id],
      ),
      query<Quote>("select * from quotes where account_id = $1", [account.id]),
      query<CampaignMember>("select * from campaign_members where account_id = $1", [account.id]),
    ]);

    const drafts = buildRelationshipSignals({
      account,
      contacts,
      engagements,
      quotes,
      campaignMembers,
      products,
      now: new Date(),
    });
    const rows = await upsertRelationshipSignals(account.id, drafts);
    generated += rows.length;
  }

  console.log(`Generated or updated ${generated} relationship signal${generated === 1 ? "" : "s"}.`);
}

async function main() {
  await generateRelationshipSignals();
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

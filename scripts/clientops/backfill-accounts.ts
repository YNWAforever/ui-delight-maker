import { query, queryOne, transaction } from "../../src/server/db/neon.server";
import type { Client } from "../../src/lib/types";

type AccountRow = { id: string; name: string };

export async function backfillAccounts() {
  const clients = await query<Client>(
    "select * from clients where account_id is null order by company_name",
  );
  let linked = 0;

  await transaction(async (db) => {
    for (const client of clients) {
      const existing = await queryOne<AccountRow>(
        "select id, name from accounts where lower(name) = lower($1)",
        [client.company_name],
        db,
      );
      const account =
        existing ??
        (await queryOne<AccountRow>(
          `
            insert into accounts (name, industry, tier, lifecycle_stage, account_owner)
            values ($1, $2, $3, 'active_client', $4)
            returning id, name
          `,
          [client.company_name, client.industry, client.tier, client.account_owner],
          db,
        ));

      if (!account) {
        throw new Error(`Failed to create account for ${client.company_name}`);
      }

      await db.query("update clients set account_id = $1 where id = $2", [account.id, client.id]);
      linked += 1;
    }
  });

  console.log(`Linked ${linked} client${linked === 1 ? "" : "s"} to accounts.`);
}

async function main() {
  await backfillAccounts();
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

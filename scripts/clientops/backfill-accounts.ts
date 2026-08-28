import { query, queryOne, transaction } from "../../src/server/db/neon.server";
import type { Client } from "../../src/lib/types";

type AccountRow = { id: string; name: string };
type Queryable = { query: (text: string, values?: readonly unknown[]) => Promise<unknown> };

export type BackfillOptions = { apply?: boolean; confirmMatches?: boolean };

export type BackfillReport = {
  toCreate: Array<{ clientId: string; companyName: string }>;
  toMatch: Array<{ clientId: string; companyName: string; accountId: string; accountName: string }>;
  created: number;
  matched: number;
};

type CreatePlan = { client: Client };
type MatchPlan = { client: Client; account: AccountRow };

const APPLY_COMMAND = "bun scripts/clientops/backfill-accounts.ts --apply";
const CONFIRM_COMMAND = "bun scripts/clientops/backfill-accounts.ts --apply --confirm-matches";

/**
 * Plan the backfill without writing anything.
 *
 * The split between "create" and "match" is the whole point of this script. A create takes
 * the client's *own* company_name/industry/tier/account_owner and promotes it to its own
 * account — nothing is inferred. A match links the client to a *pre-existing* account
 * solely because `lower(name) = lower(company_name)`, which is inference by company name:
 * the pattern the frontend-revision integrity audit found the product must not do
 * unsupervised. A client can be silently adopted into an unrelated account that happens to
 * share a name, so matches are proposals for a human, never something a single flag does.
 */
async function planBackfill(): Promise<{ creates: CreatePlan[]; matches: MatchPlan[] }> {
  const clients = await query<Client>(
    "select * from clients where account_id is null order by company_name",
  );

  const creates: CreatePlan[] = [];
  const matches: MatchPlan[] = [];

  for (const client of clients) {
    const existing = await queryOne<AccountRow>(
      "select id, name from accounts where lower(name) = lower($1)",
      [client.company_name],
    );

    if (existing) {
      matches.push({ client, account: existing });
    } else {
      creates.push({ client });
    }
  }

  return { creates, matches };
}

/**
 * `accounts_lower_name_unique_idx` (migration 003) makes `lower(name)` unique. Two
 * account-less clients sharing a company name therefore cannot both be created.
 *
 * The old script never hit this, because it re-queried inside its write loop and so
 * silently adopted the second client into the account it had just made for the first —
 * an inferred link, made without anyone asking for it. Refusing up front is the honest
 * replacement: the operator is told which names collide instead of reading a constraint
 * violation from the middle of a rolled-back transaction.
 */
function findCollidingCreates(creates: CreatePlan[]): string[] {
  const seen = new Set<string>();
  const collisions = new Set<string>();

  for (const { client } of creates) {
    const key = (client.company_name ?? "").toLowerCase();
    if (seen.has(key)) {
      collisions.add(client.company_name);
    }
    seen.add(key);
  }

  return [...collisions];
}

/**
 * Without this row the operation is unauditable, which is half of what was wrong here.
 *
 * The matching criterion is `lower(name) = lower(company_name)`, so every link the match
 * path makes satisfies that predicate *by construction* — the query you would naturally
 * reach for to audit it returns correct and incorrect links identically. Recording the
 * mode at the time of the write is the only thing that lets anyone tell them apart later.
 */
async function recordLink(
  db: Queryable,
  client: Client,
  account: AccountRow,
  mode: "created" | "matched",
) {
  await db.query(
    `
        insert into activity_logs (actor_type, actor_id, actor_name, action, object_type, object_id, diff_data)
        values ('user', $1, $2, $3, 'client', $4, $5::jsonb)
      `,
    [
      "script:clientops:backfill-accounts",
      "backfill-accounts script",
      `backfill-accounts ${mode} account link`,
      client.id,
      JSON.stringify({
        mode,
        client_id: client.id,
        company_name: client.company_name,
        account_id: account.id,
        account_name: account.name,
      }),
    ],
  );
}

function printPlan(report: BackfillReport) {
  console.log("Client account backfill");
  console.log("=======================");
  console.log(`Clients with no account:     ${report.toCreate.length + report.toMatch.length}`);
  console.log(`  would create an account:   ${report.toCreate.length}`);
  console.log(`  would match an existing:   ${report.toMatch.length}`);

  if (report.toCreate.length > 0) {
    const sample = report.toCreate.slice(0, 10);
    console.log("");
    console.log(`Accounts that would be created (${sample.length} of ${report.toCreate.length}):`);
    for (const row of sample) {
      console.log(`  ${row.companyName} (client ${row.clientId})`);
    }
  }

  if (report.toMatch.length > 0) {
    const sample = report.toMatch.slice(0, 10);
    console.log("");
    console.log(
      `Proposed matches, for human review (${sample.length} of ${report.toMatch.length}):`,
    );
    for (const row of sample) {
      console.log(
        `  ${row.companyName} (client ${row.clientId}) -> ${row.accountName} (${row.accountId})`,
      );
    }
    console.log("");
    console.log("Each match above is inferred from the company name alone. Confirm that the");
    console.log("account really is this client's before applying any of them.");
  }
}

/**
 * Plan the backfill, and write only what the caller explicitly asked for.
 *
 * - no options        — dry run. Nothing is written.
 * - apply             — creates only. Matches stay proposals.
 * - apply + confirm   — matches are performed too.
 */
export async function backfillAccounts(options: BackfillOptions = {}): Promise<BackfillReport> {
  const apply = options.apply ?? false;
  const confirmMatches = options.confirmMatches ?? false;

  const { creates, matches } = await planBackfill();

  const report: BackfillReport = {
    toCreate: creates.map(({ client }) => ({
      clientId: client.id,
      companyName: client.company_name,
    })),
    toMatch: matches.map(({ client, account }) => ({
      clientId: client.id,
      companyName: client.company_name,
      accountId: account.id,
      accountName: account.name,
    })),
    created: 0,
    matched: 0,
  };

  printPlan(report);

  if (!apply) {
    console.log("");
    console.log("DRY RUN — nothing was written. No row in `clients`, `accounts` or");
    console.log("`activity_logs` was created or modified.");
    console.log(`To create the ${report.toCreate.length} account(s) above, re-run with --apply:`);
    console.log(`  ${APPLY_COMMAND}`);
    console.log("--apply performs the creates only; the proposed matches are left alone.");
    if (report.toMatch.length > 0) {
      console.log("To also perform the matches, after reviewing every one of them:");
      console.log(`  ${CONFIRM_COMMAND}`);
    }
    return report;
  }

  const collisions = findCollidingCreates(creates);
  if (collisions.length > 0) {
    throw new Error(
      `Refusing to apply: ${collisions.length} company name(s) would need more than one ` +
        `account created, but accounts.lower(name) is unique — ${collisions.join(", ")}. ` +
        "Resolve these clients by hand.",
    );
  }

  await transaction(async (db) => {
    for (const { client } of creates) {
      const account = await queryOne<AccountRow>(
        `
            insert into accounts (name, industry, tier, lifecycle_stage, account_owner)
            values ($1, $2, $3, 'active_client', $4)
            returning id, name
          `,
        [client.company_name, client.industry, client.tier, client.account_owner],
        db,
      );

      if (!account) {
        throw new Error(`Failed to create account for ${client.company_name}`);
      }

      await db.query("update clients set account_id = $1 where id = $2", [account.id, client.id]);
      await recordLink(db, client, account, "created");
      report.created += 1;
    }

    if (!confirmMatches) {
      return;
    }

    for (const { client, account } of matches) {
      await db.query("update clients set account_id = $1 where id = $2", [account.id, client.id]);
      await recordLink(db, client, account, "matched");
      report.matched += 1;
    }
  });

  console.log("");
  console.log(`APPLIED — created ${report.created} account(s), matched ${report.matched}.`);

  if (!confirmMatches && report.toMatch.length > 0) {
    console.log("");
    console.log(
      `${report.toMatch.length} proposed match(es) were NOT performed. Matching a client into a`,
    );
    console.log("pre-existing account is inference by company name, so it needs a second flag:");
    console.log(`  ${CONFIRM_COMMAND}`);
  }

  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmMatches = process.argv.includes("--confirm-matches");

  if (confirmMatches && !apply) {
    console.error("--confirm-matches does nothing without --apply. Refusing to run.");
    process.exit(1);
  }

  await backfillAccounts({ apply, confirmMatches });
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

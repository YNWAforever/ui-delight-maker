import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "../clientops-migrations";
import { resolveBackfill } from "../../../../neon/backfill-quote-account-ids.mjs";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

// `resolveBackfill` deliberately scans *every* NULL-account quote in the database — that is
// the whole point of a backfill report. The shared `clientops_test` database is also seeded
// with NULL-account quotes by route-loader-contract.integration.test.ts, so asserting exact
// counts there would couple this file to another one's fixture. A database of its own is
// what lets "resolvable has length 3" mean what it says.
const TEST_DATABASE = "clientops_bd1_backfill";

function ownDatabaseUrl(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

const ACCOUNT_A = "00000000-0000-4000-8000-0000000b0001";
const ACCOUNT_B = "00000000-0000-4000-8000-0000000b0002";
const CLIENT_WITH_ACCOUNT = "00000000-0000-4000-8000-0000000c0001";
const CLIENT_WITHOUT_ACCOUNT = "00000000-0000-4000-8000-0000000c0002";
const LEAD_WITH_ACCOUNT = "00000000-0000-4000-8000-0000000d0001";

const QUOTE_FROM_CLIENT = "00000000-0000-4000-8000-0000000e0001";
const QUOTE_FROM_LEAD = "00000000-0000-4000-8000-0000000e0002";
const QUOTE_CLIENT_WINS = "00000000-0000-4000-8000-0000000e0003";
const QUOTE_UNRESOLVABLE = "00000000-0000-4000-8000-0000000e0004";

let pool: Pool | null = null;

async function withAdmin<T>(work: (admin: Pool) => Promise<T>): Promise<T> {
  const admin = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
  try {
    return await work(admin);
  } finally {
    await admin.end();
  }
}

/** Wipes every row this file cares about, so each test starts from the same four quotes. */
async function seed(db: Pool) {
  await db.query("delete from quotes");
  await db.query("delete from clients");
  await db.query("delete from leads");
  await db.query("delete from accounts");

  await db.query(
    `insert into accounts (id, name, tier, lifecycle_stage) values
       ($1, 'BD1 Account A', 'SME', 'active_client'),
       ($2, 'BD1 Account B', 'mid-market', 'prospect')`,
    [ACCOUNT_A, ACCOUNT_B],
  );
  await db.query(
    `insert into clients (id, company_name, account_id) values
       ($1, 'BD1 Client With Account', $2),
       ($3, 'BD1 Client Without Account', null)`,
    [CLIENT_WITH_ACCOUNT, ACCOUNT_A, CLIENT_WITHOUT_ACCOUNT],
  );
  await db.query(
    `insert into leads (id, company_name, status, source, account_id) values
       ($1, 'BD1 Lead With Account', 'new', 'manual', $2)`,
    [LEAD_WITH_ACCOUNT, ACCOUNT_B],
  );
  await db.query(
    `insert into quotes (id, number, client_id, lead_id, account_id, created_at) values
       ($1, 'BD1-Q-CLIENT',     $5,   null, null, now() - interval '4 hours'),
       ($2, 'BD1-Q-LEAD',       null, $7,   null, now() - interval '3 hours'),
       ($3, 'BD1-Q-BOTH',       $5,   $7,   null, now() - interval '2 hours'),
       ($4, 'BD1-Q-NO-ACCOUNT', $6,   null, null, now() - interval '1 hour')`,
    [
      QUOTE_FROM_CLIENT,
      QUOTE_FROM_LEAD,
      QUOTE_CLIENT_WINS,
      QUOTE_UNRESOLVABLE,
      CLIENT_WITH_ACCOUNT,
      CLIENT_WITHOUT_ACCOUNT,
      LEAD_WITH_ACCOUNT,
    ],
  );
}

async function accountIdOf(db: Pool, quoteId: string): Promise<string | null> {
  const { rows } = await db.query<{ account_id: string | null }>(
    "select account_id from quotes where id = $1",
    [quoteId],
  );
  return rows[0]?.account_id ?? null;
}

/** The shape `resolveBackfill` returns per row; the .mjs it comes from is untyped. */
type Proposal = { id: string; number: string; proposed_account_id: string | null };

function proposalFor(report: { resolvable: Proposal[] }, number: string) {
  return report.resolvable.find((row) => row.number === number);
}

describe("quote account backfill", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    await withAdmin(async (admin) => {
      await admin.query(`drop database if exists ${TEST_DATABASE} with (force)`);
      await admin.query(`create database ${TEST_DATABASE}`);
    });
    pool = new Pool({ connectionString: ownDatabaseUrl(process.env.DATABASE_TEST_URL as string) });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(pool, migrations);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
    if (!hasDatabase) return;
    await withAdmin(async (admin) => {
      await admin.query(`drop database if exists ${TEST_DATABASE} with (force)`);
    });
  }, 60_000);

  it.runIf(hasDatabase)(
    "reports which NULL-account quotes can take an account from their linked record",
    async () => {
      const db = pool as Pool;
      await seed(db);

      const report = await resolveBackfill(db);

      expect(report.total).toBe(4);
      expect(report.resolvable).toHaveLength(3);
      expect(report.unresolvable).toHaveLength(1);

      // 1. client with an account -> takes the CLIENT's account
      expect(proposalFor(report, "BD1-Q-CLIENT")?.proposed_account_id).toBe(ACCOUNT_A);
      // 2. lead with an account, no client -> takes the LEAD's account
      expect(proposalFor(report, "BD1-Q-LEAD")?.proposed_account_id).toBe(ACCOUNT_B);
      // 3. client AND lead, different accounts -> the CLIENT's wins, matching `linkedRecord`
      //    and `resolveLinkedQuoteVisibility`. One precedence rule across the product.
      expect(proposalFor(report, "BD1-Q-BOTH")?.proposed_account_id).toBe(ACCOUNT_A);
      // 4. neither has an account -> unresolvable, and it stays NULL. Nothing is inferred
      //    from the company name, which is exactly what makes this a repair and not a guess.
      expect(report.unresolvable.map((row: Proposal) => row.number)).toEqual(["BD1-Q-NO-ACCOUNT"]);
      expect(await accountIdOf(db, QUOTE_UNRESOLVABLE)).toBeNull();
    },
    60_000,
  );
});

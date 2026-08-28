import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type TestActor = { profileId: string; role: "accounting" | "sales" };

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
  actor: null as { profileId: string; role: string } | null,
}));

const createServerFnChain = vi.hoisted(() => {
  const chain = {
    validator() {
      return chain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return chain;
});

// The same passthrough stub every server-functions test in this directory uses: it strips
// the transport wrapper so the handler can be called directly, and mocks nothing about the
// handler's own behaviour.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

// Same seam and same reason as route-loader-contract.integration.test.ts: redirect query()
// at the pg driver so the real SQL runs against a real Postgres. The SQL text is identical
// either way, which is the whole point — this file exists to prove the redaction survives
// contact with an actual query planner, not to re-assert what the unit tests already pin.
vi.mock("@/server/db/neon.server", () => {
  const getPool = () => {
    if (!holder.pool) throw new Error("test pool not initialised");
    return holder.pool;
  };
  const query = async (text: string, values: readonly unknown[] = []) => {
    const result = await getPool().query(text, values as unknown[]);
    return result.rows;
  };
  const queryOne = async (text: string, values: readonly unknown[] = []) => {
    const rows = await query(text, values);
    return rows[0] ?? null;
  };
  const transaction = async (work: (db: unknown) => Promise<unknown>) => {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const result = await work({
        query: (text: string, values?: readonly unknown[]) =>
          client.query(text, values as unknown[]),
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  return { query, queryOne, transaction, getDatabaseUrl: () => "test" };
});

// The ONLY behavioural mock in this file, and deliberately the narrowest one available:
// the session boundary, which reads an HTTP cookie there is no way to produce here. Every
// step after it is real — loadAuthorizationContext issues its real queries against this
// database, evaluateAuthorization applies the real ROLE_GRANTS, buildQuoteListQuery builds
// the real SQL, and listQuotesPage runs it. Mocking requireCapabilitySet or the query
// builder would make this test assert its own fixtures; not mocking them is its entire value.
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => {
    const actor = holder.actor;
    if (!actor) throw new Error("no test actor selected");
    return {
      user: { id: actor.profileId, email: `${actor.profileId}@bd9.test` },
      session: { id: `${actor.profileId}-session` },
      profile: {
        id: actor.profileId,
        email: `${actor.profileId}@bd9.test`,
        name: actor.profileId,
        role: actor.role,
        status: "active",
        primary_department_id: null,
      },
    };
  },
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { getQuotesPage } from "../quotes";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

const ACCOUNTING: TestActor = { profileId: "bd9-accounting", role: "accounting" };
const SALES: TestActor = { profileId: "bd9-sales", role: "sales" };

// Distinctive enough that no other fixture in this shared database can collide with it, and
// distinctive enough that a JSON.stringify scan for it is meaningful.
const LEAD_NAME = "Zephyr Rail Holdings";
const SECOND_LEAD_NAME = "Meridian Cargo Union";
const CLIENT_NAME = "Halcyon Freight Partners";

// Every seeded quote carries this account_id and every call filters on it. Several test
// files seed the same DATABASE_TEST_URL, so without the scope `total` would count their
// rows too and case 2 would be measuring the wrong set.
const SCOPE_ACCOUNT_ID = "00000000-0000-4bd9-8000-0000000000a0";

// A second account holding one quote on the SAME lead, deliberately outside every call's
// filter. It makes the scope predicate load-bearing: without a row the filter must exclude,
// an aggregate query that quietly stopped applying the filters would still agree with the
// rows, and case 2 would pass while measuring nothing.
const DECOY_ACCOUNT_ID = "00000000-0000-4bd9-8000-0000000000b0";

const LEAD_ID = "00000000-0000-4bd9-8000-000000000401";
const SECOND_LEAD_ID = "00000000-0000-4bd9-8000-000000000402";
const CLIENT_ID = "00000000-0000-4bd9-8000-000000000301";

const LEAD_QUOTE_NUMBER = "BD9-Q-001";
const CLIENT_QUOTE_NUMBER = "BD9-Q-002";

// Five quotes so a limit of 2 spans three pages — enough to walk, without seeding 50 rows.
const SEEDED_QUOTE_COUNT = 5;

const SEED_STATEMENTS: string[] = [
  `insert into profiles (id, email, name, role, status) values
     ('bd9-accounting','bd9-accounting@bd9.test','BD9 Accounting','accounting','active'),
     ('bd9-sales','bd9-sales@bd9.test','BD9 Sales','sales','active')
     on conflict do nothing`,

  `insert into leads (id, company_name, status, source) values
     ('${LEAD_ID}','${LEAD_NAME}','new','manual'),
     ('${SECOND_LEAD_ID}','${SECOND_LEAD_NAME}','qualified','manual')
     on conflict do nothing`,

  // quotes.account_id carries a foreign key to accounts, so the scope needs a real row.
  `insert into accounts (id, name, tier, lifecycle_stage) values
     ('${SCOPE_ACCOUNT_ID}','BD9 Scope Account','SME','active_client'),
     ('${DECOY_ACCOUNT_ID}','BD9 Decoy Account','SME','prospect')
     on conflict do nothing`,

  `insert into clients (id, company_name, tier) values
     ('${CLIENT_ID}','${CLIENT_NAME}','SME')
     on conflict do nothing`,

  `insert into quotes (id, number, lead_id, client_id, account_id, status, total_value, currency) values
     ('00000000-0000-4bd9-8000-000000000601','${LEAD_QUOTE_NUMBER}','${LEAD_ID}',null,'${SCOPE_ACCOUNT_ID}','draft',100,'HKD'),
     ('00000000-0000-4bd9-8000-000000000602','${CLIENT_QUOTE_NUMBER}',null,'${CLIENT_ID}','${SCOPE_ACCOUNT_ID}','sent',200,'HKD'),
     ('00000000-0000-4bd9-8000-000000000603','BD9-Q-003','${SECOND_LEAD_ID}',null,'${SCOPE_ACCOUNT_ID}','draft',300,'USD'),
     ('00000000-0000-4bd9-8000-000000000604','BD9-Q-004',null,'${CLIENT_ID}','${SCOPE_ACCOUNT_ID}','accepted',400,'HKD'),
     ('00000000-0000-4bd9-8000-000000000605','BD9-Q-005','${SECOND_LEAD_ID}',null,'${SCOPE_ACCOUNT_ID}','draft',500,'HKD'),
     ('00000000-0000-4bd9-8000-0000000006f0','BD9-Q-OUT','${LEAD_ID}',null,'${DECOY_ACCOUNT_ID}','draft',600,'HKD')
     on conflict do nothing`,
];

async function seed(pool: InstanceType<typeof Pool>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const statement of SEED_STATEMENTS) {
      await client.query(statement);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function listAs(actor: TestActor, data: { search?: string; page?: number; limit?: number }) {
  holder.actor = actor;
  return getQuotesPage({ data: { account_id: SCOPE_ACCOUNT_ID, ...data } });
}

describe("quotes list disclosure boundary against a real database", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await seed(holder.pool);
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
    holder.actor = null;
  });

  it.runIf(hasDatabase)(
    "closes the search oracle on a record type the actor may not see",
    async () => {
      // The premise, checked rather than assumed: if a future policy edit hands accounting
      // leads.view, this test would silently stop testing anything.
      expect(ROLE_GRANTS.accounting.has("quotes.view")).toBe(true);
      expect(ROLE_GRANTS.accounting.has("accounts.view")).toBe(true);
      expect(ROLE_GRANTS.accounting.has("leads.view")).toBe(false);
      expect(ROLE_GRANTS.sales.has("leads.view")).toBe(true);

      const denied = await listAs(ACCOUNTING, { search: LEAD_NAME });

      // Rows AND tiles. A predicate applied to only one of the two queries still leaks: the
      // tile count would answer "does a lead by this name exist?" that the empty row list
      // refused to answer. That inference oracle is the thing being closed here, and it is
      // why display-side redaction alone would not be enough.
      expect(denied.items).toEqual([]);
      expect(denied.aggregates).toEqual([]);
      expect(denied.total).toBe(0);
      expect(denied.visibility.leads).toBe(false);

      const allowed = await listAs(SALES, { search: LEAD_NAME });
      expect(allowed.items.map((row) => row.number)).toEqual([LEAD_QUOTE_NUMBER]);
      expect(allowed.total).toBe(1);
      expect(allowed.visibility.leads).toBe(true);

      // The name must not surface anywhere in a denied actor's payload — not in a row, not in
      // an aggregate label, not in an echoed filter.
      const unsearched = await listAs(ACCOUNTING, { limit: 100 });
      expect(unsearched.items).toHaveLength(SEEDED_QUOTE_COUNT);
      expect(JSON.stringify(denied)).not.toContain(LEAD_NAME);
      expect(JSON.stringify(unsearched)).not.toContain(LEAD_NAME);
      expect(JSON.stringify(unsearched)).not.toContain(SECOND_LEAD_NAME);
    },
  );

  it.runIf(hasDatabase)("keeps the tiles counting exactly the rows the pages yield", async () => {
    const limit = 2;
    const first = await listAs(ACCOUNTING, { page: 1, limit });

    const aggregateTotal = first.aggregates.reduce((sum, entry) => sum + entry.count, 0);
    expect(aggregateTotal).toBe(first.total);
    expect(first.total).toBe(SEEDED_QUOTE_COUNT);

    const seenIds: string[] = [];
    const pageCount = Math.ceil(first.total / limit);
    for (let page = 1; page <= pageCount; page += 1) {
      const result = await listAs(ACCOUNTING, { page, limit });
      // Every page re-reports the same total from the same predicate, so a drift between
      // the row query and the aggregate query cannot hide on a later page.
      expect(result.total).toBe(first.total);
      expect(result.items.length).toBeLessThanOrEqual(limit);
      seenIds.push(...result.items.map((row) => row.id));
    }

    expect(seenIds).toHaveLength(first.total);
    expect(new Set(seenIds).size).toBe(first.total);
  });

  it.runIf(hasDatabase)("reports redaction distinguishably from an absent name", async () => {
    expect(ROLE_GRANTS.accounting.has("leads.view")).toBe(false);
    expect(ROLE_GRANTS.sales.has("leads.view")).toBe(true);

    const denied = await listAs(ACCOUNTING, { limit: 100 });
    const deniedLeadQuote = denied.items.find((row) => row.number === LEAD_QUOTE_NUMBER);
    expect(deniedLeadQuote?.linked_company_name).toBeNull();
    expect(denied.visibility.leads).toBe(false);

    const allowed = await listAs(SALES, { limit: 100 });
    const allowedLeadQuote = allowed.items.find((row) => row.number === LEAD_QUOTE_NUMBER);
    expect(allowedLeadQuote?.linked_company_name).toBe(LEAD_NAME);
    expect(allowed.visibility.leads).toBe(true);

    // The leg that stops case 1 passing trivially. A `linked_company_name` that was simply
    // nulled for accounting would satisfy every assertion above; it fails here, because the
    // client-linked quote in the SAME payload carries its real name. Redaction is therefore
    // shown to be per-record-type, not a blanket null column.
    const deniedClientQuote = denied.items.find((row) => row.number === CLIENT_QUOTE_NUMBER);
    expect(deniedClientQuote?.linked_company_name).toBe(CLIENT_NAME);
    expect(denied.visibility.clients).toBe(true);

    // The plan's own third leg — a second lead with a null company_name, so that `sales`
    // observes a genuinely absent name alongside visibility.leads === true — is not
    // reachable against this schema: leads.company_name and clients.company_name are both
    // NOT NULL, and quotes_must_have_context forbids a quote linked to neither. No actor
    // who can see both record types can ever be handed a genuinely absent linked name.
    // Pinned rather than assumed, so the day a migration relaxes it this goes red and the
    // real third leg gets written instead of quietly staying unwritten.
    if (!holder.pool) throw new Error("test pool not initialised");
    await expect(
      holder.pool.query(
        "insert into leads (company_name, status, source) values (null, 'new', 'manual')",
      ),
    ).rejects.toThrow(/not-null|not null/i);
  });
});

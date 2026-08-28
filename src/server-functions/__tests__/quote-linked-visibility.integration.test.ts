import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
  session: null as unknown,
}));

// Same seam as resource-ownership.integration.test.ts and route-loader-contract.integration.test.ts:
// redirect query()/queryOne()/transaction() at the pg driver so every repository and
// authorization query — real SQL, not a stand-in — runs against the CI Postgres service. Nothing
// in the authorization path (loadAuthorizationContext, evaluateAuthorization,
// evaluateCapabilityChecks, requireCapability, resolveOwnerProfileId) is mocked.
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
        query: async (text: string, values?: readonly unknown[]) =>
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

// The ONLY mock on the authorization path. `requireNeonAuthSession` is the session boundary —
// it is how `loadAuthorizationContext` finds out who the actor is. Everything downstream of it
// runs unmocked, against the real seeded rows below, through the redirected query() above.
// Swapping what this returns is how the same handler is driven as two different actors. Mocking
// `evaluateCapabilityChecks`, `requireCapability`, or `loadAuthorizationContext` themselves would
// assert the mock instead of the behaviour, so none of those are touched here.
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => {
    if (!holder.session) throw new Error("test session not set");
    return holder.session;
  },
}));

// createServerFn wraps its handler in TanStack Start's request-scoped AsyncLocalStorage context,
// which only a real server request establishes. Calling an unmocked export directly throws
// "No Start context found in AsyncLocalStorage" (confirmed by hand before writing this file).
// Every other server-functions test in this repo (e.g. quotes.test.ts, accounts.test.ts) mocks
// this same transport boilerplate to a passthrough so the exported const IS the handler
// function — this touches only plumbing, none of it authorization.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: () => chain,
      handler: (fn: (...args: unknown[]) => unknown) => fn,
    };
    return chain;
  },
}));

import { AdminError } from "@/lib/admin/errors";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import type { Profile } from "@/lib/types";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { getQuoteDetailRead, getQuoteDocumentRead } from "@/server-functions/quote-workspace";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

const ACCOUNTING_PROFILE_ID = "quote-vis-accounting";
const SALES_PROFILE_ID = "quote-vis-sales";

const CLIENT_VISIBLE_ID = "00000000-0000-4000-9000-000000000301";
const CLIENT_DENIED_ID = "00000000-0000-4000-9000-000000000302";
const LEAD_ID = "00000000-0000-4000-9000-000000000401";
const QUOTE_LEAD_LINKED_ID = "00000000-0000-4000-9000-000000000601";
const QUOTE_CLIENT_DENIED_ID = "00000000-0000-4000-9000-000000000602";
const QUOTE_DOC_LEAD_ONLY_ID = "00000000-0000-4000-9000-000000000603";
const QUOTE_DOC_VERSION_ID = "00000000-0000-4000-9000-000000000701";
const DENY_OVERRIDE_ID = "00000000-0000-4000-9000-000000000a01";

function makeProfile(overrides: Pick<Profile, "id" | "role">): Profile {
  return {
    email: `${overrides.id}@fixture.test`,
    name: overrides.id,
    status: "active",
    avatar_url: null,
    job_title: null,
    phone: null,
    locale: "en-HK",
    timezone: "Asia/Hong_Kong",
    primary_department_id: null,
    manager_profile_id: null,
    last_active_at: null,
    session_invalid_before: null,
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    availability_status: "available",
    leave_starts_at: null,
    leave_ends_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function sessionFor(profile: Profile): AppSession {
  return {
    user: { id: profile.id, email: profile.email },
    session: { id: null, createdAt: null, expiresAt: null },
    profile,
  };
}

const accountingSession = sessionFor(
  makeProfile({ id: ACCOUNTING_PROFILE_ID, role: "accounting" }),
);
const salesSession = sessionFor(makeProfile({ id: SALES_PROFILE_ID, role: "sales" }));

/**
 * `accounting` holds `quotes.view` and `accounts.view` but not `leads.view` (verified against
 * ROLE_GRANTS in src/lib/admin/policy.ts). `sales` holds all three. Every seeded role holds
 * `accounts.view`, so case 3 (an actor denied the quote's client) is constructed with an
 * explicit `deny` permission_overrides row instead — `permission_overrides` rows are honoured
 * by the real evaluator, so this is a legitimate way to build that actor rather than a
 * shortcut around it.
 */
async function seed(pool: Pool) {
  await pool.query(
    `insert into profiles (id, email, name, role, status) values
       ($1, $2, $3, 'accounting', 'active'),
       ($4, $5, $6, 'sales', 'active')
     on conflict (id) do update set role = excluded.role, status = excluded.status`,
    [
      ACCOUNTING_PROFILE_ID,
      `${ACCOUNTING_PROFILE_ID}@fixture.test`,
      "Quote Visibility Accounting",
      SALES_PROFILE_ID,
      `${SALES_PROFILE_ID}@fixture.test`,
      "Quote Visibility Sales",
    ],
  );

  await pool.query(
    `insert into clients (id, company_name, tier) values
       ($1, 'Quote Visibility Client (visible)', 'SME'),
       ($2, 'Quote Visibility Client (denied)', 'SME')
     on conflict (id) do nothing`,
    [CLIENT_VISIBLE_ID, CLIENT_DENIED_ID],
  );

  await pool.query(
    `insert into leads (id, company_name, status, source) values
       ($1, 'Quote Visibility Lead', 'qualified', 'manual')
     on conflict (id) do nothing`,
    [LEAD_ID],
  );

  // quoteA: linked to both a visible client and a lead — this is the "list row that used to be
  // a dead end when clicked" case. quoteB: linked to a client this actor will be denied via
  // override, no lead needed since the client check must throw before the lead is ever reached.
  await pool.query(
    `insert into quotes (id, number, client_id, lead_id, status) values
       ($1, 'Q-VIS-LEAD-LINKED', $2, $3, 'draft'),
       ($4, 'Q-VIS-CLIENT-DENIED', $5, null, 'draft')
     on conflict (id) do nothing`,
    [QUOTE_LEAD_LINKED_ID, CLIENT_VISIBLE_ID, LEAD_ID, QUOTE_CLIENT_DENIED_ID, CLIENT_DENIED_ID],
  );

  // quoteC: lead-only (no client), issued, with a stored immutable version — the document read.
  // `buildNormalizedQuoteSnapshot` spreads the whole quote row into the snapshot, so the stored
  // snapshot carries its own copy of lead_id. Without a version row, the snapshot assertions
  // below would pass vacuously against an empty `versions` array. The version FK requires the
  // quote to exist first, so the issued pointer is set afterwards.
  await pool.query(
    `insert into quotes (id, number, client_id, lead_id, status) values
       ($1, 'Q-VIS-DOC-LEAD-ONLY', null, $2, 'sent')
     on conflict (id) do nothing`,
    [QUOTE_DOC_LEAD_ONLY_ID, LEAD_ID],
  );

  await pool.query(
    `insert into quote_versions (id, quote_id, version_number, reason, snapshot)
     values ($1, $2, 1, 'issued', $3::jsonb)
     on conflict (id) do nothing`,
    [
      QUOTE_DOC_VERSION_ID,
      QUOTE_DOC_LEAD_ONLY_ID,
      JSON.stringify({
        id: QUOTE_DOC_LEAD_ONLY_ID,
        number: "Q-VIS-DOC-LEAD-ONLY",
        status: "sent",
        client_id: null,
        lead_id: LEAD_ID,
        line_items: [],
      }),
    ],
  );

  await pool.query("update quotes set issued_version_id = $2 where id = $1", [
    QUOTE_DOC_LEAD_ONLY_ID,
    QUOTE_DOC_VERSION_ID,
  ]);

  await pool.query(
    `insert into permission_overrides
       (id, profile_id, capability, effect, resource_type, resource_id, reason, granted_by)
     values
       ($1, $2, 'accounts.view', 'deny', 'client', $3,
        'test: narrow the accounts.view degradation check to this one client', $2)
     on conflict (id) do nothing`,
    [DENY_OVERRIDE_ID, ACCOUNTING_PROFILE_ID, CLIENT_DENIED_ID],
  );
}

describe("linked quote reads: lead degradation is narrow and complete", () => {
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
  });

  it.runIf(hasDatabase)(
    "an actor without leads.view sees the quote with lead: null, and does not throw",
    async () => {
      holder.session = accountingSession;
      const read = (await getQuoteDetailRead({ data: { id: QUOTE_LEAD_LINKED_ID } })) as {
        quote: { id: string; number: string | null; client_id: string | null; lead_id: unknown };
        lead: unknown;
      };

      // The quote itself must be present and populated — a degraded read, not an empty shell.
      expect(read.quote.id).toBe(QUOTE_LEAD_LINKED_ID);
      expect(read.quote.number).toBe("Q-VIS-LEAD-LINKED");
      expect(read.quote.client_id).toBe(CLIENT_VISIBLE_ID);
      expect(read.lead).toBeNull();
      // `quote.lead_id` is the lead's primary key: leaving it while nulling `lead` redacts
      // nothing, and the quote header renders it as the title for a lead-only quote.
      expect(read.quote.lead_id).toBeNull();
      expect(JSON.stringify(read)).not.toContain(LEAD_ID);
    },
  );

  it.runIf(hasDatabase)(
    "an actor with leads.view sees the same quote with lead populated",
    async () => {
      // Without this case, the previous one would pass trivially if `lead` were always null
      // regardless of the actor's capabilities.
      holder.session = salesSession;
      const read = (await getQuoteDetailRead({ data: { id: QUOTE_LEAD_LINKED_ID } })) as {
        quote: { id: string; lead_id: unknown };
        lead: { id: string; company_name: string } | null;
      };

      expect(read.quote.id).toBe(QUOTE_LEAD_LINKED_ID);
      expect(read.lead).not.toBeNull();
      expect(read.lead?.id).toBe(LEAD_ID);
      expect(read.lead?.company_name).toBe("Quote Visibility Lead");
      // A redaction that nulls `quote.lead_id` unconditionally would pass the degraded case
      // above while breaking every permitted reader — this is what stops that.
      expect(read.quote.lead_id).toBe(LEAD_ID);
    },
  );

  it.runIf(hasDatabase)(
    "an actor without leads.view gets a document read with no lead id in the quote or snapshot",
    async () => {
      // getQuoteDocumentRead returns stored immutable versions alongside the quote, and each
      // snapshot has its own copy of lead_id. Nulling `lead` and `quote.lead_id` alone still
      // hands the denied actor the UUID via versions[].snapshot.
      holder.session = accountingSession;
      const read = (await getQuoteDocumentRead({ data: { id: QUOTE_DOC_LEAD_ONLY_ID } })) as {
        quote: { id: string; number: string | null; lead_id: unknown };
        lead: unknown;
        versions: { id: string; snapshot: Record<string, unknown> }[];
      };

      expect(read.quote.id).toBe(QUOTE_DOC_LEAD_ONLY_ID);
      expect(read.quote.number).toBe("Q-VIS-DOC-LEAD-ONLY");
      expect(read.lead).toBeNull();
      expect(read.quote.lead_id).toBeNull();

      // The version must still be served — this is a redacted document, not a withheld one.
      expect(read.versions).toHaveLength(1);
      expect(read.versions[0].id).toBe(QUOTE_DOC_VERSION_ID);
      expect(read.versions[0].snapshot.number).toBe("Q-VIS-DOC-LEAD-ONLY");
      for (const version of read.versions) {
        expect(version.snapshot.lead_id).toBeNull();
      }

      // Catch-all: no corner of the payload may still carry the denied lead's identifier.
      expect(JSON.stringify(read)).not.toContain(LEAD_ID);
    },
  );

  it.runIf(hasDatabase)(
    "an actor with leads.view sees the same document read untouched",
    async () => {
      // Guards the snapshot redaction from being "fixed" by nulling lead_id for everyone: the
      // stored version is immutable and a permitted reader must get it exactly as written.
      holder.session = salesSession;
      const read = (await getQuoteDocumentRead({ data: { id: QUOTE_DOC_LEAD_ONLY_ID } })) as {
        quote: { id: string; lead_id: unknown };
        lead: { id: string } | null;
        versions: { snapshot: Record<string, unknown> }[];
      };

      expect(read.lead?.id).toBe(LEAD_ID);
      expect(read.quote.lead_id).toBe(LEAD_ID);
      expect(read.versions).toHaveLength(1);
      expect(read.versions[0].snapshot.lead_id).toBe(LEAD_ID);
    },
  );

  it.runIf(hasDatabase)(
    "an actor without accounts.view for the quote's client still throws",
    async () => {
      // Proves the client check did not degrade along with the lead: the same accounting actor
      // that degraded cleanly above is denied `accounts.view` for this one client via a
      // permission_overrides row, and opening a quote linked to that client must still reject.
      holder.session = accountingSession;
      await expect(
        getQuoteDetailRead({ data: { id: QUOTE_CLIENT_DENIED_ID } }),
      ).rejects.toMatchObject({
        name: "AdminError",
        code: "FORBIDDEN",
      });
      await expect(
        getQuoteDetailRead({ data: { id: QUOTE_CLIENT_DENIED_ID } }),
      ).rejects.toBeInstanceOf(AdminError);
    },
  );
});

import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
}));

const { requireNeonAuthSessionMock, createServerFnChain } = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return { requireNeonAuthSessionMock: vi.fn(), createServerFnChain };
});

// The only boundaries stubbed are the ones that cannot exist in a test process: the
// TanStack server-fn wrapper, and the auth session that would otherwise need a real
// request with a Neon Auth cookie. `validateLeadImportRows`, `commitLeadImport`,
// `requireCapability` and `buildLeadDedupeKey` all run for real — the whole point of
// this file is that the guarantees are proven by Postgres, not by a mock's return value.
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

// Redirect the app's database module at a plain pg Pool so the real SQL executes against
// the container Postgres. The statement text is byte-identical either way.
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

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { commitLeadImportFn } from "../lead-import";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

const ACTOR_ID = "bd5-lead-import-actor";
const ACTOR_EMAIL = "bd5-lead-import-actor@fixture.test";

// `sales` is the least-privileged role in ROLE_GRANTS (src/lib/admin/policy.ts) that
// actually holds `leads.create`, which is what commitLeadImportFn requires.
const ACTOR_ROLE = "sales";

type LeadRow = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  enquiry_text: string | null;
  status: string;
  assigned_to: string | null;
  lead_score: number;
  updated_at: string;
};

async function readLead(company: string, email: string): Promise<LeadRow> {
  const pool = holder.pool;
  if (!pool) throw new Error("test pool not initialised");
  // `updated_at::text` on purpose: pg would otherwise hand back a JS Date rounded to
  // milliseconds, and the whole idempotency assertion rests on comparing the stored
  // timestamp exactly as Postgres holds it.
  const result = await pool.query<LeadRow>(
    `
      select id, contact_name, contact_phone, enquiry_text, status, assigned_to,
             lead_score, updated_at::text as updated_at
      from leads
      where company_name = $1 and contact_email = $2
    `,
    [company, email],
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}

type CommitCounts = { created: number; updated: number; skipped: number };
type CommitHandler = (input: { data: { rows: Record<string, string>[] } }) => Promise<CommitCounts>;

// commitLeadImportFn is the server function's handler once createServerFn is stubbed to a
// passthrough, so this calls the real validate -> commit path.
const commit = (rows: Record<string, string>[]) =>
  (commitLeadImportFn as unknown as CommitHandler)({ data: { rows } });

describe("lead CSV import against Postgres", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);

    await holder.pool.query(
      `
        insert into profiles (id, email, name, role, status)
        values ($1, $2, 'BD5 Import Actor', $3, 'active')
        on conflict (id) do update set email = excluded.email, role = excluded.role,
          status = excluded.status
      `,
      [ACTOR_ID, ACTOR_EMAIL, ACTOR_ROLE],
    );

    // Repeat runs share one container database, so start from a known-empty set of the
    // rows this file owns.
    await holder.pool.query("delete from leads where company_name like 'BD5 %'");

    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: ACTOR_ID, email: ACTOR_EMAIL },
      session: {},
      profile: {
        id: ACTOR_ID,
        email: ACTOR_EMAIL,
        name: "BD5 Import Actor",
        role: ACTOR_ROLE,
        status: "active",
        primary_department_id: null,
        manager_profile_id: null,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)("re-importing an unchanged file writes nothing at all", async () => {
    const rows = [
      {
        company_name: "BD5 Idempotent One",
        contact_email: "one@bd5-idempotent.test",
        contact_name: "Ida One",
        contact_phone: "+852 1000 0001",
        enquiry_text: "First enquiry",
      },
      {
        company_name: "BD5 Idempotent Two",
        contact_email: "two@bd5-idempotent.test",
        contact_name: "Ida Two",
        contact_phone: "+852 1000 0002",
        enquiry_text: "Second enquiry",
      },
      {
        company_name: "BD5 Idempotent Three",
        contact_email: "three@bd5-idempotent.test",
        contact_name: "Ida Three",
        contact_phone: "+852 1000 0003",
        enquiry_text: "Third enquiry",
      },
    ];

    expect(await commit(rows)).toEqual({ created: 3, updated: 0, skipped: 0 });

    const before = await Promise.all(
      rows.map((row) => readLead(row.company_name, row.contact_email)),
    );

    expect(await commit(rows)).toEqual({ created: 0, updated: 0, skipped: 3 });

    const after = await Promise.all(
      rows.map((row) => readLead(row.company_name, row.contact_email)),
    );

    // THIS is the assertion that proves idempotency. The counts above would still read
    // zero if the import issued a no-op UPDATE, because `updated` is only incremented on
    // the fill path — but `leads` carries a BEFORE UPDATE trigger (`leads_updated_at`)
    // that rewrites `updated_at` on any statement whatsoever. An unchanged timestamp is
    // the only evidence that no statement reached the row.
    expect(after.map((lead) => lead.updated_at)).toEqual(before.map((lead) => lead.updated_at));
  });

  it.runIf(hasDatabase)("a richer second file fills blanks without overwriting", async () => {
    const company = "BD5 Blank Fill";
    const email = "blanks@bd5-fill.test";

    expect(
      await commit([
        {
          company_name: company,
          contact_email: email,
          contact_name: "Original Name",
          enquiry_text: "Wants a proposal",
        },
      ]),
    ).toEqual({ created: 1, updated: 0, skipped: 0 });

    expect(await readLead(company, email)).toMatchObject({
      contact_name: "Original Name",
      contact_phone: null,
    });

    expect(
      await commit([
        {
          company_name: company,
          contact_email: email,
          // A different name in the richer file: a populated column must survive.
          contact_name: "Replacement Name",
          contact_phone: "+852 2000 0002",
          enquiry_text: "Rewritten enquiry",
        },
      ]),
    ).toEqual({ created: 0, updated: 1, skipped: 0 });

    const lead = await readLead(company, email);
    expect(lead.contact_phone).toBe("+852 2000 0002");
    expect(lead.contact_name).toBe("Original Name");
    expect(lead.enquiry_text).toBe("Wants a proposal");
  });

  it.runIf(hasDatabase)("an UPDATE that fills a blank leaves sales state alone", async () => {
    const pool = holder.pool;
    if (!pool) throw new Error("test pool not initialised");
    const company = "BD5 Sales State";
    const email = "sales-state@bd5-fill.test";

    expect(
      await commit([
        {
          company_name: company,
          contact_email: email,
          contact_name: "Won Lead",
          enquiry_text: "Signed already",
        },
      ]),
    ).toEqual({ created: 1, updated: 0, skipped: 0 });

    const created = await readLead(company, email);

    // Sales state the CRM owns, set outside the importer exactly as a salesperson would.
    await pool.query(
      "update leads set status = 'won', assigned_to = $2, lead_score = 87 where id = $1",
      [created.id, ACTOR_ID],
    );

    // A file that genuinely fills a blank, so a real UPDATE statement runs. If the
    // protected columns were merely absent from the values passed rather than absent from
    // the statement, this is where it would show.
    expect(
      await commit([
        {
          company_name: company,
          contact_email: email,
          contact_name: "Won Lead",
          contact_phone: "+852 3000 0003",
          enquiry_text: "Signed already",
        },
      ]),
    ).toEqual({ created: 0, updated: 1, skipped: 0 });

    const lead = await readLead(company, email);
    expect(lead.contact_phone).toBe("+852 3000 0003");
    expect(lead.status).toBe("won");
    expect(lead.assigned_to).toBe(ACTOR_ID);
    expect(lead.lead_score).toBe(87);
  });
});

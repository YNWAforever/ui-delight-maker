import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
}));

// Same seam and same reason as route-loader-contract.integration.test.ts: redirect query()
// at the pg driver so the SQL runs against the CI Postgres service. The SQL text is
// identical either way, which is the whole point of the check.
vi.mock("@/server/db/neon.server", () => ({
  query: async (text: string, values: readonly unknown[] = []) => {
    if (!holder.pool) throw new Error("test pool not initialised");
    const result = await holder.pool.query(text, values as unknown[]);
    return result.rows;
  },
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { isPostgresError } from "@/server/db/postgres-error";
import {
  NEON_OWNED_RESOURCE_TYPES,
  resolveOwnerProfileId,
  resolveOwnerProfileIds,
  type NeonOwnedResourceType,
} from "../resource-ownership";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

// Any well-formed uuid works. The check is whether Postgres accepts the statement, not
// whether a row comes back — a resource type whose table or column is missing fails with
// 42P01/42703 before it can report "no rows".
const ABSENT_ID = "00000000-0000-0000-0000-0000000000ff";

// Three distinct absent ids, not one: `= any($1)` with a single element exercises different
// SQL from a multi-element array, and — more importantly — a joined query that selects the
// wrong side's id (e.g. `select a.id` instead of `select q.id` for `quote`) can still
// round-trip correctly with one id by coincidence. Three ids is what makes wrong keying
// observable.
const ABSENT_IDS = [
  "00000000-0000-0000-0000-0000000000fc",
  "00000000-0000-0000-0000-0000000000fd",
  "00000000-0000-0000-0000-0000000000fe",
] as const;

describe("resource ownership resolves against the migrated schema", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  // authorization.server.ts used to carry Neon SQL for eight resource types whose tables are
  // in no migration, unreachable behind a SUPABASE_RESOURCE_TYPES short-circuit. Nothing
  // would have caught it if the short-circuit were removed. This is that check: every type
  // the registry claims Neon owns must actually be answerable by the Neon schema.
  for (const resourceType of NEON_OWNED_RESOURCE_TYPES) {
    it.runIf(hasDatabase)(`answers ownership for a ${resourceType}`, async () => {
      try {
        await expect(resolveOwnerProfileId(resourceType, ABSENT_ID)).resolves.toBeNull();
      } catch (error) {
        if (isPostgresError(error)) {
          throw new Error(
            `Ownership lookup for "${resourceType}" issued SQL the migrated schema rejects: ` +
              `[${error.code}] ${error.message}`,
          );
        }
        throw error;
      }
    });
  }

  // The single-id loop above proves each query is syntactically valid against the migrated
  // schema, but it cannot catch a joined query keyed off the wrong side (see the module doc
  // on NEON_OWNERSHIP_QUERIES) — one id can round-trip correctly by coincidence. This loop
  // calls the batch entry point with three ids and checks the returned map is total and
  // every value is null, which is what makes wrong keying observable.
  for (const resourceType of NEON_OWNED_RESOURCE_TYPES) {
    it.runIf(hasDatabase)(
      `answers batch ownership for three absent ${resourceType} ids`,
      async () => {
        try {
          const owners = await resolveOwnerProfileIds(resourceType, ABSENT_IDS);
          for (const id of ABSENT_IDS) {
            expect(owners.has(id)).toBe(true);
            expect(owners.get(id)).toBeNull();
          }
        } catch (error) {
          if (isPostgresError(error)) {
            throw new Error(
              `Batch ownership lookup for "${resourceType}" issued SQL the migrated schema ` +
                `rejects: [${error.code}] ${error.message}`,
            );
          }
          throw error;
        }
      },
    );
  }

  // The absent-only batch loop above cannot catch wrong-side keying: on a joined query the
  // WHERE clause filters on the correct (outer-alias) id, so when every requested id is
  // absent the query returns zero rows no matter which column the SELECT list names — the
  // bug is invisible unless at least one requested id is a real row. Only the six joined
  // queries can mis-select a side at all (see the module doc on NEON_OWNERSHIP_QUERIES); the
  // other eight select `id` from the single table they read, so they have no "wrong side" to
  // get wrong and gain nothing from this fixture.
  describe("catches wrong-side keying with a real row present", () => {
    const OWNER_PROFILE_ID = "resource-ownership-wrong-side-owner";
    const ACCOUNT_ID = "eeeeeeee-0000-0000-0000-000000000001";
    const CLIENT_ID = "eeeeeeee-0000-0000-0000-000000000002";
    const QUOTE_ID = "eeeeeeee-0000-0000-0000-000000000003";
    const QUOTE_VERSION_ID = "eeeeeeee-0000-0000-0000-000000000004";
    const JOB_SHEET_ID = "eeeeeeee-0000-0000-0000-000000000005";
    const JOB_SHEET_PORTION_ID = "eeeeeeee-0000-0000-0000-000000000006";
    const ACCOUNT_CONTACT_ID = "eeeeeeee-0000-0000-0000-000000000007";
    const CLIENT_CONTACT_ID = "eeeeeeee-0000-0000-0000-000000000008";
    const TOUCHPOINT_ID = "eeeeeeee-0000-0000-0000-000000000009";
    const RELATIONSHIP_SIGNAL_ID = "eeeeeeee-0000-0000-0000-00000000000a";

    // Deletes children before parents. Run at both the start and end of the fixture's life:
    // at the start so a prior crashed run can't leave rows that collide with these fixed
    // ids, and at the end so this file leaves nothing behind for the wider suite, which
    // shares this database.
    async function cleanupFixtureRows() {
      if (!holder.pool) return;
      const pool = holder.pool;
      await pool.query("delete from relationship_signals where id = $1", [RELATIONSHIP_SIGNAL_ID]);
      await pool.query("delete from touchpoints where id = $1", [TOUCHPOINT_ID]);
      await pool.query("delete from client_contacts where id = $1", [CLIENT_CONTACT_ID]);
      await pool.query("delete from account_contacts where id = $1", [ACCOUNT_CONTACT_ID]);
      await pool.query("delete from job_sheet_portions where id = $1", [JOB_SHEET_PORTION_ID]);
      await pool.query("delete from job_sheets where id = $1", [JOB_SHEET_ID]);
      await pool.query("delete from quote_versions where id = $1", [QUOTE_VERSION_ID]);
      await pool.query("delete from quotes where id = $1", [QUOTE_ID]);
      await pool.query("delete from clients where id = $1", [CLIENT_ID]);
      await pool.query("delete from accounts where id = $1", [ACCOUNT_ID]);
      await pool.query("delete from profiles where id = $1", [OWNER_PROFILE_ID]);
    }

    beforeAll(async () => {
      if (!hasDatabase) return;
      await cleanupFixtureRows();
      const pool = holder.pool!;

      await pool.query(
        "insert into profiles (id, email, name, role) values ($1, $2, $3, 'sales')",
        [
          OWNER_PROFILE_ID,
          "wrong-side-keying-test@example.invalid",
          "Wrong-Side Keying Test Owner",
        ],
      );
      // `accounts` is the parent for quote/account_contact/relationship_signal below.
      await pool.query("insert into accounts (id, name, account_owner) values ($1, $2, $3)", [
        ACCOUNT_ID,
        "Wrong-Side Keying Test Account",
        OWNER_PROFILE_ID,
      ]);
      // `clients` is the parent for client_contact/touchpoint below.
      await pool.query(
        "insert into clients (id, company_name, account_owner) values ($1, $2, $3)",
        [CLIENT_ID, "Wrong-Side Keying Test Client", OWNER_PROFILE_ID],
      );
      // `created_by` stays null so the quote's owner can only come from `a.account_owner` —
      // an unambiguous signal that the join, not a fallback column, produced the answer.
      await pool.query("insert into quotes (id, client_id, account_id) values ($1, $2, $3)", [
        QUOTE_ID,
        CLIENT_ID,
        ACCOUNT_ID,
      ]);
      // job_sheets requires an accepted quote version to exist first.
      await pool.query(
        "insert into quote_versions (id, quote_id, version_number, reason, snapshot) " +
          "values ($1, $2, 1, 'issued', '{}'::jsonb)",
        [QUOTE_VERSION_ID, QUOTE_ID],
      );
      await pool.query(
        "insert into job_sheets (id, number, quote_id, accepted_quote_version_id, sales_owner) " +
          "values ($1, $2, $3, $4, $5)",
        [JOB_SHEET_ID, "WS-TEST-0001", QUOTE_ID, QUOTE_VERSION_ID, OWNER_PROFILE_ID],
      );
      await pool.query(
        "insert into job_sheet_portions (id, job_sheet_id, name) values ($1, $2, $3)",
        [JOB_SHEET_PORTION_ID, JOB_SHEET_ID, "Wrong-Side Keying Test Portion"],
      );
      await pool.query("insert into account_contacts (id, account_id, name) values ($1, $2, $3)", [
        ACCOUNT_CONTACT_ID,
        ACCOUNT_ID,
        "Wrong-Side Keying Test Contact",
      ]);
      await pool.query("insert into client_contacts (id, client_id, name) values ($1, $2, $3)", [
        CLIENT_CONTACT_ID,
        CLIENT_ID,
        "Wrong-Side Keying Test Contact",
      ]);
      await pool.query("insert into touchpoints (id, client_id, type) values ($1, $2, 'note')", [
        TOUCHPOINT_ID,
        CLIENT_ID,
      ]);
      await pool.query(
        "insert into relationship_signals " +
          "(id, account_id, signal_type, title, reason, dedupe_key) " +
          "values ($1, $2, 'unowned_account', $3, $4, $5)",
        [
          RELATIONSHIP_SIGNAL_ID,
          ACCOUNT_ID,
          "Wrong-Side Keying Test Signal",
          "seeded for the wrong-side keying regression test",
          "wrong-side-keying-test-signal",
        ],
      );
    }, 30_000);

    afterAll(async () => {
      if (!hasDatabase) return;
      await cleanupFixtureRows();
    });

    const CASES: ReadonlyArray<{ resourceType: NeonOwnedResourceType; realId: string }> = [
      { resourceType: "quote", realId: QUOTE_ID },
      { resourceType: "job_sheet_portion", realId: JOB_SHEET_PORTION_ID },
      { resourceType: "account_contact", realId: ACCOUNT_CONTACT_ID },
      { resourceType: "client_contact", realId: CLIENT_CONTACT_ID },
      { resourceType: "touchpoint", realId: TOUCHPOINT_ID },
      { resourceType: "relationship_signal", realId: RELATIONSHIP_SIGNAL_ID },
    ];

    for (const { resourceType, realId } of CASES) {
      it.runIf(hasDatabase)(
        `keys batch ${resourceType} results by its own id, not the joined table's`,
        async () => {
          const requested = [realId, ABSENT_IDS[0], ABSENT_IDS[1]] as const;
          const owners = await resolveOwnerProfileIds(resourceType, requested);

          // A wrong-side `select` still filters on the right column, so it returns a row —
          // just keyed by the joined table's id instead of the one that was requested. That
          // shows up as an extra, unrequested key in the map rather than as a missing row,
          // so the map's key set must be exactly what was requested: no more, no less.
          expect([...owners.keys()].sort()).toEqual([...requested].sort());

          expect(owners.get(realId)).toBe(OWNER_PROFILE_ID);
          expect(owners.get(ABSENT_IDS[0])).toBeNull();
          expect(owners.get(ABSENT_IDS[1])).toBeNull();
        },
      );
    }
  });

  it.runIf(hasDatabase)("returns null for a type it does not own", async () => {
    // A resource type in neither store carries no ownership. It must resolve to null rather
    // than throw, because the policy reads null as "not owned by this manager" — a deny — and
    // a throw here would turn an ordinary denial into a 500.
    await expect(resolveOwnerProfileId("workspace_view", ABSENT_ID)).resolves.toBeNull();
  });
});

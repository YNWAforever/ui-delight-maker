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

  it.runIf(hasDatabase)("returns null for a type it does not own", async () => {
    // A resource type in neither store carries no ownership. It must resolve to null rather
    // than throw, because the policy reads null as "not owned by this manager" — a deny — and
    // a throw here would turn an ordinary denial into a 500.
    await expect(resolveOwnerProfileId("workspace_view", ABSENT_ID)).resolves.toBeNull();
  });
});

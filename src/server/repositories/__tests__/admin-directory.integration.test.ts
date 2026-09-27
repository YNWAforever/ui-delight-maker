import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async <T>(sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows as T[],
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { listAssignableProfiles, resolveAssignableProfile } from "../assignable-profiles";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const prefix = "t17-directory-person-";
function context(): RequestAuthorization {
  return {
    session: {
      profile: { id: "t17-directory-admin", role: "admin", status: "active" },
    } as AppSession,
    actor: {
      profileId: "t17-directory-admin",
      role: "admin",
      status: "active",
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: [],
    },
    overrides: [],
    now: new Date(),
  };
}

describe("admin directory on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    await holder.pool.query(
      "insert into profiles(id,email,name,role,status) values('t17-directory-admin','t17-directory-admin@example.test','Admin','admin','active') on conflict(id) do update set status='active'",
    );
    await holder.pool.query(
      `insert into profiles(id,email,name,role,status)
       select $1 || lpad(n::text,3,'0'), 't17-person-' || lpad(n::text,3,'0') || '@example.test',
              'T17 Person ' || lpad(n::text,3,'0'), 'sales', 'active'
       from generate_series(1,250) n
       on conflict(id) do update set status='active'`,
      [prefix],
    );
    await holder.pool.query("update profiles set status='suspended' where id=$1", [prefix + "101"]);
  }, 60_000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)(
    "paginates beyond 100, resolves person 250, and rejects an inactive successor",
    async () => {
      const first = await listAssignableProfiles(
        { purpose: "admin_directory", limit: 100, query: "T17 Person" },
        context(),
      );
      expect(first.items).toHaveLength(100);
      expect(first.nextCursor).toBeTruthy();
      const second = await listAssignableProfiles(
        { purpose: "admin_directory", limit: 100, query: "T17 Person", cursor: first.nextCursor! },
        context(),
      );
      expect(second.items).toHaveLength(100);
      const third = await listAssignableProfiles(
        { purpose: "admin_directory", limit: 100, query: "T17 Person", cursor: second.nextCursor! },
        context(),
      );
      expect(third.items.some((person) => person.id === prefix + "250")).toBe(true);
      const selected = await resolveAssignableProfile(
        { purpose: "admin_directory", id: prefix + "250" },
        context(),
      );
      expect(selected).toMatchObject({ displayName: "T17 Person 250", isEligible: true });
      expect(
        await resolveAssignableProfile({ purpose: "successor", id: prefix + "101" }, context()),
      ).toBeNull();
    },
  );
});

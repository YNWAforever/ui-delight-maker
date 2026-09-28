import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import type { Queryable } from "@/server/db/neon.server";
import { createInvitationRepository, hashInvitationToken } from "../admin-invitations";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
let pool: Pool;
const actorId = "t18-invite-admin";

function repository(rawToken: string) {
  return createInvitationRepository({
    randomToken: () => rawToken,
    transaction: async <T>(work: (db: Queryable) => Promise<T>) => {
      const client = await pool.connect();
      await client.query("begin");
      try {
        const result = await work({
          query: async <R>(sql: string, values: readonly unknown[] = []) => ({
            rows: (await client.query(sql, [...values])).rows as R[],
          }),
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

describe("workspace invitation states on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 4 });
    await runClientOpsMigrations(
      pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    await pool.query(
      "insert into profiles(id,email,name,role,status) values($1,$2,'Admin','admin','active')",
      [actorId, "t18-admin@example.test"],
    );
  }, 60_000);

  afterAll(async () => {
    if (hasDatabase) await pool?.end();
  });

  it.runIf(hasDatabase)(
    "classifies token states and accepts exactly once under concurrent requests",
    async () => {
      const email = "t18-new@example.test";
      const repo = repository("t18-concurrent-raw-token");
      const { rawToken } = await repo.createInvitation({ email, intendedRole: "sales" }, actorId);
      await expect(repo.getInvitationLandingState(rawToken)).resolves.toMatchObject({
        state: "ready",
        preview: { email },
      });

      const results = await Promise.allSettled([
        repo.acceptInvitation(rawToken, { id: "t18-new-profile", email }),
        repo.acceptInvitation(rawToken, { id: "t18-new-profile", email }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      await expect(repo.getInvitationLandingState(rawToken)).resolves.toEqual({ state: "used" });
      const accepted = await pool.query(
        "select count(*)::int as n from admin_audit_logs where action='invitation.accepted' and actor_profile_id=$1",
        ["t18-new-profile"],
      );
      expect(accepted.rows[0].n).toBe(1);

      const expired = repository("t18-expired-raw-token");
      const expiredInvitation = await expired.createInvitation(
        { email: "t18-expired@example.test", intendedRole: "sales" },
        actorId,
      );
      await pool.query(
        "update user_invitations set expires_at=now()-interval '1 day' where id=$1",
        [expiredInvitation.invitation.id],
      );
      await expect(expired.getInvitationLandingState(expiredInvitation.rawToken)).resolves.toEqual({
        state: "expired",
      });
    },
    30_000,
  );

  it.runIf(hasDatabase)("rolls back activation of a suspended existing profile", async () => {
    const email = "t18-suspended@example.test";
    await pool.query(
      "insert into profiles(id,email,name,role,status) values($1,$2,'Suspended','sales','suspended')",
      ["t18-suspended-profile", email],
    );
    const repo = repository("t18-suspended-raw-token");
    await expect(repo.createInvitation({ email, intendedRole: "admin" }, actorId)).rejects.toThrow(
      "administrator action",
    );
    const rawToken = "t18-legacy-suspended-token";
    await pool.query(
      `insert into user_invitations(email, token_hash, intended_role, initial_team_ids, invited_by, expires_at)
       values($1,$2,'admin','{}'::uuid[],$3,now()+interval '1 day')`,
      [email, hashInvitationToken(rawToken), actorId],
    );
    await expect(
      repo.acceptInvitation(rawToken, { id: "t18-suspended-profile", email }),
    ).rejects.toThrow("administrator action");
    const profile = await pool.query("select role,status from profiles where id=$1", [
      "t18-suspended-profile",
    ]);
    expect(profile.rows[0]).toMatchObject({ role: "sales", status: "suspended" });
    await expect(repo.getInvitationLandingState(rawToken)).resolves.toMatchObject({
      state: "ready",
    });
  });
});

import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async <T>(sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows as T[],
  queryOne: async <T>(sql: string, values: readonly unknown[] = []) =>
    ((await holder.pool!.query(sql, [...values])).rows[0] ?? null) as T | null,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";

import {
  createMcpAccessToken,
  hashMcpAccessToken,
  listMcpAccessTokens,
  recordMcpToolCall,
  resolveMcpAccessToken,
  revokeMcpAccessToken,
  touchMcpAccessToken,
} from "../tokens.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const OWNER = "t17-mcp-owner";
const SUSPENDED = "t17-mcp-suspended";

describe("MCP access tokens on isolated PostgreSQL", () => {
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
    await holder.pool.query("delete from mcp_tool_calls where profile_id like 't17-mcp-%'");
    await holder.pool.query("delete from mcp_access_tokens where profile_id like 't17-mcp-%'");
    await holder.pool.query(
      `insert into profiles(id,email,name,role,status)
       values ($1,$2,'T17 MCP Owner','sales','active'), ($3,$4,'T17 MCP Suspended','sales','suspended')
       on conflict(id) do update set status = excluded.status`,
      [OWNER, `${OWNER}@example.test`, SUSPENDED, `${SUSPENDED}@example.test`],
    );
  }, 60_000);

  afterAll(async () => {
    if (holder.pool) {
      await holder.pool.query("delete from mcp_tool_calls where profile_id like 't17-mcp-%'");
      await holder.pool.query("delete from mcp_access_tokens where profile_id like 't17-mcp-%'");
      await holder.pool.query("delete from profiles where id like 't17-mcp-%'");
    }
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)("keeps both token tables server-only with RLS enabled", async () => {
    const tables = (
      await holder.pool!.query(
        "select relname, relrowsecurity from pg_class where relname = any($1::text[]) and relkind = 'r'",
        [["mcp_access_tokens", "mcp_tool_calls"]],
      )
    ).rows;
    expect(tables).toHaveLength(2);
    expect(tables.every((row) => row.relrowsecurity)).toBe(true);
    const policies = (
      await holder.pool!.query(
        "select tablename from pg_policies where tablename = any($1::text[])",
        [["mcp_access_tokens", "mcp_tool_calls"]],
      )
    ).rows;
    expect(policies).toEqual([]);
  });

  it.runIf(hasDatabase)(
    "mints a hashed token, resolves it, throttles last use, audits, and revokes idempotently",
    async () => {
      const created = await createMcpAccessToken({
        profileId: OWNER,
        name: "Connector laptop",
        expiresInDays: 30,
      });

      expect(created.token).toMatch(/^fmcp_[0-9a-f]{64}$/);
      expect(created.tokenPrefix).toBe(created.token.slice(0, 13));

      const stored = (
        await holder.pool!.query(
          "select token_hash, token_prefix, expires_at, scopes from mcp_access_tokens where id=$1",
          [created.id],
        )
      ).rows[0];
      expect(stored.token_hash).toBe(hashMcpAccessToken(created.token));
      expect(stored.token_hash).not.toContain(created.token);
      expect(stored.token_prefix).toBe(created.token.slice(0, 13));
      expect(stored.scopes).toEqual(["read"]);
      expect(stored.expires_at).toBeTruthy();

      await expect(resolveMcpAccessToken(created.token)).resolves.toMatchObject({
        tokenId: created.id,
        profileId: OWNER,
        scopes: ["read"],
      });
      const tampered = created.token.slice(0, -1) + (created.token.endsWith("0") ? "1" : "0");
      await expect(resolveMcpAccessToken(tampered)).resolves.toBeNull();

      await touchMcpAccessToken(created.id);
      const firstUse = (
        await holder.pool!.query("select last_used_at from mcp_access_tokens where id=$1", [
          created.id,
        ])
      ).rows[0].last_used_at;
      expect(firstUse).toBeTruthy();
      await touchMcpAccessToken(created.id);
      const secondUse = (
        await holder.pool!.query("select last_used_at from mcp_access_tokens where id=$1", [
          created.id,
        ])
      ).rows[0].last_used_at;
      // Within five minutes the second touch is a no-op, so the timestamp is unchanged.
      expect(secondUse).toEqual(firstUse);

      await recordMcpToolCall({
        tokenId: created.id,
        profileId: OWNER,
        tool: "crm_search",
        status: "ok",
        durationMs: 12,
      });
      await recordMcpToolCall({
        tokenId: created.id,
        profileId: OWNER,
        tool: "crm_search",
        status: "error",
        errorCode: "internal",
      });
      const calls = (
        await holder.pool!.query(
          "select tool, status, error_code, duration_ms from mcp_tool_calls where token_id=$1",
          [created.id],
        )
      ).rows;
      expect(calls).toHaveLength(2);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: "crm_search",
            status: "ok",
            error_code: null,
            duration_ms: 12,
          }),
          expect.objectContaining({ tool: "crm_search", status: "error", error_code: "internal" }),
        ]),
      );

      await expect(revokeMcpAccessToken(OWNER, created.id)).resolves.toBe(true);
      // Idempotent replay keeps the first revocation instant.
      await expect(revokeMcpAccessToken(OWNER, created.id)).resolves.toBe(true);
      await expect(resolveMcpAccessToken(created.token)).resolves.toBeNull();
      await expect(revokeMcpAccessToken(SUSPENDED, created.id)).resolves.toBe(false);
      const listed = (await listMcpAccessTokens(OWNER)).find((token) => token.id === created.id);
      expect(listed?.revokedAt).toBeTruthy();
    },
  );

  it.runIf(hasDatabase)("rejects a token whose profile is not active", async () => {
    const created = await createMcpAccessToken({
      profileId: SUSPENDED,
      name: "Suspended laptop",
      expiresInDays: null,
    });

    await expect(resolveMcpAccessToken(created.token)).resolves.toBeNull();

    // The status check is evaluated at resolve time, so reactivating the profile restores the
    // credential without reissuing it.
    await holder.pool!.query("update profiles set status='active' where id=$1", [SUSPENDED]);
    await expect(resolveMcpAccessToken(created.token)).resolves.toMatchObject({
      profileId: SUSPENDED,
    });
    await holder.pool!.query("update profiles set status='suspended' where id=$1", [SUSPENDED]);
    await revokeMcpAccessToken(SUSPENDED, created.id);
  });
});

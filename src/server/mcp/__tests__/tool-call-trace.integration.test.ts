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
import { loadAuthorizationForProfile } from "@/server/auth/authorization.server";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { getProfileById } from "@/server/repositories/profiles";
import { handleMcpRequest, McpRateLimiter } from "../protocol.server";
import { recordMcpToolCallTrace } from "../tool-call-trace.server";
import { createMcpAccessToken, resolveMcpAccessToken, touchMcpAccessToken } from "../tokens.server";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);
const OWNER = "t25-trace-owner";
const CANARY = "canary-trace-never-stored";

/**
 * End-to-end evidence for roadmap B1: one real tool call over the MCP endpoint produces exactly
 * one `mcp_tool_calls` row and one `agent_tool_calls` row linked to it, with a 64-hex argument
 * digest and no raw argument text.
 */
describe("unified agent tool-call trace on isolated PostgreSQL", () => {
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
      "delete from agent_tool_calls where mcp_tool_call_id in (select id from mcp_tool_calls where profile_id like 't25-%')",
    );
    await holder.pool.query("delete from mcp_tool_calls where profile_id like 't25-%'");
    await holder.pool.query("delete from mcp_access_tokens where profile_id like 't25-%'");
    await holder.pool.query(
      `insert into profiles(id,email,name,role,status)
       values ($1,$2,'T25 Trace Owner','sales','active')
       on conflict(id) do update set status = excluded.status`,
      [OWNER, `${OWNER}@example.test`],
    );
  }, 60_000);

  afterAll(async () => {
    if (holder.pool) {
      await holder.pool.query(
        "delete from agent_tool_calls where mcp_tool_call_id in (select id from mcp_tool_calls where profile_id like 't25-%')",
      );
      await holder.pool.query("delete from mcp_tool_calls where profile_id like 't25-%'");
      await holder.pool.query("delete from mcp_access_tokens where profile_id like 't25-%'");
      await holder.pool.query("delete from profiles where id like 't25-%'");
    }
    await holder.pool?.end();
    holder.pool = null;
  });

  it.runIf(hasDatabase)("registers migration 031 in the migration contract", () => {
    expect(CLIENTOPS_MIGRATION_PATHS).toContain("neon/migrations/031_agent_tool_call_trace.sql");
  });

  it.runIf(hasDatabase)(
    "writes one linked trace row per MCP call with digest evidence and no raw arguments",
    async () => {
      const created = await createMcpAccessToken({
        profileId: OWNER,
        name: "Trace laptop",
        expiresInDays: 30,
      });

      const deps = {
        async resolveToken(rawToken: string) {
          const token = await resolveMcpAccessToken(rawToken);
          if (!token) return null;
          const profile = await getProfileById(token.profileId);
          if (!profile || profile.status !== "active") return null;
          return { token, authorization: await loadAuthorizationForProfile(profile) };
        },
        touchToken: touchMcpAccessToken,
        recordToolCall: recordMcpToolCallTrace,
        rateLimiter: new McpRateLimiter({ max: 1_000 }),
        preAuthRateLimiter: new McpRateLimiter({ max: 1_000 }),
      };

      const response = await handleMcpRequest(
        new Request("https://clientops.example.com/api/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${created.token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "search", arguments: { query: CANARY } },
          }),
        }),
        deps,
      );
      expect(response.status).toBe(200);

      const mcpCalls = await holder.pool!.query(
        "select id, tool, status, duration_ms from mcp_tool_calls where profile_id=$1",
        [OWNER],
      );
      expect(mcpCalls.rowCount).toBe(1);
      const mcpCall = mcpCalls.rows[0];

      const traces = await holder.pool!.query(
        "select * from agent_tool_calls where mcp_tool_call_id=$1",
        [mcpCall.id],
      );
      expect(traces.rowCount).toBe(1);
      const trace = traces.rows[0];

      expect(trace.agent_run_id).toBeNull();
      expect(trace.tool_name).toBe("search");
      expect(trace.source).toBe("mcp");
      expect(trace.status).toBe(mcpCall.status);
      expect(trace.duration_ms).toBeGreaterThanOrEqual(0);
      expect(trace.args_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(trace.args_keys).toContain("query");
      // The argument columns exist from migration 001 but the trace writer never populates them.
      expect(trace.input_params).toBeNull();
      expect(trace.output_result).toBeNull();

      const traceText = JSON.stringify(trace);
      expect(traceText).not.toContain(CANARY);
    },
  );

  it.runIf(hasDatabase)("keeps agent_tool_calls server-only with RLS enabled", async () => {
    const table = (
      await holder.pool!.query(
        "select relrowsecurity from pg_class where relname = 'agent_tool_calls' and relkind = 'r'",
      )
    ).rows[0];
    expect(table.relrowsecurity).toBe(true);

    const policies = (
      await holder.pool!.query(
        "select tablename from pg_policies where tablename = 'agent_tool_calls'",
      )
    ).rows;
    expect(policies).toEqual([]);
  });
});

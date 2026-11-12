import { beforeEach, describe, expect, it, vi } from "vitest";
import { toolArgumentDigest } from "@/lib/tool-call-digest";

const mocks = vi.hoisted(() => ({ queryOne: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({ queryOne: mocks.queryOne }));

import { recordToolCallTrace } from "../agent-tool-calls";

const TRACE_ID = "trace-1";
const RUN_ID = "21212121-2121-4121-8121-212121212121";
const MCP_CALL_ID = "31313131-3131-4131-8131-313131313131";
const ACCOUNT_ID = "9f461e2c-5f3a-4d3f-9c2b-7a8e6d5c4b3a";
const CANARY = "canary-client-secret-do-not-store";

function lastCall(): { sql: string; values: readonly unknown[] } {
  const [sql, values] = mocks.queryOne.mock.calls.at(-1) as [string, readonly unknown[]];
  return { sql, values };
}

describe("recordToolCallTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryOne.mockResolvedValue({ id: TRACE_ID });
  });

  it("writes one redacted trace row and never arguments or results", async () => {
    await expect(
      recordToolCallTrace({
        source: "mcp",
        toolName: "  get_account  ",
        status: "ok",
        durationMs: 42.9,
        args: { id: ACCOUNT_ID, query: CANARY, nested: { b: 2, a: 1 } },
      }),
    ).resolves.toBe(true);

    const { sql, values } = lastCall();
    expect(sql).toContain("insert into agent_tool_calls");
    expect(sql).not.toMatch(/input_params|output_result|error_message/);
    expect(sql).toContain("returning id");

    const expectedDigest = toolArgumentDigest("mcp", "get_account", {
      id: ACCOUNT_ID,
      query: CANARY,
      nested: { b: 2, a: 1 },
    });
    expect(values[0]).toBeNull(); // agent_run_id
    expect(values[1]).toBeNull(); // mcp_tool_call_id
    expect(values[2]).toBe("get_account"); // trimmed, not the padded input
    expect(values[3]).toBe(true); // success
    expect(values[4]).toBe("ok");
    expect(values[5]).toBeNull(); // error_code
    expect(values[6]).toBe(42); // clamped/truncated duration
    expect(values[7]).toBe(expectedDigest.sha256);
    expect(values[8]).toEqual(["id", "nested", "query"]);
    expect(values[9]).toEqual([ACCOUNT_ID]);
    expect(values[10]).toBe("mcp");
    expect(JSON.stringify(values)).not.toContain(CANARY);
  });

  it("records failures as success=false with a bounded error code", async () => {
    const longCode = "e".repeat(80);
    await recordToolCallTrace({
      source: "governed_ai",
      toolName: "note_tidy",
      status: "error",
      errorCode: longCode,
      agentRunId: RUN_ID,
      args: "A customer follow-up note.",
    });

    const { values } = lastCall();
    expect(values[0]).toBe(RUN_ID);
    expect(values[3]).toBe(false);
    expect(values[4]).toBe("error");
    expect(values[5]).toHaveLength(64);
    expect(values[6]).toBeNull();
    expect(values[10]).toBe("governed_ai");
  });

  it("links the MCP audit row and uses a precomputed digest without re-hashing arguments", async () => {
    const digest = toolArgumentDigest("mcp", "search", { query: CANARY });
    await recordToolCallTrace({
      source: "mcp",
      toolName: "search",
      status: "ok",
      durationMs: 7,
      mcpToolCallId: MCP_CALL_ID,
      digest,
    });

    const { sql, values } = lastCall();
    expect(sql).not.toMatch(/input_params|output_result/);
    expect(values[1]).toBe(MCP_CALL_ID);
    expect(values[7]).toBe(digest.sha256);
    expect(values[8]).toEqual(digest.keys);
    expect(values[9]).toBeNull();
    expect(JSON.stringify(values)).not.toContain(CANARY);
  });

  it("degrades malformed ids to null instead of failing the insert", async () => {
    await recordToolCallTrace({
      source: "mcp",
      toolName: "whoami",
      status: "ok",
      agentRunId: "not-a-uuid",
      mcpToolCallId: "also-not-a-uuid",
    });

    const { values } = lastCall();
    expect(values[0]).toBeNull();
    expect(values[1]).toBeNull();
  });

  it("skips an empty tool name without touching the database", async () => {
    await expect(
      recordToolCallTrace({ source: "mcp", toolName: "   ", status: "ok" }),
    ).resolves.toBe(false);

    expect(mocks.queryOne).not.toHaveBeenCalled();
  });

  it("returns false when the insert returns no row", async () => {
    mocks.queryOne.mockResolvedValue(null);
    await expect(
      recordToolCallTrace({ source: "mcp", toolName: "whoami", status: "ok" }),
    ).resolves.toBe(false);
  });

  it("never throws when the insert fails and logs only the error name", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.queryOne.mockRejectedValue(new Error(`database unavailable: ${CANARY}`));

    await expect(
      recordToolCallTrace({ source: "mcp", toolName: "whoami", status: "ok" }),
    ).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls[0]?.[1];
    expect(logged).toBe("Error");
    expect(String(logged)).not.toContain(CANARY);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordMcpToolCall: vi.fn(),
  recordToolCallTrace: vi.fn(),
}));

vi.mock("../tokens.server", () => ({ recordMcpToolCall: mocks.recordMcpToolCall }));
vi.mock("@/server/repositories/agent-tool-calls", () => ({
  recordToolCallTrace: mocks.recordToolCallTrace,
}));

import type { McpToolCallRecord } from "../protocol.server";
import { recordMcpToolCallTrace } from "../tool-call-trace.server";

const MCP_CALL_ID = "31313131-3131-4131-8131-313131313131";
const ACCOUNT_ID = "9f461e2c-5f3a-4d3f-9c2b-7a8e6d5c4b3a";

function mcpRecord(overrides: Partial<McpToolCallRecord> = {}): McpToolCallRecord {
  return {
    tokenId: "token-1",
    profileId: "profile-1",
    tool: "get_account",
    status: "ok",
    errorCode: null,
    durationMs: 12,
    argsDigest: "a".repeat(64),
    argsKeys: ["id"],
    targetIds: [ACCOUNT_ID],
    ...overrides,
  };
}

describe("recordMcpToolCallTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordMcpToolCall.mockResolvedValue({ id: MCP_CALL_ID });
    mocks.recordToolCallTrace.mockResolvedValue(true);
  });

  it("writes the MCP audit row then the linked unified trace with only derived evidence", async () => {
    await recordMcpToolCallTrace(mcpRecord({ status: "error", errorCode: "forbidden" }));

    expect(mocks.recordMcpToolCall).toHaveBeenCalledWith({
      tokenId: "token-1",
      profileId: "profile-1",
      tool: "get_account",
      status: "error",
      errorCode: "forbidden",
      durationMs: 12,
    });
    expect(mocks.recordToolCallTrace).toHaveBeenCalledWith({
      source: "mcp",
      mcpToolCallId: MCP_CALL_ID,
      toolName: "get_account",
      status: "error",
      durationMs: 12,
      errorCode: "forbidden",
      digest: {
        sha256: "a".repeat(64),
        keys: ["id"],
        targetIds: [ACCOUNT_ID],
      },
    });
  });

  it("skips the trace when the MCP audit row could not be written", async () => {
    mocks.recordMcpToolCall.mockResolvedValue(null);

    await expect(recordMcpToolCallTrace(mcpRecord())).resolves.toBeUndefined();
    expect(mocks.recordToolCallTrace).not.toHaveBeenCalled();
  });

  it("never throws when the trace insert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.recordToolCallTrace.mockRejectedValue(new Error("trace unavailable"));

    await expect(recordMcpToolCallTrace(mcpRecord())).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[1]).toEqual({ reason: "Error" });
  });
});

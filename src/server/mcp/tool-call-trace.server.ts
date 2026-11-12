import { recordToolCallTrace } from "@/server/repositories/agent-tool-calls";
import type { McpToolCallRecord } from "./protocol.server";
import { recordMcpToolCall } from "./tokens.server";

/**
 * The MCP arm of the unified B1 tool-call trace.
 *
 * Two rows per call: the existing `mcp_tool_calls` audit row (token/profile/tool/outcome) and a
 * linked `agent_tool_calls` trace row carrying the redacted argument digest. The MCP record this
 * function receives already contains only derived evidence — never raw arguments — so the trace
 * table inherits that privacy boundary.
 *
 * Additive only: if the MCP audit insert fails there is no id to link, so the trace is skipped
 * rather than recorded detached from the call it describes. Neither insert throws, so tracing can
 * never change the MCP response.
 */
export async function recordMcpToolCallTrace(record: McpToolCallRecord): Promise<void> {
  const mcpCall = await recordMcpToolCall({
    tokenId: record.tokenId,
    profileId: record.profileId,
    tool: record.tool,
    status: record.status,
    errorCode: record.errorCode,
    durationMs: record.durationMs,
  });
  if (!mcpCall) return;

  try {
    await recordToolCallTrace({
      source: "mcp",
      mcpToolCallId: mcpCall.id,
      toolName: record.tool,
      status: record.status,
      durationMs: record.durationMs,
      errorCode: record.errorCode,
      digest: {
        sha256: record.argsDigest,
        keys: record.argsKeys,
        targetIds: record.targetIds,
      },
    });
  } catch (error) {
    // The recorder never throws; this guard keeps an injected/broken seam from reaching the
    // MCP response path either way.
    console.error("[mcp] tool-call trace failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

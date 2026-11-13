import { toolArgumentDigest, type ToolArgumentDigest } from "@/lib/tool-call-digest";
import type { AgentToolCall } from "@/lib/types";
import { queryOne } from "@/server/db/neon.server";

/** Which agent surface produced a tool call; mirrors the checked `source` column values. */
export type ToolCallTraceSource = NonNullable<AgentToolCall["source"]>;

/**
 * One row of the unified tool-call trace.
 *
 * `args` is accepted only so ledger-style callers can hand the recorder their raw arguments; it
 * is hashed inside this module and never stored. Callers that have already digested (the MCP seam,
 * which must not place raw arguments in its own audit record) pass `digest` instead.
 */
export type ToolCallTraceInput = {
  source: ToolCallTraceSource;
  toolName: string;
  status: "ok" | "error";
  durationMs?: number | null;
  errorCode?: string | null;
  agentRunId?: string | null;
  mcpToolCallId?: string | null;
  args?: unknown;
  /** Precomputed digest; takes precedence over `args`. */
  digest?: ToolArgumentDigest | null;
};

const TOOL_NAME_MAX_LENGTH = 80;
const ERROR_CODE_MAX_LENGTH = 64;
const DURATION_MAX_MS = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null for absent or malformed ids: a bad id must degrade the trace, never fail the insert. */
function uuidOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

/**
 * Records one agent tool call in the unified trace (roadmap B1).
 *
 * One parameterized insert. Arguments and results are never written: the trace owns only
 * `args_digest`, `args_keys`, `target_ids` and the call outcome, so querying "what did the agent
 * access?" cannot leak client PII. Best-effort by design: a tracing failure must not change an
 * agent's response, so every failure is logged by name only and reported as `false`.
 */
export async function recordToolCallTrace(input: ToolCallTraceInput): Promise<boolean> {
  try {
    const toolName = input.toolName.trim().slice(0, TOOL_NAME_MAX_LENGTH);
    if (!toolName) return false;

    const digest =
      input.digest ??
      (input.args === undefined ? null : toolArgumentDigest(input.source, toolName, input.args));
    const durationMs =
      input.durationMs === null || input.durationMs === undefined
        ? null
        : Math.min(DURATION_MAX_MS, Math.max(0, Math.trunc(input.durationMs)));
    const errorCode = input.errorCode ? input.errorCode.slice(0, ERROR_CODE_MAX_LENGTH) : null;

    const row = await queryOne<{ id: string }>(
      `
        insert into agent_tool_calls (
          agent_run_id, mcp_tool_call_id, tool_name, success, status, error_code, duration_ms,
          args_digest, args_keys, target_ids, source
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::uuid[], $11)
        returning id
      `,
      [
        uuidOrNull(input.agentRunId),
        uuidOrNull(input.mcpToolCallId),
        toolName,
        input.status === "ok",
        input.status,
        errorCode,
        durationMs,
        digest?.sha256 ?? null,
        digest && digest.keys.length > 0 ? digest.keys : null,
        digest && digest.targetIds.length > 0 ? digest.targetIds : null,
        input.source,
      ],
    );

    return row !== null;
  } catch (error) {
    console.error(
      "Failed to record agent tool call trace",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  }
}

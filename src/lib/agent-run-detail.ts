import { z } from "zod";

export const AGENT_TRACE_PAGE_SIZE = 50;
export const agentTraceCursorSchema = z.strictObject({
  calledAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export const agentRunDetailInputSchema = z.strictObject({
  runId: z.string().uuid(),
  cursor: agentTraceCursorSchema.optional(),
});
export type AgentTraceCursor = z.infer<typeof agentTraceCursorSchema>;
export type AgentRunDetailInput = z.infer<typeof agentRunDetailInputSchema>;

export type AgentRunDetailMetadata = {
  id: string;
  agent_name: string;
  workflow_type: string;
  status: string;
  trigger_type: string | null;
  created_at: string;
  updated_at: string;
  duration_ms: number | null;
  model_used: string | null;
  outcome_code: string | null;
  attempt_id: string | null;
};

/** Explicit projection: legacy payload/error text and untyped target ids never cross the BFF. */
export type AgentTraceEvent = {
  id: string;
  called_at: string;
  tool_name: string;
  source: "mcp" | "governed_ai" | "n8n_dispatch" | "n8n_writeback" | null;
  status: "ok" | "error" | null;
  duration_ms: number | null;
  error_code: string | null;
  args_digest: string | null;
  args_keys: string[] | null;
};
export type AgentRunDetailRead =
  | { available: false; actorId: string }
  | {
      available: true;
      actorId: string;
      run: AgentRunDetailMetadata;
      events: AgentTraceEvent[];
      nextCursor: AgentTraceCursor | null;
    };

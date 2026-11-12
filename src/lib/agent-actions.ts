import type { ApprovalStatus } from "@/lib/types";

/**
 * Governed agent actions — the only writes an MCP write-scoped token may propose.
 *
 * This module is deliberately free of server imports: the MCP tool registry and the approvals
 * UI both read these types and labels. A proposal is a normal `human_approvals` row; nothing
 * here writes, and no action ever executes without a person with `approvals.decide`. The frozen
 * design is `docs/ai/mcp-write-proposals.md`; a new action is added here first and hand-written
 * against an existing supervised command.
 */
export const AGENT_ACTION_TYPES = ["record_manual_message_sent"] as const;

export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const AGENT_ACTION_LABELS: Record<AgentActionType, string> = {
  record_manual_message_sent: "Record manual message sent",
};

export function isAgentActionType(value: unknown): value is AgentActionType {
  return typeof value === "string" && (AGENT_ACTION_TYPES as readonly string[]).includes(value);
}

/** The verified token identity is passed by the MCP layer, never by the calling agent. */
export type AgentActionProposalInput = {
  action: AgentActionType;
  targetApprovalId: string;
  reference: string;
  idempotencyKey: string;
  tokenId: string;
  tokenName: string;
};

export type AgentActionProposalResult = {
  status: "pending_approval";
  approvalId: string;
  targetApprovalId: string;
  requiresApproval: true;
  message: string;
};

export type AgentActionProposalSummary = {
  id: string;
  action: AgentActionType;
  targetApprovalId: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  reviewerNotes: string | null;
  summary: string | null;
};

/** Tool-result copy: a proposal is recorded work, never a completed action. */
export const AGENT_ACTION_PENDING_MESSAGE =
  "Proposal recorded. It is waiting for a person with approval authority in ClientOps; " +
  "nothing has been executed.";

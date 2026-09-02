import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  requireCapability,
  requireCapabilityChecks,
  requireCapabilitySet,
} from "@/server/auth/authorization.server";
import {
  loadAgentDirectoryRead,
  loadAgentHistoryPage,
  loadAiReviewRead,
} from "@/server/read-models/agent-workspaces";
import { listActivityLogs } from "@/server/repositories/activity-logs";
import { getAgentRunWithCalls, listAgentRuns } from "@/server/repositories/agent-runs";
import {
  serializeActivityLog,
  serializeAgentRun,
  serializeAgentToolCall,
} from "@/lib/serializable";
import { AGENT_SUBJECT_VIEW_CAPABILITIES } from "@/lib/agent-run-visibility";

export type {
  AgentDirectoryRead,
  AgentHistoryPageRead,
  AgentRunSummary,
  AiReviewRead,
} from "@/server/read-models/agent-workspaces";

const AGENT_HISTORY_LIMIT = 25;

export function normalizeAgentHistoryInput(input: {
  agent?: unknown;
  page?: unknown;
  limit?: unknown;
}) {
  const agent = typeof input.agent === "string" ? input.agent.trim() : "";
  if (!agent) throw new Error("Agent is required");

  const requestedPage = Number(input.page);
  const requestedLimit = Number(input.limit);
  return {
    agent,
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    limit:
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, AGENT_HISTORY_LIMIT)
        : AGENT_HISTORY_LIMIT,
  };
}

export const getAgentDirectoryRead = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("agents.view");
  return loadAgentDirectoryRead();
});

export const getAgentHistoryPage = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    normalizeAgentHistoryInput(
      (data ?? {}) as { agent?: unknown; page?: unknown; limit?: unknown },
    ),
  )
  .handler(async ({ data }) => {
    // One authorization context load answers every question this page asks. `agents.view`
    // stays required and throws on denial exactly as `requireCapability` did; the subject
    // capabilities come back as booleans. With no target passed, no ownership query runs, so
    // the page costs the same three queries it always did — which the `agents.$name`
    // maxQueries budget requires.
    const access = await requireCapabilitySet(["agents.view"], {
      optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
    });
    return loadAgentHistoryPage({ ...data, access });
  });

export const getAiReviewRead = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapabilityChecks([{ capability: "approvals.view" }, { capability: "agents.view" }]);
  return loadAiReviewRead();
});

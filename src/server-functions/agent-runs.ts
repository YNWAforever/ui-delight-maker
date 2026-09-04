import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { requirePageAuthorization } from "@/server/auth/authorization.server";
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
  AgentDirectoryRunSummary,
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
  // Same shape as getAgentHistoryPage below: one authorization context load answers "can this
  // actor see the agents surface at all", "which subjects can they see the content of at the
  // capability level" and, via `rows`, "which specific rows they may see once ownership and any
  // resource-scoped override are resolved". agents.view stays required and throws on denial
  // exactly as the single capability check it replaces; the subject capabilities still come
  // back as booleans with no target passed, so requesting them costs no ownership query on its
  // own — the read model spends `rows` on exactly the subjects the page actually returned.
  const { access, rows } = await requirePageAuthorization(["agents.view"], {
    optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
  });
  return loadAgentDirectoryRead(access, rows);
});

export const getAgentHistoryPage = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    normalizeAgentHistoryInput(
      (data ?? {}) as { agent?: unknown; page?: unknown; limit?: unknown },
    ),
  )
  .handler(async ({ data }) => {
    // One authorization context load answers every question this page asks. `agents.view`
    // stays required and throws on denial exactly as the single-capability check it replaces;
    // the subject capabilities come back as booleans, and `rows` lets the read model resolve
    // real ownership for the subjects this page's rows actually name, so a deny override
    // scoped to one record redacts that record and not its neighbours.
    const { access, rows } = await requirePageAuthorization(["agents.view"], {
      optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
    });
    return loadAgentHistoryPage({ ...data, access, rows });
  });

export const getAiReviewRead = createServerFn({ method: "GET" }).handler(async () => {
  // Same shape as getAgentDirectoryRead and getAgentHistoryPage above: one authorization
  // context load answers "can this actor see approvals and agent runs at all", "which subjects
  // can they see the content of at the capability level", and, via `rows`, which specific
  // approvals and runs they may see once ownership is resolved. approvals.view and agents.view
  // both stay required and throw on denial exactly as the two-capability check pair they
  // replace; the subject capabilities still come back as booleans with no target passed.
  const { access, rows } = await requirePageAuthorization(["approvals.view", "agents.view"], {
    optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
  });
  return loadAiReviewRead(access, rows);
});

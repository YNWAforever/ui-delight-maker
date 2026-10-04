import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { parseOperationInput } from "@/lib/operations/errors";
import { AgentRecoverySchema } from "@/lib/operations/input-schemas";
import { loadRequestAuthorization } from "@/server/auth/authorization.server";
import { recoverAgentRunCommand } from "@/server/commands/agent-recovery.server";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { requirePageAuthorization } from "@/server/auth/authorization.server";
import {
  loadAgentDirectoryRead,
  loadAgentHistoryPage,
} from "@/server/read-models/agent-workspaces";
import { listActivityLogs } from "@/server/repositories/activity-logs";
import { getAgentRunWithCalls, listAgentRuns } from "@/server/repositories/agent-runs";
import {
  serializeActivityLog,
  serializeAgentRun,
  serializeAgentToolCall,
} from "@/lib/serializable";
import { AGENT_SUBJECT_VIEW_CAPABILITIES } from "@/lib/agent-run-visibility";
import { AGENT_DEFINITIONS, agentWorkflowTypeForDisplayName } from "@/lib/agents";
import { agentQueueSchema } from "@/lib/agent-queue-input";
import { loadAgentQueue, loadAiReviewQueueRead } from "@/server/read-models/agent-queues";

export type {
  AgentDirectoryRead,
  AgentDirectoryRunSummary,
  AgentHistoryPageRead,
  AgentRunSummary,
  AiReviewRead,
} from "@/server/read-models/agent-workspaces";

const AGENT_HISTORY_LIMIT = 25;

export function normalizeAgentHistoryInput(input: {
  workflowType?: unknown;
  agent?: unknown;
  page?: unknown;
  limit?: unknown;
  runId?: unknown;
}) {
  const agent = typeof input.agent === "string" ? input.agent.trim() : "";
  const workflowType =
    typeof input.workflowType === "string"
      ? input.workflowType.trim()
      : agentWorkflowTypeForDisplayName(agent);
  if (
    !workflowType ||
    !AGENT_DEFINITIONS.some((definition) => definition.workflow_type === workflowType)
  )
    throw new Error("Known workflow type is required");

  const requestedPage = Number(input.page);
  const requestedLimit = Number(input.limit);
  return {
    workflowType,
    ...(input.runId === undefined
      ? {}
      : { runId: parseOperationInput(z.string().uuid(), input.runId) }),
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
      (data ?? {}) as {
        workflowType?: unknown;
        agent?: unknown;
        page?: unknown;
        limit?: unknown;
        runId?: unknown;
      },
    ),
  )
  .handler(async ({ data }) => {
    // One authorization context load answers every question this page asks. `agents.view`
    // stays required and throws on denial exactly as the single-capability check it replaces;
    // the subject capabilities come back as booleans, and `rows` lets the read model resolve
    // real ownership for the subjects this page's rows actually name, so a deny override
    // scoped to one record redacts that record and not its neighbours.
    const context = await loadRequestAuthorization();
    const { access, rows } = await requirePageAuthorization(["agents.view"], {
      optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
      context,
      cacheRowOwners: true,
    });
    return loadAgentHistoryPage({ ...data, access, rows, recoveryContext: context });
  });

export const getAiReviewRead = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    parseOperationInput(agentQueueSchema, {
      ...((data ?? {}) as Record<string, unknown>),
      queue: "approvals",
    }),
  )
  .handler(async ({ data }) => {
    // Same shape as getAgentDirectoryRead and getAgentHistoryPage above: one authorization
    // context load answers "can this actor see approvals and agent runs at all", "which subjects
    // can they see the content of at the capability level", and, via `rows`, which specific
    // approvals and runs they may see once ownership is resolved. approvals.view and agents.view
    // both stay required and throw on denial exactly as the two-capability check pair they
    // replace; the subject capabilities still come back as booleans with no target passed.
    const context = await loadRequestAuthorization();
    const { rows } = await requirePageAuthorization(["approvals.view", "agents.view"], {
      optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
      context,
      cacheRowOwners: true,
    });
    return loadAiReviewQueueRead(data, context, rows);
  });

export const getAgentQueue = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(agentQueueSchema, data))
  .handler(async ({ data }) => {
    const input = parseOperationInput(agentQueueSchema, data);
    const context = await loadRequestAuthorization();
    const { access, rows } = await requirePageAuthorization(
      input.queue === "approvals" ? ["agents.view", "approvals.view"] : ["agents.view"],
      {
        optional: [...AGENT_SUBJECT_VIEW_CAPABILITIES, "agents.run"],
        context,
        cacheRowOwners: true,
      },
    );
    const page = await loadAgentQueue(input, context, rows);
    // Display eligibility comes from the same server capability evaluation as the read.
    // Write commands still reauthorize every item against current scope and state.
    return page.queue === "runs"
      ? { ...page, canRun: access["agents.run"] === true, actorId: context.actor.profileId }
      : page;
  });

export const recoverAgentRunFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(AgentRecoverySchema, data))
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    const run = await recoverAgentRunCommand(context, {
      ...data,
      idempotencyKey: data.idempotencyKey ?? randomUUID(),
    });
    return serializeAgentRun(run);
  });

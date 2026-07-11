import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildRelationshipIntelligencePayload } from "@/lib/workflows/payloads";
import {
  createAccount as createAccountInNeon,
  getAccount as getAccountInNeon,
  getAccountWorkspaceData,
  listAccounts,
  type AccountFilters,
  type CreateAccountInput,
  updateAccount as updateAccountInNeon,
} from "@/server/repositories/accounts";
import {
  createAgentRun,
  findActiveRun,
  updateAgentRunResult,
} from "@/server/repositories/agent-runs";
import { serializeAgentRun } from "@/server-functions/serializers";
import type { Account } from "@/lib/types";

export const getAccounts = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as AccountFilters)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listAccounts(data);
  });

export const getAccount = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getAccountInNeon(data.id);
  });

export const getAccountWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getAccountWorkspaceData(data.id);
  });

export const createAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAccountInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createAccountInNeon(data);
  });

export const updateAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Account> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateAccountInNeon(data.id, data.updates);
  });

export const triggerRelationshipIntelligence = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accountId: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    const existingRun = await findActiveRun(data.accountId, "relationship_intelligence", "account");
    if (existingRun) {
      return {
        triggered: false,
        run: serializeAgentRun(existingRun),
        reason: "already_running" as const,
      };
    }

    const dispatchConfig = getN8nDispatchConfig(
      process.env.N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL,
    );
    if (!dispatchConfig) {
      return { triggered: false, reason: "missing_webhook" as const };
    }

    const { run, created } = await createAgentRun({
      agent_name: "Relationship Intelligence Agent",
      workflow_type: "relationship_intelligence",
      subject_type: "account",
      subject_id: data.accountId,
      input_data: { account_id: data.accountId },
      created_by: session.user.id,
    });

    if (!created) {
      return { triggered: false, run: serializeAgentRun(run), reason: "already_running" as const };
    }

    try {
      await triggerN8n(
        dispatchConfig,
        buildRelationshipIntelligencePayload({
          accountId: data.accountId,
          agentRunId: run.id,
        }),
      );
    } catch (error) {
      await updateAgentRunResult(run.id, {
        status: "failed",
        output_data: {
          dispatch_error: error instanceof Error ? error.message : "Unknown n8n dispatch error",
        },
        output_summary: "Failed to dispatch relationship intelligence workflow.",
      });
      throw error;
    }

    return { triggered: true, run: serializeAgentRun(run) };
  });

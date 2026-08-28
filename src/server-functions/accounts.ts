import { resolveDispatchableAgent } from "@/lib/agents";
import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildRelationshipIntelligencePayload } from "@/lib/workflows/payloads";
import {
  createAccount as createAccountInNeon,
  getAccount as getAccountInNeon,
  getAccountWorkspaceData,
  listAccounts,
  listAccountsPage,
  type AccountFilters,
  type AccountPageFilters,
  type CreateAccountInput,
  updateAccount as updateAccountInNeon,
} from "@/server/repositories/accounts";
import {
  createAgentRun,
  findActiveRun,
  updateAgentRunResult,
} from "@/server/repositories/agent-runs";
import { serializeAgentRun } from "@/lib/serializable";
import type { Account } from "@/lib/types";

export const getAccounts = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as AccountFilters)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    await requireNeonAuthSession();
    return listAccounts(data);
  });

export const getAccountsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as AccountPageFilters)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    await requireNeonAuthSession();
    return listAccountsPage(data);
  });
export const getAccount = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view", { resourceType: "account", resourceId: data.id });
    await requireNeonAuthSession();
    return getAccountInNeon(data.id);
  });

export const getAccountWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view", { resourceType: "account", resourceId: data.id });
    await requireNeonAuthSession();
    return getAccountWorkspaceData(data.id);
  });

export const createAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAccountInput)
  .handler(async ({ data }) => {
    await requireCapability("accounts.create");
    await requireNeonAuthSession();
    return createAccountInNeon(data);
  });

export const updateAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Account> })
  .handler(async ({ data }) => {
    await requireCapability("accounts.update", { resourceType: "account", resourceId: data.id });
    await requireNeonAuthSession();
    return updateAccountInNeon(data.id, data.updates);
  });

export const triggerRelationshipIntelligence = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accountId: string })
  .handler(async ({ data }) => {
    await requireCapability("agents.run", { resourceType: "account", resourceId: data.accountId });
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

    // After the capability check, so an unauthorised caller is refused for being unauthorised
    // rather than told the agent is inactive; before createAgentRun, so no run row records a
    // dispatch that never happened.
    const dispatchable = resolveDispatchableAgent("relationship_intelligence");
    if (!dispatchable.dispatchable) {
      return { triggered: false, reason: dispatchable.reason };
    }

    const { run, created } = await createAgentRun({
      agent_name: dispatchable.agent.display_name,
      workflow_type: "relationship_intelligence",
      subject_type: "account",
      subject_id: data.accountId,
      input_data: { account_id: data.accountId },
      created_by: session.profile.id,
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

import { agentNameFor } from "@/lib/agents";
import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildScoreRenewalRiskPayload } from "@/lib/workflows/payloads";
import {
  createAgentRun,
  findActiveRun,
  updateAgentRunResult,
} from "@/server/repositories/agent-runs";
import {
  createEngagement as createEngagementInNeon,
  listEngagementsByClient,
  listEngagementsForRenewals,
  markEngagementEnded,
  markEngagementRenewed,
  type RenewalsFilters,
} from "@/server/repositories/engagements";
import { serializeAgentRun } from "@/server-functions/serializers";
import type { Engagement } from "@/lib/types";

export const getEngagementsByClient = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { clientId: string })
  .handler(async ({ data }) => {
    await requireCapability("engagements.view", {
      resourceType: "client",
      resourceId: data.clientId,
    });
    await requireNeonAuthSession();
    return listEngagementsByClient(data.clientId);
  });

export const getEngagementsForRenewals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as RenewalsFilters)
  .handler(async ({ data }) => {
    await requireCapability("engagements.view");
    await requireNeonAuthSession();
    return listEngagementsForRenewals(data);
  });

export const createEngagement = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as Pick<Engagement, "client_id" | "product_id" | "billing_period"> &
        Partial<
          Pick<
            Engagement,
            "owner" | "value" | "start_date" | "renewal_date" | "lead_id" | "quote_id"
          >
        >,
  )
  .handler(async ({ data }) => {
    await requireCapability("engagements.create", {
      resourceType: "client",
      resourceId: data.client_id,
    });
    await requireNeonAuthSession();
    return createEngagementInNeon(data);
  });

export const renewEngagement = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; reason?: string })
  .handler(async ({ data }) => {
    await requireCapability("engagements.update", {
      resourceType: "engagement",
      resourceId: data.id,
    });
    const session = await requireNeonAuthSession();
    return markEngagementRenewed({ id: data.id, actorId: session.user.id, reason: data.reason });
  });

export const endEngagement = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; reason: string })
  .handler(async ({ data }) => {
    await requireCapability("engagements.update", {
      resourceType: "engagement",
      resourceId: data.id,
    });
    const session = await requireNeonAuthSession();
    return markEngagementEnded({ id: data.id, actorId: session.user.id, reason: data.reason });
  });

export const triggerRiskScoreAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { engagementId: string })
  .handler(async ({ data }) => {
    await requireCapability("agents.run", {
      resourceType: "engagement",
      resourceId: data.engagementId,
    });
    const session = await requireNeonAuthSession();
    const existingRun = await findActiveRun(data.engagementId, "score_renewal_risk", "engagement");
    if (existingRun) {
      return {
        triggered: false,
        run: serializeAgentRun(existingRun),
        reason: "already_running" as const,
      };
    }

    const dispatchConfig = getN8nDispatchConfig(process.env.N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL);
    if (!dispatchConfig) {
      return { triggered: false, reason: "missing_webhook" as const };
    }

    const { run, created } = await createAgentRun({
      agent_name: agentNameFor("score_renewal_risk"),
      workflow_type: "score_renewal_risk",
      subject_id: data.engagementId,
      subject_type: "engagement",
      input_data: { engagement_id: data.engagementId },
      created_by: session.user.id,
    });

    if (!created) {
      return { triggered: false, run: serializeAgentRun(run), reason: "already_running" as const };
    }

    try {
      await triggerN8n(
        dispatchConfig,
        buildScoreRenewalRiskPayload({ engagementId: data.engagementId, agentRunId: run.id }),
      );
    } catch (error) {
      await updateAgentRunResult(run.id, {
        status: "failed",
        output_data: {
          dispatch_error: error instanceof Error ? error.message : "Unknown n8n dispatch error",
        },
        output_summary: "Failed to dispatch renewal risk scoring workflow.",
      });
      throw error;
    }

    return { triggered: true, run: serializeAgentRun(run) };
  });

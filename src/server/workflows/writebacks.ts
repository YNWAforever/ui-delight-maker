import type { QualificationData } from "@/lib/types";
import type {
  QualificationWritebackPayload,
  RelationshipIntelligenceWritebackPayload,
  QuoteDraftWritebackPayload,
  ReplyDraftWritebackPayload,
  ScoreRenewalRiskWritebackPayload,
} from "@/lib/workflows/types";
import { transaction } from "@/server/db/neon.server";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { getAgentRunForUpdate, updateAgentRunResult } from "@/server/repositories/agent-runs";
import { createApproval } from "@/server/repositories/approvals";
import { updateAccount } from "@/server/repositories/accounts";
import { applyEngagementScore, getEngagement } from "@/server/repositories/engagements";
import { assertLeadExists, updateLead } from "@/server/repositories/leads";
import { createQuote } from "@/server/repositories/quotes";
import { upsertRelationshipSignals } from "@/server/repositories/relationship-signals";

function getHumanReviewRequired(qualificationData: unknown, confidenceScore: number) {
  if (
    qualificationData &&
    typeof qualificationData === "object" &&
    "human_review_required" in qualificationData
  ) {
    return Boolean(
      (qualificationData as { human_review_required?: unknown }).human_review_required,
    );
  }

  return confidenceScore < 0.7;
}

function getExistingApprovalId(outputData: unknown) {
  if (!outputData || typeof outputData !== "object") {
    return null;
  }

  const approvalId = (outputData as { approval_id?: unknown }).approval_id;
  return typeof approvalId === "string" && approvalId.length > 0 ? approvalId : null;
}

function getExistingQuoteDraftResult(outputData: unknown) {
  if (!outputData || typeof outputData !== "object") {
    return null;
  }

  const result = outputData as { quote_id?: unknown; approval_id?: unknown };
  if (typeof result.quote_id !== "string" || result.quote_id.length === 0) {
    return null;
  }

  return {
    quoteId: result.quote_id,
    approvalId: typeof result.approval_id === "string" ? result.approval_id : null,
  };
}

export async function writeQualificationResult(payload: QualificationWritebackPayload) {
  await transaction(async (db) => {
    await updateLead(
      payload.lead_id,
      {
        lead_score: payload.lead_score,
        qualification_data: payload.qualification_data as QualificationData,
      },
      db,
    );

    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: "completed",
        output_data: payload.qualification_data,
        output_summary: payload.output_summary,
        confidence_score: payload.confidence_score,
        human_review_required: getHumanReviewRequired(
          payload.qualification_data,
          payload.confidence_score,
        ),
        duration_ms: payload.duration_ms ?? null,
        tokens_used: payload.tokens_used ?? null,
        model_used: payload.model_used ?? null,
      },
      db,
    );

    await createActivityLog(
      {
        actor_type: "agent",
        actor_id: payload.agent_run_id,
        actor_name: "Lead Qualification Agent",
        action: "qualified lead",
        object_type: "lead",
        object_id: payload.lead_id,
        diff_data: {
          lead_score: payload.lead_score,
          qualification_data: payload.qualification_data,
        },
      },
      db,
    );
  });
}

export async function writeReplyDraftResult(payload: ReplyDraftWritebackPayload) {
  return transaction(async (db) => {
    await assertLeadExists(payload.lead_id, db);

    const agentRun = await getAgentRunForUpdate(payload.agent_run_id, db);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }

    if (agentRun.status === "waiting_approval" || agentRun.status === "completed") {
      const approvalId = getExistingApprovalId(agentRun.output_data);
      if (approvalId) {
        return approvalId;
      }
    }

    const approval = await createApproval(
      {
        agent_run_id: payload.agent_run_id,
        approval_type: "message_send",
        requested_by: "Reply Draft Agent",
        context_data: {
          lead_id: payload.lead_id,
          draft_message: payload.draft_message,
          confidence_score: payload.confidence_score,
          risk_notes: payload.risk_notes ?? [],
        },
        context_summary: payload.context_summary,
      },
      db,
    );

    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: "waiting_approval",
        output_data: {
          approval_id: approval.id,
          draft_message: payload.draft_message,
          risk_notes: payload.risk_notes ?? [],
        },
        output_summary: payload.context_summary,
        confidence_score: payload.confidence_score,
        human_review_required: true,
      },
      db,
    );

    await createActivityLog(
      {
        actor_type: "agent",
        actor_id: payload.agent_run_id,
        actor_name: "Reply Draft Agent",
        action: "drafted reply for review",
        object_type: "lead",
        object_id: payload.lead_id,
        diff_data: { approval_id: approval.id },
      },
      db,
    );

    return approval.id;
  });
}

export async function writeScoreRenewalRiskResult(payload: ScoreRenewalRiskWritebackPayload) {
  return transaction(async (db) => {
    const agentRun = await getAgentRunForUpdate(payload.agent_run_id, db);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }

    if (agentRun.status === "waiting_approval") {
      const approvalId = getExistingApprovalId(agentRun.output_data);
      if (approvalId) {
        return { applied: false as const, approvalId };
      }
    }

    if (agentRun.status === "completed") {
      return { applied: true as const };
    }

    const engagement = await getEngagement(payload.engagement_id, db);
    const isRaiseToHigh = payload.renewal_risk === "high" && engagement.renewal_risk !== "high";

    const approval = isRaiseToHigh
      ? await createApproval(
          {
            agent_run_id: payload.agent_run_id,
            approval_type: "cs_risk_review",
            requested_by: "Renewal Risk Agent",
            context_data: {
              engagement_id: payload.engagement_id,
              health_score: payload.health_score,
              renewal_risk: payload.renewal_risk,
              risk_reasoning: payload.risk_reasoning,
              suggested_next_action: payload.suggested_next_action,
            },
            context_summary: payload.output_summary,
          },
          db,
        )
      : null;

    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: isRaiseToHigh ? "waiting_approval" : "completed",
        output_data: {
          health_score: payload.health_score,
          renewal_risk: payload.renewal_risk,
          risk_reasoning: payload.risk_reasoning,
          suggested_next_action: payload.suggested_next_action,
          ...(approval ? { approval_id: approval.id } : {}),
        },
        output_summary: payload.output_summary,
        confidence_score: payload.confidence,
        human_review_required: isRaiseToHigh,
        model_used: payload.model_used ?? null,
      },
      db,
    );

    if (isRaiseToHigh && approval) {
      await createActivityLog(
        {
          actor_type: "agent",
          actor_id: payload.agent_run_id,
          actor_name: "Renewal Risk Agent",
          action: "flagged high renewal risk for review",
          object_type: "engagement",
          object_id: payload.engagement_id,
          diff_data: { approval_id: approval.id },
        },
        db,
      );

      return { applied: false as const, approvalId: approval.id };
    }

    await applyEngagementScore(
      payload.engagement_id,
      {
        health_score: payload.health_score,
        renewal_risk: payload.renewal_risk,
        risk_reasoning: payload.risk_reasoning,
        next_action: payload.suggested_next_action,
      },
      db,
    );

    await createActivityLog(
      {
        actor_type: "agent",
        actor_id: payload.agent_run_id,
        actor_name: "Renewal Risk Agent",
        action: "scored renewal risk",
        object_type: "engagement",
        object_id: payload.engagement_id,
        diff_data: { health_score: payload.health_score, renewal_risk: payload.renewal_risk },
      },
      db,
    );

    return { applied: true as const };
  });
}

export async function writeQuoteDraftResult(payload: QuoteDraftWritebackPayload) {
  return transaction(async (db) => {
    await assertLeadExists(payload.lead_id, db);

    const agentRun = await getAgentRunForUpdate(payload.agent_run_id, db);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }

    if (agentRun.status === "waiting_approval" || agentRun.status === "completed") {
      const existingResult = getExistingQuoteDraftResult(agentRun.output_data);
      if (existingResult) {
        return existingResult;
      }
    }

    const quote = await createQuote(
      {
        lead_id: payload.lead_id,
        number: payload.quote.number ?? null,
        currency: payload.quote.currency,
        total_value: payload.quote.total_value,
        valid_until: payload.quote.valid_until ?? null,
        line_items: payload.quote.line_items,
      },
      db,
    );

    const approval = payload.create_send_approval
      ? await createApproval(
          {
            agent_run_id: payload.agent_run_id,
            approval_type: "quote_send",
            requested_by: "Quote Draft Agent",
            context_data: {
              lead_id: payload.lead_id,
              quote_id: quote.id,
              confidence_score: payload.confidence_score,
            },
            context_summary: payload.context_summary ?? "Review drafted quote before sending.",
          },
          db,
        )
      : null;

    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: approval ? "waiting_approval" : "completed",
        output_data: {
          quote_id: quote.id,
          approval_id: approval?.id ?? null,
        },
        output_summary: payload.context_summary ?? "Draft quote created.",
        confidence_score: payload.confidence_score,
        human_review_required: Boolean(approval),
      },
      db,
    );

    await createActivityLog(
      {
        actor_type: "agent",
        actor_id: payload.agent_run_id,
        actor_name: "Quote Draft Agent",
        action: "created draft quote",
        object_type: "quote",
        object_id: quote.id,
        diff_data: { lead_id: payload.lead_id, approval_id: approval?.id ?? null },
      },
      db,
    );

    return {
      quoteId: quote.id,
      approvalId: approval?.id ?? null,
    };
  });
}

export async function writeRelationshipIntelligenceResult(
  payload: RelationshipIntelligenceWritebackPayload,
) {
  return transaction(async (db) => {
    const agentRun = (await getAgentRunForUpdate(payload.agent_run_id, db)) as
      | ({ subject_type?: unknown; subject_id?: unknown; status: string; output_data: unknown } & {
          id: string;
        })
      | null;
    if (!agentRun) {
      throw new Error("Agent run not found");
    }

    if (agentRun.subject_type !== "account" || agentRun.subject_id !== payload.account_id) {
      throw new Error("Agent run does not belong to this account");
    }

    if (agentRun.status === "completed") {
      return { applied: true as const };
    }

    await updateAccount(
      payload.account_id,
      {
        next_action: payload.next_action,
        last_activity_at: new Date().toISOString(),
      },
      db,
    );

    const signals = await upsertRelationshipSignals(
      payload.account_id,
      payload.signals.map((signal) => ({
        account_id: payload.account_id,
        source: "ai",
        ...signal,
      })),
      db,
    );

    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: "completed",
        output_data: { next_action: payload.next_action, signals },
        output_summary: payload.output_summary,
        confidence_score: payload.confidence_score,
        human_review_required: false,
        model_used: payload.model_used ?? null,
      },
      db,
    );

    await createActivityLog(
      {
        actor_type: "agent",
        actor_id: payload.agent_run_id,
        actor_name: "Relationship Intelligence Agent",
        action: "analyzed account relationship",
        object_type: "account",
        object_id: payload.account_id,
        diff_data: { signal_count: signals.length, next_action: payload.next_action },
      },
      db,
    );

    return { applied: true as const, signalCount: signals.length };
  });
}

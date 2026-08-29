import type {
  QualificationWritebackPayload,
  RelationshipIntelligenceWritebackPayload,
  QuoteDraftWritebackPayload,
  ReplyDraftWritebackPayload,
  ScoreRenewalRiskWritebackPayload,
} from "@/lib/workflows/types";
import type { AgentPolicy, AgentWorkflowType } from "@/lib/agents";
import { normalizeQualificationData } from "@/lib/workflows/qualification";
import { transaction } from "@/server/db/neon.server";
import { loadAgentPolicies } from "@/server/repositories/agent-policy";
import { createActivityLog } from "@/server/repositories/activity-logs";
import { getAgentRunForUpdate, updateAgentRunResult } from "@/server/repositories/agent-runs";
import { createApproval } from "@/server/repositories/approvals";
import { updateAccount } from "@/server/repositories/accounts";
import { applyEngagementScore, getEngagement } from "@/server/repositories/engagements";
import { assertLeadExists, updateLead } from "@/server/repositories/leads";
import { createQuote } from "@/server/repositories/quotes";
import { upsertRelationshipSignals } from "@/server/repositories/relationship-signals";

/**
 * Whether this workflow's effective policy permits parking a run in `waiting_approval`.
 *
 * Deliberately **not** `resolveDispatchableAgent`. A writeback runs after a dispatch that has
 * already happened, so an agent deactivated mid-run must still be able to record its result;
 * `status` is the dispatch path's business and nothing here reads it. Only `humanApproval`
 * is consulted, and only as a gate: each writeback keeps its own condition for *when* a run
 * deserves a human, and this decides whether that condition is allowed to fire at all.
 *
 * Until this existed, `human_approval` described the writebacks rather than governing them —
 * `/agents/$name` showed the flag beside values the dispatch path actually reads, and flipping
 * it changed nothing. It now reads the same effective-policy map the dispatch guard reads
 * (stored overrides already merged over the catalogue by `loadAgentPolicies`), rather than the
 * catalogue directly, so a stored override changes what a writeback does too, not only what
 * the badge on `/agents/$name` shows.
 *
 * Every catalogue workflow is always present in a map `loadAgentPolicies` produced, so a
 * missing entry here means the caller passed the wrong map, not a real gap — and this throws
 * rather than guessing, deliberately the opposite failure direction from
 * `resolveDispatchableAgent`'s fallback to `agent.status`. The guard fails safe toward
 * *refusing a dispatch that has not happened yet*, where a wrong guess only costs an agent run
 * that could be retried. This function fails loudly instead, because guessing `false` here
 * would silently skip human review on a run that already executed — the one thing this
 * function exists to decide.
 */
function agentParksForApproval(
  workflowType: AgentWorkflowType,
  policies: Map<AgentWorkflowType, AgentPolicy>,
): boolean {
  const policy = policies.get(workflowType);
  if (!policy) throw new Error(`No agent policy for workflow type "${workflowType}"`);
  return policy.humanApproval;
}

/**
 * Whether the agent run a callback names is actually the run for the record it wants to write.
 *
 * n8n supplies the run id and the subject id as two independent fields, so nothing but this
 * check stops a mis-wired workflow from writing one lead's qualification onto another lead, or
 * a quote draft onto an unrelated engagement. `getAgentRunForUpdate` already selects the whole
 * row, so `subject_type`/`subject_id` are in hand at no extra cost.
 */
function assertAgentRunSubject(
  agentRun: { subject_type?: unknown; subject_id?: unknown },
  expectedType: string,
  expectedId: string,
) {
  if (agentRun.subject_type !== expectedType || agentRun.subject_id !== expectedId) {
    throw new Error(`Agent run does not belong to this ${expectedType.replace(/_/g, " ")}`);
  }
}

/**
 * Whether a qualification needs a human before it counts.
 *
 * `qualification_data` is model output relayed by n8n, so a field inside it may only ever
 * *raise* the review bar, never lower it. Treating it as authoritative let a model that
 * emitted `human_review_required: false` skip the review that the confidence threshold exists
 * to force.
 */
function getHumanReviewRequired(qualificationData: unknown, confidenceScore: number) {
  const requiredByConfidence = confidenceScore < 0.7;

  if (
    qualificationData &&
    typeof qualificationData === "object" &&
    "human_review_required" in qualificationData
  ) {
    return (
      requiredByConfidence ||
      Boolean((qualificationData as { human_review_required?: unknown }).human_review_required)
    );
  }

  return requiredByConfidence;
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

/**
 * No `agentParksForApproval` call here, and that is the honest shape rather than an omission:
 * `qualify_lead` carries `human_approval: false` and this writeback has no parking path to
 * gate. The score it writes is advisory — `human_review_required` flags a low-confidence
 * result for attention without withholding it — so the run always completes.
 * `__tests__/writebacks.test.ts` pins the catalogue flag to that absence, so flipping it to
 * `true` fails loudly instead of silently doing nothing.
 */
export async function writeQualificationResult(payload: QualificationWritebackPayload) {
  await transaction(async (db) => {
    const agentRun = await getAgentRunForUpdate(payload.agent_run_id, db);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }
    assertAgentRunSubject(agentRun, "lead", payload.lead_id);

    // Every other writeback short-circuits on an already-settled run. Without it a redelivered
    // callback replays the model's scoring over whatever a rep has since edited by hand.
    if (agentRun.status === "completed") {
      return;
    }

    // Normalized before it is stored, not cast. The agent returns free-form model output, and
    // every reader of this column — the lead Insights tab most of all — assumes the declared
    // shape is actually there.
    const qualificationData = normalizeQualificationData(payload.qualification_data);

    await updateLead(
      payload.lead_id,
      {
        lead_score: payload.lead_score,
        qualification_data: qualificationData,
      },
      db,
    );

    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: "completed",
        output_data: qualificationData,
        output_summary: payload.output_summary,
        confidence_score: payload.confidence_score,
        human_review_required: getHumanReviewRequired(qualificationData, payload.confidence_score),
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
          qualification_data: qualificationData,
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
    assertAgentRunSubject(agentRun, "lead", payload.lead_id);

    if (agentRun.status === "waiting_approval" || agentRun.status === "completed") {
      const approvalId = getExistingApprovalId(agentRun.output_data);
      if (approvalId) {
        return approvalId;
      }
    }

    // This writeback has no condition of its own — a reply draft is never sent unreviewed —
    // so the effective policy is the whole decision.
    const policies = await loadAgentPolicies();
    const approval = agentParksForApproval("draft_reply", policies)
      ? await createApproval(
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
        )
      : null;

    // Forwarded, not measured. No n8n workflow sends these yet, so they stay null - the
    // Duration and Tokens columns already render "-" for null, and nothing claims
    // otherwise. When the workflows are updated the values land here with no code change.
    await updateAgentRunResult(
      payload.agent_run_id,
      {
        status: approval ? "waiting_approval" : "completed",
        output_data: {
          approval_id: approval?.id ?? null,
          draft_message: payload.draft_message,
          risk_notes: payload.risk_notes ?? [],
        },
        output_summary: payload.context_summary,
        confidence_score: payload.confidence_score,
        human_review_required: Boolean(approval),
        tokens_used: payload.tokens_used ?? null,
        model_used: payload.model_used ?? null,
      },
      db,
    );

    await createActivityLog(
      {
        actor_type: "agent",
        actor_id: payload.agent_run_id,
        actor_name: "Reply Draft Agent",
        action: approval ? "drafted reply for review" : "drafted reply",
        object_type: "lead",
        object_id: payload.lead_id,
        diff_data: { approval_id: approval?.id ?? null },
      },
      db,
    );

    return approval?.id ?? null;
  });
}

export async function writeScoreRenewalRiskResult(payload: ScoreRenewalRiskWritebackPayload) {
  return transaction(async (db) => {
    const agentRun = await getAgentRunForUpdate(payload.agent_run_id, db);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }
    assertAgentRunSubject(agentRun, "engagement", payload.engagement_id);

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
    // The condition is unchanged and stays where it was; the effective policy gates it.
    const policies = await loadAgentPolicies();
    const parksForApproval = agentParksForApproval("score_renewal_risk", policies) && isRaiseToHigh;

    const approval = parksForApproval
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
        status: parksForApproval ? "waiting_approval" : "completed",
        output_data: {
          health_score: payload.health_score,
          renewal_risk: payload.renewal_risk,
          risk_reasoning: payload.risk_reasoning,
          suggested_next_action: payload.suggested_next_action,
          ...(approval ? { approval_id: approval.id } : {}),
        },
        output_summary: payload.output_summary,
        confidence_score: payload.confidence,
        human_review_required: parksForApproval,
        tokens_used: payload.tokens_used ?? null,
        model_used: payload.model_used ?? null,
      },
      db,
    );

    if (parksForApproval && approval) {
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
    assertAgentRunSubject(agentRun, "lead", payload.lead_id);

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

    // The condition is unchanged and stays where it was; the effective policy gates it.
    const policies = await loadAgentPolicies();
    const approval =
      agentParksForApproval("draft_quote", policies) && payload.create_send_approval
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
        tokens_used: payload.tokens_used ?? null,
        model_used: payload.model_used ?? null,
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

/**
 * Like `writeQualificationResult`, no gate: `relationship_intelligence` carries
 * `human_approval: false` and there is no parking path to gate. Signals and a suggested next
 * action are surfaced for a human to act on, not held back pending one, and no `approval_type`
 * in the `approvals` check constraint describes this run. The catalogue flag is pinned to
 * `false` in `__tests__/writebacks.test.ts` so it cannot start claiming otherwise.
 */
export async function writeRelationshipIntelligenceResult(
  payload: RelationshipIntelligenceWritebackPayload,
) {
  return transaction(async (db) => {
    const agentRun = await getAgentRunForUpdate(payload.agent_run_id, db);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }
    assertAgentRunSubject(agentRun, "account", payload.account_id);

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
        tokens_used: payload.tokens_used ?? null,
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

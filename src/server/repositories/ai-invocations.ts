import { queryOne } from "@/server/db/neon.server";
import { updateAgentRunResult } from "@/server/repositories/agent-runs";
import type { AIInvocationContext, AIUsage } from "@/server/workflows/ai-invocation.server";

type PolicyRow = { id: string; status: "active" | "inactive" };
type InvocationRow = {
  id: string;
  status: string;
  outcome_code: string | null;
  input_data: { sha256?: string } | null;
  output_data: { tidied?: string } | null;
};

export async function readNoteTidyPolicy() {
  const row = await queryOne<PolicyRow>(
    "select id,status from agent_policy_versions where workflow_type='note_tidy' order by created_at desc,version_seq desc limit 1",
  );
  return { status: row?.status ?? "active", versionId: row?.id ?? null };
}

export async function beginNoteTidyRun(input: Parameters<AIInvocationContext["beginRun"]>[0]) {
  const inserted = await queryOne<InvocationRow>(
    `insert into agent_runs
      (agent_name,workflow_type,trigger_type,subject_type,subject_id,
       input_data,status,created_by,idempotency_key,policy_version_id)
     values ('Note Tidy','note_tidy','manual','note',$1,
       $2::jsonb,'running',$3,$4,$5)
     on conflict do nothing returning id,status,input_data,output_data`,
    [
      input.subjectId,
      JSON.stringify({ length: input.inputLength, sha256: input.inputFingerprint }),
      input.actorId,
      input.idempotencyKey,
      input.policyVersionId,
    ],
  );
  if (inserted) return { runId: inserted.id, created: true };
  const existing = await queryOne<InvocationRow>(
    `select id,status,outcome_code,input_data,output_data from agent_runs
      where workflow_type='note_tidy' and created_by=$1 and idempotency_key=$2`,
    [input.actorId, input.idempotencyKey],
  );
  if (!existing) throw new Error("AI invocation conflicts with an active run");
  if (existing.input_data?.sha256 !== input.inputFingerprint) {
    throw new Error("AI idempotency key was reused with different input");
  }
  return {
    runId: existing.id,
    created: false,
    status: existing.status,
    outcomeCode: existing.outcome_code,
    output: existing.status === "completed" ? (existing.output_data?.tidied ?? null) : null,
  };
}

export async function finishNoteTidyRun(
  runId: string,
  result: {
    status: "completed" | "failed";
    outcomeCode: "completed" | "timeout" | "dispatch_ambiguous" | "provider_error";
    output: string | null;
    usage: AIUsage | null;
    model: string | null;
  },
) {
  await updateAgentRunResult(runId, {
    status: result.status,
    output_data: result.output ? { tidied: result.output } : null,
    output_summary: result.status === "completed" ? "Note tidied." : "Note tidy failed.",
    tokens_used: result.usage?.totalTokens ?? null,
    usage_data: result.usage,
    outcome_code: result.outcomeCode,
    model_used: result.model,
  });
}

import { query } from "@/server/db/neon.server";
import { normalizeAIUsage } from "@/server/workflows/ai-invocation.server";
type NoteTidyRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  outcome_code: string | null;
  model_used: string | null;
  tokens_used: number | null;
  usage_data: Parameters<typeof normalizeAIUsage>[0];
};
/** This is an actor-owned invocation, not a fabricated CRM note resource/owner. */
export async function loadNoteTidyRuns(
  actorId: string,
  input: { page: number; limit: 25; runId?: string },
) {
  const values = [actorId, input.runId ?? null];
  const rows = await query<NoteTidyRow>(
    `select id,status,created_at,updated_at,outcome_code,model_used,tokens_used,usage_data from agent_runs where workflow_type='note_tidy' and created_by=$1 and ($2::uuid is null or id=$2::uuid) order by created_at desc,id desc limit $3 offset $4`,
    [...values, input.limit, (input.page - 1) * input.limit],
  );
  const count = await query<{ count: string }>(
    "select count(*)::text as count from agent_runs where workflow_type='note_tidy' and created_by=$1 and ($2::uuid is null or id=$2::uuid)",
    values,
  );
  return {
    items: rows.map(({ usage_data, ...row }) => ({ ...row, usage: normalizeAIUsage(usage_data) })),
    total: Number(count[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

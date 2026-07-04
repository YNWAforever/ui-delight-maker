import { query } from "@/server/db/neon.server";
import { createNotification } from "@/server/repositories/notifications";
import { createAgentRun, findActiveRun, updateAgentRunResult } from "@/server/repositories/agent-runs";
import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";
import { buildScoreRenewalRiskPayload } from "@/lib/workflows/payloads";
import {
  buildRenewalWindowDedupeKey,
  buildStaleTouchpointDedupeKey,
  getBoundaryCrossed,
  isEngagementStale,
} from "@/lib/retention-sweep-utils";
import type { Engagement } from "@/lib/types";

type SweepCandidate = Pick<
  Engagement,
  "id" | "client_id" | "owner" | "renewal_date" | "last_touch_at" | "start_date"
> & { client_company_name: string };

async function listActiveEngagementsForSweep(): Promise<SweepCandidate[]> {
  return query<SweepCandidate>(
    `
      select
        e.id,
        e.client_id,
        e.owner,
        e.renewal_date::text as renewal_date,
        e.last_touch_at::text as last_touch_at,
        e.start_date::text as start_date,
        c.company_name as client_company_name
      from engagements e
      join clients c on c.id = e.client_id
      where e.status = 'active'
    `,
  );
}

async function fallbackAdmins(): Promise<string[]> {
  const rows = await query<{ id: string }>("select id from profiles where role = 'admin'");
  return rows.map((r) => r.id);
}

export async function runRetentionSweep(today: string) {
  const engagements = await listActiveEngagementsForSweep();
  const admins = await fallbackAdmins();
  let renewalNotified = 0;
  let staleNotified = 0;
  let rescoreDispatched = 0;

  for (const engagement of engagements) {
    const recipients = engagement.owner ? [engagement.owner] : admins;

    const boundary = getBoundaryCrossed(engagement.renewal_date, today);
    if (boundary && engagement.renewal_date) {
      const dedupeKey = buildRenewalWindowDedupeKey(engagement.id, boundary, engagement.renewal_date);
      for (const userId of recipients) {
        const inserted = await createNotification({
          user_id: userId,
          type: "renewal_window",
          title: `${engagement.client_company_name} renews in ${boundary === "overdue" ? "the past" : `${boundary} days`}`,
          body: `Engagement ${engagement.id} crosses the ${boundary} boundary.`,
          object_type: "engagement",
          object_id: engagement.id,
          dedupe_key: dedupeKey,
        });
        if (inserted) renewalNotified += 1;
      }

      const existingRun = await findActiveRun(engagement.id, "score_renewal_risk", "engagement");
      const dispatchConfig = getN8nDispatchConfig(process.env.N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL);
      if (!existingRun && dispatchConfig) {
        const { run, created } = await createAgentRun({
          agent_name: "Renewal Risk Agent",
          workflow_type: "score_renewal_risk",
          subject_id: engagement.id,
          subject_type: "engagement",
          trigger_type: "schedule",
          input_data: { engagement_id: engagement.id, trigger: "retention_sweep", boundary },
          created_by: null,
        });

        if (created) {
          try {
            await triggerN8n(
              dispatchConfig,
              buildScoreRenewalRiskPayload({ engagementId: engagement.id, agentRunId: run.id }),
            );
            rescoreDispatched += 1;
          } catch (error) {
            // Isolate one engagement's dispatch failure from the rest of the sweep — mark this
            // run failed and move on; it becomes retryable from the Renewals panel's "Re-score risk" button.
            await updateAgentRunResult(run.id, {
              status: "failed",
              output_data: { dispatch_error: error instanceof Error ? error.message : "Unknown n8n dispatch error" },
              output_summary: "Retention sweep failed to dispatch renewal risk scoring.",
            });
          }
        }
      }
    }

    if (isEngagementStale({ lastTouchAt: engagement.last_touch_at, startDate: engagement.start_date, today })) {
      const episodeAnchor = engagement.last_touch_at ?? null;
      const dedupeKey = buildStaleTouchpointDedupeKey(engagement.id, episodeAnchor);
      for (const userId of recipients) {
        const inserted = await createNotification({
          user_id: userId,
          type: "stale_touchpoint",
          title: `${engagement.client_company_name} has no recent touchpoint`,
          body: `Engagement ${engagement.id} hasn't been touched in 30+ days.`,
          object_type: "engagement",
          object_id: engagement.id,
          dedupe_key: dedupeKey,
        });
        if (inserted) staleNotified += 1;
      }
    }
  }

  return { engagementsScanned: engagements.length, renewalNotified, staleNotified, rescoreDispatched };
}

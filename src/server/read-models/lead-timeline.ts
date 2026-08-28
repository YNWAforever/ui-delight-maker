import { query } from "@/server/db/neon.server";

export type LeadTimelineSummary = {
  total: number;
  lastActivityAt: string | null;
  byAction: Array<{ action: string; count: number; lastAt: string }>;
};

type Row = { action: string; count: number | string; last_at: string };

/**
 * What has actually happened on a lead, counted.
 *
 * Deliberately deterministic rather than generated: the control this replaces produced a
 * toast and summarised nothing, and a summary nobody can reproduce is no better. The
 * shape is structured so a narrative could later be layered over the same numbers
 * without changing the call site.
 *
 * One grouped query. `activity_logs_object_idx (object_type, object_id, created_at desc)`
 * already covers this predicate.
 */
export async function summariseLeadTimeline(leadId: string): Promise<LeadTimelineSummary> {
  const rows = await query<Row>(
    `
      select action, count(*) as count, max(created_at) as last_at
        from activity_logs
       where object_type = 'lead' and object_id = $1
       group by action
       order by max(created_at) desc
    `,
    [leadId],
  );

  const byAction = rows.map((row) => ({
    action: row.action,
    count: Number(row.count),
    lastAt: row.last_at,
  }));

  return {
    total: byAction.reduce((sum, entry) => sum + entry.count, 0),
    // Null, not a fabricated date. "No activity yet" and "we failed" must not look alike.
    // Correct only because the query orders by `max(created_at) desc`; if that ordering
    // ever changes, compute the maximum explicitly instead.
    lastActivityAt: byAction[0]?.lastAt ?? null,
    byAction,
  };
}

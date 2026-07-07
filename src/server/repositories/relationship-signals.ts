import { buildFilters } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { RelationshipSignal } from "@/lib/types";
import type { RelationshipSignalDraft } from "@/lib/relationship/types";

export type RelationshipSignalFilters = {
  account_id?: string;
  signal_type?: string;
  openOnly?: boolean;
};

export async function listRelationshipSignals(filters: RelationshipSignalFilters = {}) {
  const where = buildFilters([
    ["account_id", filters.account_id],
    ["signal_type", filters.signal_type],
  ]);
  const clause = filters.openOnly
    ? `${where.sql ? `${where.sql} and` : " where"} dismissed_at is null`
    : where.sql;

  return query<RelationshipSignal>(
    `
      select *
      from relationship_signals
      ${clause}
      order by
        case severity when 'high' then 1 when 'medium' then 2 else 3 end,
        created_at desc
    `,
    where.values,
  );
}

export async function upsertRelationshipSignals(
  accountId: string,
  drafts: RelationshipSignalDraft[],
  db?: Queryable,
) {
  const rows: RelationshipSignal[] = [];

  for (const draft of drafts) {
    const row = await queryOne<RelationshipSignal>(
      `
        insert into relationship_signals
          (account_id, signal_type, severity, title, reason, suggested_action, source, dedupe_key)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (account_id, signal_type, dedupe_key)
          where dismissed_at is null
          do update set
            severity = excluded.severity,
            title = excluded.title,
            reason = excluded.reason,
            suggested_action = excluded.suggested_action,
            source = excluded.source
        returning *
      `,
      [
        accountId,
        draft.signal_type,
        draft.severity,
        draft.title,
        draft.reason,
        draft.suggested_action,
        draft.source,
        draft.dedupe_key,
      ],
      db,
    );

    if (row) rows.push(row);
  }

  return rows;
}

export async function dismissRelationshipSignal(
  id: string,
  input: { dismissed_by: string; dismissal_reason: string },
  db?: Queryable,
) {
  const signal = await queryOne<RelationshipSignal>(
    `
      update relationship_signals
      set dismissed_at = now(),
          dismissed_by = $2,
          dismissal_reason = $3
      where id = $1
      returning *
    `,
    [id, input.dismissed_by, input.dismissal_reason],
    db,
  );

  if (!signal) throw new Error("Relationship signal not found");
  return signal;
}

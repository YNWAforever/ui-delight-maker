import { buildFilters } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { Account, RelationshipSignal } from "@/lib/types";
import type { RelationshipSignalDraft } from "@/lib/relationship/types";
import {
  normalizePagination,
  parseCount,
  type PaginationInput,
} from "@/server/repositories/pagination";

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

export type RelationshipIndexFilters = PaginationInput & {
  severity?: RelationshipSignal["severity"];
  signalType?: string;
};

export type RelationshipSignalSummary = RelationshipSignal;

type RelationshipIndexRowRecord = Account & {
  open_signal_count: number | string;
  highest_severity: RelationshipSignal["severity"] | null;
  latest_signal_at: string | null;
  signal_summaries: RelationshipSignalSummary[] | string | null;
};

function parseSignalSummaries(value: RelationshipIndexRowRecord["signal_summaries"]) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as RelationshipSignalSummary[]) : [];
  } catch {
    return [];
  }
}

export async function listRelationshipIndexPage(filters: RelationshipIndexFilters = {}) {
  const { page, limit, offset } = normalizePagination(filters);
  const values: unknown[] = [];
  const signalClauses = ["rs.dismissed_at is null"];

  if (filters.severity) {
    values.push(filters.severity);
    signalClauses.push(`rs.severity = $${values.length}`);
  }
  if (filters.signalType) {
    values.push(filters.signalType);
    signalClauses.push(`rs.signal_type = $${values.length}`);
  }

  const signalWhere = signalClauses.join(" and ");
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  const queryValues = [...values, limit, offset];

  const [records, count] = await Promise.all([
    query<RelationshipIndexRowRecord>(
      `
        select
          a.id, a.name, a.website, a.domain, a.industry, a.region, a.tier,
          a.account_owner, a.lifecycle_stage, a.cs_owner, a.source, a.tags, a.notes,
          -- Only columns that exist on accounts. health_score, renewal_date and arr
          -- were selected here but live on clients/engagements, never on accounts,
          -- so Postgres rejected the query and broke /relationships. Accounts carry
          -- relationship_health; renewal and ARR figures belong to engagements.
          a.relationship_health, a.last_activity_at, a.next_action,
          a.created_at, a.updated_at,
          count(rs.id) as open_signal_count,
          case min(case rs.severity when 'high' then 1 when 'medium' then 2 else 3 end)
            when 1 then 'high'
            when 2 then 'medium'
            when 3 then 'low'
            else null
          end as highest_severity,
          max(rs.created_at) as latest_signal_at,
          to_jsonb((array_agg(
            jsonb_build_object(
              'id', rs.id,
              'account_id', rs.account_id,
              'signal_type', rs.signal_type,
              'severity', rs.severity,
              'title', rs.title,
              'reason', rs.reason,
              'suggested_action', rs.suggested_action,
              'source', rs.source,
              'dedupe_key', rs.dedupe_key,
              'dismissed_at', rs.dismissed_at,
              'dismissed_by', rs.dismissed_by,
              'dismissal_reason', rs.dismissal_reason,
              'created_at', rs.created_at,
              'updated_at', rs.updated_at
            ) order by
              case rs.severity when 'high' then 1 when 'medium' then 2 else 3 end,
              rs.created_at desc,
              rs.id desc
          ))[1:10]) as signal_summaries
        from accounts a
        join relationship_signals rs
          on rs.account_id = a.id
         and ${signalWhere}
        group by a.id
        order by latest_signal_at desc, a.id asc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      queryValues,
    ),
    queryOne<{ total: number | string }>(
      `
        select count(distinct a.id) as total
        from accounts a
        join relationship_signals rs
          on rs.account_id = a.id
         and ${signalWhere}
      `,
      values,
    ),
  ]);

  return {
    items: records.map((record) => {
      const {
        open_signal_count,
        highest_severity,
        latest_signal_at,
        signal_summaries,
        ...account
      } = record;
      return {
        account,
        openSignalCount: Number(open_signal_count),
        highestSeverity: highest_severity,
        latestSignalAt: latest_signal_at,
        signalSummaries: parseSignalSummaries(signal_summaries),
      };
    }),
    total: parseCount(count),
    page,
    limit,
  };
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
        select $1, $2, $3, $4, $5, $6, $7, $8
        where not exists (
          select 1
          from relationship_signals
          where account_id = $1
            and signal_type = $2
            and dedupe_key = $8
            and dismissed_at is not null
        )
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

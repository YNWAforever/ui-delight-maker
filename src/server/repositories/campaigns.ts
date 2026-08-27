import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { Campaign, CampaignMember } from "@/lib/types";
import {
  normalizePagination,
  parseCount,
  type PaginatedResult,
  type PaginationInput,
} from "@/server/repositories/pagination";

export type CampaignFilters = { status?: string; type?: string; owner?: string };
export type CampaignPageFilters = CampaignFilters & PaginationInput;

export type CreateCampaignInput = Pick<Campaign, "name"> &
  Partial<
    Pick<Campaign, "type" | "status" | "objective" | "owner" | "starts_at" | "ends_at" | "notes">
  >;

export type CreateCampaignMemberInput = Pick<CampaignMember, "campaign_id"> &
  Partial<
    Pick<
      CampaignMember,
      | "account_id"
      | "contact_id"
      | "raw_company_name"
      | "raw_contact_name"
      | "raw_email"
      | "raw_phone"
      | "attendee_status"
      | "interests"
      | "follow_up_owner"
      | "follow_up_status"
      | "conversion_outcome"
      | "notes"
    >
  >;

const campaignUpdateColumns: Array<keyof Partial<Campaign> & string> = [
  "name",
  "type",
  "status",
  "objective",
  "owner",
  "starts_at",
  "ends_at",
  "notes",
];

export async function listCampaigns(filters: CampaignFilters = {}) {
  const where = buildFilters([
    ["status", filters.status],
    ["type", filters.type],
    ["owner", filters.owner],
  ]);
  return query<Campaign>(
    `select * from campaigns ${where.sql} order by created_at desc`,
    where.values,
  );
}

export async function listCampaignsPage(
  filters: CampaignPageFilters = {},
): Promise<PaginatedResult<Campaign>> {
  const where = buildFilters([
    ["status", filters.status],
    ["type", filters.type],
    ["owner", filters.owner],
  ]);
  const { page, limit, offset } = normalizePagination(filters);

  const [items, count] = await Promise.all([
    query<Campaign>(
      `
        select *
        from campaigns
        ${where.sql}
        order by created_at desc, id desc
        limit $${where.values.length + 1} offset $${where.values.length + 2}
      `,
      [...where.values, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      `
        select count(*) as total
        from campaigns
        ${where.sql}
      `,
      where.values,
    ),
  ]);

  return { items, total: parseCount(count), page, limit };
}
export async function getCampaignWithMembers(id: string) {
  const [campaign, members] = await Promise.all([
    queryOne<Campaign>(
      `
        -- Only columns the campaigns table actually has. channel, audience_filter and
        -- scheduled_at were selected here but no migration creates them, so Postgres
        -- rejected the query and broke /campaigns/$id. All three are optional on the
        -- Campaign type, and the UI already falls back (channel ?? "unknown",
        -- starts_at ?? scheduled_at).
        select id, name, type, status, objective,
               owner, starts_at, ends_at, notes, created_at, updated_at
        from campaigns
        where id = $1
      `,
      [id],
    ),
    query<CampaignMember>(
      "select * from campaign_members where campaign_id = $1 order by created_at desc",
      [id],
    ),
  ]);
  if (!campaign) throw new Error("Campaign not found");
  return { campaign, members };
}

/**
 * How two attendee rows are judged to be the same person.
 *
 * One expression, used by both reads below, so the campaign-wide duplicate *count* on the
 * workspace summary and the per-row "possible duplicate" marker on the attendee page can
 * never disagree about what a duplicate is. It deliberately mirrors the key
 * `validateEventImportRows` already uses to reject a duplicate inside a single file
 * (`src/lib/relationship/event-import.ts`): email when there is one, otherwise contact
 * name plus company name, all lower-cased and trimmed.
 *
 * It resolves to NULL for a row carrying none of the three, and every caller treats NULL
 * as "not comparable" rather than as a group — without that, every anonymous row would be
 * flagged as a duplicate of every other anonymous row.
 *
 * This is detection, not prevention. `commitEventImport` still inserts unconditionally
 * (IF-D2-21 — it needs a database constraint, which is a migration), so the point of
 * these columns is that a re-imported roster is *visible* instead of silently doubling.
 */
const ATTENDEE_DEDUPE_KEY_SQL = `
  coalesce(
    nullif(lower(btrim(coalesce(raw_email, ''))), ''),
    nullif(
      lower(btrim(coalesce(raw_contact_name, ''))) || '|' ||
      lower(btrim(coalesce(raw_company_name, ''))),
      '|'
    )
  )
`;

/** NULL keys count as one, so an unidentifiable row is never called a duplicate. */
const ATTENDEE_DUPLICATE_COUNT_SQL = `
  case when dedupe_key is null then 1 else count(*) over (partition by dedupe_key) end
`;

export type CampaignAttendeeSummary = {
  total: number;
  attended: number;
  highIntent: number;
  openFollowUp: number;
  converted: number;
  /** Attendees with no `account_id`. Surfaced as "Unmatched", never hidden. */
  unmatchedAccounts: number;
  /** Attendees sharing a dedupe key with at least one other attendee in this campaign. */
  possibleDuplicates: number;
  latestImportAt: string | null;
};

type CampaignAttendeeSummaryRow = {
  attendee_count: number | string;
  attended_count: number | string;
  high_intent_count: number | string;
  open_follow_up_count: number | string;
  converted_count: number | string;
  unmatched_account_count: number | string;
  possible_duplicate_count: number | string;
  latest_import_at: string | null;
};

export async function getCampaignWithAttendeeSummary(id: string) {
  const [campaign, summary] = await Promise.all([
    queryOne<Campaign>(
      `
        -- Only columns the campaigns table actually has. channel, audience_filter and
        -- scheduled_at were selected here but no migration creates them, so Postgres
        -- rejected the query and broke /campaigns/$id. All three are optional on the
        -- Campaign type, and the UI already falls back (channel ?? "unknown",
        -- starts_at ?? scheduled_at).
        select id, name, type, status, objective,
               owner, starts_at, ends_at, notes, created_at, updated_at
        from campaigns
        where id = $1
      `,
      [id],
    ),
    queryOne<CampaignAttendeeSummaryRow>(
      // Still one query, one pass. The two nested selects only add the dedupe key and its
      // group size as columns; the aggregate above them is the same aggregate as before.
      `
        select
          count(*) as attendee_count,
          count(*) filter (where attendee_status in ('attended', 'met', 'high_intent')) as attended_count,
          count(*) filter (where attendee_status = 'high_intent') as high_intent_count,
          count(*) filter (where follow_up_status in ('not_started', 'task_created', 'in_progress')) as open_follow_up_count,
          count(*) filter (where conversion_outcome is not null and conversion_outcome <> 'none') as converted_count,
          count(*) filter (where account_id is null) as unmatched_account_count,
          count(*) filter (where duplicate_count > 1) as possible_duplicate_count,
          max(created_at) as latest_import_at
        from (
          select
            attendee_status,
            follow_up_status,
            conversion_outcome,
            account_id,
            created_at,
            ${ATTENDEE_DUPLICATE_COUNT_SQL} as duplicate_count
          from (
            select
              attendee_status,
              follow_up_status,
              conversion_outcome,
              account_id,
              created_at,
              ${ATTENDEE_DEDUPE_KEY_SQL} as dedupe_key
            from campaign_members
            where campaign_id = $1
          ) keyed
        ) counted
      `,
      [id],
    ),
  ]);

  if (!campaign) throw new Error("Campaign not found");
  return {
    campaign,
    attendeeSummary: {
      total: Number(summary?.attendee_count ?? 0),
      attended: Number(summary?.attended_count ?? 0),
      highIntent: Number(summary?.high_intent_count ?? 0),
      openFollowUp: Number(summary?.open_follow_up_count ?? 0),
      converted: Number(summary?.converted_count ?? 0),
      unmatchedAccounts: Number(summary?.unmatched_account_count ?? 0),
      possibleDuplicates: Number(summary?.possible_duplicate_count ?? 0),
      latestImportAt: summary?.latest_import_at ?? null,
    } satisfies CampaignAttendeeSummary,
  };
}

export type CampaignImportHistoryEntry = {
  /** The day bucket the rows are grouped into. Not an event time. */
  importedAt: string;
  /**
   * The newest `created_at` inside that bucket — an instant that actually happened.
   *
   * `importedAt` is `date_trunc('day', …)`, so rendering it as a timestamp would stamp
   * every entry midnight and claim a precision the grouping threw away.
   */
  lastImportedAt: string | null;
  attendeeCount: number;
};

type CampaignImportHistoryRow = {
  imported_at: string;
  last_imported_at: string | null;
  attendee_count: number | string;
};

export type CampaignAttendeeRow = Pick<
  CampaignMember,
  | "id"
  | "contact_id"
  | "account_id"
  | "raw_company_name"
  | "raw_contact_name"
  | "raw_email"
  | "raw_phone"
  | "attendee_status"
  | "interests"
  | "follow_up_status"
  | "conversion_outcome"
  | "created_at"
> & {
  /**
   * How many attendees in **this whole campaign** share this row's dedupe key — not how
   * many share it on this page. The window runs before the LIMIT, so a duplicate whose
   * twin sits on page 4 is still marked on page 1, which is the entire point: a
   * page-scoped check would hide exactly the duplicates a re-import creates.
   *
   * Optional on the type because a caller that only projects the listed columns (a test
   * fixture, a future narrower read) must not be forced to invent one.
   */
  duplicate_count?: number | string | null;
};

export type CampaignAttendeePageFilters = PaginationInput;

export async function listCampaignAttendeeImportSection(
  campaignId: string,
  filters: CampaignAttendeePageFilters = {},
) {
  const { page, limit, offset } = normalizePagination(filters);
  const importHistoryLimit = 12;
  const [members, count, history] = await Promise.all([
    query<CampaignAttendeeRow>(
      // `duplicate_count` is a window over every member of the campaign, evaluated before
      // the LIMIT below, so the marker is campaign-wide even though the rows are a page.
      `
        select id, contact_id, account_id, raw_company_name, raw_contact_name, raw_email,
               raw_phone, attendee_status, interests, follow_up_status, conversion_outcome,
               created_at,
               ${ATTENDEE_DUPLICATE_COUNT_SQL} as duplicate_count
        from (
          select id, contact_id, account_id, raw_company_name, raw_contact_name, raw_email,
                 raw_phone, attendee_status, interests, follow_up_status, conversion_outcome,
                 created_at,
                 ${ATTENDEE_DEDUPE_KEY_SQL} as dedupe_key
          from campaign_members
          where campaign_id = $1
        ) keyed
        order by created_at desc, id desc
        limit $2 offset $3
      `,
      [campaignId, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      "select count(*) as total from campaign_members where campaign_id = $1",
      [campaignId],
    ),
    query<CampaignImportHistoryRow>(
      `
        select date_trunc('day', created_at) as imported_at,
               max(created_at) as last_imported_at,
               count(*) as attendee_count
        from campaign_members
        where campaign_id = $1
        group by date_trunc('day', created_at)
        order by imported_at desc
        limit $2
      `,
      [campaignId, importHistoryLimit],
    ),
  ]);

  return {
    members,
    total: parseCount(count),
    page,
    limit,
    importHistory: history.map((entry) => ({
      importedAt: entry.imported_at,
      lastImportedAt: entry.last_imported_at ?? null,
      attendeeCount: Number(entry.attendee_count),
    })),
  };
}

export async function createCampaign(input: CreateCampaignInput, db?: Queryable) {
  const campaign = await queryOne<Campaign>(
    `
      insert into campaigns (name, type, status, objective, owner, starts_at, ends_at, notes)
      values ($1, coalesce($2, 'campaign'), coalesce($3, 'draft'), $4, $5, $6, $7, $8)
      returning *
    `,
    [
      input.name,
      input.type ?? null,
      input.status ?? null,
      input.objective ?? null,
      input.owner ?? null,
      input.starts_at ?? null,
      input.ends_at ?? null,
      input.notes ?? null,
    ],
    db,
  );
  if (!campaign) throw new Error("Failed to create campaign");
  return campaign;
}

export async function updateCampaign(id: string, updates: Partial<Campaign>, db?: Queryable) {
  const update = buildUpdate(updates, campaignUpdateColumns, 1);
  const campaign = await queryOne<Campaign>(
    `update campaigns set ${update.sql} where id = $${update.nextIndex} returning *`,
    [...update.values, id],
    db,
  );
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

export async function createCampaignMember(input: CreateCampaignMemberInput, db?: Queryable) {
  const member = await queryOne<CampaignMember>(
    `
      insert into campaign_members
        (campaign_id, account_id, contact_id, raw_company_name, raw_contact_name, raw_email, raw_phone, attendee_status, interests, follow_up_owner, follow_up_status, conversion_outcome, notes)
      values
        ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'attended'), coalesce($9, '{}'::text[]), $10, coalesce($11, 'not_started'), coalesce($12, 'none'), $13)
      returning *
    `,
    [
      input.campaign_id,
      input.account_id ?? null,
      input.contact_id ?? null,
      input.raw_company_name ?? null,
      input.raw_contact_name ?? null,
      input.raw_email ?? null,
      input.raw_phone ?? null,
      input.attendee_status ?? null,
      input.interests ?? null,
      input.follow_up_owner ?? null,
      input.follow_up_status ?? null,
      input.conversion_outcome ?? null,
      input.notes ?? null,
    ],
    db,
  );
  if (!member) throw new Error("Failed to create campaign member");
  return member;
}

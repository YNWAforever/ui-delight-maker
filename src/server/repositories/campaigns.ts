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
        order by created_at desc
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
    queryOne<Campaign>("select * from campaigns where id = $1", [id]),
    query<CampaignMember>(
      "select * from campaign_members where campaign_id = $1 order by created_at desc",
      [id],
    ),
  ]);
  if (!campaign) throw new Error("Campaign not found");
  return { campaign, members };
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

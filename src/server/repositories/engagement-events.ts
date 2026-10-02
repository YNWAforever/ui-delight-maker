import { query, transaction } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import {
  domainOperation,
  insertDomainRow,
  updateDomainRow,
  readDomainRows,
  requireDomainRow,
  pickColumns,
} from "./domain-sql";

import type { ChannelIdentity, EngagementEvent } from "@/lib/types";

const EVENT_CREATE_COLUMNS = [
  "channel",
  "event_type",
  "contact_id",
  "account_id",
  "campaign_id",
  "campaign_member_id",
  "deal_id",
  "project_id",
  "direction",
  "subject",
  "body_preview",
  "occurred_at",
  "created_by",
  "created_by_agent",
  "metadata",
] as const;
const IDENTITY_CREATE_COLUMNS = [
  "channel",
  "contact_id",
  "account_id",
  "external_id",
  "handle",
  "is_primary",
  "last_seen_at",
  "metadata",
] as const;
const IDENTITY_UPDATE_COLUMNS = [
  "contact_id",
  "account_id",
  "handle",
  "is_primary",
  "last_seen_at",
  "metadata",
] as const;

export type EngagementEventFilters = {
  contact_id?: string;
  account_id?: string;
  campaign_id?: string;
  deal_id?: string;
  project_id?: string;
  channel?: string;
  limit?: number;
};

export type CreateEngagementEventInput = Pick<EngagementEvent, "channel" | "event_type"> &
  Partial<
    Pick<
      EngagementEvent,
      | "contact_id"
      | "account_id"
      | "campaign_id"
      | "campaign_member_id"
      | "deal_id"
      | "project_id"
      | "direction"
      | "subject"
      | "body_preview"
      | "occurred_at"
      | "created_by"
      | "created_by_agent"
      | "metadata"
    >
  >;

export type UpsertChannelIdentityInput = Pick<ChannelIdentity, "channel"> &
  Partial<
    Pick<
      ChannelIdentity,
      | "contact_id"
      | "account_id"
      | "external_id"
      | "handle"
      | "is_primary"
      | "last_seen_at"
      | "metadata"
    >
  >;

export async function listEngagementEvents(
  filters: EngagementEventFilters = {},
  context?: RequestAuthorization,
): Promise<EngagementEvent[]> {
  return domainOperation("load engagement events", () =>
    readDomainRows<EngagementEvent>(
      "engagement_events",
      pickColumns(filters, [
        "contact_id",
        "account_id",
        "campaign_id",
        "deal_id",
        "project_id",
        "channel",
      ]),
      context,
      { order: "d.occurred_at desc,d.id", limit: filters.limit ?? 100 },
    ),
  );
}
export async function createEngagementEvent(
  input: CreateEngagementEventInput,
): Promise<EngagementEvent> {
  return domainOperation("record this engagement event", () =>
    transaction(async (db) => {
      const row = await insertDomainRow<EngagementEvent>(
        "engagement_events",
        pickColumns(input, EVENT_CREATE_COLUMNS),
        db,
      );
      if (row.campaign_member_id)
        await query(
          "update campaign_members set last_event_at=greatest(last_event_at,$2::timestamptz) where id=$1",
          [row.campaign_member_id, row.occurred_at],
          db,
        );
      return row;
    }),
  );
}
export async function upsertChannelIdentity(
  input: UpsertChannelIdentityInput,
  context?: RequestAuthorization,
): Promise<ChannelIdentity> {
  return domainOperation("save this channel identity", () =>
    insertDomainRow<ChannelIdentity>(
      "channel_identities",
      pickColumns({ ...input, external_id: input.external_id || null }, IDENTITY_CREATE_COLUMNS),
      undefined,
      input.external_id
        ? { columns: ["channel", "external_id"], update: IDENTITY_UPDATE_COLUMNS, context }
        : undefined,
    ),
  );
}

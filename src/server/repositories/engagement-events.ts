import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { ChannelIdentity, EngagementEvent } from "@/lib/types";
import { pickColumns, supabaseOperationFailed } from "./supabase-writes";

/**
 * Engagement events and the channel identities they arrive through.
 *
 * Supabase-backed for now — see "Migration In Progress" in CLAUDE.md and the note at the top of
 * `./deals.ts`, which this follows.
 *
 * Two inherited behaviours here are easy to "fix" and must not be. Recording an event touches
 * `campaign_members.last_event_at` afterwards *without checking the result*, so a failed touch is
 * invisible and the event is still returned. And the channel-identity upsert is a read-then-branch
 * rather than a database upsert, so it stays one function on one client.
 *
 * The writes do now go through column allowlists, which they did not before. See
 * `./supabase-writes.ts`.
 */

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
): Promise<EngagementEvent[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("engagement_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.contact_id) query = query.eq("contact_id", filters.contact_id);
  if (filters.account_id) query = query.eq("account_id", filters.account_id);
  if (filters.campaign_id) query = query.eq("campaign_id", filters.campaign_id);
  if (filters.deal_id) query = query.eq("deal_id", filters.deal_id);
  if (filters.project_id) query = query.eq("project_id", filters.project_id);
  if (filters.channel) query = query.eq("channel", filters.channel);

  const { data, error } = await query;
  if (error) throw supabaseOperationFailed("load engagement events", error);
  return data as EngagementEvent[];
}

/**
 * Records an event and stamps its campaign member's `last_event_at`.
 *
 * The stamp is awaited but its error is never inspected — a campaign member that has been
 * deleted, or a permission failure on that table, leaves the event recorded and the timestamp
 * stale, silently. That is the existing contract and callers depend on the event coming back
 * either way; tightening it is a behaviour change, not a seam.
 */
export async function createEngagementEvent(
  input: CreateEngagementEventInput,
): Promise<EngagementEvent> {
  const supabase = createSupabaseServerClient();
  const { data: event, error } = await supabase
    .from("engagement_events")
    .insert(pickColumns(input, EVENT_CREATE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("record this engagement event", error);

  if (event.campaign_member_id) {
    await supabase
      .from("campaign_members")
      .update({ last_event_at: event.occurred_at })
      .eq("id", event.campaign_member_id);
  }

  return event as EngagementEvent;
}

/**
 * Creates or updates the identity for a channel.
 *
 * Not a database upsert: it looks the row up by `(channel, external_id)`, updates it through a
 * column allowlist when found, and otherwise inserts the caller's object whole. That read-then-
 * branch has to stay one function on one client — splitting it would open a window between the
 * lookup and the write, and the two paths are deliberately indistinguishable to the caller.
 *
 * With no `external_id` there is nothing to look up by, so it inserts unconditionally.
 */
export async function upsertChannelIdentity(
  input: UpsertChannelIdentityInput,
): Promise<ChannelIdentity> {
  const supabase = createSupabaseServerClient();

  if (input.external_id) {
    const { data: existing, error } = await supabase
      .from("channel_identities")
      .select("*")
      .eq("channel", input.channel)
      .eq("external_id", input.external_id)
      .maybeSingle();
    if (error) throw supabaseOperationFailed("look up this channel identity", error);

    if (existing) {
      const { data: identity, error: updateError } = await supabase
        .from("channel_identities")
        .update(pickColumns(input, IDENTITY_UPDATE_COLUMNS))
        .eq("id", existing.id)
        .select()
        .single();
      if (updateError) {
        throw supabaseOperationFailed("update this channel identity", updateError);
      }
      return identity as ChannelIdentity;
    }
  }

  const { data: identity, error } = await supabase
    .from("channel_identities")
    .insert(pickColumns(input, IDENTITY_CREATE_COLUMNS))
    .select()
    .single();
  if (error) throw supabaseOperationFailed("create this channel identity", error);
  return identity as ChannelIdentity;
}

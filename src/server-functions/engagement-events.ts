// src/server-functions/engagement-events.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { ChannelIdentity, EngagementEvent } from "@/lib/types";

type GetEngagementEventsInput = {
  contact_id?: string;
  account_id?: string;
  campaign_id?: string;
  deal_id?: string;
  project_id?: string;
  channel?: string;
  limit?: number;
};

type CreateEngagementEventInput = Pick<EngagementEvent, "channel" | "event_type"> &
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

type UpsertChannelIdentityInput = Pick<ChannelIdentity, "channel"> &
  Partial<
    Pick<
      ChannelIdentity,
      "contact_id" | "account_id" | "external_id" | "handle" | "is_primary" | "last_seen_at" | "metadata"
    >
  >;

export const getEngagementEvents = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetEngagementEventsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("engagement_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.contact_id) query = query.eq("contact_id", data.contact_id);
    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.campaign_id) query = query.eq("campaign_id", data.campaign_id);
    if (data.deal_id) query = query.eq("deal_id", data.deal_id);
    if (data.project_id) query = query.eq("project_id", data.project_id);
    if (data.channel) query = query.eq("channel", data.channel);

    const { data: events, error } = await query;
    if (error) throw new Error(error.message);
    return events as EngagementEvent[];
  });

export const createEngagementEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateEngagementEventInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: event, error } = await supabase
      .from("engagement_events")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (event.campaign_member_id) {
      await supabase
        .from("campaign_members")
        .update({ last_event_at: event.occurred_at })
        .eq("id", event.campaign_member_id);
    }

    return event as EngagementEvent;
  });

export const upsertChannelIdentity = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpsertChannelIdentityInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();

    if (data.external_id) {
      const { data: existing, error } = await supabase
        .from("channel_identities")
        .select("*")
        .eq("channel", data.channel)
        .eq("external_id", data.external_id)
        .maybeSingle();
      if (error) throw new Error(error.message);

      if (existing) {
        const { data: identity, error: updateError } = await supabase
          .from("channel_identities")
          .update({
            ...(data.contact_id !== undefined && { contact_id: data.contact_id }),
            ...(data.account_id !== undefined && { account_id: data.account_id }),
            ...(data.handle !== undefined && { handle: data.handle }),
            ...(data.is_primary !== undefined && { is_primary: data.is_primary }),
            ...(data.last_seen_at !== undefined && { last_seen_at: data.last_seen_at }),
            ...(data.metadata !== undefined && { metadata: data.metadata }),
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (updateError) throw new Error(updateError.message);
        return identity as ChannelIdentity;
      }
    }

    const { data: identity, error } = await supabase
      .from("channel_identities")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return identity as ChannelIdentity;
  });

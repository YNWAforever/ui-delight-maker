// src/server-functions/campaigns.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { attributeCampaignRevenue } from "@/lib/lifecycle-utils";
import type { Campaign, CampaignMember, Deal, EngagementEvent } from "@/lib/types";

type GetCampaignsInput = {
  status?: string;
  channel?: string;
  owner?: string;
};

type CreateCampaignInput = Pick<Campaign, "name" | "channel"> &
  Partial<Pick<Campaign, "status" | "objective" | "audience_filter" | "scheduled_at" | "owner">>;

type AddCampaignMemberInput = Pick<CampaignMember, "campaign_id"> &
  Partial<Pick<CampaignMember, "contact_id" | "account_id" | "status" | "metadata">>;

export const getCampaigns = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetCampaignsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("campaigns").select("*").order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.channel) query = query.eq("channel", data.channel);
    if (data.owner) query = query.eq("owner", data.owner);

    const { data: campaigns, error } = await query;
    if (error) throw new Error(error.message);
    return campaigns as Campaign[];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [campaignResult, membersResult, eventsResult, dealsResult] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", data.id).single(),
      supabase.from("campaign_members").select("*").eq("campaign_id", data.id),
      supabase
        .from("engagement_events")
        .select("*")
        .eq("campaign_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase
        .from("deals")
        .select("*")
        .eq("source_campaign_id", data.id)
        .order("created_at", { ascending: false }),
    ]);

    if (campaignResult.error) throw new Error(campaignResult.error.message);
    if (membersResult.error) throw new Error(membersResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (dealsResult.error) throw new Error(dealsResult.error.message);

    const deals = (dealsResult.data ?? []) as Deal[];

    return {
      campaign: campaignResult.data as Campaign,
      members: (membersResult.data ?? []) as CampaignMember[],
      engagementEvents: (eventsResult.data ?? []) as EngagementEvent[],
      deals,
      attribution: attributeCampaignRevenue(data.id, deals),
    };
  });

export const createCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateCampaignInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return campaign as Campaign;
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Campaign> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .update({
        ...(data.updates.name !== undefined && { name: data.updates.name }),
        ...(data.updates.channel !== undefined && { channel: data.updates.channel }),
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.objective !== undefined && { objective: data.updates.objective }),
        ...(data.updates.audience_filter !== undefined && {
          audience_filter: data.updates.audience_filter,
        }),
        ...(data.updates.scheduled_at !== undefined && { scheduled_at: data.updates.scheduled_at }),
        ...(data.updates.owner !== undefined && { owner: data.updates.owner }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return campaign as Campaign;
  });

export const addCampaignMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as AddCampaignMemberInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: member, error } = await supabase
      .from("campaign_members")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return member as CampaignMember;
  });

export const updateCampaignMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<CampaignMember> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: member, error } = await supabase
      .from("campaign_members")
      .update({
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.last_event_at !== undefined && {
          last_event_at: data.updates.last_event_at,
        }),
        ...(data.updates.metadata !== undefined && { metadata: data.updates.metadata }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return member as CampaignMember;
  });

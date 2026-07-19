import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createCampaign as createCampaignInNeon,
  createCampaignMember,
  getCampaignWithMembers,
  listCampaigns,
  listCampaignsPage,
  type CampaignFilters,
  type CampaignPageFilters,
  type CreateCampaignInput,
  type CreateCampaignMemberInput,
  updateCampaign as updateCampaignInNeon,
} from "@/server/repositories/campaigns";
import { createCampaignFollowUpTasks } from "@/server/repositories/campaign-follow-ups";
import type { Campaign } from "@/lib/types";

export const getCampaigns = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as CampaignFilters)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view");
    await requireNeonAuthSession();
    return listCampaigns(data);
  });

export const getCampaignsPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as CampaignPageFilters)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view");
    await requireNeonAuthSession();
    return listCampaignsPage(data);
  });
export const getCampaign = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("campaigns.view", { resourceType: "campaign", resourceId: data.id });
    await requireNeonAuthSession();
    return getCampaignWithMembers(data.id);
  });

export const createCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateCampaignInput)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.manage");
    const session = await requireNeonAuthSession();
    return createCampaignInNeon({ ...data, owner: session.user.id });
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Campaign> })
  .handler(async ({ data }) => {
    await requireCapability("campaigns.manage", { resourceType: "campaign", resourceId: data.id });
    await requireNeonAuthSession();
    return updateCampaignInNeon(data.id, data.updates);
  });

export const addCampaignMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateCampaignMemberInput)
  .handler(async ({ data }) => {
    await requireCapability("campaigns.manage", {
      resourceType: "campaign",
      resourceId: data.campaign_id,
    });
    await requireNeonAuthSession();
    return createCampaignMember(data);
  });

export const createCampaignFollowUpTasksFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { campaignId: string })
  .handler(async ({ data }) => {
    await requireCapability("tasks.create", {
      resourceType: "campaign",
      resourceId: data.campaignId,
    });
    const session = await requireNeonAuthSession();
    return createCampaignFollowUpTasks({
      campaignId: data.campaignId,
      actorId: session.user.id,
    });
  });

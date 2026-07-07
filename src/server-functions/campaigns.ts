import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createCampaign as createCampaignInNeon,
  createCampaignMember,
  getCampaignWithMembers,
  listCampaigns,
  type CampaignFilters,
  type CreateCampaignInput,
  type CreateCampaignMemberInput,
  updateCampaign as updateCampaignInNeon,
} from "@/server/repositories/campaigns";
import type { Campaign } from "@/lib/types";

export const getCampaigns = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as CampaignFilters)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listCampaigns(data);
  });

export const getCampaign = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getCampaignWithMembers(data.id);
  });

export const createCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateCampaignInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createCampaignInNeon(data);
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Campaign> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateCampaignInNeon(data.id, data.updates);
  });

export const addCampaignMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateCampaignMemberInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createCampaignMember(data);
  });

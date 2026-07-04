import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createEngagement as createEngagementInNeon,
  listEngagementsByClient,
  listEngagementsForRenewals,
  markEngagementEnded,
  markEngagementRenewed,
  type RenewalsFilters,
} from "@/server/repositories/engagements";
import type { Engagement } from "@/lib/types";

export const getEngagementsByClient = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { clientId: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listEngagementsByClient(data.clientId);
  });

export const getEngagementsForRenewals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as RenewalsFilters)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listEngagementsForRenewals(data);
  });

export const createEngagement = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as Pick<Engagement, "client_id" | "product_id" | "billing_period"> &
        Partial<Pick<Engagement, "owner" | "value" | "start_date" | "renewal_date" | "lead_id" | "quote_id">>,
  )
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createEngagementInNeon(data);
  });

export const renewEngagement = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; reason?: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return markEngagementRenewed({ id: data.id, actorId: session.user.id, reason: data.reason });
  });

export const endEngagement = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; reason: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return markEngagementEnded({ id: data.id, actorId: session.user.id, reason: data.reason });
  });

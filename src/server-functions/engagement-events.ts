import { authorizeDomainLinks } from "@/server/auth/domain-links.server";
// src/server-functions/engagement-events.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability, loadRequestAuthorization } from "@/server/auth/authorization.server";
import {
  createEngagementEvent as createEngagementEventInRepository,
  listEngagementEvents,
  upsertChannelIdentity as upsertChannelIdentityInRepository,
  type CreateEngagementEventInput,
  type EngagementEventFilters,
  type UpsertChannelIdentityInput,
} from "@/server/repositories/engagement-events";

function engagementTarget(input: { account_id?: string | null; contact_id?: string | null }) {
  if (input.account_id) return { resourceType: "account", resourceId: input.account_id };
  if (input.contact_id) return { resourceType: "contact", resourceId: input.contact_id };
  return {};
}

export const getEngagementEvents = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as EngagementEventFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("engagements.view", engagementTarget(data), context);
    return listEngagementEvents(data, context);
  });

export const createEngagementEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateEngagementEventInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("engagements.create", engagementTarget(data), context);
    await authorizeDomainLinks("engagements.create", data, context);
    return createEngagementEventInRepository({ ...data, created_by: context.actor.profileId });
  });

export const upsertChannelIdentity = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpsertChannelIdentityInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("engagements.update", engagementTarget(data), context);
    await authorizeDomainLinks("engagements.update", data, context);
    return upsertChannelIdentityInRepository(data, context);
  });

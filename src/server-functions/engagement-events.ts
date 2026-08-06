// src/server-functions/engagement-events.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import {
  createEngagementEvent as createEngagementEventInRepository,
  listEngagementEvents,
  upsertChannelIdentity as upsertChannelIdentityInRepository,
  type CreateEngagementEventInput,
  type EngagementEventFilters,
  type UpsertChannelIdentityInput,
} from "@/server/repositories/engagement-events";

/**
 * These three all scope authorization the same way: by account when one is given, else by
 * contact, else unscoped. Both resource types are Supabase-owned, so the guard reaches Supabase
 * before the handler does.
 */
function engagementTarget(input: { account_id?: string | null; contact_id?: string | null }) {
  if (input.account_id) return { resourceType: "supabase_account", resourceId: input.account_id };
  if (input.contact_id) return { resourceType: "contact", resourceId: input.contact_id };
  return {};
}

export const getEngagementEvents = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as EngagementEventFilters)
  .handler(async ({ data }) => {
    await requireCapability("engagements.view", engagementTarget(data));
    return listEngagementEvents(data);
  });

export const createEngagementEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateEngagementEventInput)
  .handler(async ({ data }) => {
    await requireCapability("engagements.create", engagementTarget(data));
    return createEngagementEventInRepository(data);
  });

export const upsertChannelIdentity = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpsertChannelIdentityInput)
  .handler(async ({ data }) => {
    await requireCapability("engagements.update", engagementTarget(data));
    return upsertChannelIdentityInRepository(data);
  });

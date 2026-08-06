// src/server-functions/deals.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import { calculateWeightedForecast } from "@/lib/lifecycle-utils";
import {
  createDeal as createDealInRepository,
  getDealWorkspace,
  listDeals,
  listOpenDeals,
  updateDeal as updateDealInRepository,
  type CreateDealInput,
  type DealFilters,
  type ForecastDealFilters,
} from "@/server/repositories/deals";
import type { Deal } from "@/lib/types";

export const getDeals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as DealFilters)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    return listDeals(data);
  });

export const getDeal = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireCapability("accounts.view", { resourceType: "deal", resourceId: data.id });
    return getDealWorkspace(data.id);
  });

export const createDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateDealInput)
  .handler(async ({ data }) => {
    await requireCapability("accounts.create");
    return createDealInRepository(data);
  });

export const updateDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Deal> })
  .handler(async ({ data }) => {
    await requireCapability("accounts.update", { resourceType: "deal", resourceId: data.id });
    return updateDealInRepository(data.id, data.updates);
  });

export const getForecast = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as ForecastDealFilters)
  .handler(async ({ data }) => {
    await requireCapability("accounts.view");
    // The forecast maths stays here: it is a pure function over the rows, and keeping the
    // repository layer to data access is what lets the Supabase reads below be swapped for Neon
    // without touching anything that interprets them.
    return calculateWeightedForecast(await listOpenDeals(data));
  });

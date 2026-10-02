import { authorizeDomainLinks } from "@/server/auth/domain-links.server";
// src/server-functions/deals.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability, loadRequestAuthorization } from "@/server/auth/authorization.server";
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
    const context = await loadRequestAuthorization();
    await requireCapability("accounts.view", {}, context);
    return listDeals(data, context);
  });

export const getDeal = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "accounts.view",
      { resourceType: "deal", resourceId: data.id },
      context,
    );
    return getDealWorkspace(data.id, context);
  });

export const createDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateDealInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("accounts.create", {}, context);
    await authorizeDomainLinks("accounts.create", data, context);
    return createDealInRepository(data);
  });

export const updateDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Deal> })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "accounts.update",
      { resourceType: "deal", resourceId: data.id },
      context,
    );
    await authorizeDomainLinks("accounts.update", data.updates, context);
    return updateDealInRepository(data.id, data.updates);
  });

export const getForecast = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as ForecastDealFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("accounts.view", {}, context);
    // Forecast calculations remain a pure interpretation of scoped Neon rows.
    return calculateWeightedForecast(await listOpenDeals(data, context));
  });

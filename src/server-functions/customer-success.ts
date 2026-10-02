import { authorizeDomainLinks } from "@/server/auth/domain-links.server";
// src/server-functions/customer-success.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability, loadRequestAuthorization } from "@/server/auth/authorization.server";
import { assessRenewalRisk } from "@/lib/lifecycle-utils";
import {
  createSuccessTouchpoint as createSuccessTouchpointInRepository,
  getCustomerSuccessAccountWorkspace,
  getCustomerSuccessRiskInputs,
  listCustomerSuccessProfiles,
  listCustomerSuccessProfilesForDashboard,
  updateCustomerSuccessProfile as updateCustomerSuccessProfileInRepository,
  upsertCustomerSuccessProfile as upsertCustomerSuccessProfileInRepository,
  type CreateSuccessTouchpointInput,
  type CustomerSuccessProfileFilters,
  type RenewalRiskOverride,
  type UpsertCustomerSuccessProfileInput,
} from "@/server/repositories/customer-success";
import type { CustomerSuccessProfile } from "@/lib/types";

export const getCustomerSuccessProfiles = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as CustomerSuccessProfileFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("engagements.view", {}, context);
    return listCustomerSuccessProfiles(data, context);
  });

export const getCustomerSuccessProfile = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { accountId: string })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.view",
      {
        resourceType: "account",
        resourceId: data.accountId,
      },
      context,
    );
    return getCustomerSuccessAccountWorkspace(data.accountId, context);
  });

export const upsertCustomerSuccessProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as UpsertCustomerSuccessProfileInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.update",
      {
        resourceType: "account",
        resourceId: data.account_id,
      },
      context,
    );
    // Risk is derived here, not in the repository: it is a judgement about the data, and it
    // reads the clock, which is the kind of thing a data-access function should not do.
    const risk = assessRenewalRisk({
      health_score: data.health_score ?? null,
      renewal_date: data.renewal_date ?? null,
    });

    await authorizeDomainLinks("engagements.update", data, context);
    return upsertCustomerSuccessProfileInRepository({
      ...data,
      renewal_risk: data.renewal_risk ?? risk.level,
      next_best_action: data.next_best_action ?? risk.nextBestAction,
    });
  });

export const updateCustomerSuccessProfile = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { id: string; updates: Partial<Omit<CustomerSuccessProfile, "id" | "account_id">> },
  )
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.update",
      {
        resourceType: "customer_success_profile",
        resourceId: data.id,
      },
      context,
    );

    // Only worth recomputing when one of its two inputs is changing; otherwise the stored risk
    // stands and no read happens at all.
    let riskOverride: RenewalRiskOverride = null;
    if (data.updates.health_score !== undefined || data.updates.renewal_date !== undefined) {
      const current = await getCustomerSuccessRiskInputs(data.id);
      const risk = assessRenewalRisk({
        health_score: data.updates.health_score ?? current.health_score,
        renewal_date: data.updates.renewal_date ?? current.renewal_date,
      });
      riskOverride = { renewal_risk: risk.level, next_best_action: risk.nextBestAction };
    }

    await authorizeDomainLinks("engagements.update", data.updates, context);
    return updateCustomerSuccessProfileInRepository(data.id, data.updates, riskOverride);
  });

export const createSuccessTouchpoint = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateSuccessTouchpointInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.create",
      {
        resourceType: "account",
        resourceId: data.account_id,
      },
      context,
    );
    await authorizeDomainLinks("engagements.create", data, context);
    return createSuccessTouchpointInRepository({ ...data, created_by: context.actor.profileId });
  });

export const getCustomerSuccessDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const context = await loadRequestAuthorization();
  await requireCapability("engagements.view", {}, context);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = await listCustomerSuccessProfilesForDashboard(context);
  const healthTotal = rows.reduce((sum, profile) => sum + profile.health_score, 0);

  return {
    accounts: rows,
    averageAccountHealth: rows.length > 0 ? Math.round(healthTotal / rows.length) : 0,
    highRiskAccounts: rows.filter((profile) => profile.renewal_risk === "high").length,
    renewalsDue30: rows.filter(
      (profile) => profile.renewal_date !== null && profile.renewal_date <= in30Days,
    ).length,
  };
});

// src/server-functions/accounts.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type {
  Account,
  Contact,
  CustomerSuccessProfile,
  Deal,
  EngagementEvent,
  Project,
} from "@/lib/types";

type GetAccountsInput = {
  owner?: string;
  lifecycle_stage?: string;
  health_min?: number;
  renewal_before?: string;
};

type CreateAccountInput = Pick<Account, "name"> &
  Partial<
    Pick<
      Account,
      | "domain"
      | "industry"
      | "tier"
      | "account_owner"
      | "lifecycle_stage"
      | "health_score"
      | "renewal_date"
      | "arr"
    >
  >;

export const getAccounts = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetAccountsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("accounts").select("*").order("name");

    if (data.owner) query = query.eq("account_owner", data.owner);
    if (data.lifecycle_stage) query = query.eq("lifecycle_stage", data.lifecycle_stage);
    if (data.health_min !== undefined) query = query.gte("health_score", data.health_min);
    if (data.renewal_before) query = query.lte("renewal_date", data.renewal_before);

    const { data: accounts, error } = await query;
    if (error) throw new Error(error.message);
    return accounts as Account[];
  });

export const getAccount = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [accountResult, contactsResult, timelineResult, dealsResult, projectsResult, csResult] =
      await Promise.all([
        supabase.from("accounts").select("*").eq("id", data.id).single(),
        supabase.from("contacts").select("*").eq("account_id", data.id).order("full_name"),
        supabase
          .from("engagement_events")
          .select("*")
          .eq("account_id", data.id)
          .order("occurred_at", { ascending: false })
          .limit(50),
        supabase
          .from("deals")
          .select("*")
          .eq("account_id", data.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("projects")
          .select("*")
          .eq("account_id", data.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_success_profiles")
          .select("*")
          .eq("account_id", data.id)
          .maybeSingle(),
      ]);

    if (accountResult.error) throw new Error(accountResult.error.message);
    if (contactsResult.error) throw new Error(contactsResult.error.message);
    if (timelineResult.error) throw new Error(timelineResult.error.message);
    if (dealsResult.error) throw new Error(dealsResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (csResult.error) throw new Error(csResult.error.message);

    return {
      account: accountResult.data as Account,
      contacts: (contactsResult.data ?? []) as Contact[],
      engagementEvents: (timelineResult.data ?? []) as EngagementEvent[],
      deals: (dealsResult.data ?? []) as Deal[],
      projects: (projectsResult.data ?? []) as Project[],
      customerSuccessProfile: csResult.data as CustomerSuccessProfile | null,
    };
  });

export const createAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAccountInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: account, error } = await supabase.from("accounts").insert(data).select().single();
    if (error) throw new Error(error.message);
    return account as Account;
  });

export const updateAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Account> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: account, error } = await supabase
      .from("accounts")
      .update({
        ...(data.updates.name !== undefined && { name: data.updates.name }),
        ...(data.updates.domain !== undefined && { domain: data.updates.domain }),
        ...(data.updates.industry !== undefined && { industry: data.updates.industry }),
        ...(data.updates.tier !== undefined && { tier: data.updates.tier }),
        ...(data.updates.account_owner !== undefined && {
          account_owner: data.updates.account_owner,
        }),
        ...(data.updates.lifecycle_stage !== undefined && {
          lifecycle_stage: data.updates.lifecycle_stage,
        }),
        ...(data.updates.health_score !== undefined && { health_score: data.updates.health_score }),
        ...(data.updates.renewal_date !== undefined && {
          renewal_date: data.updates.renewal_date,
        }),
        ...(data.updates.arr !== undefined && { arr: data.updates.arr }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return account as Account;
  });

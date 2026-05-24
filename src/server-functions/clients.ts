// src/server-functions/clients.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { Client } from "@/lib/types";

type GetClientsInput = { tier?: string; health_min?: number };
type CreateClientInput = Pick<Client, "company_name"> &
  Partial<Pick<Client, "industry" | "tier" | "account_owner" | "health_score" | "renewal_date" | "arr">>;

export const getClients = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetClientsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("clients").select("*").order("company_name");
    if (data.tier) query = query.eq("tier", data.tier);
    if (data.health_min !== undefined) query = query.gte("health_score", data.health_min);
    const { data: clients, error } = await query;
    if (error) throw new Error(error.message);
    return clients as Client[];
  });

export const getClient = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: client, error } = await supabase
      .from("clients").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return client as Client;
  });

export const createClient = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateClientInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: client, error } = await supabase.from("clients").insert(data).select().single();
    if (error) throw new Error(error.message);
    return client as Client;
  });

export const updateClient = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Client> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: client, error } = await supabase
      .from("clients").update(data.updates).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    return client as Client;
  });

// src/server-functions/quotes.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { Quote, PricingTemplate } from "@/lib/types";

type GetQuotesInput = { status?: string; lead_id?: string };
type CreateQuoteInput = Pick<Quote, "lead_id" | "currency"> &
  Partial<Pick<Quote, "client_id" | "line_items" | "total_value" | "valid_until" | "number">>;

export const getQuotes = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetQuotesInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    if (data.lead_id) query = query.eq("lead_id", data.lead_id);
    const { data: quotes, error } = await query;
    if (error) throw new Error(error.message);
    return quotes as Quote[];
  });

export const getQuote = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: quote, error } = await supabase
      .from("quotes").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return quote as Quote;
  });

export const createQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateQuoteInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: quote, error } = await supabase.from("quotes").insert(data).select().single();
    if (error) throw new Error(error.message);
    return quote as Quote;
  });

export const updateQuote = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Quote> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: quote, error } = await supabase
      .from("quotes").update(data.updates).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    return quote as Quote;
  });

export const requestQuoteApproval = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("quotes").update({ status: "pending_approval" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    // n8n trigger added in Task 15
  });

export const triggerQuoteAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    // Phase 2 — n8n trigger added in Task 15
    void data;
    return { triggered: false };
  });

export const getPricingTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pricing_templates").select("*").eq("active", true).order("service");
  if (error) throw new Error(error.message);
  return data as PricingTemplate[];
});

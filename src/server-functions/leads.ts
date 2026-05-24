// src/server-functions/leads.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { Lead } from "@/lib/types";

type GetLeadsInput = { status?: string; source?: string; assigned_to?: string };
type CreateLeadInput = Pick<Lead, "company_name" | "source"> & {
  enquiry_text?: string | null;
} & Partial<Pick<Lead, "contact_name" | "contact_email" | "contact_phone" | "assigned_to">>;
type UpdateLeadInput = Partial<
  Pick<Lead, "status" | "assigned_to" | "lead_score" | "qualification_data">
>;

export const getLeads = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetLeadsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    if (data.source) query = query.eq("source", data.source);
    if (data.assigned_to) query = query.eq("assigned_to", data.assigned_to);
    const { data: leads, error } = await query;
    if (error) throw new Error(error.message);
    return leads as Lead[];
  });

export const getLead = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [leadResult, logsResult] = await Promise.all([
      supabase.from("leads").select("*").eq("id", data.id).single(),
      supabase
        .from("activity_logs")
        .select("*")
        .eq("object_id", data.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (leadResult.error) throw new Error(leadResult.error.message);
    return { lead: leadResult.data as Lead, activityLogs: logsResult.data ?? [] };
  });

export const createLead = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateLeadInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: lead, error } = await supabase.from("leads").insert(data).select().single();
    if (error) throw new Error(error.message);
    // n8n trigger is added in Task 15 (Phase 2)
    return lead as Lead;
  });

export const updateLead = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: UpdateLeadInput })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: lead, error } = await supabase
      .from("leads")
      .update({
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.assigned_to !== undefined && { assigned_to: data.updates.assigned_to }),
        ...(data.updates.lead_score !== undefined && { lead_score: data.updates.lead_score }),
        ...(data.updates.qualification_data !== undefined && { qualification_data: data.updates.qualification_data }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return lead as Lead;
  });

export const triggerLeadAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    // Phase 2 — n8n trigger added in Task 15
    void data;
    return { triggered: false };
  });

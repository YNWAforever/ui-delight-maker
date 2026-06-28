// src/server-functions/leads.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { triggerN8n } from "@/lib/n8n";
import type { Lead, LeadStatus } from "@/lib/types";

type GetLeadsInput = {
  status?: string;
  source?: string;
  assigned_to?: string;
  contact_id?: string;
  account_id?: string;
  source_campaign_id?: string;
};
type CreateLeadInput = Pick<Lead, "company_name" | "source"> & {
  enquiry_text?: string | null;
} & Partial<
    Pick<
      Lead,
      | "contact_name"
      | "contact_email"
      | "contact_phone"
      | "assigned_to"
      | "contact_id"
      | "account_id"
      | "source_campaign_id"
      | "campaign_member_id"
    >
  >;
type UpdateLeadInput = Partial<
  Pick<
    Lead,
    | "status"
    | "assigned_to"
    | "lead_score"
    | "qualification_data"
    | "contact_id"
    | "account_id"
    | "source_campaign_id"
    | "campaign_member_id"
  >
>;

export const getLeads = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetLeadsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    if (data.source) query = query.eq("source", data.source);
    if (data.assigned_to) query = query.eq("assigned_to", data.assigned_to);
    if (data.contact_id) query = query.eq("contact_id", data.contact_id);
    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.source_campaign_id) query = query.eq("source_campaign_id", data.source_campaign_id);
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
    const webhookUrl = process.env.N8N_LEAD_WEBHOOK_URL;
    if (webhookUrl) {
      void triggerN8n(webhookUrl, {
        trigger: "lead.created",
        lead_id: (lead as Lead).id,
        payload: {
          company_name: (lead as Lead).company_name,
          enquiry_text: (lead as Lead).enquiry_text,
          source: (lead as Lead).source,
        },
      });
    }
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
        ...(data.updates.qualification_data !== undefined && {
          qualification_data: data.updates.qualification_data,
        }),
        ...(data.updates.contact_id !== undefined && { contact_id: data.updates.contact_id }),
        ...(data.updates.account_id !== undefined && { account_id: data.updates.account_id }),
        ...(data.updates.source_campaign_id !== undefined && {
          source_campaign_id: data.updates.source_campaign_id,
        }),
        ...(data.updates.campaign_member_id !== undefined && {
          campaign_member_id: data.updates.campaign_member_id,
        }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return lead as Lead;
  });

export const moveLeadStage = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; status: LeadStatus; reason?: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: lead, error } = await supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("activity_logs").insert({
      actor_type: "user",
      actor_id: user?.id ?? null,
      actor_name: null,
      action: `moved lead to ${data.status.replace(/_/g, " ")}`,
      object_type: "lead",
      object_id: data.id,
      diff_data: { status: data.status, reason: data.reason ?? null },
    });

    return lead as Lead;
  });

export const triggerLeadAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { leadId: string })
  .handler(async ({ data }) => {
    const webhookUrl = process.env.N8N_LEAD_WEBHOOK_URL;
    if (webhookUrl) {
      void triggerN8n(webhookUrl, { trigger: "lead.retrigger", lead_id: data.leadId, payload: {} });
    }
    return { triggered: !!webhookUrl };
  });

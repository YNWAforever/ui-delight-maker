// src/server-functions/approvals.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { HumanApproval } from "@/lib/types";

export const getApprovals = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { status?: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("human_approvals")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    const { data: approvals, error } = await query;
    if (error) throw new Error(error.message);
    return approvals as HumanApproval[];
  });

export const decideApproval = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { id: string; decision: "approved" | "rejected" | "escalated"; notes?: string },
  )
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("human_approvals")
      .update({
        status: data.decision,
        reviewer_notes: data.notes ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("activity_logs").insert({
      actor_type: "user",
      actor_id: user?.id ?? null,
      actor_name: null,
      action: `${data.decision} approval`,
      object_type: "approval",
      object_id: data.id,
    });
  });

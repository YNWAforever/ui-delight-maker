// src/server-functions/tasks.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { Task } from "@/lib/types";

type GetTasksInput = {
  status?: string;
  assigned_to?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
  project_id?: string;
};
type CreateTaskInput = Pick<Task, "title"> &
  Partial<
    Pick<
      Task,
      | "description"
      | "assigned_to"
      | "lead_id"
      | "client_id"
      | "contact_id"
      | "account_id"
      | "deal_id"
      | "project_id"
      | "due_date"
      | "priority"
    >
  >;

export const getTasks = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetTasksInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    if (data.assigned_to) query = query.eq("assigned_to", data.assigned_to);
    if (data.contact_id) query = query.eq("contact_id", data.contact_id);
    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.deal_id) query = query.eq("deal_id", data.deal_id);
    if (data.project_id) query = query.eq("project_id", data.project_id);
    const { data: tasks, error } = await query;
    if (error) throw new Error(error.message);
    return tasks as Task[];
  });

export const createTask = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateTaskInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: task, error } = await supabase.from("tasks").insert(data).select().single();
    if (error) throw new Error(error.message);
    return task as Task;
  });

export const updateTask = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Task> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: task, error } = await supabase
      .from("tasks").update({
        ...(data.updates.status !== undefined && { status: data.updates.status }),
        ...(data.updates.title !== undefined && { title: data.updates.title }),
        ...(data.updates.description !== undefined && { description: data.updates.description }),
        ...(data.updates.assigned_to !== undefined && { assigned_to: data.updates.assigned_to }),
        ...(data.updates.lead_id !== undefined && { lead_id: data.updates.lead_id }),
        ...(data.updates.client_id !== undefined && { client_id: data.updates.client_id }),
        ...(data.updates.contact_id !== undefined && { contact_id: data.updates.contact_id }),
        ...(data.updates.account_id !== undefined && { account_id: data.updates.account_id }),
        ...(data.updates.deal_id !== undefined && { deal_id: data.updates.deal_id }),
        ...(data.updates.project_id !== undefined && { project_id: data.updates.project_id }),
        ...(data.updates.due_date !== undefined && { due_date: data.updates.due_date }),
        ...(data.updates.priority !== undefined && { priority: data.updates.priority }),
      }).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    return task as Task;
  });

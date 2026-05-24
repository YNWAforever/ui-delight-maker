// src/server-functions/tasks.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { Task } from "@/lib/types";

type GetTasksInput = { status?: string; assigned_to?: string };
type CreateTaskInput = Pick<Task, "title"> &
  Partial<Pick<Task, "description" | "assigned_to" | "lead_id" | "client_id" | "due_date" | "priority">>;

export const getTasks = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetTasksInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    if (data.assigned_to) query = query.eq("assigned_to", data.assigned_to);
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
        ...(data.updates.due_date !== undefined && { due_date: data.updates.due_date }),
        ...(data.updates.priority !== undefined && { priority: data.updates.priority }),
      }).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    return task as Task;
  });

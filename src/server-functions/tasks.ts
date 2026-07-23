import { requireCapability } from "@/server/auth/authorization.server";
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createTask as createTaskInNeon,
  listTasks,
  updateTask as updateTaskInNeon,
} from "@/server/repositories/tasks";
import type { Task } from "@/lib/types";

type GetTasksInput = {
  status?: string;
  priority?: Task["priority"];
  assigned_to?: string;
  client_id?: string;
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
    await requireCapability("tasks.view");
    await requireNeonAuthSession();
    const { priority, ...filters } = data;
    const tasks = await listTasks(filters);
    return priority ? tasks.filter((task) => task.priority === priority) : tasks;
  });

export const createTask = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateTaskInput)
  .handler(async ({ data }) => {
    await requireCapability("tasks.create");
    await requireNeonAuthSession();
    return createTaskInNeon(data);
  });

export const updateTask = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Task> })
  .handler(async ({ data }) => {
    await requireCapability("tasks.update", { resourceType: "task", resourceId: data.id });
    await requireNeonAuthSession();
    return updateTaskInNeon(data.id, data.updates);
  });

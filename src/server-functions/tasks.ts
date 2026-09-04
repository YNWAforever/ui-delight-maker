import { requireCapability, requirePageAuthorization } from "@/server/auth/authorization.server";
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

/**
 * A `listTasks` row, redacted per-row against the task's own ownership.
 *
 * `title` and `description` are the only fields that can be nulled — every other column
 * (`status`, `due_date`, `priority`, `assigned_to`, `created_by_agent`, and `account_id`,
 * which `src/routes/tasks.tsx`'s `move()` reads for cache invalidation) survives redaction
 * unchanged, because a work queue needs its metadata to stay usable even for a row a reader
 * may not read the content of. `restricted` lets the client tell "you may not see this" from
 * "this is genuinely empty".
 */
export type TaskListItem = Omit<Task, "title" | "description"> & {
  title: string | null;
  description: string | null;
  restricted: boolean;
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
  .handler(async ({ data }): Promise<TaskListItem[]> => {
    // One authorization context load answers both questions this page asks: "can this actor
    // see the tasks surface at all" (tasks.view, required, throws on denial exactly as the
    // requireCapability + requireNeonAuthSession pair it replaced) and, via `rows`, "which
    // specific tasks may they see once a task's own ownership (assigned_to) and any
    // resource-scoped override are resolved". The separate requireNeonAuthSession call is
    // gone: requirePageAuthorization's context load already establishes the session
    // (loadAuthorizationContext calls requireNeonAuthSession internally), the same property
    // requireCapabilitySet has that src/server-functions/quotes.ts:97-99 already relies on to
    // drop the second call, and nothing here needs the session's return value.
    const { rows } = await requirePageAuthorization(["tasks.view"]);
    const { priority, ...filters } = data;
    const tasks = await listTasks(filters);

    // The priority filter runs first, before redaction: priority is a plain column that
    // survives redaction either way, so filtering first means `rows.allow` — the one
    // ownership query this handler pays — is only ever asked about the rows this response
    // will actually return, not every row `listTasks` fetched before the filter narrowed it.
    const scoped = priority ? tasks.filter((task) => task.priority === priority) : tasks;

    const decisions = await rows.allow(
      "tasks.view",
      "task",
      scoped.map((task) => task.id),
    );

    return scoped.map((task): TaskListItem => {
      if (decisions.get(task.id) === true) {
        return { ...task, restricted: false };
      }
      return { ...task, title: null, description: null, restricted: true };
    });
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

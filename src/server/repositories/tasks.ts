import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne } from "@/server/db/neon.server";
import type { Task } from "@/lib/types";

type TaskFilters = {
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

const taskUpdateColumns: Array<keyof Partial<Task> & string> = [
  "status",
  "title",
  "description",
  "assigned_to",
  "lead_id",
  "client_id",
  "contact_id",
  "account_id",
  "deal_id",
  "project_id",
  "due_date",
  "priority",
];

export async function listTasks(filters: TaskFilters = {}) {
  const where = buildFilters([
    ["status", filters.status],
    ["assigned_to", filters.assigned_to],
    ["contact_id", filters.contact_id],
    ["account_id", filters.account_id],
    ["deal_id", filters.deal_id],
    ["project_id", filters.project_id],
  ]);

  return query<Task>(
    `
      select *
      from tasks
      ${where.sql}
      order by created_at desc
    `,
    where.values,
  );
}

export async function listOpenTasksByDueDate() {
  return query<Task>(
    `
      select *
      from tasks
      where status <> 'done'
      order by due_date asc nulls last, created_at desc
    `,
  );
}

export async function createTask(input: CreateTaskInput) {
  const task = await queryOne<Task>(
    `
      insert into tasks
        (title, description, assigned_to, lead_id, client_id, contact_id, account_id, deal_id, project_id, due_date, priority)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, 'medium'))
      returning *
    `,
    [
      input.title,
      input.description ?? null,
      input.assigned_to ?? null,
      input.lead_id ?? null,
      input.client_id ?? null,
      input.contact_id ?? null,
      input.account_id ?? null,
      input.deal_id ?? null,
      input.project_id ?? null,
      input.due_date ?? null,
      input.priority ?? null,
    ],
  );

  if (!task) throw new Error("Failed to create task");
  return task;
}

export async function updateTask(id: string, updates: Partial<Task>) {
  const update = buildUpdate(updates, taskUpdateColumns, 1);
  const task = await queryOne<Task>(
    `
      update tasks
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
  );

  if (!task) throw new Error("Task not found");
  return task;
}

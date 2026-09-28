import { createHash } from "node:crypto";
import { AdminError } from "@/lib/admin/errors";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { buildVisibilityScope } from "@/server/auth/visibility-scope.server";
import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { Task } from "@/lib/types";

type TaskFilters = {
  status?: string;
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
    ["client_id", filters.client_id],
    ["contact_id", filters.contact_id],
    ["account_id", filters.account_id],
    ["deal_id", filters.deal_id],
    ["project_id", filters.project_id],
  ]);

  return query<Task>(
    `
      select
        id, title, description, assigned_to, account_id, due_date, priority, status,
        created_by_agent
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

export async function createTask(input: CreateTaskInput, db?: Queryable) {
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
    db,
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

export type TaskQueuePageInput = {
  status?: Task["status"];
  priority?: Task["priority"];
  assigned_to?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};
export type TaskQueuePage = {
  items: Array<Task & { owner_display_name: string | null }>;
  nextCursor: string | null;
  total: number;
};

function queueCursor(
  input: string | undefined,
  signature: string,
): { createdAt: string; id: string } | null {
  if (!input) return null;
  if (input.length > 2048) throw new AdminError("VALIDATION_FAILED", "Invalid task cursor");
  try {
    const parsed = JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      parsed.v !== 1 ||
      parsed.signature !== signature ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      throw new Error("cursor mismatch");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new AdminError("VALIDATION_FAILED", "Invalid task cursor");
  }
}

/** A page is scoped and filtered in PostgreSQL before counting or limiting. */
export async function listTaskQueuePage(
  input: TaskQueuePageInput,
  context: RequestAuthorization,
): Promise<TaskQueuePage> {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const filters = {
    status: input.status ?? null,
    priority: input.priority ?? null,
    assigned_to: input.assigned_to ?? null,
    search: input.search?.trim().toLowerCase() ?? "",
  };
  if (
    (filters.status && !["open", "in_progress", "done"].includes(filters.status)) ||
    (filters.priority && !["low", "medium", "high"].includes(filters.priority))
  ) {
    throw new AdminError("VALIDATION_FAILED", "Invalid task queue filter");
  }
  const signature = createHash("sha256")
    .update(
      JSON.stringify({ actor: context.actor.profileId, sort: "created_at_desc_id_desc", filters }),
    )
    .digest("hex");
  const after = queueCursor(input.cursor, signature);
  const scope = buildVisibilityScope(context, "task", "t");
  const values: unknown[] = [...scope.values];
  const clauses = [scope.sql];
  const add = (value: unknown) => {
    values.push(value);
    return "$" + values.length;
  };
  if (filters.status) clauses.push("t.status=" + add(filters.status));
  if (filters.priority) clauses.push("t.priority=" + add(filters.priority));
  if (filters.assigned_to === "unassigned") {
    clauses.push("t.assigned_to is null");
  } else if (filters.assigned_to === "mine") {
    clauses.push("t.assigned_to=" + add(context.actor.profileId));
  } else if (filters.assigned_to) {
    clauses.push("t.assigned_to=" + add(filters.assigned_to));
  }
  if (filters.search) {
    clauses.push(
      "position(" +
        add(filters.search) +
        "::text in lower(coalesce(t.title,'') || ' ' || coalesce(t.description,''))) > 0",
    );
  }
  const where = "where " + clauses.join(" and ");
  const count = await query<{ total: number | string }>(
    "select count(*)::int as total from tasks t " + where,
    values,
  );
  const total = Number(count[0]?.total ?? 0);
  const pageValues = [...values];
  let pageWhere = where;
  if (after) {
    const dateIndex = pageValues.push(after.createdAt);
    const idIndex = pageValues.push(after.id);
    pageWhere +=
      " and (t.created_at,t.id) < ($" + dateIndex + "::timestamptz,$" + idIndex + "::uuid)";
  }
  const limitIndex = pageValues.push(limit + 1);
  const rows = await query<Task & { owner_display_name: string | null }>(
    `select t.id,t.title,t.description,t.assigned_to,t.account_id,t.due_date,
            t.priority,t.status,t.created_by_agent,t.created_at,
            coalesce(nullif(trim(owner.name),''),'Name unavailable') as owner_display_name
       from tasks t left join profiles owner on owner.id=t.assigned_to ${pageWhere}
       order by t.created_at desc,t.id desc
       limit $${limitIndex}`,
    pageValues,
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({
            v: 1,
            signature,
            createdAt: new Date(last.created_at).toISOString(),
            id: last.id,
          }),
        ).toString("base64url")
      : null;
  return { items, nextCursor, total };
}

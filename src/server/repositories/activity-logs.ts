import { query, type Queryable } from "@/server/db/neon.server";
import type { ActivityLog } from "@/lib/types";

export type CreateActivityLogInput = {
  actor_type: "agent" | "user";
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  object_type: "lead" | "quote" | "client" | "task" | "approval";
  object_id?: string | null;
  diff_data?: unknown;
};

export async function createActivityLog(input: CreateActivityLogInput, db?: Queryable) {
  await query(
    `
      insert into activity_logs
        (actor_type, actor_id, actor_name, action, object_type, object_id, diff_data)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.actor_type,
      input.actor_id ?? null,
      input.actor_name ?? null,
      input.action,
      input.object_type,
      input.object_id ?? null,
      JSON.stringify(input.diff_data ?? null),
    ],
    db,
  );
}

export async function listActivityLogs(input: { object_id?: string } = {}) {
  const values: unknown[] = [];
  let where = "";

  if (input.object_id) {
    values.push(input.object_id);
    where = "where object_id = $1";
  }

  return query<ActivityLog>(
    `
      select *
      from activity_logs
      ${where}
      order by created_at desc
      limit 30
    `,
    values,
  );
}

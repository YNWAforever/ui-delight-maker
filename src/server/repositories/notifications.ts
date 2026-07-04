// src/server/repositories/notifications.ts
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import type { NotificationRecord, NotificationType } from "@/lib/types";

type CreateNotificationInput = {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  object_type?: string | null;
  object_id?: string | null;
  dedupe_key?: string | null;
};

export async function listNotifications(userId: string, limit = 50) {
  return query<NotificationRecord>(
    "select * from notifications where user_id = $1 order by created_at desc limit $2",
    [userId, limit],
  );
}

export async function countUnreadNotifications(userId: string) {
  const row = await queryOne<{ count: string }>(
    "select count(*)::text as count from notifications where user_id = $1 and read_at is null",
    [userId],
  );
  return Number(row?.count ?? "0");
}

/** Returns null (no insert, no error) when `dedupe_key` collides with an existing row — the sweep relies on this to stay idempotent. Accepts an optional `db` so it can participate in a caller's transaction (e.g. `createApproval` in a later task). */
export async function createNotification(input: CreateNotificationInput, db?: Queryable) {
  return queryOne<NotificationRecord>(
    `
      insert into notifications (user_id, type, title, body, object_type, object_id, dedupe_key)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (user_id, type, dedupe_key) where dedupe_key is not null do nothing
      returning *
    `,
    [
      input.user_id,
      input.type,
      input.title,
      input.body ?? null,
      input.object_type ?? null,
      input.object_id ?? null,
      input.dedupe_key ?? null,
    ],
    db,
  );
}

export async function markNotificationRead(id: string, userId: string) {
  const notification = await queryOne<NotificationRecord>(
    "update notifications set read_at = now() where id = $1 and user_id = $2 returning *",
    [id, userId],
  );
  if (!notification) throw new Error("Notification not found");
  return notification;
}

export async function markAllNotificationsRead(userId: string) {
  await query("update notifications set read_at = now() where user_id = $1 and read_at is null", [
    userId,
  ]);
}

export async function listApproverProfileIds() {
  const rows = await query<{ id: string }>(
    "select id from profiles where role in ('admin', 'manager')",
  );
  return rows.map((r) => r.id);
}

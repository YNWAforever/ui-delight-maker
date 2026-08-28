// src/server/repositories/notifications.ts
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { USER_ROLES } from "@/lib/admin/types";
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

/** The roles that hold `approvals.decide`, derived from the policy rather than hardcoded. */
function approverRoles() {
  return USER_ROLES.filter((role) => ROLE_GRANTS[role].has("approvals.decide"));
}

/**
 * Who gets told an approval is waiting.
 *
 * Derived from `ROLE_GRANTS` rather than hardcoded: this list said `('admin','manager')`, which
 * was the whole role set before migration 007 added `super_admin` and renamed `cs` to
 * `client_success`. The effect was that the one role holding every capability never received a
 * single approval notification. Reading the roles that actually hold `approvals.decide` means
 * the next role change updates this automatically instead of silently skipping someone.
 *
 * Suspended and deactivated profiles are excluded — notifying an account that cannot sign in
 * only buries the ones that can.
 */
export async function listApproverProfileIds() {
  const rows = await query<{ id: string }>(
    "select id from profiles where status = 'active' and role = any($1::text[])",
    [approverRoles()],
  );
  return rows.map((r) => r.id);
}

export type ApproverProfile = { id: string; name: string | null; email: string | null };

/**
 * The same people, named — the roster an approval can be routed to.
 *
 * Assignment shares this derivation rather than listing every profile, because an approval
 * assigned to someone without `approvals.decide` is a dead end: they cannot act on it, and the
 * queue would show it as handled when nobody can handle it. Whoever is told an approval is
 * waiting is exactly whoever may be given it.
 */
export async function listApproverProfiles() {
  return query<ApproverProfile>(
    `
      select id, name, email
      from profiles
      where status = 'active' and role = any($1::text[])
      order by coalesce(name, email, id), id
    `,
    [approverRoles()],
  );
}

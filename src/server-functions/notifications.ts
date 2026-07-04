// src/server-functions/notifications.ts
import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/repositories/notifications";

export const getNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireNeonAuthSession();
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(session.user.id),
    countUnreadNotifications(session.user.id),
  ]);
  return { notifications, unreadCount };
});

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return markNotificationRead(data.id, session.user.id);
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireNeonAuthSession();
  await markAllNotificationsRead(session.user.id);
  return { ok: true };
});

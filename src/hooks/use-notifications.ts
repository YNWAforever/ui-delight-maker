// src/hooks/use-notifications.ts
import { useCallback, useEffect, useState } from "react";
import {
  getNotifications,
  markAllNotificationsReadFn,
  markNotificationReadFn,
} from "@/server-functions/notifications";
import type { NotificationRecord } from "@/lib/types";

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const result = await getNotifications();
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markAsRead = useCallback(
    async (id: string) => {
      await markNotificationReadFn({ data: { id } });
      await refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsReadFn();
    await refresh();
  }, [refresh]);

  return { notifications, unreadCount, markAsRead, markAllRead, refresh };
}

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import {
  getNotifications,
  markAllNotificationsReadFn,
  markNotificationReadFn,
} from "@/server-functions/notifications";
import type { NotificationRecord } from "@/lib/types";

export type NotificationsRead = {
  notifications: NotificationRecord[];
  unreadCount: number;
};

const notificationsQueryKey = crmQueryKeys.notifications.list({});

function markRead(
  current: NotificationsRead | undefined,
  predicate: (notification: NotificationRecord) => boolean,
): NotificationsRead | undefined {
  if (!current) return current;

  const readAt = new Date().toISOString();
  const notifications = current.notifications.map((notification) =>
    predicate(notification) && !notification.read_at
      ? { ...notification, read_at: readAt }
      : notification,
  );

  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.read_at).length,
  };
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const query = useQuery(
    routeQueryOptions({
      queryKey: notificationsQueryKey,
      queryFn: () => getNotifications(),
    }),
  );

  const updateCachedData = useCallback(
    async (update: (current: NotificationsRead | undefined) => NotificationsRead | undefined) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey, exact: true });
      const previous = queryClient.getQueryData<NotificationsRead>(notificationsQueryKey);
      queryClient.setQueryData<NotificationsRead>(notificationsQueryKey, update);
      return previous;
    },
    [queryClient],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      const previous = await updateCachedData((current) =>
        markRead(current, (notification) => notification.id === id),
      );
      try {
        await markNotificationReadFn({ data: { id } });
      } catch (error) {
        queryClient.setQueryData(notificationsQueryKey, previous);
        throw error;
      }
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true });
    },
    [queryClient, updateCachedData],
  );

  const markAllRead = useCallback(async () => {
    const previous = await updateCachedData((current) => markRead(current, () => true));
    try {
      await markAllNotificationsReadFn();
    } catch (error) {
      queryClient.setQueryData(notificationsQueryKey, previous);
      throw error;
    }
    await queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true });
  }, [queryClient, updateCachedData]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true }),
    [queryClient],
  );

  const data = query.data as NotificationsRead | undefined;

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    markAsRead,
    markAllRead,
    refresh,
  };
}

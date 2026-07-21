import { useCallback, useRef } from "react";
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
  const readMutationTokensRef = useRef(new Map<string, symbol>());
  const query = useQuery(
    routeQueryOptions({
      queryKey: notificationsQueryKey,
      queryFn: () => getNotifications(),
    }),
  );

  const beginReadMutation = useCallback(
    async (predicate: (notification: NotificationRecord) => boolean) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey, exact: true });
      const previousById = new Map<string, NotificationRecord>();
      const mutationToken = Symbol("notification-read");
      queryClient.setQueryData<NotificationsRead>(notificationsQueryKey, (current) => {
        current?.notifications.forEach((notification) => {
          if (predicate(notification) && !notification.read_at) {
            previousById.set(notification.id, notification);
            readMutationTokensRef.current.set(notification.id, mutationToken);
          }
        });
        return markRead(current, predicate);
      });
      return { previousById, mutationToken };
    },
    [queryClient],
  );

  const finishReadMutation = useCallback(
    (previousById: Map<string, NotificationRecord>, mutationToken: symbol, rollback: boolean) => {
      if (rollback) {
        queryClient.setQueryData<NotificationsRead>(notificationsQueryKey, (current) => {
          if (!current) return current;
          const notifications = current.notifications.map((notification) => {
            const previous = previousById.get(notification.id);
            return previous && readMutationTokensRef.current.get(notification.id) === mutationToken
              ? previous
              : notification;
          });
          return {
            notifications,
            unreadCount: notifications.filter((notification) => !notification.read_at).length,
          };
        });
      }
      previousById.forEach((_, id) => {
        if (readMutationTokensRef.current.get(id) === mutationToken) {
          readMutationTokensRef.current.delete(id);
        }
      });
    },
    [queryClient],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      const mutation = await beginReadMutation((notification) => notification.id === id);
      try {
        await markNotificationReadFn({ data: { id } });
      } catch (error) {
        finishReadMutation(mutation.previousById, mutation.mutationToken, true);
        throw error;
      }
      finishReadMutation(mutation.previousById, mutation.mutationToken, false);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true });
    },
    [beginReadMutation, finishReadMutation, queryClient],
  );

  const markAllRead = useCallback(async () => {
    const mutation = await beginReadMutation(() => true);
    try {
      await markAllNotificationsReadFn();
    } catch (error) {
      finishReadMutation(mutation.previousById, mutation.mutationToken, true);
      throw error;
    }
    finishReadMutation(mutation.previousById, mutation.mutationToken, false);
    await queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true });
  }, [beginReadMutation, finishReadMutation, queryClient]);

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

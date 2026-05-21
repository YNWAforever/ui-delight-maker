import { useCallback, useMemo, useSyncExternalStore } from "react";
import { notifications as initialNotifications, type Notification } from "@/lib/mock-data";

type Store = {
  notifications: Notification[];
  listeners: Set<() => void>;
};

const store: Store = {
  notifications: initialNotifications.map((n) => ({ ...n })),
  listeners: new Set(),
};

function emit() {
  store.listeners.forEach((l) => l());
}

function getSnapshot() {
  return store.notifications;
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function useNotifications() {
  const notes = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const unreadCount = useMemo(
    () => notes.filter((n) => !n.read).length,
    [notes]
  );

  const markAsRead = useCallback((id: string) => {
    const idx = store.notifications.findIndex((n) => n.id === id);
    if (idx !== -1 && !store.notifications[idx].read) {
      store.notifications = store.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      emit();
    }
  }, []);

  const markAllRead = useCallback(() => {
    if (store.notifications.some((n) => !n.read)) {
      store.notifications = store.notifications.map((n) => ({ ...n, read: true }));
      emit();
    }
  }, []);

  return { notifications: notes, unreadCount, markAsRead, markAllRead };
}

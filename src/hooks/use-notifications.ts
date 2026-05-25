import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface Notification {
  id: string;
  type: "approval" | "task" | "lead" | "client";
  message: string;
  link: string;
  created_at: string;
  read: boolean;
}

type Store = {
  notifications: Notification[];
  listeners: Set<() => void>;
};

const store: Store = {
  notifications: [],
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

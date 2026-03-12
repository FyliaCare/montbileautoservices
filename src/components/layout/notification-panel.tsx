"use client";

import React, { useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { NOTIFICATION_ICONS } from "@/lib/constants";
import type { AppNotification, Keyed } from "@/lib/types";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role === "owner" ? "management" : "rider";
  const { appNotifications, markRead, markAllRead, removeNotification, clearAllNotifications: clearAll } =
    useFirebaseStore(useShallow((s) => ({
      appNotifications: s.appNotifications,
      markRead: s.markRead,
      markAllRead: s.markAllRead,
      removeNotification: s.removeNotification,
      clearAllNotifications: s.clearAllNotifications,
    })));

  // For riders: only show their own notifications (matching actor name)
  // For management: show all management + all-targeted notifications
  const notifications = useMemo(() => {
    return Object.entries(appNotifications)
      .filter(([, n]) => {
        if (role === "management") {
          return n.target_role === "management" || n.target_role === "all";
        }
        // Rider: only show notifications about themselves
        return (n.target_role === "rider" || n.target_role === "all") && n.actor === user?.name;
      })
      .map(([id, n]) => ({ ...n, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);
  }, [appNotifications, role, user?.name]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleRead = async (n: Keyed<AppNotification>) => {
    if (!n.read) {
      try { await markRead(n.id); } catch {}
    }
  };

  // Group: Today vs Earlier
  const today = new Date().toISOString().slice(0, 10);
  const todayNotifs = notifications.filter((n) => n.created_at?.startsWith(today));
  const earlierNotifs = notifications.filter((n) => !n.created_at?.startsWith(today));

  return (
    <BottomSheet open={open} onClose={onClose} title="Notifications">
      {/* Actions bar */}
      {notifications.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-gray-500">
            {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
          </span>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  // Only mark visible notifications as read
                  const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
                  if (unreadIds.length > 0) {
                    Promise.all(unreadIds.map(id => markRead(id))).catch(() => {});
                  }
                }}
                className="text-xs font-medium text-gold hover:text-gold-dark transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={() => {
                // Only delete visible notifications (not other users')
                const ids = notifications.map(n => n.id);
                Promise.all(ids.map(id => removeNotification(id))).catch(() => {});
                onClose();
              }}
              className="text-xs font-medium text-gray-400 hover:text-danger transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {notifications.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="text-3xl">🔔</span>
          <p className="mt-2 text-sm text-gray-500">No notifications yet</p>
        </div>
      )}

      {/* Today */}
      {todayNotifs.length > 0 && (
        <NotifGroup label="Today" items={todayNotifs} onRead={handleRead} onDelete={removeNotification} />
      )}

      {/* Earlier */}
      {earlierNotifs.length > 0 && (
        <NotifGroup label="Earlier" items={earlierNotifs} onRead={handleRead} onDelete={removeNotification} />
      )}
    </BottomSheet>
  );
}

function NotifGroup({
  label,
  items,
  onRead,
  onDelete,
}: {
  label: string;
  items: Keyed<AppNotification>[];
  onRead: (n: Keyed<AppNotification>) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            onClick={() => onRead(n)}
            className={cn(
              "flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-colors",
              n.read
                ? "bg-gray-50 dark:bg-gray-800/50"
                : "bg-gold/5 dark:bg-gold/10"
            )}
          >
            <span className="mt-0.5 text-lg shrink-0">
              {NOTIFICATION_ICONS[n.type] || "📢"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {n.title}
                </p>
                {!n.read && <span className="h-2 w-2 rounded-full bg-gold shrink-0" />}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.message}</p>
              <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(n.id).catch(() => {}); }}
              className="shrink-0 p-1 text-gray-300 hover:text-danger transition-colors"
              aria-label="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

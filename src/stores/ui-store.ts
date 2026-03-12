"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  shiftReminders: boolean;
  maintenanceAlerts: boolean;
  autoSync: boolean;

  setTheme: (theme: "light" | "dark" | "system") => void;
  toggleNotifications: () => void;
  toggleShiftReminders: () => void;
  toggleMaintenanceAlerts: () => void;
  setAutoSync: (val: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "system",
      notificationsEnabled: true,
      shiftReminders: true,
      maintenanceAlerts: true,
      autoSync: true,

      setTheme: (theme) => set({ theme }),
      toggleNotifications: () =>
        set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
      toggleShiftReminders: () =>
        set((s) => ({ shiftReminders: !s.shiftReminders })),
      toggleMaintenanceAlerts: () =>
        set((s) => ({ maintenanceAlerts: !s.maintenanceAlerts })),
      setAutoSync: (val) => set({ autoSync: val }),
    }),
    {
      name: "montbile-ui",
    }
  )
);

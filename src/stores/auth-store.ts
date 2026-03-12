"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppUser, UserRole, Rider } from "@/lib/types";
import { USERS } from "@/lib/constants";

interface AuthState {
  user: AppUser | null;
  login: (pin: string) => AppUser | null;
  loginWithRiders: (pin: string, riders: Record<string, Rider>) => AppUser | null;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,

      login: (pin: string) => {
        const found = USERS.find((u) => u.pin === pin);
        if (found) {
          set({ user: found });
          return found;
        }
        return null;
      },

      loginWithRiders: (pin: string, riders: Record<string, Rider>) => {
        // First check hardcoded users
        const found = USERS.find((u) => u.pin === pin);
        if (found) {
          set({ user: found });
          return found;
        }
        // Then check registered riders
        for (const [id, rider] of Object.entries(riders)) {
          if (rider.pin === pin && rider.selfRegistered) {
            // Only allow approved/active riders to log in
            if (rider.registration_status === "approved" || rider.registration_status === "active") {
              const riderUser: AppUser = {
                id,
                name: rider.name,
                role: "rider" as UserRole,
                pin: rider.pin,
                icon: "🏍️",
              };
              set({ user: riderUser });
              return riderUser;
            }
            // Pending riders cannot log in yet
            return null;
          }
        }
        return null;
      },

      logout: () => set({ user: null }),
    }),
    {
      name: "montbile-auth",
      partialize: (state) => ({ user: state.user }),
    }
  )
);

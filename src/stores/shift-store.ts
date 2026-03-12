"use client";

// Shift & trip tracking store (client-side shift session)

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid, todayISO } from "@/lib/utils";

interface ShiftState {
  // Current rider ID (for data isolation)
  currentRiderId: string | null;

  // Current shift data
  currentShiftId: string | null;
  clockInTime: string | null;
  isShiftActive: boolean;

  // Overtime tracking
  overtimeStartedAt: string | null; // ISO timestamp when overtime began (after 7 PM)

  // Online/Offline toggle (separate from shift)
  // Rider can go online/offline many times during a shift
  isOnline: boolean;

  // Today's accumulator
  todayTrips: Array<{ id: string; fare: number; time: string }>;
  todayEarnings: number;
  tripCount: number;

  // Actions
  setRider: (riderId: string) => void;
  startShift: (riderId: string, tricycleId: string) => string;
  endShift: () => { shiftId: string; duration: number; trips: number; earnings: number; overtimeMs: number } | null;
  addTrip: (fare: number) => { tripId: string; shiftId: string };
  goOnline: () => void;
  goOffline: () => void;
  markOvertime: () => void;
  loadTodayData: (riderId: string) => void;
  resetDay: () => void;
  clearAll: () => void;
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      currentRiderId: null,
      currentShiftId: null,
      clockInTime: null,
      isShiftActive: false,
      overtimeStartedAt: null,
      isOnline: false,
      todayTrips: [],
      todayEarnings: 0,
      tripCount: 0,

      setRider: (riderId) => {
        const prev = get().currentRiderId;
        if (prev && prev !== riderId) {
          set({
            currentRiderId: riderId,
            currentShiftId: null,
            clockInTime: null,
            isShiftActive: false,
            overtimeStartedAt: null,
            isOnline: false,
            todayTrips: [],
            todayEarnings: 0,
            tripCount: 0,
          });
        } else {
          set({ currentRiderId: riderId });
        }
      },

      startShift: (riderId, tricycleId) => {
        const shiftId = uid("shift");
        const now = new Date().toISOString();
        set({
          currentShiftId: shiftId,
          clockInTime: now,
          isShiftActive: true,
          overtimeStartedAt: null,
          isOnline: true, // auto go online when shift starts
        });
        return shiftId;
      },

      endShift: () => {
        const { currentShiftId, clockInTime, tripCount, todayEarnings, overtimeStartedAt } = get();
        if (!currentShiftId || !clockInTime) return null;

        const duration = Date.now() - new Date(clockInTime).getTime();
        const overtimeMs = overtimeStartedAt
          ? Date.now() - new Date(overtimeStartedAt).getTime()
          : 0;
        const result = {
          shiftId: currentShiftId,
          duration,
          trips: tripCount,
          earnings: todayEarnings,
          overtimeMs,
        };

        set({
          currentShiftId: null,
          clockInTime: null,
          isShiftActive: false,
          overtimeStartedAt: null,
          isOnline: false, // go offline when shift ends
        });

        return result;
      },

      addTrip: (fare) => {
        const { currentShiftId, todayTrips } = get();
        const tripId = uid("trip");
        const now = new Date().toISOString();
        const shiftId = currentShiftId || "no-shift";

        const newTrip = { id: tripId, fare, time: now };
        set({
          todayTrips: [...todayTrips, newTrip],
          todayEarnings: get().todayEarnings + fare,
          tripCount: get().tripCount + 1,
        });

        return { tripId, shiftId };
      },

      loadTodayData: (riderId) => {
        // recalculate from todayTrips (already persisted)
        const trips = get().todayTrips;
        const today = todayISO();
        const todayOnly = trips.filter((t) => t.time.startsWith(today));
        set({
          todayTrips: todayOnly,
          todayEarnings: todayOnly.reduce((s, t) => s + t.fare, 0),
          tripCount: todayOnly.length,
        });
      },

      resetDay: () => {
        set({
          todayTrips: [],
          todayEarnings: 0,
          tripCount: 0,
        });
      },
      goOnline: () => {
        if (get().isShiftActive) set({ isOnline: true });
      },

      goOffline: () => {
        set({ isOnline: false });
      },

      markOvertime: () => {
        if (!get().overtimeStartedAt) {
          set({ overtimeStartedAt: new Date().toISOString() });
        }
      },

      clearAll: () => {
        set({
          currentRiderId: null,
          currentShiftId: null,
          clockInTime: null,
          isShiftActive: false,
          overtimeStartedAt: null,
          isOnline: false,
          todayTrips: [],
          todayEarnings: 0,
          tripCount: 0,
        });
      },
    }),
    {
      name: "montbile-shift",
      partialize: (s) => ({
        currentRiderId: s.currentRiderId,
        currentShiftId: s.currentShiftId,
        clockInTime: s.clockInTime,
        isShiftActive: s.isShiftActive,
        overtimeStartedAt: s.overtimeStartedAt,
        isOnline: s.isOnline,
        todayTrips: s.todayTrips,
        todayEarnings: s.todayEarnings,
        tripCount: s.tripCount,
      }),
    }
  )
);

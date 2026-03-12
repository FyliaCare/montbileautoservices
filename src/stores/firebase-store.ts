"use client";

import { create } from "zustand";
import {
  subscribeToAll,
  saveDailyLog,
  deleteDailyLog,
  saveExpense,
  deleteExpense,
  savePayment,
  deletePayment,
  saveRider,
  updateRider,
  deleteRider,
  saveFuelLog,
  deleteFuelLog,
  saveMaintenance,
  deleteMaintenance,
  patchSettings as fbPatchSettings,
  saveShift,
  updateShift,
  deleteShift,
  saveTrip,
  deleteTrip,
  saveRemittance,
  updateRemittance,
  deleteRemittance,
  saveNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as fbDeleteNotification,
  deleteAllNotifications,
  saveRiderLocation,
  removeRiderLocation,
  saveLeaveRequest,
  updateLeaveRequest,
  deleteLeaveRequest as fbDeleteLeave,
  saveIncident,
  updateIncident,
  deleteIncident as fbDeleteIncident,
  saveMessage,
  markMessageRead,
  deleteMessage as fbDeleteMessage,
  saveDocument,
  deleteDocument as fbDeleteDocument,
  saveTrackerConfig as fbSaveTrackerConfig,
  updateTrackerConfig as fbUpdateTrackerConfig,
  saveTrackerDevice as fbSaveTrackerDevice,
  removeTrackerDevice as fbRemoveTrackerDevice,
} from "@/lib/firebase";
import type {
  FirebaseSnapshot,
  Settings,
  DailyLog,
  Expense,
  Payment,
  Rider,
  FuelLog,
  Maintenance,
  Shift,
  Trip,
  Remittance,
  AppNotification,
  Keyed,
  RiderLocation,
  LeaveRequest,
  IncidentReport,
  Message,
  Document,
  TrackerConfig,
  TrackerDevice,
} from "@/lib/types";

// ─── Store Shape ───
interface FirebaseState {
  // connection
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // data
  settings: Settings | null;
  dailyLogs: Record<string, DailyLog>;
  expenses: Record<string, Expense>;
  payments: Record<string, Payment>;
  riders: Record<string, Rider>;
  fuelLogs: Record<string, FuelLog>;
  maintenance: Record<string, Maintenance>;
  appShifts: Record<string, Shift>;
  appTrips: Record<string, Trip>;
  appRemittances: Record<string, Remittance>;
  appNotifications: Record<string, AppNotification>;
  riderLocations: Record<string, RiderLocation>;
  leaveRequests: Record<string, LeaveRequest>;
  incidents: Record<string, IncidentReport>;
  messages: Record<string, Message>;
  documents: Record<string, Document>;
  trackerConfig: TrackerConfig | null;

  // actions
  connect: () => void;
  disconnect: () => void;

  addDailyLog: (log: DailyLog) => Promise<void>;
  removeDailyLog: (key: string) => Promise<void>;
  addExpense: (expense: Expense) => Promise<string>;
  removeExpense: (key: string) => Promise<void>;
  addPayment: (payment: Payment) => Promise<string>;
  removePayment: (key: string) => Promise<void>;
  addRider: (rider: Rider) => Promise<string>;
  editRider: (key: string, updates: Partial<Rider>) => Promise<void>;
  removeRider: (key: string) => Promise<void>;
  addFuelLog: (log: FuelLog) => Promise<string>;
  removeFuelLog: (key: string) => Promise<void>;
  addMaintenance: (record: Maintenance) => Promise<string>;
  removeMaintenance: (key: string) => Promise<void>;
  patchSettings: (updates: Partial<Settings>) => Promise<void>;
  addShift: (id: string, shift: Shift) => Promise<void>;
  editShift: (id: string, updates: Partial<Shift>) => Promise<void>;
  removeShift: (id: string) => Promise<void>;
  addTrip: (id: string, trip: Trip) => Promise<void>;
  removeTrip: (id: string) => Promise<void>;
  addRemittance: (id: string, remittance: Remittance) => Promise<void>;
  editRemittance: (id: string, updates: Partial<Remittance>) => Promise<void>;
  removeRemittance: (id: string) => Promise<void>;
  addNotification: (notification: AppNotification) => Promise<string>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  updateRiderLocation: (riderId: string, location: RiderLocation) => Promise<void>;
  clearRiderLocation: (riderId: string) => Promise<void>;

  // Leave requests
  addLeaveRequest: (request: LeaveRequest) => Promise<string>;
  editLeaveRequest: (id: string, updates: Partial<LeaveRequest>) => Promise<void>;
  removeLeaveRequest: (id: string) => Promise<void>;

  // Incidents
  addIncident: (incident: IncidentReport) => Promise<string>;
  editIncident: (id: string, updates: Partial<IncidentReport>) => Promise<void>;
  removeIncident: (id: string) => Promise<void>;

  // Messages
  addMessage: (message: Message) => Promise<string>;
  readMessage: (id: string, userId: string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;

  // Documents
  addDocument: (doc: Document) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;

  // GPS Tracker
  setTrackerConfig: (config: TrackerConfig) => Promise<void>;
  patchTrackerConfig: (updates: Partial<TrackerConfig>) => Promise<void>;
  addTrackerDevice: (id: string, device: TrackerDevice) => Promise<void>;
  deleteTrackerDevice: (id: string) => Promise<void>;

  // computed
  getTodayLogs: () => DailyLog[];
  getTotalRevenue: () => number;
  getTotalExpenses: () => number;
  getRiderList: () => Keyed<Rider>[];
  getRecentExpenses: (limit?: number) => Keyed<Expense>[];
  getRecentPayments: (limit?: number) => Keyed<Payment>[];
  getRecentMaintenance: (limit?: number) => Keyed<Maintenance>[];
  getUnreadCount: (role?: string) => number;
  getNotificationsForRole: (role: string, limit?: number) => Keyed<AppNotification>[];
}

// singleton unsubscribe token
let _unsub: (() => void) | null = null;

export const useFirebaseStore = create<FirebaseState>()((set, get) => ({
  isConnected: false,
  isLoading: false,
  error: null,
  lastUpdated: null,
  settings: null,
  dailyLogs: {},
  expenses: {},
  payments: {},
  riders: {},
  fuelLogs: {},
  maintenance: {},
  appShifts: {},
  appTrips: {},
  appRemittances: {},
  appNotifications: {},
  riderLocations: {},
  leaveRequests: {},
  incidents: {},
  messages: {},
  documents: {},
  trackerConfig: null,

  // ── Connection ──
  connect: () => {
    if (_unsub) return; // already connected
    set({ isLoading: true, error: null });
    try {
      _unsub = subscribeToAll((data: FirebaseSnapshot) => {
        set({
          isConnected: true,
          isLoading: false,
          settings: data.settings,
          dailyLogs: data.daily_logs,
          expenses: data.expenses,
          payments: data.payments,
          riders: data.riders,
          fuelLogs: data.fuel_logs,
          maintenance: data.maintenance,
          appShifts: data.app_shifts,
          appTrips: data.app_trips,
          appRemittances: data.app_remittances,
          appNotifications: data.app_notifications,
          riderLocations: data.rider_locations,
          leaveRequests: data.leave_requests,
          incidents: data.incidents,
          messages: data.messages,
          documents: data.documents,
          trackerConfig: data.tracker_config,
        });
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  },

  disconnect: () => {
    _unsub?.();
    _unsub = null;
    set({ isConnected: false });
  },

  // ── CRUD wrappers (real-time listener auto-updates store) ──
  addDailyLog: async (log) => { await saveDailyLog(log); },
  removeDailyLog: async (key) => { await deleteDailyLog(key); },
  addExpense: async (expense) => saveExpense(expense),
  removeExpense: async (key) => { await deleteExpense(key); },
  addPayment: async (payment) => savePayment(payment),
  removePayment: async (key) => { await deletePayment(key); },
  addRider: async (rider) => saveRider(rider),
  editRider: async (key, updates) => { await updateRider(key, updates); },
  removeRider: async (key) => { await deleteRider(key); },
  addFuelLog: async (log) => saveFuelLog(log),
  removeFuelLog: async (key) => { await deleteFuelLog(key); },
  addMaintenance: async (record) => saveMaintenance(record),
  removeMaintenance: async (key) => { await deleteMaintenance(key); },
  patchSettings: async (updates) => { await fbPatchSettings(updates); },
  addShift: async (id, shift) => { await saveShift(id, shift); },
  editShift: async (id, updates) => { await updateShift(id, updates); },
  removeShift: async (id) => { await deleteShift(id); },
  addTrip: async (id, trip) => { await saveTrip(id, trip); },
  removeTrip: async (id) => { await deleteTrip(id); },
  addRemittance: async (id, remittance) => { await saveRemittance(id, remittance); },
  editRemittance: async (id, updates) => { await updateRemittance(id, updates); },
  removeRemittance: async (id) => { await deleteRemittance(id); },
  addNotification: async (notification) => saveNotification(notification),
  markRead: async (id) => { await markNotificationRead(id); },
  markAllRead: async () => {
    const notifs = get().appNotifications;
    const unreadIds = Object.entries(notifs)
      .filter(([, n]) => !n.read)
      .map(([id]) => id);
    if (unreadIds.length > 0) await markAllNotificationsRead(unreadIds);
  },
  removeNotification: async (id) => { await fbDeleteNotification(id); },
  clearAllNotifications: async () => { await deleteAllNotifications(); },
  updateRiderLocation: async (riderId, location) => { await saveRiderLocation(riderId, location); },
  clearRiderLocation: async (riderId) => { await removeRiderLocation(riderId); },

  addLeaveRequest: async (request) => saveLeaveRequest(request),
  editLeaveRequest: async (id, updates) => { await updateLeaveRequest(id, updates); },
  removeLeaveRequest: async (id) => { await fbDeleteLeave(id); },

  addIncident: async (incident) => saveIncident(incident),
  editIncident: async (id, updates) => { await updateIncident(id, updates); },
  removeIncident: async (id) => { await fbDeleteIncident(id); },

  addMessage: async (message) => saveMessage(message),
  readMessage: async (id, userId) => { await markMessageRead(id, userId); },
  removeMessage: async (id) => { await fbDeleteMessage(id); },

  addDocument: async (doc) => saveDocument(doc),
  removeDocument: async (id) => { await fbDeleteDocument(id); },

  setTrackerConfig: async (config) => { await fbSaveTrackerConfig(config); },
  patchTrackerConfig: async (updates) => { await fbUpdateTrackerConfig(updates); },
  addTrackerDevice: async (id, device) => { await fbSaveTrackerDevice(id, device); },
  deleteTrackerDevice: async (id) => { await fbRemoveTrackerDevice(id); },

  // ── Computed ──
  getTodayLogs: () => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.values(get().dailyLogs).filter((l) => l.date === today);
  },
  getTotalRevenue: () =>
    Object.values(get().dailyLogs).reduce((s, l) => s + (l.total_revenue || 0), 0),
  getTotalExpenses: () =>
    Object.values(get().expenses).reduce((s, e) => s + (e.amount || 0), 0),
  getRiderList: () =>
    Object.entries(get().riders).map(([id, r]) => ({ ...r, id })),
  getRecentExpenses: (limit = 10) =>
    Object.entries(get().expenses)
      .map(([id, e]) => ({ ...e, id }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),
  getRecentPayments: (limit = 10) =>
    Object.entries(get().payments)
      .map(([id, p]) => ({ ...p, id }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),
  getRecentMaintenance: (limit = 10) =>
    Object.entries(get().maintenance)
      .map(([id, m]) => ({ ...m, id }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),
  getUnreadCount: (role?: string) =>
    Object.values(get().appNotifications).filter(
      (n) => !n.read && (!role || n.target_role === role || n.target_role === "all")
    ).length,
  getNotificationsForRole: (role: string, limit = 50) =>
    Object.entries(get().appNotifications)
      .filter(([, n]) => n.target_role === role || n.target_role === "all")
      .map(([id, n]) => ({ ...n, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit),
}));

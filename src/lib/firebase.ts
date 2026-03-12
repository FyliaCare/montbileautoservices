// Firebase Realtime Database — single file for config + all operations
// Lazy initialization: Firebase SDK is imported but init deferred until first use

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  set,
  remove,
  push,
  off,
  onDisconnect,
  type Database,
} from "firebase/database";
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
  RiderLocation,
  LeaveRequest,
  IncidentReport,
  Message,
  Document,
  TrackerConfig,
  TrackerDevice,
} from "./types";

// ─── Config ───
const firebaseConfig = {
  apiKey: "AIzaSyAiggwEpVKc5BeqifVA8xNttJK7k2Xy2d8",
  authDomain: "montbile-services.firebaseapp.com",
  databaseURL:
    "https://montbile-services-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "montbile-services",
  storageBucket: "montbile-services.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};

// ─── Lazy Singletons ───
let _app: FirebaseApp | null = null;
let _db: Database | null = null;

function getApp_(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

function getDb(): Database {
  if (!_db) {
    _db = getDatabase(getApp_());
  }
  return _db;
}

// ─── ID Generation ───
function genId(prefix: string, date = ""): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return date ? `${prefix}_${date}_${rand}` : `${prefix}_${rand}`;
}

// ═══════════════════════════════════════
// REAL-TIME SUBSCRIPTION
// ═══════════════════════════════════════

type SnapshotCallback = (data: FirebaseSnapshot) => void;

export function subscribeToAll(callback: SnapshotCallback): () => void {
  const db = getDb();
  const rootRef = ref(db, "/");

  onValue(rootRef, (snapshot) => {
    const raw = snapshot.val() || {};
    callback({
      settings: raw.settings || null,
      daily_logs: raw.daily_logs || {},
      expenses: raw.expenses || {},
      payments: raw.payments || {},
      riders: raw.riders || {},
      fuel_logs: raw.fuel_logs || {},
      maintenance: raw.maintenance || {},
      app_shifts: raw.app_shifts || {},
      app_trips: raw.app_trips || {},
      app_remittances: raw.app_remittances || {},
      app_notifications: raw.app_notifications || {},
      rider_locations: raw.rider_locations || {},
      leave_requests: raw.leave_requests || {},
      incidents: raw.incidents || {},
      messages: raw.messages || {},
      documents: raw.documents || {},
      tracker_config: raw.tracker_config || null,
    });
  });

  return () => off(rootRef);
}

// ═══════════════════════════════════════
// CRUD — Settings
// ═══════════════════════════════════════

export async function patchSettings(updates: Partial<Settings>): Promise<void> {
  const db = getDb();
  const settingsRef = ref(db, "settings");
  return new Promise((resolve) => {
    onValue(
      settingsRef,
      async (snap) => {
        off(settingsRef);
        await set(settingsRef, { ...snap.val(), ...updates });
        resolve();
      },
      { onlyOnce: true }
    );
  });
}

// ═══════════════════════════════════════
// CRUD — Daily Logs (keyed by date_bikeN)
// ═══════════════════════════════════════

export async function saveDailyLog(log: DailyLog): Promise<void> {
  const db = getDb();
  const key = `${log.date}_bike${log.bike}`;
  await set(ref(db, `daily_logs/${key}`), log);
}

export async function deleteDailyLog(key: string): Promise<void> {
  await remove(ref(getDb(), `daily_logs/${key}`));
}

// ═══════════════════════════════════════
// CRUD — Expenses
// ═══════════════════════════════════════

export async function saveExpense(expense: Expense): Promise<string> {
  const key = genId("exp", expense.date);
  await set(ref(getDb(), `expenses/${key}`), expense);
  return key;
}

export async function deleteExpense(key: string): Promise<void> {
  await remove(ref(getDb(), `expenses/${key}`));
}

// ═══════════════════════════════════════
// CRUD — Payments
// ═══════════════════════════════════════

export async function savePayment(payment: Payment): Promise<string> {
  const key = genId("pay", payment.date);
  await set(ref(getDb(), `payments/${key}`), payment);
  return key;
}

export async function deletePayment(key: string): Promise<void> {
  await remove(ref(getDb(), `payments/${key}`));
}

// ═══════════════════════════════════════
// CRUD — Riders
// ═══════════════════════════════════════

export async function saveRider(rider: Rider): Promise<string> {
  const key = genId("rider");
  await set(ref(getDb(), `riders/${key}`), rider);
  return key;
}

export async function updateRider(
  key: string,
  updates: Partial<Rider>
): Promise<void> {
  const db = getDb();
  const riderRef = ref(db, `riders/${key}`);
  return new Promise((resolve) => {
    onValue(
      riderRef,
      async (snap) => {
        off(riderRef);
        await set(riderRef, { ...snap.val(), ...updates });
        resolve();
      },
      { onlyOnce: true }
    );
  });
}

export async function deleteRider(key: string): Promise<void> {
  await remove(ref(getDb(), `riders/${key}`));
}

// ═══════════════════════════════════════
// CRUD — Fuel Logs
// ═══════════════════════════════════════

export async function saveFuelLog(log: FuelLog): Promise<string> {
  const key = genId("fuel", log.date);
  await set(ref(getDb(), `fuel_logs/${key}`), log);
  return key;
}

export async function deleteFuelLog(key: string): Promise<void> {
  await remove(ref(getDb(), `fuel_logs/${key}`));
}

// ═══════════════════════════════════════
// CRUD — Maintenance
// ═══════════════════════════════════════

export async function saveMaintenance(record: Maintenance): Promise<string> {
  const key = genId("maint", record.date);
  await set(ref(getDb(), `maintenance/${key}`), record);
  return key;
}

export async function deleteMaintenance(key: string): Promise<void> {
  await remove(ref(getDb(), `maintenance/${key}`));
}

// ═══════════════════════════════════════
// CRUD — Shifts
// ═══════════════════════════════════════

export async function saveShift(id: string, shift: Shift): Promise<void> {
  await set(ref(getDb(), `app_shifts/${id}`), shift);
}

export async function updateShift(
  id: string,
  updates: Partial<Shift>
): Promise<void> {
  const db = getDb();
  const shiftRef = ref(db, `app_shifts/${id}`);
  return new Promise((resolve) => {
    onValue(
      shiftRef,
      async (snap) => {
        off(shiftRef);
        await set(shiftRef, { ...snap.val(), ...updates });
        resolve();
      },
      { onlyOnce: true }
    );
  });
}

export async function deleteShift(id: string): Promise<void> {
  await remove(ref(getDb(), `app_shifts/${id}`));
}

// ═══════════════════════════════════════
// CRUD — Trips
// ═══════════════════════════════════════

export async function saveTrip(id: string, trip: Trip): Promise<void> {
  await set(ref(getDb(), `app_trips/${id}`), trip);
}

export async function deleteTrip(id: string): Promise<void> {
  await remove(ref(getDb(), `app_trips/${id}`));
}

// ═══════════════════════════════════════
// CRUD — Remittances
// ═══════════════════════════════════════

export async function saveRemittance(
  id: string,
  remittance: Remittance
): Promise<void> {
  await set(ref(getDb(), `app_remittances/${id}`), remittance);
}

export async function updateRemittance(
  id: string,
  updates: Partial<Remittance>
): Promise<void> {
  const db = getDb();
  const remitRef = ref(db, `app_remittances/${id}`);
  return new Promise((resolve) => {
    onValue(
      remitRef,
      async (snap) => {
        off(remitRef);
        await set(remitRef, { ...snap.val(), ...updates });
        resolve();
      },
      { onlyOnce: true }
    );
  });
}

export async function deleteRemittance(id: string): Promise<void> {
  await remove(ref(getDb(), `app_remittances/${id}`));
}

// ═══════════════════════════════════════
// CRUD — Notifications
// ═══════════════════════════════════════

export async function saveNotification(
  notification: AppNotification
): Promise<string> {
  const db = getDb();
  const notifRef = push(ref(db, "app_notifications"));
  await set(notifRef, notification);
  return notifRef.key!;
}

export async function markNotificationRead(id: string): Promise<void> {
  await set(ref(getDb(), `app_notifications/${id}/read`), true);
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  const db = getDb();
  await Promise.all(
    ids.map((id) => set(ref(db, `app_notifications/${id}/read`), true))
  );
}

export async function deleteNotification(id: string): Promise<void> {
  await remove(ref(getDb(), `app_notifications/${id}`));
}

export async function deleteAllNotifications(): Promise<void> {
  await remove(ref(getDb(), "app_notifications"));
}

// ═══════════════════════════════════════
// CRUD — Rider Locations
// ═══════════════════════════════════════

export async function saveRiderLocation(
  riderId: string,
  location: RiderLocation
): Promise<void> {
  await set(ref(getDb(), `rider_locations/${riderId}`), location);
}

export async function removeRiderLocation(
  riderId: string
): Promise<void> {
  await remove(ref(getDb(), `rider_locations/${riderId}`));
}

/**
 * Mark rider location as idle (temporary offline).
 * Keeps position on map but shows grey/ash indicator.
 * Used when rider ends a mid-day shift break.
 */
export async function setRiderLocationIdle(
  riderId: string
): Promise<void> {
  const locRef = ref(getDb(), `rider_locations/${riderId}`);
  const { get: fbGet } = await import("firebase/database");
  const snap = await fbGet(locRef);
  if (snap.exists()) {
    const data = snap.val() as RiderLocation;
    await set(locRef, { ...data, status: "idle", timestamp: new Date().toISOString() });
  }
}

/**
 * Set up onDisconnect handler so Firebase auto-marks
 * the rider's location as idle if the browser/tab closes unexpectedly.
 * This keeps them visible on the map as grey (offline) instead of disappearing.
 */
export function setupLocationDisconnect(riderId: string): void {
  const locRef = ref(getDb(), `rider_locations/${riderId}/status`);
  onDisconnect(locRef).set("idle").catch(() => {});
}

export function subscribeToLocations(
  callback: (locations: Record<string, RiderLocation>) => void
): () => void {
  const db = getDb();
  const locRef = ref(db, "rider_locations");
  onValue(locRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(locRef);
}

// ═══════════════════════════════════════
// CRUD — Leave Requests
// ═══════════════════════════════════════

export async function saveLeaveRequest(request: LeaveRequest): Promise<string> {
  const db = getDb();
  const reqRef = push(ref(db, "leave_requests"));
  await set(reqRef, request);
  return reqRef.key!;
}

export async function updateLeaveRequest(
  id: string,
  updates: Partial<LeaveRequest>
): Promise<void> {
  const db = getDb();
  const reqRef = ref(db, `leave_requests/${id}`);
  return new Promise((resolve) => {
    onValue(reqRef, async (snap) => {
      off(reqRef);
      await set(reqRef, { ...snap.val(), ...updates });
      resolve();
    }, { onlyOnce: true });
  });
}

export async function deleteLeaveRequest(id: string): Promise<void> {
  await remove(ref(getDb(), `leave_requests/${id}`));
}

// ═══════════════════════════════════════
// CRUD — Incidents
// ═══════════════════════════════════════

export async function saveIncident(incident: IncidentReport): Promise<string> {
  const db = getDb();
  const incRef = push(ref(db, "incidents"));
  await set(incRef, incident);
  return incRef.key!;
}

export async function updateIncident(
  id: string,
  updates: Partial<IncidentReport>
): Promise<void> {
  const db = getDb();
  const incRef = ref(db, `incidents/${id}`);
  return new Promise((resolve) => {
    onValue(incRef, async (snap) => {
      off(incRef);
      await set(incRef, { ...snap.val(), ...updates });
      resolve();
    }, { onlyOnce: true });
  });
}

export async function deleteIncident(id: string): Promise<void> {
  await remove(ref(getDb(), `incidents/${id}`));
}

// ═══════════════════════════════════════
// CRUD — Messages
// ═══════════════════════════════════════

export async function saveMessage(message: Message): Promise<string> {
  const db = getDb();
  const msgRef = push(ref(db, "messages"));
  await set(msgRef, message);
  return msgRef.key!;
}

export async function markMessageRead(id: string, userId: string): Promise<void> {
  await set(ref(getDb(), `messages/${id}/read_by/${userId}`), true);
}

export async function deleteMessage(id: string): Promise<void> {
  await remove(ref(getDb(), `messages/${id}`));
}

// ═══════════════════════════════════════
// CRUD — Documents
// ═══════════════════════════════════════

export async function saveDocument(doc: Document): Promise<string> {
  const db = getDb();
  const docRef = push(ref(db, "documents"));
  await set(docRef, doc);
  return docRef.key!;
}

export async function deleteDocument(id: string): Promise<void> {
  await remove(ref(getDb(), `documents/${id}`));
}

// ═══════════════════════════════════════
// CRUD — GPS Tracker Config
// ═══════════════════════════════════════

export async function saveTrackerConfig(config: TrackerConfig): Promise<void> {
  await set(ref(getDb(), "tracker_config"), config);
}

export async function updateTrackerConfig(
  updates: Partial<TrackerConfig>
): Promise<void> {
  const db = getDb();
  const configRef = ref(db, "tracker_config");
  return new Promise((resolve) => {
    onValue(
      configRef,
      async (snap) => {
        off(configRef);
        await set(configRef, { ...snap.val(), ...updates });
        resolve();
      },
      { onlyOnce: true }
    );
  });
}

export async function saveTrackerDevice(
  deviceId: string,
  device: TrackerDevice
): Promise<void> {
  await set(ref(getDb(), `tracker_config/devices/${deviceId}`), device);
}

export async function removeTrackerDevice(deviceId: string): Promise<void> {
  await remove(ref(getDb(), `tracker_config/devices/${deviceId}`));
}

// Offline-first IndexedDB storage using Dexie
// Every operation is wrapped in try/catch for resilience

import Dexie, { type Table } from "dexie";

interface OfflineTrip {
  id?: number;
  shiftId: string;
  riderId: string;
  fareAmount: number;
  tripTime: string;
  synced: number; // 0 or 1
}

interface OfflineShift {
  id?: number;
  shiftId: string;
  riderId: string;
  clockIn: string;
  clockOut?: string;
  status: string;
  totalTrips: number;
  totalEarnings: number;
  synced: number;
}

interface CachedNotification {
  id?: number;
  notifId: string;
  title: string;
  message: string;
  type: string;
  read: number; // 0 or 1
  createdAt: string;
}

class MontbileDB extends Dexie {
  trips!: Table<OfflineTrip>;
  shifts!: Table<OfflineShift>;
  notifications!: Table<CachedNotification>;

  constructor() {
    super("MontbileDB");
    this.version(1).stores({
      trips: "++id, shiftId, riderId, synced",
      shifts: "++id, shiftId, riderId, synced",
      notifications: "++id, notifId, read, createdAt",
    });
  }
}

let _db: MontbileDB | null = null;

function getDB(): MontbileDB {
  if (!_db) _db = new MontbileDB();
  return _db;
}

// ─── Trips ───

export async function saveOfflineTrip(trip: Omit<OfflineTrip, "id">): Promise<void> {
  try {
    await getDB().trips.add(trip);
  } catch (e) {
    console.warn("IndexedDB: failed to save trip", e);
  }
}

export async function getUnsyncedTrips(): Promise<OfflineTrip[]> {
  try {
    return await getDB().trips.where("synced").equals(0).toArray();
  } catch {
    return [];
  }
}

export async function markTripSynced(id: number): Promise<void> {
  try {
    await getDB().trips.update(id, { synced: 1 });
  } catch (e) {
    console.warn("IndexedDB: failed to mark trip synced", e);
  }
}

// ─── Shifts ───

export async function saveOfflineShift(shift: Omit<OfflineShift, "id">): Promise<void> {
  try {
    await getDB().shifts.add(shift);
  } catch (e) {
    console.warn("IndexedDB: failed to save shift", e);
  }
}

// ─── Notifications Cache ───

export async function cacheNotification(n: Omit<CachedNotification, "id">): Promise<void> {
  try {
    const existing = await getDB().notifications.where("notifId").equals(n.notifId).first();
    if (!existing) await getDB().notifications.add(n);
  } catch (e) {
    console.warn("IndexedDB: failed to cache notification", e);
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    return await getDB().notifications.where("read").equals(0).count();
  } catch {
    return 0;
  }
}

export async function markNotificationReadLocal(notifId: string): Promise<void> {
  try {
    const item = await getDB().notifications.where("notifId").equals(notifId).first();
    if (item?.id) await getDB().notifications.update(item.id, { read: 1 });
  } catch (e) {
    console.warn("IndexedDB: failed to mark read", e);
  }
}

export async function clearLocalNotifications(): Promise<void> {
  try {
    await getDB().notifications.clear();
  } catch (e) {
    console.warn("IndexedDB: failed to clear notifications", e);
  }
}

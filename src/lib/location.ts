// ─── Location Tracking Service ───
// Uses the free browser Geolocation API (no Google Maps needed)
// Stores rider positions in Firebase Realtime Database
// Throttled to write every ~10 seconds to save bandwidth

import { saveRiderLocation, removeRiderLocation, setRiderLocationIdle, setupLocationDisconnect } from "./firebase";
import { BASE_LOCATION, GEOFENCE_RADIUS_M } from "./constants";
import type { RiderLocation } from "./types";

let _watchId: number | null = null;
let _riderId: string | null = null;
let _lastWriteTime = 0;
const WRITE_INTERVAL_MS = 10_000; // write to Firebase at most every 10s

/**
 * Start tracking rider location.
 * Called when rider clicks "Start Shift".
 * Uses navigator.geolocation.watchPosition() for real-time updates.
 * Writes are throttled to every 10 seconds to save bandwidth.
 * Sets up onDisconnect() so Firebase auto-removes stale locations.
 */
export function startLocationTracking(
  riderId: string,
  riderName: string,
  shiftId: string
): boolean {
  if (!("geolocation" in navigator)) {
    console.warn("Geolocation not supported");
    return false;
  }

  // Stop any existing tracking
  stopLocationTracking();

  _riderId = riderId;
  _lastWriteTime = 0; // ensure first position writes immediately

  // Set up onDisconnect handler — Firebase auto-removes location
  // if the browser/tab closes without calling stopLocationTracking()
  setupLocationDisconnect(riderId);

  // Request high-accuracy position updates
  _watchId = navigator.geolocation.watchPosition(
    (position) => {
      const now = Date.now();

      // Throttle: skip if we wrote less than 10s ago
      if (now - _lastWriteTime < WRITE_INTERVAL_MS) return;

      const location: RiderLocation = {
        rider_id: riderId,
        rider_name: riderName,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: new Date().toISOString(),
        shift_id: shiftId,
        status: "active",
      };

      _lastWriteTime = now;
      // Save to Firebase (fire-and-forget)
      saveRiderLocation(riderId, location).catch(() => {});
    },
    (error) => {
      console.warn("Geolocation error:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000, // accept cached position up to 10s old
      timeout: 15000,    // timeout after 15s
    }
  );

  return true;
}

/**
 * Stop tracking rider location.
 * Called when rider clicks "End Shift".
 * Clears the GPS watch but keeps rider on map as IDLE (grey/ash).
 * Rider stays visible so management knows they're just temporarily offline
 * (lunch break, phone charging, slow market — not end of day).
 */
export function stopLocationTracking(): void {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }

  if (_riderId) {
    // Mark as idle instead of removing — keeps grey marker on map
    setRiderLocationIdle(_riderId).catch(() => {});
    _riderId = null;
  }
}

/**
 * Fully remove rider from map (used for true end-of-day cleanup).
 */
export function clearLocationFromMap(): void {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  if (_riderId) {
    removeRiderLocation(_riderId).catch(() => {});
    _riderId = null;
  }
}

/**
 * Check if location tracking is currently active
 */
export function isTracking(): boolean {
  return _watchId !== null;
}

/**
 * Get a one-time position (for initial location on shift start)
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  });
}

// ─── Geofence helpers ───

/** Haversine distance between two lat/lng points in metres */
function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000; // earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check whether the rider is within the geofence of the base station.
 * Returns { atBase, distanceM } or throws if GPS is unavailable.
 */
export async function checkAtBase(): Promise<{ atBase: boolean; distanceM: number }> {
  const pos = await getCurrentPosition();
  const distanceM = haversineMetres(
    pos.coords.latitude,
    pos.coords.longitude,
    BASE_LOCATION.lat,
    BASE_LOCATION.lng
  );
  return { atBase: distanceM <= GEOFENCE_RADIUS_M, distanceM };
}

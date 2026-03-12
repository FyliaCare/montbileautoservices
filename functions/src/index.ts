/**
 * Montbile Auto Services — GPS Tracker Cloud Functions
 *
 * Polls DAGPS.net for hardware GPS tracker locations and writes them
 * to Firebase RTDB at /rider_locations/tracker-{imei}, where the existing
 * fleet map automatically picks them up.
 *
 * Deployment:
 *   1. cd functions && npm install
 *   2. firebase deploy --only functions
 *
 * Requires Firebase Blaze plan (pay-as-you-go, free tier covers small usage).
 */

import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { dagpsLogin, dagpsGetDeviceLocation } from "./dagps";
import type { DagpsSession } from "./dagps";

admin.initializeApp();
const db = admin.database();

// ─── Types matching the client app ───

interface TrackerDevice {
  imei: string;
  name: string;
  rider_id?: string;
  rider_name?: string;
  enabled: boolean;
  last_lat?: number;
  last_lng?: number;
  last_speed?: number;
  last_seen?: string;
  added_at: string;
}

interface TrackerConfig {
  platform: string;
  account: string;
  password: string;
  server_url: string;
  devices: Record<string, TrackerDevice>;
  enabled: boolean;
  poll_interval_seconds: number;
  last_poll?: string;
  last_error?: string;
  session_token?: string;
  session_user_id?: string;
  session_cookie?: string;
  session_expiry?: string;
}

interface RiderLocation {
  rider_id: string;
  rider_name: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  shift_id: string;
  status: "active" | "idle";
  source: "tracker";
}

// ─── Cached session ───
let cachedSession: DagpsSession | null = null;

async function getOrRefreshSession(config: TrackerConfig): Promise<DagpsSession> {
  // Check if we have a valid cached session
  if (
    cachedSession &&
    cachedSession.mds &&
    new Date(cachedSession.expires_at) > new Date()
  ) {
    return cachedSession;
  }

  // Check if RTDB has a valid session
  if (
    config.session_token &&
    config.session_expiry &&
    new Date(config.session_expiry) > new Date()
  ) {
    cachedSession = {
      mds: config.session_token,
      user_id: config.session_user_id || "",
      cookie: config.session_cookie || "",
      expires_at: config.session_expiry,
    };
    return cachedSession;
  }

  // Need to login fresh
  const session = await dagpsLogin({
    account: config.account,
    password: config.password,
    server_url: config.server_url,
  });

  // Save session to RTDB for persistence
  await db.ref("tracker_config/session_token").set(session.mds);
  await db.ref("tracker_config/session_user_id").set(session.user_id);
  await db.ref("tracker_config/session_cookie").set(session.cookie);
  await db.ref("tracker_config/session_expiry").set(session.expires_at);

  cachedSession = session;
  return session;
}

// ─── Main polling function ───

async function pollTrackerLocations(): Promise<{
  success: number;
  failed: number;
  error?: string;
}> {
  // Read tracker config from RTDB
  const configSnap = await db.ref("tracker_config").once("value");
  const config = configSnap.val() as TrackerConfig | null;

  if (!config) {
    return { success: 0, failed: 0, error: "No tracker config found" };
  }

  if (!config.enabled) {
    return { success: 0, failed: 0, error: "Tracker polling disabled" };
  }

  if (!config.account || !config.password) {
    return { success: 0, failed: 0, error: "Missing DAGPS credentials" };
  }

  if (!config.devices || Object.keys(config.devices).length === 0) {
    return { success: 0, failed: 0, error: "No devices configured" };
  }

  let session: DagpsSession;
  try {
    session = await getOrRefreshSession(config);
  } catch (err) {
    const errorMsg = `Login failed: ${(err as Error).message}`;
    await db.ref("tracker_config/last_error").set(errorMsg);
    await db.ref("tracker_config/last_poll").set(new Date().toISOString());
    return { success: 0, failed: 0, error: errorMsg };
  }

  let success = 0;
  let failed = 0;

  // Poll each enabled device
  for (const [deviceId, device] of Object.entries(config.devices)) {
    if (!device.enabled || !device.imei) continue;

    try {
      const location = await dagpsGetDeviceLocation(
        config.server_url,
        session,
        device.imei
      );

      if (location && location.lat !== 0 && location.lng !== 0) {
        // Write to rider_locations (same path the fleet map reads from)
        const riderLocation: RiderLocation = {
          rider_id: device.rider_id || deviceId,
          rider_name: device.rider_name || device.name,
          lat: location.lat,
          lng: location.lng,
          accuracy: 10, // Hardware GPS trackers are typically ~10m accuracy
          speed: location.speed > 0 ? location.speed / 3.6 : null, // Convert km/h to m/s (app expects m/s)
          heading: location.heading > 0 ? location.heading : null,
          timestamp: new Date().toISOString(),
          shift_id: `tracker-${device.imei}`,
          status: "active",
          source: "tracker",
        };

        await db.ref(`rider_locations/${deviceId}`).set(riderLocation);

        // Update device last-seen info
        await db.ref(`tracker_config/devices/${deviceId}/last_lat`).set(location.lat);
        await db.ref(`tracker_config/devices/${deviceId}/last_lng`).set(location.lng);
        await db.ref(`tracker_config/devices/${deviceId}/last_speed`).set(location.speed);
        await db.ref(`tracker_config/devices/${deviceId}/last_seen`).set(new Date().toISOString());

        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Update poll timestamp
  const updates: Record<string, string | null> = {
    "tracker_config/last_poll": new Date().toISOString(),
  };
  if (success > 0) {
    updates["tracker_config/last_error"] = null;
  }
  await db.ref().update(updates);

  return { success, failed };
}

// ═══════════════════════════════════════
// Cloud Function: Scheduled Poller
// Runs every 1 minute (minimum for Cloud Scheduler)
// ═══════════════════════════════════════

export const pollDagpsTracker = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async () => {
    const result = await pollTrackerLocations();
    console.log(
      `DAGPS poll complete: ${result.success} success, ${result.failed} failed${
        result.error ? `, error: ${result.error}` : ""
      }`
    );
  }
);

// ═══════════════════════════════════════
// Cloud Function: Manual Poll (HTTP trigger)
// Call this to test the integration manually
// ═══════════════════════════════════════

export const pollDagpsManual = onRequest(
  {
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (_req, res) => {
    try {
      const result = await pollTrackerLocations();
      res.json({
        ok: true,
        ...result,
        polled_at: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: (err as Error).message,
      });
    }
  }
);

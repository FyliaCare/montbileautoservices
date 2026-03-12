#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 *  MONTBILE GPS TRACKER DAEMON v3.0
 *  Near Real-Time DAGPS → Firebase Bridge (Multi-Device, Self-Healing)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Reads tracker_config from Firebase RTDB for credentials and devices.
 *  Polls DAGPS for ALL enabled devices and pushes enriched data to
 *  Firebase where the fleet map picks it up instantly.
 *
 *  Features:
 *  ─ Dynamic configuration from Firebase (no hardcoded credentials)
 *  ─ Multi-device support — polls all enabled devices in tracker_config
 *  ─ Session auto-refresh before expiry (50 min of 60 min TTL)
 *  ─ Exponential backoff on errors (max 5 min)
 *  ─ Alarm detection → writes Firebase notifications
 *  ─ Adaptive poll rate: 10s moving, 30s stationary, 60s idle
 *  ─ Rich data: speed, heading, trail, signal, heartbeat, movement
 *  ─ Health-check HTTP server for cloud hosting (Fly.io, Railway, etc.)
 *  ─ Graceful shutdown writes offline status
 *  ─ Zero npm dependencies — pure Node.js
 *
 *  Usage:
 *    node tracker-daemon.js
 *
 *  Environment:
 *    PORT — HTTP health server port (default 8080)
 *
 *  Runs until stopped with Ctrl+C.
 * ═══════════════════════════════════════════════════════════════════════
 */

const http = require("http");
const https = require("https");

// ─── Configuration ───────────────────────────────────────────────────

const FIREBASE_DB_URL =
  "https://montbile-services-default-rtdb.europe-west1.firebasedatabase.app";

const DAGPS_BASE_URL = "http://www.dagps.net";

const POLL_INTERVALS = {
  movingMs: 10_000,
  stationaryMs: 30_000,
  idleMs: 60_000,
};

const SESSION_REFRESH_BEFORE_EXPIRY_MS = 10 * 60_000; // refresh 10 min before expiry
const CONFIG_RELOAD_INTERVAL_MS = 5 * 60_000; // re-read tracker_config every 5 min
const MAX_SPEED_HISTORY = 20;
const MAX_TRAIL_POINTS = 30;
const MAX_RETRY_ATTEMPTS = 5;
const HEARTBEAT_ONLINE_THRESHOLD_SEC = 300; // 5 min

// ─── State ───────────────────────────────────────────────────────────

const state = {
  config: null,
  configLastLoaded: 0,
  session: null,
  devices: {},

  stats: {
    startTime: Date.now(),
    totalPolls: 0,
    successPolls: 0,
    errorPolls: 0,
    firebaseWrites: 0,
    lastPollTime: null,
    consecutiveErrors: 0,
    devicesPolled: 0,
  },
};

function getDeviceState(deviceId) {
  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      speedHistory: [],
      trail: [],
      prevLatLng: null,
      movement: "unknown",
      online: false,
      lastLocation: null,
      lastAlarm: 0,
    };
  }
  return state.devices[deviceId];
}

// ─── ANSI Colour Helpers ─────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  clear: "\x1b[2J\x1b[H",
};

// ─── HTTP Helpers (zero deps) ────────────────────────────────────────

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": "MontbileTrackerDaemon/3.0",
        ...options.headers,
      },
      timeout: options.timeout || 15000,
    };

    if (options.body) {
      const bodyBuf = Buffer.from(options.body, "utf-8");
      reqOptions.headers["Content-Length"] = bodyBuf.length;
      if (!reqOptions.headers["Content-Type"]) {
        reqOptions.headers["Content-Type"] =
          "application/x-www-form-urlencoded";
      }
    }

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, headers: res.headers, body: data });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

/** Retry a function with exponential backoff */
async function withRetry(fn, label, maxAttempts = MAX_RETRY_ATTEMPTS) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) {
        log("❌", `${label} failed after ${maxAttempts} attempts: ${err.message}`);
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      log("⏳", `${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

// ─── Firebase RTDB (REST API) ────────────────────────────────────────

async function firebaseRead(path) {
  const url = `${FIREBASE_DB_URL}/${path}.json`;
  const res = await httpRequest(url, { timeout: 10000 });
  if (res.status !== 200) throw new Error(`Firebase read ${path} failed: ${res.status}`);
  return JSON.parse(res.body);
}

async function firebaseWrite(path, data) {
  const url = `${FIREBASE_DB_URL}/${path}.json`;
  const res = await httpRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    timeout: 10000,
  });
  if (res.status !== 200) throw new Error(`Firebase write ${path} failed: ${res.status}`);
  state.stats.firebaseWrites++;
}

async function firebasePatch(path, data) {
  const url = `${FIREBASE_DB_URL}/${path}.json`;
  const res = await httpRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    timeout: 10000,
  });
  if (res.status !== 200) throw new Error(`Firebase patch ${path} failed: ${res.status}`);
}

async function firebasePush(path, data) {
  const url = `${FIREBASE_DB_URL}/${path}.json`;
  const res = await httpRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    timeout: 10000,
  });
  if (res.status !== 200) throw new Error(`Firebase push ${path} failed: ${res.status}`);
}

// ─── Load Config from Firebase ───────────────────────────────────────

async function loadConfig() {
  const now = Date.now();
  if (state.config && now - state.configLastLoaded < CONFIG_RELOAD_INTERVAL_MS) {
    return state.config;
  }

  log("📋", "Loading tracker config from Firebase...");
  const config = await firebaseRead("tracker_config");

  if (!config || !config.account) {
    throw new Error(
      "No tracker_config in Firebase. Set up in Management → Settings → Tracker."
    );
  }

  state.config = config;
  state.configLastLoaded = now;

  const deviceCount = config.devices ? Object.keys(config.devices).length : 0;
  const enabledCount = config.devices
    ? Object.values(config.devices).filter((d) => d.enabled !== false).length
    : 0;
  log("✅", `Config: account=${config.account}, ${enabledCount}/${deviceCount} devices enabled`);

  return config;
}

function getEnabledDevices(config) {
  if (!config?.devices) return [];
  return Object.entries(config.devices)
    .filter(([, d]) => d.enabled !== false)
    .map(([id, d]) => ({ id, ...d }));
}

// ─── DAGPS API (Reverse-Engineered) ─────────────────────────────────

async function dagpsLogin(account, password) {
  const serverUrl = state.config?.server_url || DAGPS_BASE_URL;

  const body = [
    `userName=${encodeURIComponent(account)}`,
    `pwd_=${encodeURIComponent(password)}`,
    `pwd=${encodeURIComponent(password)}`,
    `loginType=USER`,
    `language=en`,
    `timeZone=0`,
    `monitor=0`,
    `loginUrl=`,
  ].join("&");

  const res = await httpRequest(
    `${serverUrl}/LoginByUser.aspx?method=loginSystem`,
    {
      method: "POST",
      body,
      headers: { Referer: `${serverUrl}/Skins/DefaultIndex/` },
    }
  );

  let cookie = "";
  const cookies = res.headers["set-cookie"];
  if (Array.isArray(cookies)) {
    const match = cookies.find((c) => c.includes("ASP.NET_SessionId"));
    if (match) cookie = match.split(";")[0];
  } else if (typeof cookies === "string" && cookies.includes("ASP.NET_SessionId")) {
    cookie = cookies.split(";")[0];
  }

  const mdsMatch = res.body.match(/mds=([a-f0-9]+)/i);
  if (!mdsMatch) {
    throw new Error(`Login failed: no mds token. Status=${res.status}`);
  }
  const mds = mdsMatch[1];

  const dashRes = await httpRequest(`${serverUrl}/user/indexp.aspx?mds=${mds}`, {
    headers: { Cookie: cookie, Referer: `${serverUrl}/Skins/DefaultIndex/` },
  });

  let userId = "";
  const uidMatch = dashRes.body.match(/var loginUserId\s*=\s*'([^']+)'/);
  if (uidMatch) userId = uidMatch[1];
  if (!userId) throw new Error("Login OK but could not extract user_id");

  const session = {
    mds,
    user_id: userId,
    cookie,
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  };

  // Share session with Cloud Functions
  try {
    await firebasePatch("tracker_config", {
      session_token: session.mds,
      session_user_id: session.user_id,
      session_cookie: session.cookie,
      session_expiry: session.expires_at,
    });
  } catch {
    // Non-critical
  }

  return session;
}

async function dagpsFetchLocation(session) {
  const serverUrl = state.config?.server_url || DAGPS_BASE_URL;
  const baseHeaders = {
    Cookie: session.cookie,
    Referer: `${serverUrl}/user/indexp.aspx?mds=${session.mds}`,
  };

  // loadUser — the only working DAGPS endpoint.
  // Returns device coords, heartbeat, but speed/signal always 0 on GT06.
  // Speed is computed from consecutive GPS positions in analyzeMovement().
  const url = `${serverUrl}/GetDataService.aspx?method=loadUser&mds=${session.mds}&user_id=${encodeURIComponent(session.user_id)}&callback=cb`;
  const res = await httpRequest(url, { headers: baseHeaders, timeout: 10000 });
  if (res.status !== 200) return [];

  const jsonStr = res.body.replace(/^cb\(/, "").replace(/\);?\s*$/, "");
  const json = JSON.parse(jsonStr);
  if (json.success !== "true" || !json.data) return [];

  state.lastRawDagps = json.data;

  return json.data.map((d) => ({
    lat: parseFloat(d.weidu) || 0,
    lng: parseFloat(d.jingdu) || 0,
    speed_kmh: parseFloat(d.sudu) || 0,
    heading_raw: 0,
    gps_time: d.datetime || "",
    heart_time: d.heart_time || "",
    sys_time: d.sys_time || "",
    alarm: parseInt(d.alarm) || 0,
    signal: parseInt(d.grade) || 0,
    device_type: d.product_type || "GT06",
    imei: d.sim_id || "",
    device_name: d.user_name || "",
    status_raw: d.status || "",
  }));
}

// ─── Session Management ──────────────────────────────────────────────

async function ensureSession() {
  if (!state.config) throw new Error("No config loaded");

  if (state.session) {
    const expiresAt = new Date(state.session.expires_at).getTime();
    const refreshAt = expiresAt - SESSION_REFRESH_BEFORE_EXPIRY_MS;
    if (Date.now() < refreshAt) return;
    log("🔄", "Session nearing expiry, refreshing...");
  }

  log("🔑", "Logging into DAGPS...");
  state.session = await withRetry(
    () => dagpsLogin(state.config.account, state.config.password),
    "DAGPS login"
  );
  log("✅", `Session acquired: mds=${state.session.mds.substring(0, 16)}...`);
}

// ─── Heading & Distance Calculations ─────────────────────────────────

function computeBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function getCompassDirection(bearing) {
  const dirs = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW",
  ];
  return dirs[Math.round(bearing / 22.5) % 16];
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Movement Analysis (per-device) ─────────────────────────────────

function analyzeMovement(deviceId, loc) {
  const ds = getDeviceState(deviceId);

  // ── Calculate speed from consecutive GPS points (DAGPS sudu field is unreliable) ──
  let computedSpeedKmh = 0;
  if (ds.prevLatLng && loc.lat !== 0 && loc.lng !== 0) {
    const [prevLat, prevLng, prevTime] = ds.prevLatLng;
    const dist = distanceMeters(prevLat, prevLng, loc.lat, loc.lng);
    const timeStr = loc.gps_time || loc.sys_time || "";
    const prevT = prevTime || 0;
    let nowT = 0;
    if (timeStr) {
      const cleaned = timeStr.replace(/\//g, "-");
      const parsed = new Date(cleaned.includes("Z") || cleaned.includes("+") ? cleaned : cleaned + "Z");
      if (!isNaN(parsed.getTime())) nowT = parsed.getTime();
    }
    const dtSec = nowT > 0 && prevT > 0 ? (nowT - prevT) / 1000 : 30; // fallback to poll interval
    if (dtSec > 0 && dist > 3) {
      // distance in meters, time in seconds → km/h
      computedSpeedKmh = (dist / dtSec) * 3.6;
      // Cap at reasonable speed (filter GPS jitter when parked)
      if (computedSpeedKmh > 120) computedSpeedKmh = 0; // jitter
    }
  }

  // Use DAGPS speed if non-zero, otherwise use our computed speed
  const speed = loc.speed_kmh > 0 ? loc.speed_kmh : Math.round(computedSpeedKmh * 10) / 10;

  ds.speedHistory.push(speed);
  if (ds.speedHistory.length > MAX_SPEED_HISTORY) ds.speedHistory.shift();

  if (loc.lat !== 0 && loc.lng !== 0) {
    const lastTrail = ds.trail[ds.trail.length - 1];
    if (
      !lastTrail ||
      distanceMeters(lastTrail.lat, lastTrail.lng, loc.lat, loc.lng) > 3 ||
      speed > 0
    ) {
      ds.trail.push({
        lat: loc.lat,
        lng: loc.lng,
        speed: speed,
        t: loc.gps_time || new Date().toISOString(),
      });
      if (ds.trail.length > MAX_TRAIL_POINTS) ds.trail.shift();
    }
  }

  // ── Heading from API or consecutive moved points ──
  let heading = loc.heading_raw > 0 ? Math.round(loc.heading_raw) : 0;
  if (!heading && ds.prevLatLng && loc.lat !== 0 && loc.lng !== 0) {
    const [prevLat, prevLng] = ds.prevLatLng;
    if (distanceMeters(prevLat, prevLng, loc.lat, loc.lng) > 5) {
      heading = Math.round(computeBearing(prevLat, prevLng, loc.lat, loc.lng));
    }
  }

  // Store current position + timestamp for next speed calculation
  if (loc.lat !== 0 && loc.lng !== 0) {
    let currentTime = 0;
    const timeStr = loc.gps_time || loc.sys_time || "";
    if (timeStr) {
      const cleaned = timeStr.replace(/\//g, "-");
      const parsed = new Date(cleaned.includes("Z") || cleaned.includes("+") ? cleaned : cleaned + "Z");
      if (!isNaN(parsed.getTime())) currentTime = parsed.getTime();
    }
    ds.prevLatLng = [loc.lat, loc.lng, currentTime];
  }

  let heartbeatAgeSec = Infinity;
  const hbTimeStr = loc.heart_time || loc.gps_time;
  if (hbTimeStr) {
    const cleaned = hbTimeStr.replace(/\//g, "-");
    const parsed = new Date(
      cleaned.includes("Z") || cleaned.includes("+") ? cleaned : cleaned + "Z"
    );
    if (!isNaN(parsed.getTime())) {
      heartbeatAgeSec = (Date.now() - parsed.getTime()) / 1000;
    }
  }

  ds.online = heartbeatAgeSec < HEARTBEAT_ONLINE_THRESHOLD_SEC;

  if (speed > 2) {
    ds.movement = "moving";
  } else if (heartbeatAgeSec > HEARTBEAT_ONLINE_THRESHOLD_SEC) {
    ds.movement = "idle";
  } else {
    ds.movement = "stationary";
  }

  return {
    speed,
    heading,
    headingCompass: heading > 0 ? getCompassDirection(heading) : "—",
    heartbeatAgeSec: Math.round(heartbeatAgeSec === Infinity ? 999 : heartbeatAgeSec),
  };
}

// ─── Alarm Detection ─────────────────────────────────────────────────

async function checkAlarm(deviceId, device, loc) {
  const ds = getDeviceState(deviceId);

  if (loc.alarm > 0 && ds.lastAlarm === 0) {
    log("🚨", `ALARM on ${device.name || deviceId}: code=${loc.alarm}`);
    try {
      await firebasePush("notifications", {
        type: "tracker_alarm",
        title: `🚨 Tracker Alarm: ${device.name || deviceId}`,
        message: `Alarm triggered (code ${loc.alarm}) at ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}. Speed: ${loc.speed_kmh} km/h.`,
        device_id: deviceId,
        imei: device.imei,
        lat: loc.lat,
        lng: loc.lng,
        speed: loc.speed_kmh,
        alarm_code: loc.alarm,
        timestamp: new Date().toISOString(),
        read: false,
      });
    } catch (err) {
      log("❌", `Failed to write alarm: ${err.message}`);
    }
  }

  ds.lastAlarm = loc.alarm;
}

// ─── Build Firebase Payload ──────────────────────────────────────────

function buildLocationPayload(deviceId, device, loc, analysis) {
  const ds = getDeviceState(deviceId);
  const now = new Date().toISOString();
  // Use computed speed (distance/time) since DAGPS sudu field is unreliable
  const effectiveSpeed = analysis.speed || 0;
  const speedMs = effectiveSpeed > 0 ? effectiveSpeed / 3.6 : null;

  return {
    rider_id: device.rider_id || deviceId,
    rider_name: device.rider_name || device.name || `Tracker ${device.imei}`,
    lat: loc.lat,
    lng: loc.lng,
    accuracy: 5,
    speed: speedMs,
    heading: analysis.heading > 0 ? analysis.heading : null,
    timestamp: now,
    shift_id: deviceId,
    status: "idle",
    source: "tracker",

    tracker_data: {
      gps_time: loc.gps_time,
      heart_time: loc.heart_time,
      speed_kmh: effectiveSpeed,
      speed_dagps: loc.speed_kmh,
      alarm: loc.alarm,
      signal: loc.signal,
      device_type: loc.device_type,
      imei: loc.imei || device.imei,
      online: ds.online,
      movement: ds.movement,
      heading_computed: analysis.heading,
      heading_compass: analysis.headingCompass,
      heartbeat_age_sec: analysis.heartbeatAgeSec,
      speed_history: [...ds.speedHistory],
      trail: ds.trail.slice(-MAX_TRAIL_POINTS),
      poll_count: state.stats.totalPolls,
      daemon_uptime_sec: Math.round((Date.now() - state.stats.startTime) / 1000),
    },
  };
}

// ─── Console Dashboard ───────────────────────────────────────────────

let dashboardMode = false;

function renderDashboard() {
  const now = new Date();
  const uptime = formatDuration(Math.round((Date.now() - state.stats.startTime) / 1000));
  const s = state.stats;

  const sessionExpiry = state.session ? new Date(state.session.expires_at) : null;
  const sessionMins = sessionExpiry ? Math.max(0, Math.round((sessionExpiry - now) / 60000)) : 0;

  const successRate = s.totalPolls > 0 ? ((s.successPolls / s.totalPolls) * 100).toFixed(1) : "0";
  const devices = state.config ? getEnabledDevices(state.config) : [];

  const statusIcon =
    s.consecutiveErrors > 3
      ? `${C.bgRed}${C.white} ERROR ${C.reset}`
      : devices.some((d) => getDeviceState(d.id).online)
        ? `${C.bgGreen}${C.white} ONLINE ${C.reset}`
        : `${C.bgYellow}${C.white} OFFLINE ${C.reset}`;

  let output = C.clear;
  output += `${C.bold}${C.cyan}╔═══════════════════════════════════════════════════════════╗${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.bold}${C.white}MONTBILE GPS TRACKER DAEMON${C.reset} ${C.dim}v3.0${C.reset}                      ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Multi-Device DAGPS → Firebase Bridge${C.reset}                  ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Status:    ${statusIcon}                                       ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Session:   ${C.green}${sessionMins}m remaining${C.reset}                                ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Devices:   ${C.white}${devices.length} enabled${C.reset}                                   ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Uptime:    ${C.white}${uptime}${C.reset}                                       ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;

  for (const device of devices) {
    const ds = getDeviceState(device.id);
    const loc = ds.lastLocation;
    const onlineStr = ds.online ? `${C.green}● ON${C.reset}` : `${C.red}● OFF${C.reset}`;
    const movIcon = ds.movement === "moving" ? "🚀" : ds.movement === "stationary" ? "🅿️" : "💤";

    output += `${C.bold}${C.cyan}║${C.reset}  📡 ${C.bold}${(device.name || device.imei).substring(0, 18)}${C.reset} ${onlineStr} ${movIcon}`;
    if (loc) {
      const spd = ds.computedSpeed || 0;
      const spdColor = spd > 40 ? C.red : spd > 20 ? C.yellow : spd > 0 ? C.green : C.dim;
      output += ` ${spdColor}${Math.round(spd)}km/h${C.reset}`;
    }
    output += `\n`;
  }

  if (devices.length === 0) {
    output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}No devices. Add in Settings → Tracker.${C.reset}\n`;
  }

  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  🔄 Polls: ${C.white}${s.totalPolls}${C.reset}  ✅ ${C.green}${s.successPolls}${C.reset}  ❌ ${C.red}${s.errorPolls}${C.reset}  Rate: ${C.white}${successRate}%${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  🔥 Firebase writes: ${C.white}${s.firebaseWrites}${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Last: ${s.lastPollTime ? timeAgo(s.lastPollTime) : "never"} | Ctrl+C to stop${C.reset}\n`;
  output += `${C.bold}${C.cyan}╚═══════════════════════════════════════════════════════════╝${C.reset}\n`;

  process.stdout.write(output);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

function timeAgo(date) {
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(icon, msg) {
  const time = new Date().toLocaleTimeString();
  if (!dashboardMode) {
    console.log(`${C.dim}[${time}]${C.reset} ${icon} ${msg}`);
  }
}

// ─── Main Poll Cycle ─────────────────────────────────────────────────

async function pollOnce() {
  state.stats.totalPolls++;
  state.stats.lastPollTime = new Date();

  try {
    // 1. Load/refresh config from Firebase
    await loadConfig();

    if (!state.config?.enabled) {
      log("⏸️", "Tracker disabled in config. Sleeping...");
      return;
    }

    // 2. Ensure valid DAGPS session
    await ensureSession();

    // 3. Fetch ALL device locations from DAGPS
    const allLocations = await dagpsFetchLocation(state.session);
    if (!allLocations || allLocations.length === 0) {
      state.stats.errorPolls++;
      state.stats.consecutiveErrors++;
      return;
    }

    // 4. Match DAGPS results to configured devices
    const enabledDevices = getEnabledDevices(state.config);
    let matchedAny = false;

    for (const device of enabledDevices) {
      const loc = allLocations.find(
        (l) => l.imei === device.imei || l.imei === device.imei?.replace(/^0+/, "")
      );

      if (!loc || (loc.lat === 0 && loc.lng === 0)) continue;

      matchedAny = true;
      const ds = getDeviceState(device.id);
      ds.lastLocation = loc;

      const analysis = analyzeMovement(device.id, loc);
      ds.computedSpeed = analysis.speed || 0;
      await checkAlarm(device.id, device, loc);

      const payload = buildLocationPayload(device.id, device, loc, analysis);
      await firebaseWrite(`rider_locations/${device.id}`, payload);

      await firebasePatch(`tracker_config/devices/${device.id}`, {
        last_lat: loc.lat,
        last_lng: loc.lng,
        last_speed: loc.speed_kmh,
        last_seen: new Date().toISOString(),
      });
    }

    if (matchedAny) {
      state.stats.successPolls++;
      state.stats.consecutiveErrors = 0;
      state.stats.devicesPolled = enabledDevices.length;
    } else {
      state.stats.errorPolls++;
      state.stats.consecutiveErrors++;
      log("⚠️", `No matching devices in DAGPS response (${allLocations.length} returned, ${enabledDevices.length} configured)`);
    }

    await firebasePatch("tracker_config", {
      last_poll: new Date().toISOString(),
      last_error: null,
    });

  } catch (err) {
    state.stats.errorPolls++;
    state.stats.consecutiveErrors++;

    if (err.message && (err.message.includes("Login failed") || err.message.includes("mds") || err.message.includes("401"))) {
      state.session = null;
    }

    try {
      await firebasePatch("tracker_config", {
        last_error: `${new Date().toISOString()}: ${err.message}`,
      });
    } catch {
      // Ignore
    }

    if (!dashboardMode) log("❌", `Poll error: ${err.message}`);
  }
}

function getNextInterval() {
  if (state.stats.consecutiveErrors > 0) {
    return Math.min(
      POLL_INTERVALS.idleMs * Math.pow(1.5, state.stats.consecutiveErrors),
      5 * 60_000
    );
  }

  const devices = state.config ? getEnabledDevices(state.config) : [];
  let fastest = POLL_INTERVALS.idleMs;
  for (const device of devices) {
    const ds = getDeviceState(device.id);
    const interval =
      ds.movement === "moving" ? POLL_INTERVALS.movingMs :
      ds.movement === "stationary" ? POLL_INTERVALS.stationaryMs :
      POLL_INTERVALS.idleMs;
    if (interval < fastest) fastest = interval;
  }
  return fastest;
}

// ─── Main Loop ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  🏍️  MONTBILE GPS TRACKER DAEMON v3.0${C.reset}`);
  console.log(`${C.bold}  📡 Multi-Device DAGPS → Firebase Bridge${C.reset}`);
  console.log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════════${C.reset}\n`);

  console.log(`${C.dim}Firebase:${C.reset} ${FIREBASE_DB_URL}`);
  console.log(`${C.dim}Polling:${C.reset}  ${POLL_INTERVALS.movingMs / 1000}s / ${POLL_INTERVALS.stationaryMs / 1000}s / ${POLL_INTERVALS.idleMs / 1000}s (moving/parked/idle)\n`);

  // Load config with generous retry
  try {
    await withRetry(() => loadConfig(), "Initial config load", 10);
  } catch (err) {
    console.error(`${C.red}Config load failed: ${err.message}${C.reset}`);
    console.log(`${C.yellow}Will retry on next poll cycle...${C.reset}\n`);
  }

  // Initial login
  if (state.config?.enabled) {
    try {
      await ensureSession();
    } catch (err) {
      console.error(`${C.red}Login failed: ${err.message}${C.reset}`);
      console.log(`${C.yellow}Will retry on next poll cycle...${C.reset}\n`);
    }
  }

  console.log(`${C.green}Starting polling loop...${C.reset}\n`);
  await pollOnce();

  dashboardMode = true;
  renderDashboard();

  while (true) {
    const interval = getNextInterval();
    await sleep(interval);
    await pollOnce();
    renderDashboard();
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

process.on("SIGINT", async () => {
  dashboardMode = false;
  console.log(`\n\n${C.yellow}🛑 Shutting down...${C.reset}`);

  const devices = state.config ? getEnabledDevices(state.config) : [];
  for (const device of devices) {
    const ds = getDeviceState(device.id);
    try {
      await firebaseWrite(`rider_locations/${device.id}`, {
        rider_id: device.rider_id || device.id,
        rider_name: device.rider_name || device.name || `Tracker ${device.imei}`,
        lat: ds.lastLocation?.lat || 0,
        lng: ds.lastLocation?.lng || 0,
        accuracy: 5,
        speed: null,
        heading: null,
        timestamp: new Date().toISOString(),
        shift_id: device.id,
        status: "idle",
        source: "tracker",
        tracker_data: {
          gps_time: ds.lastLocation?.gps_time || "",
          heart_time: ds.lastLocation?.heart_time || "",
          speed_kmh: 0,
          alarm: 0,
          signal: 0,
          device_type: ds.lastLocation?.device_type || "GT06",
          imei: device.imei,
          online: false,
          movement: "idle",
          heading_computed: 0,
          heading_compass: "—",
          heartbeat_age_sec: 999,
          speed_history: ds.speedHistory,
          trail: ds.trail,
          poll_count: state.stats.totalPolls,
          daemon_uptime_sec: Math.round((Date.now() - state.stats.startTime) / 1000),
        },
      });
      console.log(`${C.green}✅ ${device.name || device.id}: offline${C.reset}`);
    } catch (err) {
      console.log(`${C.red}✗ ${device.id}: ${err.message}${C.reset}`);
    }
  }

  const uptime = formatDuration(Math.round((Date.now() - state.stats.startTime) / 1000));
  console.log(`\n${C.bold}Stats:${C.reset} ${uptime} uptime, ${state.stats.totalPolls} polls, ${state.stats.successPolls} OK, ${state.stats.errorPolls} errors, ${state.stats.firebaseWrites} writes`);
  console.log(`${C.dim}Goodbye! 👋${C.reset}\n`);
  process.exit(0);
});

// ─── Health Check Server ─────────────────────────────────────────────

function startHealthServer() {
  const PORT = process.env.PORT || 8080;
  const server = http.createServer((req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    if (pathname === "/health" || pathname === "/") {
      const uptime = formatDuration(Math.round((Date.now() - state.stats.startTime) / 1000));
      const devices = state.config ? getEnabledDevices(state.config) : [];

      const payload = {
        status: "ok",
        daemon: "montbile-tracker-v3",
        uptime,
        enabled: state.config?.enabled || false,
        devices_enabled: devices.length,
        devices_online: devices.filter((d) => getDeviceState(d.id).online).length,
        devices: devices.map((d) => {
          const ds = getDeviceState(d.id);
          return {
            id: d.id, name: d.name, imei: d.imei, online: ds.online,
            movement: ds.movement, speed: ds.computedSpeed || 0,
            lat: ds.lastLocation?.lat || null, lng: ds.lastLocation?.lng || null,
          };
        }),
        polls: state.stats.totalPolls,
        errors: state.stats.errorPolls,
        firebase_writes: state.stats.firebaseWrites,
        last_poll: state.stats.lastPollTime?.toISOString() || null,
        consecutive_errors: state.stats.consecutiveErrors,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    } else if (pathname === "/debug") {
      const devices = state.config ? getEnabledDevices(state.config) : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        raw_dagps: state.lastRawDagps || null,
        devices: devices.map(d => {
          const ds = getDeviceState(d.id);
          return { id: d.id, computedSpeed: ds.computedSpeed, movement: ds.movement,
            trailLength: ds.trail?.length || 0, speedHistory: ds.speedHistory };
        }),
        polls: state.stats.totalPolls,
      }));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  server.listen(PORT, () => log("🌐", `Health server on port ${PORT}`));
}

// ─── Start ───────────────────────────────────────────────────────────
startHealthServer();
main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  log("🔄", "Restarting in 30s...");
  sleep(30000).then(() => main().catch(() => process.exit(1)));
});

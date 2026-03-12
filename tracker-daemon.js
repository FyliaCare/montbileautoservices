#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 *  MONTBILE GPS TRACKER DAEMON v2.0
 *  Near Real-Time DAGPS → Firebase Bridge
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Reverse-engineered from dagps.net. Polls the DAGPS hardware tracker
 *  every 10 seconds and pushes rich location data to Firebase RTDB
 *  where the Montbile fleet map picks it up instantly.
 *
 *  Features:
 *  ─ Near real-time polling (10s when moving, 30s when stationary)
 *  ─ Adaptive poll rate based on movement detection
 *  ─ Rich data: speed, GPS time, heartbeat, signal, alarm, online/offline
 *  ─ Computed heading from position deltas
 *  ─ Speed history (last 20 readings)
 *  ─ Movement trail (last 30 positions)
 *  ─ Auto session refresh on expiry
 *  ─ Error recovery with exponential backoff
 *  ─ Live console dashboard with colour output
 *  ─ Zero npm dependencies — pure Node.js
 *
 *  Usage:
 *    node tracker-daemon.js
 *
 *  Runs until stopped with Ctrl+C.
 * ═══════════════════════════════════════════════════════════════════════
 */

const http = require("http");
const https = require("https");

// ─── Configuration ───────────────────────────────────────────────────

const CONFIG = {
  // DAGPS credentials (reverse-engineered login)
  dagps: {
    imei: "352672109749028",
    password: "123456",
    baseUrl: "http://www.dagps.net",
  },

  // Firebase RTDB (REST API — zero dependencies)
  firebase: {
    dbUrl: "https://montbile-services-default-rtdb.europe-west1.firebasedatabase.app",
  },

  // Rider assignment
  rider: {
    id: "rider_kuyht5",
    name: "Ransford Kennedy Dankwah",
  },

  // Polling
  poll: {
    movingIntervalMs: 10_000,     // 10s when moving
    stationaryIntervalMs: 30_000, // 30s when stationary
    idleIntervalMs: 60_000,       // 60s when idle (no heartbeat for 5 min)
    sessionRefreshMs: 50 * 60_000, // refresh session at 50 min (expires at 60)
  },

  // Data retention
  history: {
    maxSpeedHistory: 20,   // last 20 speed readings
    maxTrailPoints: 30,    // last 30 GPS positions
  },
};

// ─── State ───────────────────────────────────────────────────────────

const state = {
  session: null,           // { mds, user_id, cookie, expires_at }
  lastLocation: null,      // last parsed DAGPS response
  prevLatLng: null,        // previous [lat, lng] for heading calc
  speedHistory: [],        // last N speed readings (km/h)
  trail: [],               // last N positions [{lat, lng, speed, t}]
  movement: "unknown",     // "moving" | "stationary" | "idle"
  online: false,           // device online based on heartbeat freshness

  // Stats
  stats: {
    startTime: Date.now(),
    totalPolls: 0,
    successPolls: 0,
    errorPolls: 0,
    firebaseWrites: 0,
    lastPollTime: null,
    lastFirebaseWrite: null,
    consecutiveErrors: 0,
  },
};

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
  bgBlue: "\x1b[44m",
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
        "User-Agent": "MontbileTrackerDaemon/2.0",
        ...options.headers,
      },
      timeout: options.timeout || 15000,
    };

    if (options.body) {
      const bodyBuf = Buffer.from(options.body, "utf-8");
      reqOptions.headers["Content-Length"] = bodyBuf.length;
      if (!reqOptions.headers["Content-Type"]) {
        reqOptions.headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    }

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── DAGPS API (Reverse-Engineered) ─────────────────────────────────

/**
 * Login to DAGPS via the USER login form.
 * POST /LoginByUser.aspx?method=loginSystem
 * Returns session with mds token, user_id GUID, and ASP.NET cookie.
 */
async function dagpsLogin() {
  const { imei, password, baseUrl } = CONFIG.dagps;

  const body = [
    `userName=${encodeURIComponent(imei)}`,
    `pwd_=${encodeURIComponent(password)}`,
    `pwd=${encodeURIComponent(password)}`,
    `loginType=USER`,
    `language=en`,
    `timeZone=0`,
    `monitor=0`,
    `loginUrl=`,
  ].join("&");

  const res = await httpRequest(`${baseUrl}/LoginByUser.aspx?method=loginSystem`, {
    method: "POST",
    body,
    headers: { Referer: `${baseUrl}/Skins/DefaultIndex/` },
  });

  // Extract ASP.NET session cookie
  let cookie = "";
  const cookies = res.headers["set-cookie"];
  if (Array.isArray(cookies)) {
    const match = cookies.find((c) => c.includes("ASP.NET_SessionId"));
    if (match) cookie = match.split(";")[0];
  } else if (typeof cookies === "string" && cookies.includes("ASP.NET_SessionId")) {
    cookie = cookies.split(";")[0];
  }

  // Extract mds token from redirect script
  const mdsMatch = res.body.match(/mds=([a-f0-9]+)/i);
  if (!mdsMatch) {
    throw new Error(`Login failed: no mds token. Status=${res.status} Body=${res.body.substring(0, 200)}`);
  }
  const mds = mdsMatch[1];

  // Fetch dashboard to extract user_id GUID
  const dashRes = await httpRequest(`${baseUrl}/user/indexp.aspx?mds=${mds}`, {
    headers: { Cookie: cookie, Referer: `${baseUrl}/Skins/DefaultIndex/` },
  });

  let userId = "";
  const uidMatch = dashRes.body.match(/var loginUserId\s*=\s*'([^']+)'/);
  if (uidMatch) userId = uidMatch[1];

  if (!userId) {
    throw new Error("Login succeeded but could not extract user_id from dashboard");
  }

  return {
    mds,
    user_id: userId,
    cookie,
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(), // 1 hour
  };
}

/**
 * Fetch live device data from DAGPS.
 * GET /GetDataService.aspx?method=loadUser&mds={mds}&user_id={uid}
 * Returns parsed device data with ALL available fields.
 */
async function dagpsFetchLocation(session) {
  const { baseUrl } = CONFIG.dagps;

  let url = `${baseUrl}/GetDataService.aspx?method=loadUser&mds=${session.mds}&callback=cb`;
  if (session.user_id) {
    url += `&user_id=${encodeURIComponent(session.user_id)}`;
  }

  const res = await httpRequest(url, {
    headers: {
      Cookie: session.cookie,
      Referer: `${baseUrl}/user/indexp.aspx?mds=${session.mds}`,
    },
    timeout: 10000,
  });

  if (res.status !== 200) return null;

  // Parse JSONP: cb({...})
  const jsonStr = res.body.replace(/^cb\(/, "").replace(/\);?\s*$/, "");
  const json = JSON.parse(jsonStr);

  if (json.success !== "true" || !json.data || !json.data[0]) return null;

  const d = json.data[0];
  return {
    lat: parseFloat(d.weidu) || 0,
    lng: parseFloat(d.jingdu) || 0,
    speed_kmh: parseFloat(d.sudu) || 0,
    gps_time: d.datetime || "",            // Last GPS fix time
    heart_time: d.heart_time || "",        // Last device heartbeat
    sys_time: d.sys_time || "",            // Server time
    alarm: parseInt(d.alarm) || 0,         // 0=none, 1+=alarm
    signal: parseInt(d.grade) || 0,        // Signal quality
    device_type: d.product_type || "GT06", // Hardware model
    imei: d.sim_id || CONFIG.dagps.imei,
    device_name: d.user_name || "",
    status_raw: d.status || "",
    icon_type: d.iconType || "",
    speed_duration: parseInt(d.SpeedDuration) || 0,
    jingwei: d.jingwei || "",              // Combined "lng;lat"
  };
}

// ─── Firebase RTDB (REST API) ────────────────────────────────────────

/**
 * Write rider location to Firebase RTDB via REST API.
 * PUT /rider_locations/tracker-{imei}.json
 */
async function firebaseWriteLocation(locationData) {
  const deviceKey = `tracker-${CONFIG.dagps.imei}`;
  const url = `${CONFIG.firebase.dbUrl}/rider_locations/${deviceKey}.json`;

  const res = await httpRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(locationData),
    timeout: 10000,
  });

  if (res.status !== 200) {
    throw new Error(`Firebase write failed: ${res.status} ${res.body.substring(0, 200)}`);
  }

  state.stats.firebaseWrites++;
  state.stats.lastFirebaseWrite = new Date();
}

/**
 * Update tracker device status in Firebase.
 */
async function firebaseUpdateDevice(data) {
  const deviceKey = `tracker-${CONFIG.dagps.imei}`;
  const url = `${CONFIG.firebase.dbUrl}/tracker_config/devices/${deviceKey}.json`;

  // PATCH via POST with X-HTTP-Method-Override
  const res = await httpRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    timeout: 10000,
  });

  return res.status === 200;
}

// ─── Heading Calculation ─────────────────────────────────────────────

function computeBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360; // Normalize to 0-360
}

function getCompassDirection(bearing) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(bearing / 22.5) % 16];
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Movement Analysis ───────────────────────────────────────────────

function analyzeMovement(loc) {
  const speed = loc.speed_kmh;

  // Update speed history
  state.speedHistory.push(speed);
  if (state.speedHistory.length > CONFIG.history.maxSpeedHistory) {
    state.speedHistory.shift();
  }

  // Update trail
  if (loc.lat !== 0 && loc.lng !== 0) {
    const lastTrail = state.trail[state.trail.length - 1];
    // Only add to trail if position changed or speed > 0
    if (!lastTrail ||
        distanceMeters(lastTrail.lat, lastTrail.lng, loc.lat, loc.lng) > 3 ||
        speed > 0) {
      state.trail.push({
        lat: loc.lat,
        lng: loc.lng,
        speed: speed,
        t: loc.gps_time || new Date().toISOString(),
      });
      if (state.trail.length > CONFIG.history.maxTrailPoints) {
        state.trail.shift();
      }
    }
  }

  // Compute heading from consecutive positions
  let heading = 0;
  if (state.prevLatLng && loc.lat !== 0 && loc.lng !== 0 && speed > 2) {
    const [prevLat, prevLng] = state.prevLatLng;
    const dist = distanceMeters(prevLat, prevLng, loc.lat, loc.lng);
    if (dist > 5) { // Only compute heading if moved > 5 meters
      heading = Math.round(computeBearing(prevLat, prevLng, loc.lat, loc.lng));
    }
  }

  // Update previous position
  if (loc.lat !== 0 && loc.lng !== 0) {
    state.prevLatLng = [loc.lat, loc.lng];
  }

  // Determine heartbeat freshness (DAGPS times are UTC+0)
  let heartbeatAgeSec = Infinity;
  if (loc.heart_time) {
    const htStr = loc.heart_time.replace(/\//g, "-");
    // Append Z to force UTC parsing — DAGPS timeZone=0
    const heartTime = new Date(htStr.includes("Z") || htStr.includes("+") ? htStr : htStr + "Z");
    if (!isNaN(heartTime.getTime())) {
      heartbeatAgeSec = (Date.now() - heartTime.getTime()) / 1000;
    }
  }
  // Also check GPS time as a fallback for freshness
  if (heartbeatAgeSec === Infinity && loc.gps_time) {
    const gpsStr = loc.gps_time.replace(/\//g, "-");
    const gpsTime = new Date(gpsStr.includes("Z") || gpsStr.includes("+") ? gpsStr : gpsStr + "Z");
    if (!isNaN(gpsTime.getTime())) {
      heartbeatAgeSec = (Date.now() - gpsTime.getTime()) / 1000;
    }
  }
  state.online = heartbeatAgeSec < 300; // Online if heartbeat within 5 min

  // Determine movement state
  if (speed > 2) {
    state.movement = "moving";
  } else if (heartbeatAgeSec > 300) {
    state.movement = "idle";
  } else {
    state.movement = "stationary";
  }

  return {
    heading,
    headingCompass: heading > 0 ? getCompassDirection(heading) : "—",
    heartbeatAgeSec,
  };
}

// ─── Build Firebase Payload ──────────────────────────────────────────

function buildLocationPayload(loc, analysis) {
  const now = new Date().toISOString();
  const speedMs = loc.speed_kmh > 0 ? loc.speed_kmh / 3.6 : null; // Convert km/h to m/s

  return {
    // Base fields (compatible with existing fleet map)
    rider_id: CONFIG.rider.id,
    rider_name: CONFIG.rider.name,
    lat: loc.lat,
    lng: loc.lng,
    accuracy: 5,  // Hardware GPS is typically 5-10m
    speed: speedMs,
    heading: analysis.heading > 0 ? analysis.heading : null,
    timestamp: now,
    shift_id: `tracker-${CONFIG.dagps.imei}`,
    status: "idle",  // Always idle — tracker online ≠ rider on shift. Use tracker_data.online for device state.
    source: "tracker",

    // Enhanced tracker data (new!)
    tracker_data: {
      gps_time: loc.gps_time,
      heart_time: loc.heart_time,
      speed_kmh: loc.speed_kmh,
      alarm: loc.alarm,
      signal: loc.signal,
      device_type: loc.device_type,
      imei: loc.imei,
      online: state.online,
      movement: state.movement,
      heading_computed: analysis.heading,
      heading_compass: analysis.headingCompass,
      heartbeat_age_sec: Math.round(analysis.heartbeatAgeSec),
      speed_history: [...state.speedHistory],
      trail: state.trail.slice(-CONFIG.history.maxTrailPoints),
      poll_count: state.stats.totalPolls,
      daemon_uptime_sec: Math.round((Date.now() - state.stats.startTime) / 1000),
    },
  };
}

// ─── Console Dashboard ───────────────────────────────────────────────

function renderDashboard() {
  const now = new Date();
  const uptime = formatDuration(Date.now() - state.stats.startTime);
  const loc = state.lastLocation;
  const s = state.stats;

  const sessionExpiry = state.session ? new Date(state.session.expires_at) : null;
  const sessionMins = sessionExpiry ? Math.max(0, Math.round((sessionExpiry - now) / 60000)) : 0;

  const successRate = s.totalPolls > 0
    ? ((s.successPolls / s.totalPolls) * 100).toFixed(1)
    : "0.0";

  const pollInterval = state.movement === "moving"
    ? CONFIG.poll.movingIntervalMs / 1000
    : state.movement === "idle"
      ? CONFIG.poll.idleIntervalMs / 1000
      : CONFIG.poll.stationaryIntervalMs / 1000;

  // Determine status indicator
  const statusIcon = s.consecutiveErrors > 3
    ? `${C.bgRed}${C.white} ERROR ${C.reset}`
    : state.online
      ? `${C.bgGreen}${C.white} ONLINE ${C.reset}`
      : `${C.bgYellow}${C.white} OFFLINE ${C.reset}`;

  const movementIcon = state.movement === "moving" ? "🚀"
    : state.movement === "stationary" ? "🅿️"
    : "💤";

  const speedBar = loc ? buildSpeedBar(loc.speed_kmh) : "";

  let output = C.clear;
  output += `${C.bold}${C.cyan}╔═══════════════════════════════════════════════════════════╗${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.bold}${C.white}MONTBILE GPS TRACKER DAEMON${C.reset} ${C.dim}v2.0${C.reset}                      ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Near Real-Time DAGPS → Firebase Bridge${C.reset}                ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Status:    ${statusIcon}                                       ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Session:   ${C.green}mds=${state.session?.mds?.substring(0, 12) || "—"}...${C.reset} ${C.dim}(${sessionMins}m left)${C.reset}       ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Poll Rate: ${C.yellow}${pollInterval}s${C.reset} ${C.dim}(${state.movement})${C.reset}                            ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  Uptime:    ${C.white}${uptime}${C.reset}                                    ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;

  if (loc) {
    output += `${C.bold}${C.cyan}║${C.reset}  ${C.bold}DEVICE:${C.reset} ${C.white}${loc.device_name || "GT0609749028"}${C.reset} ${C.dim}(${loc.imei})${C.reset}  ${C.bold}${C.cyan}║${C.reset}\n`;
    output += `${C.bold}${C.cyan}║${C.reset}  ${C.bold}RIDER:${C.reset}  ${C.white}${CONFIG.rider.name}${C.reset}         ${C.bold}${C.cyan}║${C.reset}\n`;
    output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}─────────────────────────────────────────────────────${C.reset}  ${C.bold}${C.cyan}║${C.reset}\n`;
    output += `${C.bold}${C.cyan}║${C.reset}  📍 ${C.bold}Position:${C.reset}  ${C.white}${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}${C.reset}             ${C.bold}${C.cyan}║${C.reset}\n`;

    const speedColor = loc.speed_kmh > 40 ? C.red : loc.speed_kmh > 20 ? C.yellow : loc.speed_kmh > 0 ? C.green : C.dim;
    output += `${C.bold}${C.cyan}║${C.reset}  ${movementIcon} ${C.bold}Speed:${C.reset}     ${speedColor}${loc.speed_kmh} km/h${C.reset} ${speedBar}           ${C.bold}${C.cyan}║${C.reset}\n`;
    output += `${C.bold}${C.cyan}║${C.reset}  🕐 ${C.bold}GPS Time:${C.reset}  ${C.white}${loc.gps_time || "—"}${C.reset}             ${C.bold}${C.cyan}║${C.reset}\n`;

    const hbAge = state.lastLocation ? Math.round(analyzeMovement.lastHeartbeatAge || 0) : 0;
    const hbColor = hbAge < 30 ? C.green : hbAge < 120 ? C.yellow : C.red;
    output += `${C.bold}${C.cyan}║${C.reset}  💓 ${C.bold}Heartbeat:${C.reset} ${hbColor}${loc.heart_time || "—"}${C.reset} ${C.dim}(${hbAge}s ago)${C.reset}  ${C.bold}${C.cyan}║${C.reset}\n`;
    output += `${C.bold}${C.cyan}║${C.reset}  📡 ${C.bold}Signal:${C.reset}    ${loc.signal}  ${C.bold}Alarm:${C.reset} ${loc.alarm === 0 ? `${C.green}None${C.reset}` : `${C.red}⚠ ACTIVE${C.reset}`}             ${C.bold}${C.cyan}║${C.reset}\n`;

    if (state.speedHistory.length > 0) {
      const miniChart = state.speedHistory.slice(-10).map(s =>
        s > 30 ? "█" : s > 20 ? "▆" : s > 10 ? "▄" : s > 2 ? "▂" : "▁"
      ).join("");
      output += `${C.bold}${C.cyan}║${C.reset}  📊 ${C.bold}Speed Graph:${C.reset} ${C.green}${miniChart}${C.reset}                          ${C.bold}${C.cyan}║${C.reset}\n`;
    }
  } else {
    output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Waiting for first data...${C.reset}                              ${C.bold}${C.cyan}║${C.reset}\n`;
  }

  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  🔄 Polls: ${C.white}${s.totalPolls}${C.reset}  ✅ ${C.green}${s.successPolls}${C.reset}  ❌ ${C.red}${s.errorPolls}${C.reset}  Rate: ${C.white}${successRate}%${C.reset}      ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  🔥 Firebase writes: ${C.white}${s.firebaseWrites}${C.reset}                              ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Trail: ${state.trail.length} points | History: ${state.speedHistory.length} readings${C.reset}      ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}╠═══════════════════════════════════════════════════════════╣${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Last poll: ${s.lastPollTime ? timeAgo(s.lastPollTime) : "never"}${C.reset}                                   ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}║${C.reset}  ${C.dim}Press Ctrl+C to stop${C.reset}                                    ${C.bold}${C.cyan}║${C.reset}\n`;
  output += `${C.bold}${C.cyan}╚═══════════════════════════════════════════════════════════╝${C.reset}\n`;

  process.stdout.write(output);
}

function buildSpeedBar(speed) {
  const bars = Math.min(Math.round(speed / 5), 12);
  const color = speed > 40 ? C.red : speed > 20 ? C.yellow : C.green;
  return `${color}${"█".repeat(bars)}${C.dim}${"░".repeat(12 - bars)}${C.reset}`;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function timeAgo(date) {
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ─── Session Management ──────────────────────────────────────────────

async function ensureSession() {
  // Check if session exists and is valid
  if (state.session) {
    const expiresAt = new Date(state.session.expires_at);
    const refreshAt = new Date(expiresAt.getTime() - CONFIG.poll.sessionRefreshMs);

    if (Date.now() < refreshAt.getTime()) {
      return; // Session still valid
    }
  }

  // Need to login
  log("🔑", "Logging into DAGPS...");
  state.session = await dagpsLogin();
  log("✅", `Session acquired: mds=${state.session.mds.substring(0, 16)}... user_id=${state.session.user_id.substring(0, 8)}...`);

  // Save session to Firebase for the Cloud Functions to use too
  try {
    await httpRequest(`${CONFIG.firebase.dbUrl}/tracker_config/session_token.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.session.mds),
    });
    await httpRequest(`${CONFIG.firebase.dbUrl}/tracker_config/session_user_id.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.session.user_id),
    });
    await httpRequest(`${CONFIG.firebase.dbUrl}/tracker_config/session_cookie.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.session.cookie),
    });
    await httpRequest(`${CONFIG.firebase.dbUrl}/tracker_config/session_expiry.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.session.expires_at),
    });
  } catch {
    // Non-critical: session saved locally even if Firebase save fails
  }
}

// ─── Logging ─────────────────────────────────────────────────────────

function log(icon, msg) {
  const time = new Date().toLocaleTimeString();
  // Don't log during dashboard mode unless it's an error
  if (!dashboardMode) {
    console.log(`${C.dim}[${time}]${C.reset} ${icon} ${msg}`);
  }
}

let dashboardMode = false;

// ─── Main Poll Cycle ─────────────────────────────────────────────────

async function pollOnce() {
  state.stats.totalPolls++;
  state.stats.lastPollTime = new Date();

  try {
    // Ensure we have a valid session
    await ensureSession();

    // Fetch location from DAGPS
    const loc = await dagpsFetchLocation(state.session);

    if (!loc || (loc.lat === 0 && loc.lng === 0)) {
      state.stats.errorPolls++;
      state.stats.consecutiveErrors++;
      return;
    }

    state.lastLocation = loc;
    state.stats.successPolls++;
    state.stats.consecutiveErrors = 0;

    // Analyze movement, compute heading, update history
    const analysis = analyzeMovement(loc);
    analyzeMovement.lastHeartbeatAge = analysis.heartbeatAgeSec;

    // Build enriched location payload
    const payload = buildLocationPayload(loc, analysis);

    // Write to Firebase RTDB
    await firebaseWriteLocation(payload);

    // Update device last-seen in Firebase
    await firebaseUpdateDevice({
      last_lat: loc.lat,
      last_lng: loc.lng,
      last_speed: loc.speed_kmh,
      last_seen: new Date().toISOString(),
    });

    // Also update the poll timestamp
    await httpRequest(`${CONFIG.firebase.dbUrl}/tracker_config/last_poll.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(new Date().toISOString()),
    });

  } catch (err) {
    state.stats.errorPolls++;
    state.stats.consecutiveErrors++;

    // If login error, clear session to force re-login
    if (err.message && (err.message.includes("Login failed") || err.message.includes("mds"))) {
      state.session = null;
    }

    if (!dashboardMode) {
      log("❌", `Error: ${err.message}`);
    }
  }
}

function getNextInterval() {
  // Exponential backoff on consecutive errors
  if (state.stats.consecutiveErrors > 0) {
    const backoff = Math.min(
      CONFIG.poll.idleIntervalMs * Math.pow(1.5, state.stats.consecutiveErrors),
      5 * 60_000 // Max 5 min backoff
    );
    return backoff;
  }

  switch (state.movement) {
    case "moving":     return CONFIG.poll.movingIntervalMs;
    case "stationary": return CONFIG.poll.stationaryIntervalMs;
    case "idle":       return CONFIG.poll.idleIntervalMs;
    default:           return CONFIG.poll.stationaryIntervalMs;
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  🏍️  MONTBILE GPS TRACKER DAEMON v2.0${C.reset}`);
  console.log(`${C.bold}  📡 DAGPS → Firebase Near Real-Time Bridge${C.reset}`);
  console.log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════════${C.reset}\n`);

  console.log(`${C.dim}Device:${C.reset}  ${CONFIG.dagps.imei}`);
  console.log(`${C.dim}Rider:${C.reset}   ${CONFIG.rider.name}`);
  console.log(`${C.dim}Firebase:${C.reset} ${CONFIG.firebase.dbUrl}`);
  console.log(`${C.dim}Polling:${C.reset}  ${CONFIG.poll.movingIntervalMs / 1000}s (moving) / ${CONFIG.poll.stationaryIntervalMs / 1000}s (parked) / ${CONFIG.poll.idleIntervalMs / 1000}s (idle)\n`);

  // Initial login
  try {
    await ensureSession();
  } catch (err) {
    console.error(`${C.red}Failed to login: ${err.message}${C.reset}`);
    console.log(`${C.yellow}Will retry on next poll cycle...${C.reset}\n`);
  }

  // First poll
  console.log(`${C.green}Starting polling loop...${C.reset}\n`);
  await pollOnce();

  // Switch to dashboard mode after first poll
  dashboardMode = true;
  renderDashboard();

  // Main loop
  while (true) {
    const interval = getNextInterval();
    await sleep(interval);
    await pollOnce();
    renderDashboard();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

process.on("SIGINT", async () => {
  dashboardMode = false;
  console.log(`\n\n${C.yellow}🛑 Shutting down gracefully...${C.reset}`);

  // Write offline status to Firebase
  try {
    const deviceKey = `tracker-${CONFIG.dagps.imei}`;
    const offlineData = {
      rider_id: CONFIG.rider.id,
      rider_name: CONFIG.rider.name,
      lat: state.lastLocation?.lat || 0,
      lng: state.lastLocation?.lng || 0,
      accuracy: 5,
      speed: null,
      heading: null,
      timestamp: new Date().toISOString(),
      shift_id: `tracker-${CONFIG.dagps.imei}`,
      status: "idle",
      source: "tracker",
      tracker_data: {
        gps_time: state.lastLocation?.gps_time || "",
        heart_time: state.lastLocation?.heart_time || "",
        speed_kmh: 0,
        alarm: 0,
        signal: 0,
        device_type: state.lastLocation?.device_type || "GT06",
        imei: CONFIG.dagps.imei,
        online: false,
        movement: "idle",
        heading_computed: 0,
        heading_compass: "—",
        heartbeat_age_sec: 999,
        speed_history: state.speedHistory,
        trail: state.trail,
        poll_count: state.stats.totalPolls,
        daemon_uptime_sec: Math.round((Date.now() - state.stats.startTime) / 1000),
      },
    };

    await firebaseWriteLocation(offlineData);
    console.log(`${C.green}✅ Offline status written to Firebase${C.reset}`);
  } catch (err) {
    console.log(`${C.red}Failed to write offline status: ${err.message}${C.reset}`);
  }

  // Print final stats
  const uptime = formatDuration(Date.now() - state.stats.startTime);
  console.log(`\n${C.bold}Final Stats:${C.reset}`);
  console.log(`  Uptime:         ${uptime}`);
  console.log(`  Total polls:    ${state.stats.totalPolls}`);
  console.log(`  Successful:     ${state.stats.successPolls}`);
  console.log(`  Errors:         ${state.stats.errorPolls}`);
  console.log(`  Firebase writes: ${state.stats.firebaseWrites}`);
  console.log(`  Trail points:   ${state.trail.length}`);
  console.log(`\n${C.dim}Goodbye! 👋${C.reset}\n`);

  process.exit(0);
});

// ─── Health Check Server (for cloud platforms) ──────────────────────

function startHealthServer() {
  const PORT = process.env.PORT || 8080;
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const uptime = formatDuration(Date.now() - state.stats.startTime);
      const payload = {
        status: "ok",
        daemon: "montbile-tracker-v2",
        uptime,
        online: state.online,
        movement: state.movement,
        polls: state.stats.totalPolls,
        errors: state.stats.errorPolls,
        firebase_writes: state.stats.firebaseWrites,
        last_poll: state.stats.lastPollTime ? state.stats.lastPollTime.toISOString() : null,
        last_lat: state.lastLocation?.lat || null,
        last_lng: state.lastLocation?.lng || null,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  server.listen(PORT, () => {
    log("🌐", `Health server listening on port ${PORT}`);
  });
}

// ─── Start ───────────────────────────────────────────────────────────
startHealthServer();
main().catch((err) => {
  console.error(`${C.red}Fatal error: ${err.message}${C.reset}`);
  process.exit(1);
});

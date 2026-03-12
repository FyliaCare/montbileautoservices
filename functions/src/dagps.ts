/**
 * DAGPS.net API Client — Reverse-engineered from the actual dagps.net web app.
 *
 * Login: POST /LoginByUser.aspx?method=loginSystem
 *   - Fields: userName (IMEI), pwd_ (plain), pwd (plain), loginType=USER, language=en
 *   - Returns: redirect script with mds= session token
 *
 * Data:  GET /GetDataService.aspx?method=loadUser&mds={mds}&user_id={uid}&callback=cb
 *   - Returns: JSONP with jingdu (lng), weidu (lat), sudu (speed), datetime, etc.
 */

import * as http from "http";

// ─── Types ───

export interface DagpsCredentials {
  account: string;   // IMEI number used as login
  password: string;
  server_url: string;
}

export interface DagpsSession {
  mds: string;       // session token from login redirect
  user_id: string;   // GUID extracted from loadUser response
  cookie: string;    // ASP.NET session cookie
  expires_at: string;
}

export interface DagpsDeviceLocation {
  imei: string;
  lat: number;
  lng: number;
  speed: number;     // km/h
  heading: number;
  gps_time: string;
  status: string;
}

// ─── HTTP Helper ───

function request(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {}
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...options.headers,
      },
      timeout: options.timeout || 15000,
    };

    if (options.body) {
      reqOptions.headers["Content-Type"] = "application/x-www-form-urlencoded";
      reqOptions.headers["Content-Length"] = String(Buffer.byteLength(options.body));
    }

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
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

// ─── DAGPS API Methods ───

/**
 * Authenticate with DAGPS.
 * POST /LoginByUser.aspx?method=loginSystem
 * On success, response body contains: window.location.href="/user/indexp.aspx?mds=..."
 */
export async function dagpsLogin(creds: DagpsCredentials): Promise<DagpsSession> {
  const baseUrl = creds.server_url.replace(/\/$/, "");

  const body = [
    `userName=${encodeURIComponent(creds.account)}`,
    `pwd_=${encodeURIComponent(creds.password)}`,
    `pwd=${encodeURIComponent(creds.password)}`,
    `loginType=USER`,
    `language=en`,
    `timeZone=0`,
    `monitor=0`,
    `loginUrl=`,
  ].join("&");

  const res = await request(`${baseUrl}/LoginByUser.aspx?method=loginSystem`, {
    method: "POST",
    body,
    headers: {
      "Referer": `${baseUrl}/Skins/DefaultIndex/`,
    },
  });

  // Extract ASP.NET session cookie
  const cookies = res.headers["set-cookie"];
  let cookie = "";
  if (Array.isArray(cookies)) {
    const match = cookies.find(c => c.includes("ASP.NET_SessionId"));
    if (match) cookie = match.split(";")[0];
  } else if (typeof cookies === "string") {
    cookie = cookies.split(";")[0];
  }

  // Extract mds token from redirect script
  // Response: <script>window.location.href="/user/indexp.aspx?mds=XXXXX";</script>
  const mdsMatch = res.body.match(/mds=([a-f0-9]+)/i);
  if (!mdsMatch) {
    throw new Error(`DAGPS login failed: no mds token in response. Status=${res.status}, body=${res.body.substring(0, 200)}`);
  }

  const mds = mdsMatch[1];

  // Now load the dashboard page to extract the user_id GUID
  const dashRes = await request(
    `${baseUrl}/user/indexp.aspx?mds=${mds}`,
    { headers: { "Cookie": cookie, "Referer": `${baseUrl}/Skins/DefaultIndex/` } }
  );

  let userId = "";
  const userIdMatch = dashRes.body.match(/var loginUserId\s*=\s*'([^']+)'/);
  if (userIdMatch) {
    userId = userIdMatch[1];
  }

  return {
    mds,
    user_id: userId,
    cookie,
    expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
  };
}

/**
 * Fetch device location from DAGPS.
 * GET /GetDataService.aspx?method=loadUser&mds={mds}&user_id={uid}&callback=cb
 * Returns JSONP with: jingdu (longitude), weidu (latitude), sudu (speed), datetime
 */
export async function dagpsGetDeviceLocation(
  baseUrl: string,
  session: DagpsSession,
  _imei: string
): Promise<DagpsDeviceLocation | null> {
  const base = baseUrl.replace(/\/$/, "");

  let url = `${base}/GetDataService.aspx?method=loadUser&mds=${session.mds}&callback=cb`;
  if (session.user_id) {
    url += `&user_id=${encodeURIComponent(session.user_id)}`;
  }

  const res = await request(url, {
    headers: {
      "Cookie": session.cookie,
      "Referer": `${base}/user/indexp.aspx?mds=${session.mds}`,
    },
    timeout: 10000,
  });

  if (res.status !== 200) return null;

  // Parse JSONP: cb({...})
  const jsonStr = res.body.replace(/^cb\(/, "").replace(/\)$/, "");
  try {
    const json = JSON.parse(jsonStr);
    if (json.success !== "true" || !json.data?.[0]) return null;

    const d = json.data[0];
    const lat = parseFloat(d.weidu) || 0;   // latitude
    const lng = parseFloat(d.jingdu) || 0;   // longitude
    if (lat === 0 && lng === 0) return null;

    return {
      imei: d.sim_id || _imei,
      lat,
      lng,
      speed: parseFloat(d.sudu) || 0,
      heading: 0,
      gps_time: d.datetime || new Date().toISOString(),
      status: d.status || (parseFloat(d.sudu) > 0 ? "moving" : "stationary"),
    };
  } catch {
    return null;
  }
}
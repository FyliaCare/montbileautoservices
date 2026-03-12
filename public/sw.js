const CACHE_NAME = "montbile-v5";
const STATIC_ASSETS = [
  "/",
  "/login/",
  "/rider/",
  "/rider/trips/",
  "/rider/earnings/",
  "/rider/profile/",
  "/management/",
  "/management/finance/",
  "/management/analytics/",
  "/management/simulations/",
  "/management/fleet/",
  "/management/settings/",
  "/manifest.json",
];

// Install — cache static shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch — network-first for hashed assets, stale-while-revalidate for pages
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Firebase/external requests
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Hashed JS/CSS chunks (_next/static) — network-first, fallback to cache
  // These change every build so we must always try the network first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Other static assets (icons, images) — cache-first
  if (/\.(png|jpg|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // HTML pages — stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));

      return cached || fetchPromise;
    })
  );
});

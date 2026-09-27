// Offline shell: network-first for our own files (always fresh when online), cache fallback when offline.
// Third-party data (weather, tiles, NOAA, JMA) is never cached here; the app falls back to sample data by itself.
const CACHE = "earth-eye-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "model.js", "forecast.js", "locations.js", "planets.js", "solar.js", "solarui.js", "cosmos.js", "cosmos-data.js", "sky.js", "moon.js", "inner.html", "journey.js", "vendor/astro/astronomy.browser.min.js", "vendor/astro/satellite.min.js",
  "vendor/maplibre/maplibre-gl.js", "vendor/maplibre/maplibre-gl.css", "vendor/three/three.module.min.js", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("api/")) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

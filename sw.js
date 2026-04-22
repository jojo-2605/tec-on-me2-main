const CACHE_NAME = "tec-on-me-cache-v1";
const FILES_TO_CACHE = [
  "/",
  "/carte.html",
  "/index.html",
  "/main.js",
  "/styles/style.css",
  "/styles/map.css",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  console.log("[SW] Install");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .catch((err) => {
        console.warn("[SW] cache addAll failed", err);
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activate");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (event.request.method === "GET") {
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, res.clone()));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((r) => r || caches.match("/")),
      ),
  );
});

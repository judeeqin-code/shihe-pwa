/* 史河科技 PWA Service Worker：离线缓存所有静态资源 */
const CACHE = "shihe-pwa-v7";
const ASSETS = [
  ".", "index.html", "manifest.webmanifest",
  "css/style.css",
  "js/crypto.js", "js/db.js", "js/app.js", "js/export_worker.js",
  "icons/icon-96.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

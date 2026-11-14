// WeSki service worker: keeps the whole app and the Jay Peak map on the phone so it opens offline.
const VERSION = '__VERSION__';
const FILES = "__FILES__";
const CACHE = 'weski-map';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(FILES.map((f) => fetch(f, { cache: 'reload' }).then((res) => { if (!res.ok) throw new Error(f); return cache.put(f, res); }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    const cache = await caches.open(CACHE);
    const keep = new Set(FILES);
    for (const req of await cache.keys()) if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === 'navigate' ? '/' : req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      return res;
    } catch (e) {
      if (req.mode === 'navigate') { const shell = await cache.match('/'); if (shell) return shell; }
      throw e;
    }
  })());
});

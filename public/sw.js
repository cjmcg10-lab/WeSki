// SkiWithMe service worker: keeps the whole app and the Jay Peak map on the phone so it opens offline.
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

const RESORT_DATA = /^\/(data\/[^/]+|forecast)\//;   // one folder of map data per resort, and the Forecast resort catalog, cached when first opened

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    const cache = await caches.open(CACHE);
    const keep = new Set(FILES);
    for (const req of await cache.keys()) { const p = new URL(req.url).pathname; if (!keep.has(p) && !RESORT_DATA.test(p)) await cache.delete(req); }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // The website and legal pages are pages of their own, straight from the server (answering them from here broke
  // when the server redirects /legal/terms.html to /legal/terms).
  if (req.mode === 'navigate' && /^\/(legal\/|about)/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (/\/graph\.json$/.test(url.pathname)) {
      // Directions data (part of the pass): ask the server first, so an ended pass ends here too;
      // use the saved copy only with no signal.
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(url.pathname, res.clone());
        else if (res.status === 402) await cache.delete(url.pathname);
        return res;
      } catch (e) {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        throw e;
      }
    }
    if (RESORT_DATA.test(url.pathname)) {
      // Resort maps: answer from the phone straight away if we have it, and refresh the copy
      // in the background when online, so the map opens offline and still picks up updates.
      const hit = await cache.match(url.pathname);
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(url.pathname, res.clone()); return res; });
      if (hit) { fresh.catch(() => {}); return hit; }
      return fresh;
    }
    const page = req.mode === 'navigate';
    const hit = await cache.match(page ? '/' : req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (page) { const shell = await cache.match('/'); if (shell) return shell; }
      throw e;
    }
  })());
});

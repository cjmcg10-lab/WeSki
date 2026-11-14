// On-device storage. Sessions (runs, routes, stats, GPS points) live in IndexedDB so
// history and playback work offline; small settings live in localStorage.
const DB = 'weski', VERSION = 1;
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const sessions = {
  put: (s) => tx('sessions', 'readwrite', (o) => o.put(s)),
  get: (id) => tx('sessions', 'readonly', (o) => o.get(id)),
  del: (id) => tx('sessions', 'readwrite', (o) => o.delete(id)),
  async list() {
    const all = (await tx('sessions', 'readonly', (o) => o.getAll())) || [];
    return all.sort((a, b) => b.start - a.start);
  },
};

export const kv = {
  get: (k) => tx('kv', 'readonly', (o) => o.get(k)),
  set: (k, v) => tx('kv', 'readwrite', (o) => o.put(v, k)),
};

const LS = 'weski:';
export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(LS + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(LS + key, JSON.stringify(value)); } catch { /* private mode / full */ }
  },
};

/** Ask iOS to keep our data when storage is tight. */
export function persist() {
  navigator.storage?.persist?.().catch(() => {});
}

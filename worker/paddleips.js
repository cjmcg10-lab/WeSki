// Paddle sends its webhooks only from a published list of IPv4 addresses. The list is read from Paddle itself
// (https://api.paddle.com/ips for live, https://sandbox-api.paddle.com/ips for the sandbox; addresses in
// data.ipv4_cidrs as /32 CIDRs) and never written into the code, because Paddle can change it. The signature check in
// worker/accounts.js stays the real protection; this only turns away anything that is not Paddle before that.

const TTL_MS = 60 * 60 * 1000; // read the list again after an hour
const cache = new Map(); // base url -> {list, at}

/** Paddle's current webhook addresses as CIDR strings, or null when the list cannot be read and none is cached. */
export async function paddleIps(live, { fetchFn = fetch, now = Date.now() } = {}) {
  const base = live ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
  const hit = cache.get(base);
  if (hit && now - hit.at < TTL_MS) return hit.list;
  try {
    const r = await fetchFn(`${base}/ips`, { headers: { 'user-agent': 'weski-build' } });
    const list = r.ok ? (await r.json())?.data?.ipv4_cidrs : null;
    if (Array.isArray(list) && list.length && list.every((c) => typeof c === 'string')) {
      cache.set(base, { list, at: now });
      return list;
    }
  } catch { /* fall back to the last list read, if any */ }
  return hit?.list || null;
}

const toInt = (ip) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some((n) => n > 255) ? null : ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
};

/** True when an IPv4 address lies in one of the CIDRs ("1.2.3.4/32"). Anything else (IPv6, junk) is false. */
export function ipAllowed(ip, cidrs) {
  const n = toInt(ip);
  if (n === null || !Array.isArray(cidrs)) return false;
  return cidrs.some((c) => {
    const [addr, bits = '32'] = String(c).split('/');
    const base = toInt(addr), b = Number(bits);
    if (base === null || !(b >= 0 && b <= 32)) return false;
    const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0;
    return ((n & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

/** For tests: forget the cached lists. */
export const _resetPaddleIps = () => cache.clear();

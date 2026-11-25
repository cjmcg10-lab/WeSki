// Apple in-app purchases: checking Apple's signed data and turning it into pass records.
//
// Everything Apple sends about a purchase is a JWS (header.payload.signature) whose header carries the signing
// certificate chain (x5c: leaf, Apple's intermediate, Apple Root CA - G3). It counts as Apple's only when:
//   - the last certificate is Apple Root CA - G3 (its SHA-256 fingerprint, published by Apple),
//   - each certificate is signed by the next and names it as issuer,
//   - the intermediate and the leaf carry Apple's marker extensions (as Apple's own server library checks),
//   - every certificate was valid when the data was signed, and
//   - the leaf's key verifies the JWS signature (ES256).
// Works in the Worker with WebCrypto only: certificates are read with the small DER reader below.
import { PLANS, ONE_OFF } from './accounts.js';

export const BUNDLE_ID = 'app.builtbyroger.skiwithme';
export const APP_APPLE_ID = 6837861984;
export const PRODUCT_PREFIX = `${BUNDLE_ID}.`;
/** SHA-256 fingerprint of Apple Root CA - G3 (https://www.apple.com/certificateauthority/). */
export const APPLE_ROOT_G3 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
// extension OIDs 1.2.840.113635.100.6.2.1 (Apple WWDR intermediate) and 1.2.840.113635.100.6.11.1 (App Store receipt
// signing), as DER
const OID_INTERMEDIATE = hex('060a2a864886f76364060201');
const OID_LEAF = hex('060a2a864886f76364060b01');
const OID_P256 = hex('2a8648ce3d030107');
const OID_P384 = hex('2b81040022');
const OID_SHA256 = hex('2a8648ce3d040302');
const OID_SHA384 = hex('2a8648ce3d040303');
const GRACE_MS = 6 * 3600e3;   // as for Paddle: a renewal message can arrive a little after the period ends

function hex(s) { return Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16)); }
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function b64(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function find(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** One DER element at pos: {tag, start (content), end, whole (header and content)}. */
function tlv(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1], p = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error('DER length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  if (p + len > buf.length) throw new Error('DER overrun');
  return { tag, start: p, end: p + len, whole: buf.subarray(pos, p + len) };
}
function children(buf, el) {
  const out = [];
  for (let p = el.start; p < el.end;) { const c = tlv(buf, p); out.push(c); p = c.end; }
  return out;
}
function derTime(buf, el) {
  const s = new TextDecoder().decode(buf.subarray(el.start, el.end));
  const m = el.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(s);
  if (!m) throw new Error('DER time');
  let y = +m[1];
  if (el.tag === 0x17) y += y < 50 ? 2000 : 1900;
  return Date.UTC(y, m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** The parts of an X.509 certificate needed here. */
export function readCert(der) {
  const cert = tlv(der, 0);
  const [tbs, sigAlg, sig] = children(der, cert);
  let parts = children(der, tbs);
  if (parts[0].tag === 0xa0) parts = parts.slice(1);       // version
  const [, , issuer, validity, subject, spki] = parts;
  const [from, to] = children(der, validity);
  const spkiAlg = children(der, children(der, spki)[0]);
  const curveOid = der.subarray(spkiAlg[1].start, spkiAlg[1].end);
  const sigOid = der.subarray(children(der, sigAlg)[0].start, children(der, sigAlg)[0].end);
  return {
    der, tbs: tbs.whole, issuer: issuer.whole, subject: subject.whole, spki: spki.whole,
    from: derTime(der, from), to: derTime(der, to),
    curve: same(curveOid, OID_P256) ? 'P-256' : same(curveOid, OID_P384) ? 'P-384' : null,
    hash: same(sigOid, OID_SHA256) ? 'SHA-256' : same(sigOid, OID_SHA384) ? 'SHA-384' : null,
    sig: der.subarray(sig.start + 1, sig.end),               // a BIT STRING: skip the unused-bits byte
  };
}

/** An ECDSA signature in DER (SEQUENCE of two INTEGERs) as the raw r||s WebCrypto wants. */
function rawSig(der, size) {
  const [r, s] = children(der, tlv(der, 0));
  const fix = (el) => {
    let v = der.subarray(el.start, el.end);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('ECDSA size');
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const out = new Uint8Array(size * 2);
  out.set(fix(r), 0); out.set(fix(s), size);
  return out;
}

const keyOf = (c) => crypto.subtle.importKey('spki', c.spki, { name: 'ECDSA', namedCurve: c.curve }, false, ['verify']);

/** True when `child` was signed by `parent`'s key and names it as issuer. */
async function signedBy(child, parent) {
  if (!child.hash || !parent.curve || !same(child.issuer, parent.subject)) return false;
  const size = parent.curve === 'P-384' ? 48 : 32;
  return crypto.subtle.verify({ name: 'ECDSA', hash: child.hash }, await keyOf(parent), rawSig(child.sig, size), child.tbs);
}

/**
 * Check one JWS signed by the App Store and return its payload, or null.
 * opts.root: the expected root fingerprint (tests use their own); opts.now: used when the payload has no signedDate.
 */
export async function verifyAppleJws(jws, opts = {}) {
  try {
    const parts = String(jws || '').split('.');
    if (parts.length !== 3) return null;
    const head = JSON.parse(new TextDecoder().decode(b64(parts[0])));
    if (head.alg !== 'ES256' || !Array.isArray(head.x5c) || head.x5c.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64(parts[1])));
    const [leaf, mid, root] = head.x5c.map((c) => readCert(b64(c)));
    if (toHex(await crypto.subtle.digest('SHA-256', root.der)) !== (opts.root || APPLE_ROOT_G3)) return null;
    if (!find(mid.tbs, OID_INTERMEDIATE) || !find(leaf.tbs, OID_LEAF)) return null;
    // the certificates must have been valid when Apple signed the data (as Apple's library checks without online
    // revocation lookups), so an old transaction restored later still checks out
    const at = Number(payload.signedDate) || opts.now || Date.now();
    if (![leaf, mid, root].every((c) => c.from <= at && at <= c.to)) return null;
    if (!(await signedBy(leaf, mid)) || !(await signedBy(mid, root)) || !(await signedBy(root, root))) return null;
    if (leaf.curve !== 'P-256') return null;
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await keyOf(leaf), b64(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return ok ? payload : null;
  } catch {
    return null;
  }
}

/** A transaction (or notification data) for this app: right bundle, and in production the right app. */
export function forThisApp(x) {
  if (!x || x.bundleId !== BUNDLE_ID) return false;
  if (x.environment === 'Production' && x.appAppleId != null && Number(x.appAppleId) !== APP_APPLE_ID) return false;
  return true;
}

/** Plan id from an App Store product id (app.builtbyroger.skiwithme.season → season), or null. */
export function planOf(productId) {
  const p = String(productId || '');
  if (!p.startsWith(PRODUCT_PREFIX)) return null;
  const k = p.slice(PRODUCT_PREFIX.length);
  return PLANS[k] ? k : null;
}

/**
 * A verified transaction as a pass record (without the account): {id, plan, status, starts, ends, sub, revoked}.
 * Day and Week passes are one record per transaction; a Season or Crew subscription is one record for its whole
 * life (Apple's originalTransactionId), so renewals and an upgrade to Crew update it. renewal: the verified
 * renewal info, if any (its grace period keeps a pass on while Apple retries a failed payment).
 */
export function appleRecord(tx, renewal = null) {
  const plan = planOf(tx?.productId);
  if (!plan || !forThisApp(tx)) return null;
  const purchase = Number(tx.purchaseDate) || Date.now();
  if (tx.revocationDate) {
    const sub = !ONE_OFF.includes(plan);
    return { id: `apple:${sub ? tx.originalTransactionId : tx.transactionId}`, plan, status: 'revoked',
      starts: Number(tx.originalPurchaseDate) || purchase, ends: Number(tx.revocationDate), sub: sub ? `apple:${tx.originalTransactionId}` : null, revoked: true };
  }
  if (ONE_OFF.includes(plan)) {
    return { id: `apple:${tx.transactionId}`, plan, status: 'active', starts: purchase, ends: purchase + PLANS[plan].days * 86400000, sub: null };
  }
  const expires = Math.max(Number(tx.expiresDate) || 0, Number(renewal?.gracePeriodExpiresDate) || 0);
  if (!expires) return null;
  return { id: `apple:${tx.originalTransactionId}`, plan, status: expires > Date.now() ? 'active' : 'expired',
    starts: Number(tx.originalPurchaseDate) || purchase, ends: expires + GRACE_MS, sub: `apple:${tx.originalTransactionId}` };
}

/**
 * A verified App Store Server Notification (v2) body: {id, type, token, record} or null.
 * The transaction and renewal info inside are signed again and checked the same way.
 */
export async function readNotification(body, opts = {}) {
  const n = await verifyAppleJws(body?.signedPayload, opts);
  if (!n || !n.notificationUUID) return null;
  const d = n.data || {};
  if (d.bundleId && !forThisApp({ ...d, bundleId: d.bundleId })) return null;
  const tx = d.signedTransactionInfo ? await verifyAppleJws(d.signedTransactionInfo, opts) : null;
  const renewal = d.signedRenewalInfo ? await verifyAppleJws(d.signedRenewalInfo, opts) : null;
  if (d.signedTransactionInfo && !tx) return null;
  return { id: `apple-n:${n.notificationUUID}`, type: n.notificationType, token: tx?.appAccountToken || null,
    record: tx ? appleRecord(tx, renewal) : null };
}

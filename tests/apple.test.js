// Apple in-app purchases: the signed-data check and the pass records (worker/apple.js).
// The fixtures in tests/fixtures/apple are a made-up chain shaped like Apple's (a P-384 root, an intermediate and a
// leaf carrying Apple's marker extensions). Their keys are for these tests only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyAppleJws, appleRecord, readNotification, planOf, BUNDLE_ID } from '../worker/apple.js';

const dir = new URL('./fixtures/apple/', import.meta.url);
const pemDer = (name) => Buffer.from(readFileSync(new URL(name, dir), 'utf8').replace(/-----[^-]+-----|\s/g, ''), 'base64');
const chain = ['leaf.pem', 'mid.pem', 'root.pem'].map((n) => pemDer(n).toString('base64'));
const ROOT = createHash('sha256').update(pemDer('root.pem')).digest('hex');
const b64u = (x) => Buffer.from(x).toString('base64url');

async function sign(payload, x5c = chain) {
  const key = await crypto.subtle.importKey('pkcs8', pemDer('leaf.key'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(JSON.stringify({ alg: 'ES256', x5c }));
  const body = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(new Uint8Array(sig))}`;
}
const now = Date.now();
const tx = (over = {}) => ({
  bundleId: BUNDLE_ID, environment: 'Sandbox', productId: `${BUNDLE_ID}.week`, transactionId: '2000000001',
  originalTransactionId: '2000000001', purchaseDate: now, originalPurchaseDate: now, signedDate: now,
  appAccountToken: '7b0c5c9e-3c1e-4b9e-9a1e-5d3f1f0a2b11', ...over,
});

describe('verifyAppleJws', () => {
  it('accepts data signed through the chain to the expected root', async () => {
    const out = await verifyAppleJws(await sign(tx()), { root: ROOT });
    expect(out?.productId).toBe(`${BUNDLE_ID}.week`);
  });
  it("refuses a chain that does not end at Apple's root", async () => {
    expect(await verifyAppleJws(await sign(tx()))).toBeNull();          // the real Apple fingerprint
  });
  it('refuses changed data', async () => {
    const [h, , s] = (await sign(tx())).split('.');
    const forged = b64u(JSON.stringify(tx({ productId: `${BUNDLE_ID}.crew` })));
    expect(await verifyAppleJws(`${h}.${forged}.${s}`, { root: ROOT })).toBeNull();
  });
  it('refuses a chain in the wrong order or missing a certificate', async () => {
    expect(await verifyAppleJws(await sign(tx(), [chain[1], chain[0], chain[2]]), { root: ROOT })).toBeNull();
    expect(await verifyAppleJws(await sign(tx(), chain.slice(0, 2)), { root: ROOT })).toBeNull();
  });
  it('refuses data signed outside the certificates\' dates', async () => {
    expect(await verifyAppleJws(await sign(tx({ signedDate: Date.UTC(2001, 0, 1) })), { root: ROOT })).toBeNull();
  });
  it('refuses rubbish', async () => {
    for (const x of ['', 'a.b.c', null, 42]) expect(await verifyAppleJws(x, { root: ROOT })).toBeNull();
  });
});

describe('appleRecord', () => {
  it('maps product ids to plans', () => {
    expect(planOf(`${BUNDLE_ID}.day`)).toBe('day');
    expect(planOf(`${BUNDLE_ID}.crew`)).toBe('crew');
    expect(planOf('com.other.day')).toBeNull();
    expect(planOf(`${BUNDLE_ID}.lifetime`)).toBeNull();
  });
  it('makes a Day or Week Pass one record per purchase, lasting its length', () => {
    const r = appleRecord(tx());
    expect(r).toMatchObject({ id: 'apple:2000000001', plan: 'week', status: 'active', starts: now, ends: now + 7 * 86400000, sub: null });
    expect(appleRecord(tx({ productId: `${BUNDLE_ID}.day`, transactionId: '9' })).ends).toBe(now + 86400000);
  });
  it('keeps one record for a whole subscription, ending at its expiry (or grace period)', () => {
    const exp = now + 365 * 86400000;
    const r = appleRecord(tx({ productId: `${BUNDLE_ID}.season`, transactionId: '2000000005', expiresDate: exp }));
    expect(r.id).toBe('apple:2000000001');
    expect(r.ends).toBeGreaterThan(exp);
    const g = appleRecord(tx({ productId: `${BUNDLE_ID}.season`, expiresDate: now - 1000 }), { gracePeriodExpiresDate: now + 86400000 });
    expect(g.ends).toBeGreaterThan(now + 86400000);
  });
  it('ends a refunded pass when Apple revoked it', () => {
    const r = appleRecord(tx({ revocationDate: now + 1000 }));
    expect(r).toMatchObject({ status: 'revoked', revoked: true, ends: now + 1000 });
  });
  it('ignores other apps and unknown products', () => {
    expect(appleRecord(tx({ bundleId: 'com.other.app' }))).toBeNull();
    expect(appleRecord(tx({ environment: 'Production', appAppleId: 1 }))).toBeNull();
    expect(appleRecord(tx({ productId: 'x' }))).toBeNull();
  });
});

describe('readNotification', () => {
  it('checks the notification and the transaction inside it', async () => {
    const t = await sign(tx({ productId: `${BUNDLE_ID}.crew`, expiresDate: now + 3600e3 }));
    const body = { signedPayload: await sign({ notificationType: 'DID_RENEW', notificationUUID: 'n-1', signedDate: now,
      data: { bundleId: BUNDLE_ID, environment: 'Sandbox', signedTransactionInfo: t } }) };
    const n = await readNotification(body, { root: ROOT });
    expect(n).toMatchObject({ id: 'apple-n:n-1', type: 'DID_RENEW', token: tx().appAccountToken });
    expect(n.record.plan).toBe('crew');
  });
  it("refuses a notification whose transaction is not Apple's", async () => {
    const body = { signedPayload: await sign({ notificationType: 'DID_RENEW', notificationUUID: 'n-2', signedDate: now,
      data: { bundleId: BUNDLE_ID, signedTransactionInfo: 'x.y.z' } }) };
    expect(await readNotification(body, { root: ROOT })).toBeNull();
  });
  it('reads Apple\'s test message (no transaction)', async () => {
    const body = { signedPayload: await sign({ notificationType: 'TEST', notificationUUID: 'n-3', signedDate: now, data: { bundleId: BUNDLE_ID } }) };
    expect(await readNotification(body, { root: ROOT })).toMatchObject({ type: 'TEST', record: null });
  });
});

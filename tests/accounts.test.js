import { describe, it, expect } from 'vitest';
import { verifyPaddle, hmacHex, purchaseFromEvent, entitlement, sessionFromCookie, PLANS, GRACE_MS } from '../worker/accounts.js';
import { cleanSummary, addSummary, publicTotals, cleanReport, K_ANON } from '../worker/evidence.js';

const prices = { pri_day: 'day', pri_week: 'week', pri_season: 'season', pri_crew: 'crew' };

describe('payments', () => {
  it('accepts only a correctly signed, fresh Paddle webhook', async () => {
    const body = '{"event_id":"evt_1"}', secret = 'pdl_ntfset_secret', ts = Math.floor(Date.now() / 1000);
    const h1 = await hmacHex(secret, `${ts}:${body}`);
    expect(await verifyPaddle(`ts=${ts};h1=${h1}`, body, secret)).toBe(true);
    expect(await verifyPaddle(`ts=${ts};h1=${h1}`, body + ' ', secret)).toBe(false);          // body changed
    expect(await verifyPaddle(`ts=${ts};h1=${h1}`, body, 'other-secret')).toBe(false);        // forged
    expect(await verifyPaddle(`ts=${ts - 3600};h1=${await hmacHex(secret, `${ts - 3600}:${body}`)}`, body, secret)).toBe(false); // replayed
    expect(await verifyPaddle(null, body, secret)).toBe(false);
    expect(await verifyPaddle(`ts=${ts};h1=${h1}`, body, '')).toBe(false);                    // not set up: nothing passes
  });

  it('turns a paid day pass into 24 hours and a season subscription into its billing period', () => {
    const day = purchaseFromEvent({ event_type: 'transaction.completed', data: { id: 'txn_1', billed_at: '2026-12-01T10:00:00Z', custom_data: { account: 'a1' }, items: [{ price: { id: 'pri_day' } }] } }, prices);
    expect(day).toMatchObject({ account: 'a1', plan: 'day', ends: Date.parse('2026-12-02T10:00:00Z') });
    const sub = purchaseFromEvent({ event_type: 'subscription.created', data: { id: 'sub_1', status: 'active', started_at: '2026-12-01T00:00:00Z', current_billing_period: { ends_at: '2027-12-01T00:00:00Z' }, custom_data: { account: 'a1' }, items: [{ price: { id: 'pri_season' } }] } }, prices);
    expect(sub.ends).toBe(Date.parse('2027-12-01T00:00:00Z') + GRACE_MS);
    const cancelled = purchaseFromEvent({ event_type: 'subscription.canceled', occurred_at: '2027-01-05T00:00:00Z', data: { id: 'sub_1', status: 'canceled', canceled_at: '2027-01-05T00:00:00Z', custom_data: { account: 'a1' }, items: [{ price: { id: 'pri_season' } }] } }, prices);
    expect(cancelled.ends).toBe(Date.parse('2027-01-05T00:00:00Z'));
    // unknown price, or no account: no pass
    expect(purchaseFromEvent({ event_type: 'transaction.completed', data: { id: 't', custom_data: { account: 'a' }, items: [{ price: { id: 'pri_other' } }] } }, prices)).toBe(null);
    expect(purchaseFromEvent({ event_type: 'transaction.completed', data: { id: 't', items: [{ price: { id: 'pri_day' } }] } }, prices)).toBe(null);
  });

  it('decides the pass from purchases, crews and the free day only', () => {
    const now = Date.parse('2026-12-10T00:00:00Z');
    expect(entitlement([], [], 0, now).active).toBe(false);
    expect(entitlement([{ plan: 'week', starts: now - 1e6, ends: now + 1e6 }], [], 0, now)).toMatchObject({ active: true, plan: 'week' });
    expect(entitlement([{ plan: 'day', starts: now - 2e8, ends: now - 1e8 }], [], 0, now).active).toBe(false);
    expect(entitlement([], [{ plan: 'crew', starts: now - 1, ends: now + 1e9 }], 0, now)).toMatchObject({ active: true, member: true });
    expect(entitlement([], [], now + 1000, now)).toMatchObject({ active: true, trial: true });
    expect(Object.keys(PLANS)).toEqual(['day', 'week', 'season', 'crew']);
  });

  it('reads only a well-formed session cookie', () => {
    const t = 'a'.repeat(64);
    expect(sessionFromCookie(`x=1; sw_session=${t}; y=2`)).toBe(t);
    expect(sessionFromCookie('sw_session=abc')).toBe(null);
    expect(sessionFromCookie(null)).toBe(null);
  });
});

describe('map evidence from skiers', () => {
  it('keeps only counts reached by enough separate ski days', () => {
    const totals = { runs: {}, cells: {} };
    const day = (cells) => cleanSummary({ resort: 'stowe', key: 'f'.repeat(32), day: '2026-12-01', runs: [3, 4], cells });
    for (let i = 0; i < K_ANON - 1; i++) addSummary(totals, day([[1, 2]]));
    expect(publicTotals(totals).cells).toEqual({});
    addSummary(totals, day([[1, 2], [9, 9]]));
    const pub = publicTotals(totals);
    expect(pub.cells).toEqual({ '1,2': K_ANON });
    expect(pub.runs).toEqual({ 3: K_ANON, 4: K_ANON });
  });

  it('refuses malformed summaries', () => {
    expect(cleanSummary({ resort: 'Stowe!', key: 'f'.repeat(32), day: '2026-12-01', runs: [], cells: [] }).error).toBeTruthy();
    expect(cleanSummary({ resort: 'stowe', key: 'short', day: '2026-12-01', runs: [], cells: [] }).error).toBeTruthy();
    expect(cleanSummary({ resort: 'stowe', key: 'f'.repeat(32), day: '2026-12-01', runs: [], cells: new Array(7000).fill([0, 0]) }).error).toBeTruthy();
  });

  it('strips contact details from public reports', () => {
    const r = cleanReport({ resort: 'stowe', kind: 'not_real', x: 10, y: 20, text: 'No such run. Email me at a@b.com or +1 802 555 1234' });
    expect(r.report.text).not.toMatch(/a@b\.com|555/);
    expect(cleanReport({ resort: 'stowe', kind: 'spam', x: 1, y: 1 }).error).toBeTruthy();
  });
});

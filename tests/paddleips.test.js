// Paddle webhook addresses: read from Paddle, cached, and checked before the signature (worker/paddleips.js).
import { describe, it, expect, beforeEach } from 'vitest';
import { paddleIps, ipAllowed, _resetPaddleIps } from '../worker/paddleips.js';
import { purchaseFromEvent } from '../worker/accounts.js';

const reply = (list) => async () => ({ ok: true, json: async () => ({ data: { ipv4_cidrs: list } }) });

describe('Paddle webhook addresses', () => {
  beforeEach(() => _resetPaddleIps());

  it('reads the live and sandbox lists from Paddle and keeps them for an hour', async () => {
    const asked = [];
    const fetchFn = async (u) => { asked.push(u); return reply(['34.232.58.13/32'])(); };
    expect(await paddleIps(true, { fetchFn, now: 0 })).toEqual(['34.232.58.13/32']);
    await paddleIps(true, { fetchFn, now: 59 * 60000 });
    await paddleIps(false, { fetchFn, now: 0 });
    expect(asked).toEqual(['https://api.paddle.com/ips', 'https://sandbox-api.paddle.com/ips']);
    await paddleIps(true, { fetchFn, now: 61 * 60000 });
    expect(asked.length).toBe(3);
  });

  it('keeps the last list when Paddle cannot be reached, and gives null when there is none', async () => {
    const down = async () => { throw new Error('offline'); };
    expect(await paddleIps(true, { fetchFn: down, now: 0 })).toBeNull();
    await paddleIps(true, { fetchFn: reply(['1.2.3.4/32']), now: 0 });
    expect(await paddleIps(true, { fetchFn: down, now: 2 * 3600000 })).toEqual(['1.2.3.4/32']);
  });

  it('lets in only listed addresses', () => {
    const list = ['34.232.58.13/32', '10.0.0.0/24'];
    expect(ipAllowed('34.232.58.13', list)).toBe(true);
    expect(ipAllowed('34.232.58.14', list)).toBe(false);
    expect(ipAllowed('10.0.0.200', list)).toBe(true);
    expect(ipAllowed('10.0.1.1', list)).toBe(false);
    expect(ipAllowed('2001:db8::1', list)).toBe(false);
    expect(ipAllowed(null, list)).toBe(false);
    expect(ipAllowed('999.1.1.1', list)).toBe(false);
  });
});

describe('Paddle customer id', () => {
  it('is kept from purchase events, for Paddle Retain', () => {
    const ev = { event_type: 'transaction.completed', occurred_at: '2026-11-25T00:00:00Z',
      data: { id: 'txn_1', customer_id: 'ctm_01abc', custom_data: { account: 'a1' }, items: [{ price: { id: 'pri_day' } }], billed_at: '2026-11-25T00:00:00Z' } };
    expect(purchaseFromEvent(ev, { pri_day: 'day' }).customer).toBe('ctm_01abc');
  });
});

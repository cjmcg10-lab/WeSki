// The Accounts store (worker/stores.js) on a real SQLite database (Node's built-in node:sqlite), for the account
// sharing rules of issue #134: 2 devices per account, the new-sign-in notice and its "sign out everywhere" link,
// "Sign out of all devices", and one purchase belonging to one account.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { deviceName, newSignInEmail, MAX_SESSIONS, REVOKE_TTL_MS } from '../worker/accounts.js';

vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } }));
const { Accounts } = await import('../worker/stores.js');

// node:sqlite is loaded at run time so the bundler does not try to resolve it
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/** The small part of Cloudflare's `ctx.storage.sql` the store uses: exec(query, ...args) → rows. */
function fakeSql() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(q, ...args) {
      if (!args.length && (q.match(/;/g) || []).length > 1) { db.exec(q); return []; }
      const st = db.prepare(q);
      return /^\s*SELECT/i.test(q) ? st.all(...args) : (st.run(...args), []);
    },
  };
}
const store = () => new Accounts({ storage: { sql: fakeSql() } }, {});
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
};

describe('device names', () => {
  it('names the kind of device from the browser, and gives up rather than guess', () => {
    expect(deviceName(UA.iphone)).toBe('iPhone');
    expect(deviceName(UA.mac)).toBe('Mac');
    expect(deviceName(UA.android)).toBe('Android phone');
    expect(deviceName('Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 Chrome/131.0 Safari/537.36')).toBe('Android tablet');
    expect(deviceName('Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X)')).toBe('iPad');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0')).toBe('Windows computer');
    expect(deviceName('curl/8.5')).toBeNull();
    expect(deviceName(undefined)).toBeNull();
  });

  it('the new-sign-in email names the device and carries the sign-out link', () => {
    const m = newSignInEmail('iPhone', Date.UTC(2026, 10, 24, 15, 4), 'https://x.example/api/auth/revoke?t=abc');
    expect(m.subject).toBe('New sign-in to your SkiWithMe account');
    expect(m.text).toContain('signed in on an iPhone, on 2026-11-24 at 15:04 UTC');
    expect(m.text).toContain('https://x.example/api/auth/revoke?t=abc');
    expect(m.html).toContain('Sign out everywhere');
    expect(newSignInEmail('Mac', 0, 'l').text).toContain('on a Mac');
    expect(newSignInEmail(null, 0, 'l').text).toContain('on a new device');
  });
});

describe('two devices per account', () => {
  it('keeps the two most recent sign-ins and signs out the one used longest ago', async () => {
    expect(MAX_SESSIONS).toBe(2);
    const a = store();
    const one = await a.openSession('ski@example.com', UA.iphone);
    const two = await a.openSession('ski@example.com', UA.mac);
    expect(await a.accountFor(one.session)).toBe(one.account);
    expect(await a.accountFor(two.session)).toBe(one.account);
    const three = await a.openSession('ski@example.com', UA.android);
    expect(await a.accountFor(one.session)).toBeNull();          // the first is signed out
    expect(await a.accountFor(two.session)).toBe(one.account);
    expect(await a.accountFor(three.session)).toBe(one.account);
  });

  it('lists the signed-in devices by name and marks this one, without the raw browser string', async () => {
    const a = store();
    await a.openSession('ski@example.com', UA.iphone);
    const mac = await a.openSession('ski@example.com', UA.mac);
    const me = await a.me(mac.session);
    expect(me.devices.map((d) => [d.name, d.current]).sort()).toEqual([['Mac', true], ['iPhone', false]]);
    expect(JSON.stringify(me.devices)).not.toContain('Mozilla');
  });

  it('another account is not touched', async () => {
    const a = store();
    const other = await a.openSession('friend@example.com', UA.iphone);
    for (let i = 0; i < 3; i++) await a.openSession('ski@example.com', UA.mac);
    expect(await a.accountFor(other.session)).toBe(other.account);
  });
});

describe('new-sign-in notice and "sign out everywhere"', () => {
  it('sends no notice when the sign-in creates the account, and one for every later sign-in', async () => {
    const a = store();
    expect((await a.openSession('ski@example.com', UA.iphone)).notice).toBeNull();
    const later = await a.openSession('ski@example.com', UA.mac);
    expect(later.notice).toMatchObject({ email: 'ski@example.com', device: 'Mac' });
    expect(later.notice.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the link signs out every device of that account, once; looking at it does nothing', async () => {
    const a = store();
    const first = await a.openSession('ski@example.com', UA.iphone);
    const second = await a.openSession('ski@example.com', UA.mac);
    const { token } = second.notice;
    expect(await a.revokeValid(token)).toBe(true);
    expect(await a.accountFor(first.session)).toBe(first.account);   // a look (GET) signs nobody out
    expect(await a.revokeAll(token)).toBe(true);
    expect(await a.accountFor(first.session)).toBeNull();
    expect(await a.accountFor(second.session)).toBeNull();
    expect(await a.revokeAll(token)).toBe(false);                    // once only
    expect(await a.revokeValid(token)).toBe(false);
    expect(await a.revokeAll('f'.repeat(64))).toBe(false);
  });

  it('the link stops working after 7 days', async () => {
    const a = store();
    await a.openSession('ski@example.com', UA.iphone);
    const { notice } = await a.openSession('ski@example.com', UA.mac);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + REVOKE_TTL_MS + 1);
    try {
      expect(await a.revokeValid(notice.token)).toBe(false);
      expect(await a.revokeAll(notice.token)).toBe(false);
    } finally { vi.restoreAllMocks(); }
  });

  it('"Sign out of all devices" needs a signed-in device and signs out all of them', async () => {
    const a = store();
    const first = await a.openSession('ski@example.com', UA.iphone);
    const second = await a.openSession('ski@example.com', UA.mac);
    expect(await a.signOutAll('0'.repeat(64))).toBe(false);
    expect(await a.signOutAll(second.session)).toBe(true);
    expect(await a.accountFor(first.session)).toBeNull();
    expect(await a.accountFor(second.session)).toBeNull();
  });
});

describe('one purchase, one account', () => {
  const season = (account, ends) => ({ id: 'sub_1', account, plan: 'season', status: 'active', starts: Date.now() - 1000, ends, sub: 'sub_1' });

  it('a purchase never moves to another account, but its own account gets its updates', async () => {
    const a = store();
    const owner = await a.openSession('owner@example.com', UA.iphone);
    const other = await a.openSession('other@example.com', UA.iphone);
    const later = Date.now() + 365 * 864e5;
    expect(a.applyPurchase('evt_1', season(owner.account, later))).toBe(true);
    expect((await a.me(owner.session)).pass.active).toBe(true);
    // the same purchase arriving again for someone else changes nothing
    a.applyPurchase('evt_2', season(other.account, later));
    expect((await a.me(other.session)).pass.active).toBe(false);
    expect((await a.me(owner.session)).pass.active).toBe(true);
    // a renewal or cancellation for the right account still applies
    a.applyPurchase('evt_3', season(owner.account, Date.now() - 1));
    expect((await a.me(owner.session)).pass.active).toBe(false);
  });

  it('each payment event is applied once', () => {
    const a = store();
    expect(a.applyPurchase('evt_1', null)).toBe(true);
    expect(a.applyPurchase('evt_1', null)).toBe(false);
  });
});

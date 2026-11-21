// Durable Objects for accounts (one instance, SQLite) and for each resort's map evidence (one per resort).
import { DurableObject } from 'cloudflare:workers';
import {
  sha256, randomToken, entitlement, PLANS, TRIAL_HOURS, MAX_SESSIONS, LOGIN_TTL_MS, SESSION_TTL_MS, normEmail,
} from './accounts.js';
import { addSummary, publicTotals, CELL_M } from './evidence.js';

export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE, created INTEGER, trial_until INTEGER DEFAULT 0, trial_used INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account TEXT, created INTEGER, seen INTEGER, device TEXT);
      CREATE TABLE IF NOT EXISTS logins (hash TEXT PRIMARY KEY, email TEXT, expires INTEGER, code TEXT, tries INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, account TEXT, plan TEXT, status TEXT, starts INTEGER, ends INTEGER, sub TEXT, updated INTEGER);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, at INTEGER);
      CREATE TABLE IF NOT EXISTS crew (owner TEXT, email TEXT, PRIMARY KEY (owner, email));
      CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER, until INTEGER);
      CREATE TABLE IF NOT EXISTS consents (account TEXT, v TEXT, at INTEGER, PRIMARY KEY (account, v));
    `);
  }

  /** Record that the signed-in person agreed to terms version v (the phone sends it after sign-in and after agreeing). */
  async recordConsent(session, v) {
    const id = await this.accountFor(session);
    if (!id || !/^[0-9-]{10}$/.test(String(v))) return false;
    this.sql.exec('INSERT OR IGNORE INTO consents VALUES (?, ?, ?)', id, String(v), Date.now());
    return true;
  }

  rows(q, ...a) { return [...this.sql.exec(q, ...a)]; }
  one(q, ...a) { return this.rows(q, ...a)[0] || null; }

  /** Simple counters: at most n actions per key per window. */
  allow(key, n, windowMs) {
    const now = Date.now(), r = this.one('SELECT n, until FROM limits WHERE k = ?', key);
    if (!r || r.until < now) { this.sql.exec('INSERT OR REPLACE INTO limits VALUES (?, 1, ?)', key, now + windowMs); return true; }
    if (r.n >= n) return false;
    this.sql.exec('UPDATE limits SET n = n + 1 WHERE k = ?', key);
    return true;
  }

  /** Make a one-time sign-in link token and a 6-digit code for this email. Returns {token, code}, or null when asked
   *  too often. The code is for the installed app: on iPhone a link in an email opens Safari, which does not share
   *  sign-ins with an app added to the home screen. */
  async startLogin(email, ipKey) {
    email = normEmail(email);
    if (!this.allow('mail:' + email, 5, 3600e3) || !this.allow('ip:' + ipKey, 20, 3600e3)) return null;
    const token = randomToken(), code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
    this.sql.exec('DELETE FROM logins WHERE expires < ?', Date.now());
    this.sql.exec('INSERT INTO logins VALUES (?, ?, ?, ?, 0)', await sha256(token), email, Date.now() + LOGIN_TTL_MS, await sha256(email + ':' + code));
    return { token, code };
  }

  /** Sign in with the code from the email: five wrong tries end that email's code. */
  async finishCode(email, code, device) {
    email = normEmail(email);
    const row = this.one('SELECT hash, code, tries, expires FROM logins WHERE email = ? ORDER BY expires DESC LIMIT 1', email);
    if (!row || row.expires < Date.now()) return null;
    // wrong codes are also capped per email per day (10), so guessing never pays
    const fails = this.one('SELECT n, until FROM limits WHERE k = ?', 'codefail:' + email);
    if (fails && fails.until > Date.now() && fails.n >= 10) return null;
    if (row.code !== await sha256(email + ':' + String(code))) {
      this.allow('codefail:' + email, 10, 864e5);
      if (row.tries + 1 >= 5) this.sql.exec('DELETE FROM logins WHERE email = ?', email);
      else this.sql.exec('UPDATE logins SET tries = tries + 1 WHERE hash = ?', row.hash);
      return null;
    }
    this.sql.exec('DELETE FROM logins WHERE email = ?', email);
    return this.openSession(email, device);
  }

  /** Use a sign-in link (once). Returns {session, account} or null. */
  async finishLogin(token, device) {
    const h = await sha256(token), row = this.one('SELECT email, expires FROM logins WHERE hash = ?', h);
    this.sql.exec('DELETE FROM logins WHERE hash = ?', h);
    if (!row || row.expires < Date.now()) return null;
    this.sql.exec('DELETE FROM logins WHERE email = ?', row.email);
    return this.openSession(row.email, device);
  }

  async openSession(email, device) {
    const row = { email };
    let acc = this.one('SELECT id FROM accounts WHERE email = ?', row.email);
    if (!acc) {
      acc = { id: randomToken(12) };
      this.sql.exec('INSERT INTO accounts (id, email, created) VALUES (?, ?, ?)', acc.id, row.email, Date.now());
    }
    const session = randomToken(), now = Date.now();
    this.sql.exec('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)', await sha256(session), acc.id, now, now, String(device || '').slice(0, 80));
    // keep the newest MAX_SESSIONS phones signed in
    const all = this.rows('SELECT hash FROM sessions WHERE account = ? ORDER BY seen DESC', acc.id);
    for (const s of all.slice(MAX_SESSIONS)) this.sql.exec('DELETE FROM sessions WHERE hash = ?', s.hash);
    return { session, account: acc.id };
  }

  async accountFor(session) {
    if (!session) return null;
    const h = await sha256(session), s = this.one('SELECT account, seen FROM sessions WHERE hash = ?', h);
    if (!s) return null;
    if (Date.now() - s.seen > SESSION_TTL_MS) { this.sql.exec('DELETE FROM sessions WHERE hash = ?', h); return null; }
    if (Date.now() - s.seen > 3600e3) this.sql.exec('UPDATE sessions SET seen = ? WHERE hash = ?', Date.now(), h);
    return s.account;
  }

  /** Owner accounts with every paid feature and no end date: the Cloudflare secret COMP_EMAILS, a comma-separated
   *  list of emails (kept out of the code so no address is published). */
  isComp(email) {
    const list = String(this.env?.COMP_EMAILS || '').split(',').map((e) => normEmail(e)).filter(Boolean);
    return !!email && list.includes(normEmail(email));
  }

  /** {email, pass: entitlement, crew members, purchases} for the signed-in account, or null. */
  async me(session) {
    const id = await this.accountFor(session);
    if (!id) return null;
    const acc = this.one('SELECT * FROM accounts WHERE id = ?', id);
    const own = this.rows('SELECT * FROM purchases WHERE account = ?', id);
    const crewOf = this.rows(`SELECT p.* FROM crew c JOIN purchases p ON p.account = c.owner WHERE c.email = ? AND p.plan = 'crew'`, acc.email);
    return {
      account: id, email: acc.email, trialUsed: !!acc.trial_used,
      pass: this.isComp(acc.email) ? { active: true, plan: 'comp', until: 4102444800000, comp: true, trial: false }
        : this.rows('SELECT a.email FROM crew c JOIN accounts a ON a.id = c.owner WHERE c.email = ?', acc.email).some((r) => this.isComp(r.email))
          ? { active: true, plan: 'crew', until: 4102444800000, member: true, trial: false }
          : entitlement(own, crewOf, acc.trial_until),
      purchases: own.map((p) => ({ plan: p.plan, status: p.status, ends: p.ends, renews: PLANS[p.plan]?.renews })),
      crew: this.rows('SELECT email FROM crew WHERE owner = ?', id).map((r) => r.email),
      devices: this.rows('SELECT created, seen, device FROM sessions WHERE account = ? ORDER BY seen DESC', id),
      terms: this.rows('SELECT v, at FROM consents WHERE account = ? ORDER BY at', id),
    };
  }

  async hasPass(session) {
    const me = await this.me(session);
    return !!me?.pass.active;
  }

  async startTrial(session) {
    const id = await this.accountFor(session);
    if (!id) return { error: 'signed_out' };
    const acc = this.one('SELECT trial_used FROM accounts WHERE id = ?', id);
    if (acc.trial_used) return { error: 'used' };
    this.sql.exec('UPDATE accounts SET trial_used = 1, trial_until = ? WHERE id = ?', Date.now() + TRIAL_HOURS * 3600e3, id);
    return { ok: true };
  }

  /** A verified Paddle event (each applied once). */
  applyPurchase(eventId, p) {
    if (this.one('SELECT id FROM events WHERE id = ?', eventId)) return false;
    this.sql.exec('INSERT INTO events VALUES (?, ?)', eventId, Date.now());
    if (p) {
      this.sql.exec('INSERT OR REPLACE INTO purchases VALUES (?, ?, ?, ?, ?, ?, ?, ?)', p.id, p.account, p.plan, p.status, p.starts, p.ends, p.sub, Date.now());
    }
    return true;
  }

  async setCrew(session, emails) {
    const id = await this.accountFor(session);
    if (!id) return { error: 'signed_out' };
    const own = this.rows(`SELECT * FROM purchases WHERE account = ? AND plan = 'crew'`, id);
    const acc = this.one('SELECT email FROM accounts WHERE id = ?', id);
    if (!entitlement(own).active && !this.isComp(acc?.email)) return { error: 'no_crew_pass' };
    const list = [...new Set(emails.map(normEmail).filter((e) => e.includes('@')))].slice(0, PLANS.crew.seats - 1);
    this.sql.exec('DELETE FROM crew WHERE owner = ?', id);
    for (const e of list) this.sql.exec('INSERT INTO crew VALUES (?, ?)', id, e);
    return { ok: true, crew: list };
  }

  async signOut(session) {
    if (session) this.sql.exec('DELETE FROM sessions WHERE hash = ?', await sha256(session));
  }

  /** Delete the account and everything stored about it (purchase records are kept by Paddle, the seller). */
  async deleteAccount(session) {
    const id = await this.accountFor(session);
    if (!id) return false;
    const acc = this.one('SELECT email FROM accounts WHERE id = ?', id);
    for (const q of ['DELETE FROM sessions WHERE account = ?', 'DELETE FROM purchases WHERE account = ?', 'DELETE FROM crew WHERE owner = ?', 'DELETE FROM consents WHERE account = ?', 'DELETE FROM accounts WHERE id = ?']) this.sql.exec(q, id);
    this.sql.exec('DELETE FROM crew WHERE email = ?', acc.email);
    return true;
  }
}

/** One per resort: the running totals of opt-in ski-day summaries, and public map-mistake reports. */
export class ResortLog extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS buckets (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS seen (key TEXT PRIMARY KEY, at INTEGER);
      CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT);
      CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, kind TEXT, x INTEGER, y INTEGER, ref TEXT, name TEXT, text TEXT, status TEXT DEFAULT 'open');
      CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER, until INTEGER);
    `);
  }

  allow(key, n, windowMs) {
    const now = Date.now(), r = [...this.sql.exec('SELECT n, until FROM limits WHERE k = ?', key)][0];
    if (!r || r.until < now) { this.sql.exec('INSERT OR REPLACE INTO limits VALUES (?, 1, ?)', key, now + windowMs); return true; }
    if (r.n >= n) return false;
    this.sql.exec('UPDATE limits SET n = n + 1 WHERE k = ?', key);
    return true;
  }

  // Each upload is stored as one row in "pending"; every few minutes they are added into the totals, which are
  // kept in 1 km bands. Few storage writes, and nothing is lost if the object is unloaded in between.
  load() {
    const t = { runs: {}, cells: {}, days: 0 };
    for (const r of this.sql.exec('SELECT k, v FROM buckets')) {
      const v = JSON.parse(r.v);
      if (r.k === 'meta') { t.runs = v.runs; t.days = v.days; } else Object.assign(t.cells, v);
    }
    return t;
  }

  pendingRows() {
    return [...this.sql.exec('SELECT id, v FROM pending ORDER BY id')].map((r) => {
      const v = JSON.parse(r.v);
      return { id: r.id, s: { runs: new Set(v.runs), cells: new Set(v.cells) } };
    });
  }

  async addDay(s, ipKey) {
    if (!this.allow('ip:' + ipKey, 30, 86400e3)) return { error: 'too_many' };
    this.sql.exec('DELETE FROM seen WHERE at < ?', Date.now() - 3 * 86400e3);
    if ([...this.sql.exec('SELECT key FROM seen WHERE key = ?', s.key)].length) return { ok: true, duplicate: true };
    this.sql.exec('INSERT INTO seen VALUES (?, ?)', s.key, Date.now());
    this.sql.exec('INSERT INTO pending (v) VALUES (?)', JSON.stringify({ runs: [...s.runs], cells: [...s.cells] }));
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 5 * 60e3);
    return { ok: true };
  }

  async alarm() {
    const t = this.load(), rows = this.pendingRows(), bands = new Set();
    const band = (c) => Math.floor(Number(c.split(',')[0]) / (1000 / CELL_M));
    for (const { s } of rows) { addSummary(t, s); for (const c of s.cells) bands.add(band(c)); }
    this.sql.exec('INSERT OR REPLACE INTO buckets VALUES (?, ?)', 'meta', JSON.stringify({ runs: t.runs, days: t.days }));
    for (const b of bands) {
      const part = {};
      for (const [c, n] of Object.entries(t.cells)) if (band(c) === b) part[c] = n;
      this.sql.exec('INSERT OR REPLACE INTO buckets VALUES (?, ?)', 'b' + b, JSON.stringify(part));
    }
    if (rows.length) this.sql.exec('DELETE FROM pending WHERE id <= ?', rows[rows.length - 1].id);
  }

  heat() {
    const t = this.load();
    for (const { s } of this.pendingRows()) addSummary(t, s);
    return publicTotals(t);
  }

  addReport(r, ipKey) {
    if (!this.allow('rep:' + ipKey, 10, 86400e3)) return { error: 'too_many' };
    this.sql.exec('INSERT INTO reports (at, kind, x, y, ref, name, text) VALUES (?, ?, ?, ?, ?, ?, ?)', r.at, r.kind, r.x, r.y, r.ref, r.name, r.text);
    return { ok: true };
  }

  reports() {
    return [...this.sql.exec('SELECT id, at, kind, x, y, ref, name, text, status FROM reports ORDER BY id DESC LIMIT 500')];
  }
}

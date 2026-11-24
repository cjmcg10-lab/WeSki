// Durable Objects for accounts (one instance, SQLite) and for each resort's map evidence (one per resort).
import { DurableObject } from 'cloudflare:workers';
import {
  sha256, randomToken, entitlement, PLANS, TRIAL_HOURS, MAX_SESSIONS, LOGIN_TTL_MS, SESSION_TTL_MS, REVOKE_TTL_MS, normEmail, deviceName,
} from './accounts.js';
import { addSummary, publicTotals, CELL_M } from './evidence.js';
import { HistoryStore } from './history.js';
import { ensembleStep, ensembleRecord } from './meteoswiss.js';
import { addFeedbackCounts, FEEDBACK_PER_NETWORK_PER_DAY } from './calibration.js';
import { CONFIDENCE, scoreProblems } from './confidence.js';

/** One per watched resort: 72 hours of weather history, the last good forecast and the forecast archive (see docs/FORECAST_HISTORY.md). */
export class ForecastHistory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new HistoryStore(ctx.storage);
  }

  due(now) { return this.store.due(now); }
  record(snapshot, now) { return this.store.record(snapshot, now); }
  history(now) { return this.store.history(now); }
  lastGood(now) { return this.store.lastGood(now); }
  archive(sinceMs, limit) { return this.store.archive(sinceMs, limit); }
  // MeteoSwiss ensemble ranges (issue #57) live in one extra instance of this class, named '_meteoswiss' (no resort id
  // can start with an underscore). The scheduled job runs its steps here, so the file reading is done by the object.
  ensembleStep(now) { return ensembleStep(this.ctx.storage, (url, init) => fetch(url, init), now); }
  ensembleFor(id, now) { return ensembleRecord(this.ctx.storage, id, now); }
}

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
      CREATE TABLE IF NOT EXISTS usage (day TEXT, k TEXT, n INTEGER, PRIMARY KEY (day, k));
      CREATE TABLE IF NOT EXISTS revokes (hash TEXT PRIMARY KEY, account TEXT, expires INTEGER);
    `);
  }

  /** Record that the signed-in person agreed to terms version v (the phone sends it after sign-in and after agreeing). */
  async recordConsent(session, v) {
    const id = await this.accountFor(session);
    if (!id || !/^[0-9-]{10}$/.test(String(v))) return false;
    this.sql.exec('INSERT OR IGNORE INTO consents VALUES (?, ?, ?)', id, String(v), Date.now());
    return true;
  }

  /** The Worker's own daily counts for the usage alerts (worker/usage.js): add a batch, kept for 60 days. */
  addUsage(day, batch) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    for (const [k, n] of Object.entries(batch || {}).slice(0, 50)) {
      if (/^[a-z:-]{3,30}$/.test(k) && Number.isFinite(n) && n > 0) {
        this.sql.exec('INSERT INTO usage VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = n + excluded.n', day, k, Math.round(n));
      }
    }
    this.sql.exec('DELETE FROM usage WHERE day < ?', new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10));
  }

  /** {day: {counter: n}} from `since` (a date) on. */
  usage(since) {
    const out = {};
    for (const r of this.rows('SELECT day, k, n FROM usage WHERE day >= ? ORDER BY day', since)) (out[r.day] ||= {})[r.k] = r.n;
    return out;
  }

  rows(q, ...a) { return [...this.sql.exec(q, ...a)]; }
  one(q, ...a) { return this.rows(q, ...a)[0] || null; }

  /** Simple counters: at most n actions per key per window. */
  allow(key, n, windowMs) {
    const now = Date.now();
    this.sql.exec('DELETE FROM limits WHERE until < ?', now);
    const r = this.one('SELECT n, until FROM limits WHERE k = ?', key);
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

  /** Sign in: make the account if new, open a session, keep only the MAX_SESSIONS devices used most recently.
   *  For an account that already existed, also returns `notice`: {email, token, device} for the new-sign-in email,
   *  whose token signs out every device (revokeAll). */
  async openSession(email, device) {
    const now = Date.now();
    let acc = this.one('SELECT id FROM accounts WHERE email = ?', email);
    const isNew = !acc;
    if (isNew) {
      acc = { id: randomToken(12) };
      this.sql.exec('INSERT INTO accounts (id, email, created) VALUES (?, ?, ?)', acc.id, email, now);
    }
    const session = randomToken();
    this.sql.exec('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)', await sha256(session), acc.id, now, now, String(device || '').slice(0, 80));
    // the new session counts as the most recently used, whatever the clock says about the others
    const all = this.rows('SELECT hash FROM sessions WHERE account = ? ORDER BY created = ? DESC, seen DESC', acc.id, now);
    for (const s of all.slice(MAX_SESSIONS)) this.sql.exec('DELETE FROM sessions WHERE hash = ?', s.hash);
    if (isNew) return { session, account: acc.id, notice: null };
    const token = randomToken();
    this.sql.exec('DELETE FROM revokes WHERE expires < ?', now);
    this.sql.exec('INSERT INTO revokes VALUES (?, ?, ?)', await sha256(token), acc.id, now + REVOKE_TTL_MS);
    return { session, account: acc.id, notice: { email, token, device: deviceName(device) } };
  }

  /** Is this "sign out everywhere" link still good? (Looking does not use it up.) */
  async revokeValid(token) {
    const r = this.one('SELECT expires FROM revokes WHERE hash = ?', await sha256(token));
    return !!r && r.expires > Date.now();
  }

  /** Use a "sign out everywhere" link: every device of that account is signed out. Works once. */
  async revokeAll(token) {
    const h = await sha256(token), r = this.one('SELECT account, expires FROM revokes WHERE hash = ?', h);
    if (!r || r.expires <= Date.now()) return false;
    this.sql.exec('DELETE FROM sessions WHERE account = ?', r.account);
    this.sql.exec('DELETE FROM revokes WHERE account = ?', r.account);
    return true;
  }

  /** "Sign out of all devices" from a signed-in device (this one included). */
  async signOutAll(session) {
    const id = await this.accountFor(session);
    if (!id) return false;
    this.sql.exec('DELETE FROM sessions WHERE account = ?', id);
    return true;
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
    const mine = await sha256(session);
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
      devices: this.rows('SELECT hash, created, seen, device FROM sessions WHERE account = ? ORDER BY seen DESC', id)
        .map((d) => ({ created: d.created, seen: d.seen, name: deviceName(d.device), current: d.hash === mine })),
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

  /** A verified payment event (each applied once). A purchase belongs to the account it was first recorded for:
   *  a later event naming another account for the same purchase is ignored, so one purchase never unlocks two. */
  applyPurchase(eventId, p) {
    if (this.one('SELECT id FROM events WHERE id = ?', eventId)) return false;
    this.sql.exec('INSERT INTO events VALUES (?, ?)', eventId, Date.now());
    const before = p && this.one('SELECT account FROM purchases WHERE id = ?', p.id);
    if (p && (!before || before.account === p.account)) {
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
      CREATE TABLE IF NOT EXISTS feedback (day TEXT PRIMARY KEY, ratings TEXT, tags TEXT);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS digest_due (resort TEXT PRIMARY KEY, at INTEGER);
    `);
    // columns added for #112 (older objects have the first version of the table)
    const cols = new Set([...this.sql.exec('PRAGMA table_info(reports)')].map((r) => r.name));
    for (const [c, type] of [['dev', 'TEXT'], ['near', 'INTEGER'], ['run', 'INTEGER'], ['lat', 'REAL'], ['lon', 'REAL'], ['should', 'INTEGER'], ['scale', 'TEXT']]) {
      if (!cols.has(c)) this.sql.exec(`ALTER TABLE reports ADD COLUMN ${c} ${type}`);
    }
  }

  kvGet(k) { return [...this.sql.exec('SELECT v FROM kv WHERE k = ?', k)][0]?.v ?? null; }
  kvSet(k, v) { this.sql.exec('INSERT OR REPLACE INTO kv VALUES (?, ?)', k, String(v)); }

  /** "How was it?" answers as counts per local date. No identity is stored; the network key only feeds the rate limit. */
  addFeedback(f, ipKey) {
    if (!this.allow('fb:' + ipKey, FEEDBACK_PER_NETWORK_PER_DAY, 86400e3)) return { error: 'too_many' };
    const row = [...this.sql.exec('SELECT ratings, tags FROM feedback WHERE day = ?', f.day)][0];
    const next = addFeedbackCounts(row && { ratings: JSON.parse(row.ratings), tags: JSON.parse(row.tags) }, f);
    this.sql.exec('INSERT OR REPLACE INTO feedback VALUES (?, ?, ?)', f.day, JSON.stringify(next.ratings), JSON.stringify(next.tags));
    return { ok: true };
  }

  feedback(sinceDay) {
    return [...this.sql.exec('SELECT day, ratings, tags FROM feedback WHERE day >= ? ORDER BY day', sinceDay)]
      .map((r) => ({ day: r.day, ratings: JSON.parse(r.ratings), tags: JSON.parse(r.tags) }));
  }

  allow(key, n, windowMs) {
    const now = Date.now();
    this.sql.exec('DELETE FROM limits WHERE until < ?', now);
    const r = [...this.sql.exec('SELECT n, until FROM limits WHERE k = ?', key)][0];
    if (!r || r.until < now) { this.sql.exec('INSERT OR REPLACE INTO limits VALUES (?, 1, ?)', key, now + windowMs); return true; }
    if (r.n >= n) return false;
    this.sql.exec('UPDATE limits SET n = n + 1 WHERE k = ?', key);
    return true;
  }

  // Each upload is stored as one row in "pending"; every few minutes they are added into the totals, which are
  // kept in 1 km bands. Few storage writes, and nothing is lost if the object is unloaded in between.
  load() {
    const t = { runs: {}, cells: {}, days: 0, daily: {} };
    for (const r of this.sql.exec('SELECT k, v FROM buckets')) {
      const v = JSON.parse(r.v);
      if (r.k === 'meta') { t.runs = v.runs; t.days = v.days; } else if (r.k === 'daily') t.daily = v; else Object.assign(t.cells, v);
    }
    return t;
  }

  pendingRows() {
    return [...this.sql.exec('SELECT id, v FROM pending ORDER BY id')].map((r) => {
      const v = JSON.parse(r.v);
      return { id: r.id, s: { runs: new Set(v.runs), cells: new Set(v.cells), day: v.day, on: v.on ?? null } };
    });
  }

  async addDay(s, ipKey) {
    if (!this.allow('ip:' + ipKey, 30, 86400e3)) return { error: 'too_many' };
    this.sql.exec('DELETE FROM seen WHERE at < ?', Date.now() - 3 * 86400e3);
    if ([...this.sql.exec('SELECT key FROM seen WHERE key = ?', s.key)].length) return { ok: true, duplicate: true };
    this.sql.exec('INSERT INTO seen VALUES (?, ?)', s.key, Date.now());
    this.sql.exec('INSERT INTO pending (v) VALUES (?)', JSON.stringify({ runs: [...s.runs], cells: [...s.cells], day: s.day, on: s.on ?? null }));
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 5 * 60e3);
    return { ok: true };
  }

  async alarm() {
    const t = this.load(), rows = this.pendingRows(), bands = new Set();
    const band = (c) => Math.floor(Number(c.split(',')[0]) / (1000 / CELL_M));
    for (const { s } of rows) { addSummary(t, s); for (const c of s.cells) bands.add(band(c)); }
    this.sql.exec('INSERT OR REPLACE INTO buckets VALUES (?, ?)', 'meta', JSON.stringify({ runs: t.runs, days: t.days }));
    // per-day totals for the on-map share (#112): small (one row of three numbers per day), rewritten whole
    this.sql.exec('INSERT OR REPLACE INTO buckets VALUES (?, ?)', 'daily', JSON.stringify(t.daily));
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

  /** `r.dev` must already be the per-mountain hash of the phone's install id (see worker/index.js), or ''. */
  addReport(r, ipKey) {
    if (!this.allow('rep:' + ipKey, 10, 86400e3)) return { error: 'too_many' };
    this.sql.exec('INSERT INTO reports (at, kind, x, y, ref, name, text, dev, near, run, lat, lon, should, scale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      r.at, r.kind, r.x, r.y, r.ref, r.name, r.text, r.dev || null, r.near ?? null, r.run ?? null, r.lat ?? null, r.lon ?? null, r.should ?? null, r.scale ?? null);
    return { ok: true };
  }

  /** The public list: never the install-id hash or the reporter's distance from the spot. */
  reports() {
    return [...this.sql.exec('SELECT id, at, kind, x, y, ref, name, text, status, lat, lon, should, scale FROM reports ORDER BY id DESC LIMIT 500')];
  }

  /** Reports young enough to count towards a confidence score, with the fields scoring needs (kept inside the server). */
  scoringReports(now) {
    return [...this.sql.exec('SELECT id, at, kind, x, y, ref, name, text, status, dev, near, run, lat, lon, should, scale FROM reports WHERE at >= ? ORDER BY id LIMIT 5000',
      now - CONFIDENCE.fadeDays * 86400e3)];
  }

  /** The scored problem list (worker/confidence.js). Public: counts and reasons only, nothing that identifies a phone. */
  problems(now = Date.now()) {
    const heat = this.heat();
    return { days: heat.days, k: heat.k, confidence: CONFIDENCE, problems: scoreProblems(this.scoringReports(now), heat, now) };
  }

  // ---- daily digest (worker/digest.js). On a mountain's object: the reports not yet emailed.
  digestPart(now = Date.now()) {
    const sent = Number(this.kvGet('digestSent') || 0);
    // the first digest for a mountain sends only the last two days, not every report made before the email existed
    const since = this.kvGet('digestSent') == null ? now - 2 * 86400e3 : 0;
    const reports = [...this.sql.exec('SELECT id, at, kind, x, y, ref, name, text, near, run, lat, lon, should, scale FROM reports WHERE id > ? AND at >= ? ORDER BY id', sent, since)];
    const heat = this.heat();
    const p = this.problems(now);
    // heat: the public map-help counts (only what K_ANON or more ski days reached), for the email's map-help part
    return { reports, problems: p.problems, days: p.days, heat, maxId: reports.length ? reports[reports.length - 1].id : sent };
  }

  digestSent(maxId) {
    if (maxId > Number(this.kvGet('digestSent') || 0)) this.kvSet('digestSent', maxId);
  }

  // ---- on the DIGEST_INDEX object only: which mountains have reports waiting, and the day of the last digest
  digestNote(resort, at) {
    this.sql.exec('INSERT OR REPLACE INTO digest_due VALUES (?, ?)', resort, at);
  }

  digestDue(today, now = Date.now()) {
    if (this.kvGet('lastDigestDay') === today) return { sentToday: true, resorts: [] };
    // a claim younger than 10 minutes means another run is sending right now
    const claim = Number(this.kvGet('digestClaim') || 0);
    if (claim && now - claim < 600000) return { sentToday: false, busy: true, resorts: [] };
    this.kvSet('digestClaim', now);
    return { sentToday: false, resorts: [...this.sql.exec('SELECT resort FROM digest_due ORDER BY at')].map((r) => r.resort) };
  }

  digestRelease() { this.kvSet('digestClaim', 0); }

  /** Clears the mountains just handled (only reports noted before `before`), and records the day when one was sent. */
  digestDone(resorts, sentDay, before) {
    for (const r of resorts) this.sql.exec('DELETE FROM digest_due WHERE resort = ? AND at <= ?', r, before);
    // only the run's final call frees the day's claim (clearing leftovers mid-run must not let a second run in)
    if (sentDay) { this.kvSet('lastDigestDay', sentDay); this.kvSet('digestClaim', 0); }
  }
}

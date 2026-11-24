// Map-mistake reports: confidence scores and the daily email (issue #112, steps 1 and 2). No real email is sent here.
import { describe, it, expect } from 'vitest';
import { CONFIDENCE, scoreProblems, groupReports, ageWeight, offRunNear, thingKeys, ratingVotes, votesText } from '../worker/confidence.js';
import { buildDigest, sendMail, runDigest, digestConfig, DIGEST_INDEX, appLink, RESEND_URL } from '../worker/digest.js';
import { cleanReport, publicTotals } from '../worker/evidence.js';

const DAY = 86400e3;
const NOW = Date.UTC(2026, 10, 24, 11, 23);
let nextId = 1;
const rep = (o) => ({ id: nextId++, at: NOW - DAY, kind: 'not_real', x: 1000, y: 2000, ref: '', name: '', text: '', status: 'open', dev: null, near: null, run: null, lat: null, lon: null, ...o });

describe('confidence: grouping and fading', () => {
  it('groups reports on no run or lift by spot: one kind within 60 m, other kinds and far spots apart', () => {
    const g = groupReports([rep({ x: 0, y: 0 }), rep({ x: 40, y: 0 }), rep({ x: 500, y: 0 }), rep({ x: 10, y: 0, kind: 'missing' })]);
    expect(g.map((q) => [q.kind, q.reports.length])).toEqual([['not_real', 2], ['not_real', 1], ['missing', 1]]);
  });

  it('groups reports about one run by the run, however far apart they were sent', () => {
    const g = groupReports([
      rep({ kind: 'wrong_rating', ref: '200363366', name: 'Northway', x: 0, y: 0 }),
      rep({ kind: 'wrong_rating', ref: '200363366', name: 'Northway', x: 800, y: 0 }),     // same run, 800 m down it
      rep({ kind: 'wrong_rating', ref: '200363999', name: 'Upper Goat', x: 10, y: 0 }),    // another run at the same spot
      rep({ kind: 'not_real', ref: '200363366', name: 'Northway', x: 400, y: 0 }),        // same run, other kind
    ]);
    expect(g.map((q) => [q.kind, q.by, q.reports.length])).toEqual([['wrong_rating', 'thing', 2], ['wrong_rating', 'thing', 1], ['not_real', 'thing', 1]]);
  });

  it('joins OSM pieces of one named run, and runs without an OSM id by name; never by run number', () => {
    const g = groupReports([
      rep({ ref: '300000001', name: 'Lower Lord', x: 0, y: 0, run: 4 }),
      rep({ ref: '300000002', name: 'Lower Lord', x: 900, y: 0, run: 5 }),          // OSM draws the run as two ways
      rep({ ref: '', name: 'Traced Glade', x: 2000, y: 0 }),
      rep({ ref: '', name: 'traced glade ', x: 2600, y: 0 }),
      rep({ ref: '12', name: '', x: 5000, y: 0, run: 12 }),                          // old phone: run number as ref
      rep({ ref: '12', name: '', x: 7000, y: 0, run: 12 }),
    ]);
    expect(g.map((q) => [q.by, q.reports.length])).toEqual([['thing', 2], ['thing', 2], ['spot', 1], ['spot', 1]]);
    expect(thingKeys({ kind: 'not_real', ref: '12', name: '' })).toEqual([]);
    expect(thingKeys({ kind: 'missing', ref: '300000001', name: 'Lower Lord' })).toEqual([]);   // missing is always a spot
  });

  it('groups reports on a lift by the lift, apart from a run of the same name', () => {
    const g = groupReports([
      rep({ kind: 'closed_for_good', ref: 'lift:199923159', name: 'Metro Quad', x: 0, y: 0 }),
      rep({ kind: 'closed_for_good', ref: 'lift:199923159', name: 'Metro Quad', x: 700, y: 300 }),
      rep({ kind: 'closed_for_good', ref: '400000001', name: 'Metro Quad', x: 20, y: 0 }),
    ]);
    expect(g.map((q) => q.reports.length)).toEqual([2, 1]);
    const p = scoreProblems([rep({ kind: 'wrong_name', ref: 'lift:Metro Quad', name: 'Metro Quad', dev: 'a' }), rep({ kind: 'wrong_name', ref: 'lift:Metro Quad', name: 'Metro Quad', x: 1600, dev: 'b' })], null, NOW)[0];
    expect(p).toMatchObject({ by: 'thing', lift: true, phones: 2 });
    expect(p.why.join(' ')).toMatch(/Grouped by the lift: reports sent up to 600 m apart/);
  });

  it('uses a 150 m spot for "missing" and 60 m for "runs don\'t connect"', () => {
    expect(CONFIDENCE.missingM).toBe(150);
    const g = groupReports([
      rep({ kind: 'missing', x: 0, y: 0, ref: '300000001', name: 'Lower Lord' }), rep({ kind: 'missing', x: 120, y: 0 }), rep({ kind: 'missing', x: 400, y: 0 }),
      rep({ kind: 'no_connection', x: 0, y: 0, name: 'Lower Lord' }), rep({ kind: 'no_connection', x: 50, y: 0 }), rep({ kind: 'no_connection', x: 120, y: 0 }),
    ]);
    expect(g.map((q) => [q.kind, q.reports.length])).toEqual([['missing', 2], ['missing', 1], ['no_connection', 2], ['no_connection', 1]]);
  });

  it('fades a report in a straight line to nothing at 60 days', () => {
    expect(ageWeight(NOW, NOW)).toBe(1);
    expect(ageWeight(NOW - 30 * DAY, NOW)).toBeCloseTo(0.5);
    expect(ageWeight(NOW - 61 * DAY, NOW)).toBe(0);
    expect(scoreProblems([rep({ at: NOW - 70 * DAY })], null, NOW)).toEqual([]);
    expect(scoreProblems([rep({ status: 'done' })], null, NOW)).toEqual([]);
  });
});

describe('confidence: independent phones and GPS near the spot', () => {
  it('counts each phone once, however many times it reports', () => {
    const one = scoreProblems([rep({ dev: 'a' }), rep({ dev: 'a' }), rep({ dev: 'a' })], null, NOW)[0];
    const three = scoreProblems([rep({ dev: 'a' }), rep({ dev: 'b' }), rep({ dev: 'c' })], null, NOW)[0];
    expect(one.phones).toBe(1);
    expect(three.phones).toBe(3);
    expect(three.score).toBeGreaterThan(one.score * 2.5);
    expect(three.level).toBe('medium');
  });

  it('gives reports with no install id half weight each', () => {
    const p = scoreProblems([rep({}), rep({})], null, NOW)[0];
    expect(p.parts.reports).toBeCloseTo(2 * CONFIDENCE.unknownDevice * ageWeight(NOW - DAY, NOW), 1);
    expect(p.why[0]).toMatch(/before phones had an install id/);
  });

  it('counts a report sent from near the spot for more', () => {
    const far = scoreProblems([rep({ dev: 'a', near: 900 })], null, NOW)[0];
    const near = scoreProblems([rep({ dev: 'a', near: 30 })], null, NOW)[0];
    expect(near.score / far.score).toBeCloseTo(CONFIDENCE.nearFactor, 1);
    expect(near.near).toBe(1);
    expect(near.why.join(' ')).toMatch(/within 200 m of the spot/);
  });

  it('reaches high with several phones on the spot', () => {
    const p = scoreProblems(['a', 'b', 'c'].map((dev) => rep({ dev, near: 20, at: NOW })), null, NOW)[0];
    expect(p.level).toBe('high');
  });
});

describe('confidence: map-help evidence (public counts only)', () => {
  // raw totals as the server keeps them; publicTotals drops anything under 5 ski days, as /api/heat does
  const heat = (o) => publicTotals({ days: 0, runs: {}, cells: {}, ...o });

  it('"does not exist" on a run nobody skis gains points once the mountain has enough ski days', () => {
    const r = [rep({ dev: 'a', run: 7 })];
    const quiet = scoreProblems(r, heat({ days: 80, runs: { 7: 3, 8: 60 } }), NOW)[0];
    const young = scoreProblems(r, heat({ days: 10, runs: {} }), NOW)[0];
    expect(quiet.parts.gps).toBe(CONFIDENCE.absencePoints);
    expect(quiet.why.join(' ')).toMatch(/no published ski days/);
    expect(young.parts.gps).toBe(0);
    expect(young.why.join(' ')).toMatch(/too few ski days/);
  });

  it('"does not exist" on a run skiers do ski loses points', () => {
    const p = scoreProblems([rep({ dev: 'a', run: 7 })], heat({ days: 80, runs: { 7: 22 } }), NOW)[0];
    expect(p.parts.gps).toBe(CONFIDENCE.skiedPoints);
    expect(p.score).toBe(0);
    expect(p.level).toBe('low');
  });

  it('"missing run" counts off-run squares skied on 5+ days near the spot', () => {
    // spot at (1000, 2000): squares are 20 m, so (50, 100) is the square holding it
    const cells = { '50,100': 9, '50,101': 7, '51,100': 6, '50,102': 4, '90,90': 50 };
    const p = scoreProblems([rep({ kind: 'missing', dev: 'a' })], heat({ days: 40, cells }), NOW)[0];
    expect(p.parts.gps).toBe(CONFIDENCE.offRunPoints);
    expect(p.why.join(' ')).toMatch(/3 squares off the mapped runs/);
    expect(offRunNear(heat({ cells }).cells, 1000, 2000, 60)).toHaveLength(3);     // the 4-day square is never seen
  });

  it('a run problem counts off-run squares near each reported spot along the run', () => {
    const cells = { '0,0': 9, '1,0': 7, '50,0': 6 };
    const p = scoreProblems([rep({ kind: 'wrong_place', ref: '300000001', name: 'A', x: 10, y: 10, dev: 'a' }), rep({ kind: 'wrong_place', ref: '300000001', name: 'A', x: 1010, y: 10, dev: 'b' })], heat({ days: 40, cells }), NOW)[0];
    expect(p.parts.gps).toBe(CONFIDENCE.offRunPoints);
  });

  it('never judges a rating from GPS', () => {
    const p = scoreProblems([rep({ kind: 'wrong_rating', dev: 'a', run: 7 })], heat({ days: 500, runs: { 7: 300 } }), NOW)[0];
    expect(p.parts.gps).toBe(0);
    expect(p.why.join(' ')).toMatch(/never judged from GPS/);
  });

  it('explains itself with report ids and no phone ids', () => {
    const p = scoreProblems([rep({ id: 41, dev: 'secret-hash', name: 'Lower Lord', lat: 44.5, lon: -72.7 })], null, NOW)[0];
    expect(p.reports).toEqual([41]);
    expect(JSON.stringify(p)).not.toMatch(/secret-hash/);
    expect(p).toMatchObject({ name: 'Lower Lord', lat: 44.5, lon: -72.7 });
  });
});

describe('wrong rating: what it should be', () => {
  const wr = (dev, should, o = {}) => rep({ kind: 'wrong_rating', ref: '300000001', name: 'Lower Lord', dev, should, scale: 'us', ...o });

  it('adds up phones that agree and shows the most-voted rating', () => {
    const reports = [wr('a', 2), wr('b', 2), wr('c', 2, { x: 900 }), wr('d', 1)];
    const v = ratingVotes(reports);
    expect(v).toMatchObject({ top: 2, agree: 3 });
    expect(votesText(v)).toBe('3 phones say Black, 1 says Blue');
    const p = scoreProblems(reports, null, NOW)[0];
    expect(p.should).toMatchObject({ top: 2, name: 'Black', agree: 3 });
    expect(p.why.join(' ')).toContain('It should be Black: 3 phones say Black, 1 says Blue');
    // the phone that says blue counts for less than one that agrees, but still for something
    const agreeing = scoreProblems([wr('a', 2), wr('b', 2), wr('c', 2), wr('d', 2)], null, NOW)[0];
    expect(p.score).toBeLessThan(agreeing.score);
    expect(p.score).toBeGreaterThan(scoreProblems([wr('a', 2), wr('b', 2), wr('c', 2)], null, NOW)[0].score);
  });

  it('counts a phone once, by its newest choice, and names colours for colour resorts', () => {
    const v = ratingVotes([wr('a', 1, { at: NOW - 3 * DAY }), wr('a', 2, { at: NOW - DAY })]);
    expect(v.votes).toEqual([[2, 1]]);
    expect(votesText(ratingVotes([wr('a', 2, { scale: 'colour' })]))).toBe('1 phone says Red');
    expect(ratingVotes([rep({ kind: 'wrong_rating' })])).toBeNull();       // old phones sent no choice
  });

  it('the server takes only a rating on the resort\'s scale, and only with a wrong-rating report', () => {
    const base = { resort: 'stowe', kind: 'wrong_rating', x: 1, y: 2 };
    expect(cleanReport({ ...base, should: 3, scale: 'us' }).report).toMatchObject({ should: 3, scale: 'us' });
    expect(cleanReport({ ...base, should: 4, scale: 'colour' }).report).toMatchObject({ should: 4, scale: 'colour' });
    expect(cleanReport({ ...base, should: 2 }).report).toMatchObject({ should: 2, scale: 'us' });
    expect(cleanReport({ ...base, should: 4, scale: 'us' }).error).toBe('bad rating');
    expect(cleanReport({ ...base, should: 1.5 }).error).toBe('bad rating');
    expect(cleanReport({ ...base, should: 1, scale: 'metric' }).error).toBe('bad rating');
    expect(cleanReport(base).report).toMatchObject({ should: null, scale: null });
    expect(cleanReport({ ...base, kind: 'missing', should: 2 }).report).toMatchObject({ should: null });
    expect(cleanReport({ ...base, kind: 'wrong_name' }).ok).toBe(true);
    expect(cleanReport({ ...base, kind: 'no_connection' }).ok).toBe(true);
  });
});

describe('reports from newer phones', () => {
  it('keeps the install id, distance, run and spot only when well formed', () => {
    const ok = cleanReport({ resort: 'stowe', kind: 'missing', x: 1, y: 2, dev: 'ab'.repeat(16), near: 123.4, run: 12, lat: 44.123456789, lon: -72.8 }).report;
    expect(ok).toMatchObject({ dev: 'ab'.repeat(16), near: 123, run: 12, lat: 44.12346, lon: -72.8 });
    const bad = cleanReport({ resort: 'stowe', kind: 'missing', x: 1, y: 2, dev: 'me@example.com', near: -5, run: 1.5, lat: 200, lon: 0 }).report;
    expect(bad).toMatchObject({ dev: '', near: null, run: null, lat: null, lon: null });
    const old = cleanReport({ resort: 'stowe', kind: 'missing', x: 1, y: 2 }).report;
    expect(old).toMatchObject({ dev: '', near: null, run: null, lat: null, lon: null });
  });
});

describe('daily digest email', () => {
  const part = () => {
    const reports = [
      rep({ id: 11, kind: 'not_real', name: 'Lower Lord', text: 'No run here,\nonly trees', near: 40, run: 7, lat: 44.52, lon: -72.78, dev: 'a' }),
      rep({ id: 12, kind: 'missing', x: 400, y: 300, text: '' }),
      rep({ id: 13, kind: 'wrong_rating', name: 'Upper Lord', ref: '300000009', should: 3, scale: 'us', dev: 'b' }),
    ];
    return { resort: 'stowe', reports, problems: scoreProblems(reports, null, NOW), days: 12, maxId: 13 };
  };

  it('lists each new report with run, note, spot link, GPS distance and confidence', () => {
    const mail = buildDigest([part()], NOW);
    expect(mail.subject).toBe('SkiWithMe map reports: 3 new reports at 1 mountain (2026-11-24)');
    const t = mail.text;
    expect(t).toContain('== Stowe (stowe): 3 new reports ==');
    expect(t).toContain(appLink('stowe'));
    expect(t).toContain('1. Run does not exist: Lower Lord  [report #11, 2026-11-23 11:23 UTC]');
    expect(t).toContain('Note: "No run here, only trees"');
    expect(t).toContain('https://www.openstreetmap.org/?mlat=44.52000&mlon=-72.78000');
    expect(t).toContain('40 m from the spot when sent');
    expect(t).toContain('2. Run or lift missing (not on a named run)');
    expect(t).toContain('map position x 400 m, y 300 m');
    expect(t).toMatch(/Confidence: LOW \(score [\d.]+\)/);
    expect(t).toContain('Open problems at Stowe');
    expect(t).toContain('3. Wrong rating: Upper Lord');
    expect(t).toContain('   It should be: Double black');
    expect(t).toContain('Wrong rating: Upper Lord -> should be Double black');
    expect(t).toContain('It should be Double black: 1 phone says Double black');
  });

  it('is empty on a day with nothing new', () => {
    expect(buildDigest([], NOW)).toBeNull();
    expect(buildDigest([{ resort: 'stowe', reports: [], problems: [], days: 0 }], NOW)).toBeNull();
  });

  it('sends through Resend with the sign-in mail account, as weski-build, and fails loudly when refused', async () => {
    const calls = [];
    const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
    const cfg = { to: 'hello@builtbyroger.app', from: 'SkiWithMe <signin@builtbyroger.app>', key: 're_test' };
    await sendMail({}, cfg, { subject: 'Val d’Isère\nreports', text: 'Piste über Tignes' }, NOW, ok);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESEND_URL);
    expect(calls[0].init.headers).toMatchObject({ authorization: 'Bearer re_test', 'user-agent': 'weski-build' });
    expect(JSON.parse(calls[0].init.body)).toEqual({ from: cfg.from, to: ['hello@builtbyroger.app'], subject: 'Val d’Isère reports', text: 'Piste über Tignes' });
    await expect(sendMail({}, cfg, { subject: 's', text: 't' }, NOW, async () => ({ ok: false, status: 403 }))).rejects.toThrow('Resend answered 403');
  });
});

describe('daily digest job', () => {
  // stand-ins for the ResortLog Durable Objects
  function fakeEnv({ key = true } = {}) {
    const state = { due: new Map([['stowe', NOW - DAY]]), lastDay: null, sent: { stowe: 0 }, reports: { stowe: part() } };
    function part() { return [rep({ id: 1, dev: 'a' }), rep({ id: 2, dev: 'b' })]; }
    const index = {
      digestDue: async (today) => ({ sentToday: state.lastDay === today, resorts: [...state.due.keys()] }),
      digestDone: async (resorts, day, before) => { for (const r of resorts) if (state.due.get(r) <= before) state.due.delete(r); if (day) state.lastDay = day; },
    };
    const mountain = (id) => ({
      digestPart: async (now) => {
        const reports = state.reports[id].filter((r) => r.id > state.sent[id]);
        return { reports, problems: scoreProblems(state.reports[id], null, now), days: 0, maxId: reports.at(-1)?.id ?? state.sent[id] };
      },
      digestSent: async (maxId) => { state.sent[id] = Math.max(state.sent[id], maxId); },
    });
    const env = { REPORT_DIGEST_TO: 'hello@builtbyroger.app', MAIL_FROM: 'SkiWithMe <signin@builtbyroger.app>', ...(key ? { RESEND_API_KEY: 're_test' } : {}) };
    return { env, state, log: (_env, id) => (id === DIGEST_INDEX ? index : mountain(id)) };
  }

  it('does nothing at all without the Resend key or the sender', async () => {
    const { env, state, log } = fakeEnv({ key: false });
    const sent = [];
    expect(digestConfig(env)).toBeNull();
    expect((await runDigest(env, log, NOW, async (...a) => sent.push(a))).sent).toBe(false);
    expect(sent).toHaveLength(0);
    expect(state.due.size).toBe(1);          // reports wait for the first digest after it is switched on
    expect(digestConfig({ RESEND_API_KEY: 'k', REPORT_DIGEST_TO: 'a@x.app' })).toBeNull();
    expect(digestConfig({ RESEND_API_KEY: 'k', MAIL_FROM: 'f@x.app' })).toBeNull();
  });

  it('sends once, marks the reports as sent, and sends nothing twice', async () => {
    const { env, state, log } = fakeEnv();
    const sent = [];
    const send = async (_env, cfg, mail) => sent.push({ cfg, mail });
    expect(await runDigest(env, log, NOW, send)).toMatchObject({ sent: true, mountains: 1, reports: 2 });
    expect(sent[0].cfg).toEqual({ to: 'hello@builtbyroger.app', from: 'SkiWithMe <signin@builtbyroger.app>', key: 're_test' });
    expect(sent[0].mail.text).toContain('2 new reports');
    expect(state.sent.stowe).toBe(2);
    expect((await runDigest(env, log, NOW + 60e3, send)).why).toBe('already sent today');
    expect((await runDigest(env, log, NOW + DAY, send)).why).toBe('nothing new');
    expect(sent).toHaveLength(1);
  });

  it('the real sender goes through fetch (mocked here: Resend is never called)', async () => {
    const { env, state, log } = fakeEnv();
    const real = globalThis.fetch, calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
    try { expect((await runDigest(env, log, NOW)).sent).toBe(true); } finally { globalThis.fetch = real; }
    expect(calls.map((c) => c.url)).toEqual([RESEND_URL]);
    expect(state.sent.stowe).toBe(2);
  });

  it('keeps reports for tomorrow when sending fails', async () => {
    const { env, state, log } = fakeEnv();
    const refused = (env2, cfg, mail, now) => sendMail(env2, cfg, mail, now, async () => ({ ok: false, status: 422 }));
    await expect(runDigest(env, log, NOW, refused)).rejects.toThrow('Resend answered 422');
    expect(state.sent.stowe).toBe(0);
    expect(state.due.size).toBe(1);
    expect(state.lastDay).toBeNull();
  });
});

describe('daily email schedule', () => {
  it('both Worker configs run the MeteoSwiss step and the daily email, and the Worker tells them apart', async () => {
    const { readFileSync } = await import('node:fs');
    const cron = readFileSync('worker/index.js', 'utf8').match(/export const DIGEST_CRON = '([^']+)'/)?.[1];
    expect(cron).toBe('23 11 * * *');
    for (const f of ['wrangler.jsonc', 'wrangler.assets.jsonc']) {
      const crons = JSON.parse(readFileSync(f, 'utf8').match(/"crons":\s*(\[[^\]]*\])/)[1]);
      expect(crons).toContain('*/5 * * * *');
      expect(crons).toContain(cron);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { assess, assessAll, report, readState, gotWorse, trend, fmt, addDays } from '../tools/usage/assess.mjs';
import { limitsFor, PLANS } from '../tools/usage/limits.mjs';
import { fromCloudflare, fromWorker, r2Class } from '../tools/usage/collect.mjs';
import { publishAlert, publishWeekly } from '../tools/usage/github.mjs';
import { routeKey, count, flush, usageResponse, mailResponse, mimeText } from '../worker/usage.js';

const lim = (plan, id) => limitsFor(plan).find((l) => l.id === id);
/** n daily points ending the day before `today`, from `start` growing by `step` a day; plus a partial today. */
const days = (today, n, start, step, todayValue) => {
  const pts = Array.from({ length: n }, (_, i) => ({ date: addDays(today, i - n), value: start + i * step }));
  if (todayValue != null) pts.push({ date: today, value: todayValue });
  return pts;
};
const TODAY = '2026-11-23';

describe('trend and formatting', () => {
  it('fits a straight line', () => {
    expect(trend([1, 2, 3, 4]).slope).toBeCloseTo(1);
    expect(trend([5, 5]).slope).toBe(0);
  });
  it('rounds to readable numbers', () => {
    expect(fmt(72345, 'requests')).toBe('72,300');
    expect(fmt(4120000, 'requests')).toBe('4.12 million');
    expect(fmt(7.456, 'GB')).toBe('7.46 GB');
  });
});

describe('one limit', () => {
  it('daily Worker requests: the example from the owner\'s request', () => {
    // 54,000 rising by 3,000 a day to 72,000 yesterday; today's partial count is ignored
    const a = assess(lim('free', 'workers_requests'), days(TODAY, 7, 54000, 3000, 5000), TODAY);
    expect(a.current).toBe(72000);
    expect(Math.round(a.pct)).toBe(72);
    expect(a.days[100]).toBe(10);
    expect(a.days[90]).toBe(6);
    expect(a.level).toBe('urgent'); // the limit is reached within 14 days
    expect(a.advice).toContain('reached 72,000 requests a day (72% of the free 100,000 requests)');
    expect(a.advice).toContain('reach the limit in about 10 days');
    expect(a.advice).toContain('Workers Paid plan: $5 a month');
    expect(a.advice).toContain('Workers & Pages > Plans');
  });
  it('levels by share when not growing', () => {
    const at = (v) => assess(lim('free', 'do_requests'), days(TODAY, 7, v, 0), TODAY);
    expect(at(30000).level).toBe('ok');
    expect(at(30000).advice).not.toContain('Next step');
    expect(at(30000).advice).toContain('Not growing');
    expect(at(65000).level).toBe('notice');
    expect(at(85000).level).toBe('warning');
    expect(at(92000).level).toBe('urgent');
  });
  it('slow growth far from the limit stays quiet', () => {
    const a = assess(lim('free', 'workers_requests'), days(TODAY, 7, 10000, 100), TODAY);
    expect(a.level).toBe('ok');
    expect(a.days[70]).toBeGreaterThan(14);
  });
  it('monthly R2 reads on course to go over: warning with the cost', () => {
    // 22 full days of 500,000 reads: 11 million already; well over the 10 million
    const a = assess(lim('free', 'r2_class_b'), days(TODAY, 22, 500000, 0, 100000), TODAY);
    expect(a.level).toBe('urgent');
    expect(a.days[100]).toBe(0);
    expect(a.advice).toContain('so far this month');
    expect(a.advice).toContain('by 30 November');
    expect(a.advice).toMatch(/Going over would cost about \$\d/);
    // 300,000 a day: 6.6 million by the 22nd, 9 million by the 30th: notice only (projected 80% or more)
    const b = assess(lim('free', 'r2_class_b'), days(TODAY, 22, 300000, 0), TODAY);
    expect(b.level).toBe('notice');
    expect(Math.round(b.projectedPct)).toBe(90);
    // a month's allowance starts again on the 1st: early in the month, little is used
    const c = assess(lim('free', 'r2_class_b'), [{ date: '2026-12-01', value: 100000 }], '2026-12-02');
    expect(c.level).toBe('ok');
  });
  it('stored amounts use the latest reading', () => {
    const a = assess(lim('free', 'r2_storage'), days(TODAY, 7, 6, 0.1, 6.8), TODAY);
    expect(a.current).toBeCloseTo(6.8);
    expect(a.level).toBe('notice');
    expect(a.advice).toContain('stored (68% of the free 10.0 GB)');
    expect(a.days[90]).toBe(22);
  });
  it('the Paid plan reports the extra cost instead of an upgrade', () => {
    const a = assess(lim('paid', 'workers_requests'), days(TODAY, 22, 500000, 0), TODAY);
    expect(a.level).toBe('urgent');
    expect(a.advice).toContain('$0.30 per million');
    expect(a.advice).not.toContain('Move the Cloudflare account');
  });
  it('every limit has a source and a next step', () => {
    for (const l of [...PLANS.free, ...PLANS.paid, ...PLANS.both]) {
      expect(l.source, l.id).toBeTruthy();
      expect(l.next, l.id).toBeTruthy();
    }
  });
});

describe('the whole report', () => {
  const fake = (wr) => ({
    series: { workers_requests: days(TODAY, 7, wr, 0), r2_storage: days(TODAY, 7, 0.3, 0) },
    missing: { do_requests: 'Cloudflare refused the analytics read' },
    notes: ['a note'],
  });
  it('a figure Cloudflare will not give is a notice, so the owner fixes the token', () => {
    const r = assessAll(fake(1000), { today: TODAY });
    expect(r.level).toBe('notice');
    const md = report(r);
    expect(md).toContain('Not measured');
    expect(md).toContain('Token permission');
    expect(readState(md)).toMatchObject({ level: 'notice', rows: { workers_requests: 'ok', r2_storage: 'ok' } });
    expect(readState(md).rows.do_requests).toBeUndefined();
  });
  it('tells when something got worse', () => {
    const before = assessAll(fake(65000), { today: TODAY });
    const after = assessAll(fake(85000), { today: TODAY });
    expect(gotWorse(readState(report(before)), after)).toBe(true);
    expect(gotWorse(readState(report(after)), after)).toBe(false);
    expect(gotWorse(readState(report(after)), before)).toBe(false);
    expect(report(after)).toContain('**Warning**: Worker requests');
  });
});

/** A fake GitHub: issues and comments in memory. */
function fakeGitHub() {
  const issues = [], comments = [];
  const gh = async (method, path, body) => {
    if (path === '/labels') return null;
    if (method === 'GET' && path.startsWith('/issues?')) {
      const label = /labels=([^&]+)/.exec(path)[1];
      return issues.filter((i) => i.state === 'open' && i.labels.includes(label));
    }
    if (method === 'POST' && path === '/issues') { const i = { number: issues.length + 1, state: 'open', html_url: `u${issues.length + 1}`, ...body }; issues.push(i); return i; }
    const m = /^\/issues\/(\d+)(\/comments)?$/.exec(path);
    const issue = issues.find((i) => i.number === +m[1]);
    if (m[2]) { comments.push({ issue: issue.number, ...body }); return {}; }
    Object.assign(issue, body);
    return issue;
  };
  return { gh, issues, comments };
}

describe('the usage-alert issue', () => {
  const run = (wr) => { const r = assessAll({ series: { workers_requests: days(TODAY, 7, wr, 0) } }, { today: TODAY }); return [r, report(r)]; };
  it('opens, updates quietly, comments when worse, closes when fine', async () => {
    const { gh, issues, comments } = fakeGitHub();
    expect((await publishAlert(gh, ...run(10000))).action).toBe('none');
    expect((await publishAlert(gh, ...run(65000))).action).toBe('opened');
    expect(issues[0].title).toContain('Notice');
    expect(issues[0].labels).toEqual(['usage-alert']);
    const same = await publishAlert(gh, ...run(66000));
    expect(same).toMatchObject({ action: 'updated', worse: false });
    expect(comments).toHaveLength(0);
    const worse = await publishAlert(gh, ...run(85000));
    expect(worse).toMatchObject({ action: 'updated', worse: true });
    expect(comments[0].body).toContain('Got worse');
    expect(issues[0].title).toContain('Warning');
    expect((await publishAlert(gh, ...run(20000))).action).toBe('closed');
    expect(issues[0].state).toBe('closed');
    expect(comments[1].body).toContain('back under 60%');
  });
  it('the weekly summary goes on one standing issue', async () => {
    const { gh, issues, comments } = fakeGitHub();
    await publishWeekly(gh, ...run(10000));
    await publishWeekly(gh, ...run(10000));
    expect(issues).toHaveLength(1);
    expect(comments).toHaveLength(2);
  });
});

describe('reading Cloudflare', () => {
  it('classes R2 operations', () => {
    expect(r2Class('GetObject')).toBe('b');
    expect(r2Class('PutObject')).toBe('a');
    expect(r2Class('ListObjects')).toBe('a');
    expect(r2Class('DeleteObject')).toBe(null);
  });
  it('turns GraphQL rows into daily series, and a refused read into "not measured"', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    const answers = {
      workersInvocationsAdaptive: [
        { dimensions: { date: '2026-11-22', scriptName: 'skiwithme', status: 'success' }, sum: { requests: 990, cpuTimeUs: 1e6 } },
        { dimensions: { date: '2026-11-22', scriptName: 'skiwithme', status: 'exceededCpu' }, sum: { requests: 10, cpuTimeUs: 1e5 } },
        { dimensions: { date: '2026-11-22', scriptName: 'other', status: 'success' }, sum: { requests: 500, cpuTimeUs: 0 } },
      ],
      durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { date: '2026-11-22' }, sum: { requests: 100 } }],
      durableObjectsPeriodicGroups: [{ dimensions: { date: '2026-11-22' }, sum: { activeTime: 10e6, inboundWebsocketMsgCount: 200, rowsRead: 5, rowsWritten: 2 } }],
      r2OperationsAdaptiveGroups: [
        { dimensions: { date: '2026-11-22', actionType: 'GetObject' }, sum: { requests: 70 } },
        { dimensions: { date: '2026-11-22', actionType: 'PutObject' }, sum: { requests: 3 } },
        { dimensions: { date: '2026-11-22', actionType: 'DeleteObject' }, sum: { requests: 9 } },
      ],
      r2StorageAdaptiveGroups: [{ dimensions: { date: '2026-11-22', bucketName: 'm' }, max: { payloadSize: 2e9, metadataSize: 0 } }],
    };
    const fetchFn = async (url, init) => {
      const field = /accounts\(filter: \{accountTag: \$a\}\) \{ (\w+)/.exec(JSON.parse(init.body).query)[1];
      if (field === 'durableObjectsSqlStorageGroups') return new Response(JSON.stringify({ errors: [{ message: 'not authorized for that account' }] }), { status: 200 });
      return new Response(JSON.stringify({ data: { viewer: { accounts: [{ [field]: answers[field] }] } } }));
    };
    const out = await fromCloudflare({ today: TODAY, fetchFn });
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    expect(out.series.workers_requests).toEqual([{ date: '2026-11-22', value: 1500 }]);
    expect(out.series.workers_cpu[0].value).toBeCloseTo(1); // 10 of 1,000 stopped for CPU
    expect(out.series.do_requests[0].value).toBe(110); // 100 + 200 WebSocket messages / 20
    expect(out.series.do_duration[0].value).toBeCloseTo(1.28);
    expect(out.series.r2_class_a[0].value).toBe(3);
    expect(out.series.r2_class_b[0].value).toBe(70);
    expect(out.series.r2_storage[0].value).toBe(2);
    expect(out.missing.do_storage).toContain('Account Analytics: Read');
    expect(out.notes[0]).toContain('1,000 of the account\'s 1,500');
  });
  it('reads the Worker\'s own count', async () => {
    const fetchFn = async (url, init) => {
      expect(init.headers['x-admin-key']).toBe('k');
      return new Response(JSON.stringify({ days: { '2026-11-22': { 'out:resend': 4, 'req:map': 300 } } }));
    };
    const out = await fromWorker({ today: TODAY, app: 'https://x', secret: 'k', fetchFn });
    expect(out.series.resend_day).toEqual([{ date: '2026-11-22', value: 4 }]);
    expect(out.selfCount).toContainEqual(['Map files served (/data)', 300]);
    expect((await fromWorker({ today: TODAY, app: 'https://x', secret: '' })).error).toContain('USAGE_SECRET');
  });
});

describe('the Worker\'s own count', () => {
  it('names each kind of request', () => {
    expect(routeKey('/data/jay-peak/graph.json', 'GET')).toBe('req:graph');
    expect(routeKey('/data/jay-peak/resort.json', 'GET')).toBe('req:map');
    expect(routeKey('/api/groups', 'POST')).toBe('req:group-create');
    expect(routeKey('/api/groups/ABCDEF/ws', 'GET')).toBe('req:group-ws');
    expect(routeKey('/api/admin/usage', 'GET')).toBe(null);
    expect(routeKey('/index.html', 'GET')).toBe(null);
  });
  it('writes to the Durable Object at most once a minute', () => {
    const sent = [];
    const env = { ACCOUNTS: { idFromName: (n) => n, get: () => ({ addUsage: async (day, b) => sent.push([day, b]) }) } };
    const t0 = Date.now() + 120e3;
    count('req:map');
    expect(flush(env, null, { now: t0 })).toEqual({ 'req:map': 1 });
    count('req:map', 2);
    expect(flush(env, null, { now: t0 + 1000 })).toBe(null); // too soon: kept in memory
    expect(flush(env, null, { now: t0 + 61e3 })).toEqual({ 'req:map': 2 });
    expect(sent).toHaveLength(2);
  });
  const store = { usage: async (since) => ({ '2026-11-22': { 'req:map': 3 } }) };
  const env = (more) => ({ ACCOUNTS: { idFromName: (n) => n, get: () => store }, ...more });
  const req = (key, init = {}) => new Request('https://x/api/admin/usage', { ...init, headers: key ? { 'x-admin-key': key } : {} });
  it('the admin endpoint is hidden without the secret and refuses a wrong key', async () => {
    const url = new URL('https://x/api/admin/usage');
    expect((await usageResponse(req('a'), url, env({}))).status).toBe(404);
    expect((await usageResponse(req('wrong'), url, env({ USAGE_SECRET: 's' }))).status).toBe(401);
    const ok = await usageResponse(req('s'), url, env({ USAGE_SECRET: 's' }));
    expect(await ok.json()).toEqual({ days: { '2026-11-22': { 'req:map': 3 } } });
  });
  it('emails through the send_email binding only when it exists', async () => {
    const post = (key) => req(key, { method: 'POST', body: JSON.stringify({ subject: 'Hi\r\nBcc: x@y', text: 'line 1\nline 2' }) });
    expect((await mailResponse(post('s'), env({ USAGE_SECRET: 's' }))).status).toBe(404);
    const sent = [];
    class EmailMessage { constructor(from, to, raw) { Object.assign(this, { from, to, raw }); } }
    const res = await mailResponse(post('s'), env({ USAGE_SECRET: 's', USAGE_MAIL: { send: async (m) => sent.push(m) } }), { EmailMessage });
    expect(res.status).toBe(200);
    expect(sent[0].to).toBe('hello@builtbyroger.app');
    expect(sent[0].raw).toContain('Subject: Hi Bcc: x@y\r\n'); // no header can be slipped in
    expect(sent[0].raw).toContain('line 1\r\nline 2');
  });
  it('builds a plain-text email', () => {
    const raw = mimeText({ from: 'a@b.app', to: 'c@d.app', subject: 'S', text: 'T' });
    expect(raw).toMatch(/^From: SkiWithMe usage <a@b\.app>\r\nTo: c@d\.app\r\nSubject: S\r\n/);
    expect(raw).toContain('Message-ID: <');
    expect(raw.endsWith('\r\n\r\nT')).toBe(true);
  });
});

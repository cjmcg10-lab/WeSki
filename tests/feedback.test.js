import { describe, it, expect, vi } from 'vitest';
import { cleanFeedback, addFeedbackCounts, feedbackResponse, archiveExportResponse, FEEDBACK_PER_NETWORK_PER_DAY } from '../worker/calibration.js';
import { answerFeedback, feedbackAsked, flushFeedback, FEEDBACK_TAGS } from '../src/feedback.js';

const NOW = Date.UTC(2026, 10, 22, 18);
const valid = { resort: 'stowe', day: '2026-11-21', rating: 4, tags: ['powder', 'crowded'] };

const memory = () => {
  const map = new Map();
  return { get: (k, fallback) => (map.has(k) ? structuredClone(map.get(k)) : fallback), set: (k, v) => map.set(k, structuredClone(v)) };
};

describe('cleanFeedback', () => {
  it('accepts a rating with tags and keeps only the four fields', () => {
    const out = cleanFeedback({ ...valid, key: 'abc', lat: 44.5, time: '10:30', email: 'a@b.c' }, NOW);
    expect(out).toEqual({ ok: true, feedback: valid });
  });

  it('accepts a rating with no tags and drops repeated tags', () => {
    expect(cleanFeedback({ ...valid, tags: undefined }, NOW).feedback.tags).toEqual([]);
    expect(cleanFeedback({ ...valid, tags: ['icy', 'icy'] }, NOW).feedback.tags).toEqual(['icy']);
  });

  it.each([
    ['a rating of 0', { rating: 0 }, 'bad rating'],
    ['a rating of 6', { rating: 6 }, 'bad rating'],
    ['a fractional rating', { rating: 3.5 }, 'bad rating'],
    ['a rating sent as text', { rating: '4' }, 'bad rating'],
    ['an unknown tag', { tags: ['sunny'] }, 'bad tags'],
    ['tags that are not a list', { tags: 'icy' }, 'bad tags'],
    ['too many tags', { tags: [...FEEDBACK_TAGS, 'icy'] }, 'bad tags'],
    ['a date that does not exist', { day: '2026-02-30' }, 'bad day'],
    ['a date in the future', { day: '2026-11-25' }, 'bad day'],
    ['a date over 120 days ago', { day: '2026-06-01' }, 'bad day'],
    ['an unsafe mountain id', { resort: '../x' }, 'bad resort'],
  ])('refuses %s', (_name, over, error) => {
    expect(cleanFeedback({ ...valid, ...over }, NOW)).toEqual({ error });
  });

  it('refuses a missing or non-object body', () => {
    expect(cleanFeedback(null, NOW).error).toBe('bad body');
    expect(cleanFeedback('x', NOW).error).toBe('bad body');
  });
});

describe('addFeedbackCounts', () => {
  it('adds counts per rating and tag and never mutates the earlier row', () => {
    const first = addFeedbackCounts(null, { rating: 5, tags: ['powder'] });
    const second = addFeedbackCounts(first, { rating: 5, tags: ['powder', 'icy'] });
    expect(first).toEqual({ ratings: [0, 0, 0, 0, 1], tags: { powder: 1 } });
    expect(second).toEqual({ ratings: [0, 0, 0, 0, 2], tags: { powder: 2, icy: 1 } });
  });
});

function fakeEnv() {
  const calls = [];
  const log = { addFeedback: async (f, key) => { calls.push({ f, key }); return calls.length > FEEDBACK_PER_NETWORK_PER_DAY ? { error: 'too_many' } : { ok: true }; } };
  return { calls, env: { RESORTLOG: { idFromName: (n) => n, get: () => log } } };
}
const resolve = async (_env, id) => (id === 'stowe' || id === 'stowe-old' ? { id: 'stowe', place: {} } : null);
const post = (body, env, key = 'k1') => feedbackResponse(typeof body === 'string' ? body : JSON.stringify(body), env, key, { resolve, now: NOW });

describe('POST /api/feedback', () => {
  it('stores an answer under the listed mountain id and passes only the network key for the rate limit', async () => {
    const { env, calls } = fakeEnv();
    const res = await post({ ...valid, resort: 'stowe-old' }, env);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ f: { ...valid, resort: 'stowe' }, key: 'k1' }]);
  });

  it('answers 400 for a mountain that is not on the list and stores nothing', async () => {
    const { env, calls } = fakeEnv();
    expect((await post({ ...valid, resort: 'nowhere' }, env)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('answers 400 for an invalid body, for text that is not JSON and for an oversized body', async () => {
    const { env, calls } = fakeEnv();
    expect((await post({ ...valid, rating: 9 }, env)).status).toBe(400);
    expect((await post('{not json', env)).status).toBe(400);
    expect((await post(JSON.stringify({ ...valid, pad: 'x'.repeat(700) }), env)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('answers 429 once a network has sent too many in a day', async () => {
    const { env } = fakeEnv();
    let last;
    for (let i = 0; i <= FEEDBACK_PER_NETWORK_PER_DAY; i++) last = await post(valid, env);
    expect(last.status).toBe(429);
  });
});

describe('GET /api/forecast-archive/<id>', () => {
  const stubs = () => ({
    FORECASTHIST: { idFromName: (n) => n, get: () => ({ archive: async (since, limit) => [{ since, limit }], history: async () => ({ tz: 'x' }) }) },
    RESORTLOG: { idFromName: (n) => n, get: () => ({ feedback: async (day) => [{ day, ratings: [0, 0, 1, 0, 0], tags: {} }] }) },
  });
  const listed = async () => ({ id: 'stowe', place: { top: 1116, base: 399, tz: 'America/New_York', lat: 1 } });
  const call = (env, key, query = '') => archiveExportResponse(
    new Request('https://x.test/api/forecast-archive/stowe', { headers: key ? { 'x-admin-key': key } : {} }),
    new URL(`https://x.test/api/forecast-archive/stowe${query}`), 'stowe', env, { resolve: listed, now: NOW },
  );

  it('answers 404 when the secret is not set, even with a key', async () => {
    expect((await call(stubs(), 'anything')).status).toBe(404);
  });

  it('answers 401 for a missing or wrong key', async () => {
    const env = { ...stubs(), ARCHIVE_ADMIN_SECRET: 'right' };
    expect((await call(env, null)).status).toBe(401);
    expect((await call(env, 'wrong')).status).toBe(401);
  });

  it('exports the archive, the stored hours and the feedback with only the height and zone of the place', async () => {
    const env = { ...stubs(), ARCHIVE_ADMIN_SECRET: 'right' };
    const res = await call(env, 'right', `?since=${Date.UTC(2026, 10, 1)}&limit=5000`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 'stowe', place: { top: 1116, base: 399, tz: 'America/New_York' },
      archive: [{ since: Date.UTC(2026, 10, 1), limit: 200 }], history: { tz: 'x' }, feedback: [{ day: '2026-11-01', ratings: [0, 0, 1, 0, 0], tags: {} }],
    });
  });

  it('answers 404 for a mountain that is not listed', async () => {
    const env = { ...stubs(), ARCHIVE_ADMIN_SECRET: 'right' };
    const res = await archiveExportResponse(new Request('https://x.test/', { headers: { 'x-admin-key': 'right' } }), new URL('https://x.test/'), 'nowhere', env, { resolve: async () => null });
    expect(res.status).toBe(404);
  });
});

describe('the phone side', () => {
  it('asks once per mountain and day, whether the answer was sent or skipped', () => {
    const store = memory();
    expect(feedbackAsked(store, 'stowe', '2026-11-21')).toBe(false);
    answerFeedback(store, 'stowe', '2026-11-21', null);
    expect(feedbackAsked(store, 'stowe', '2026-11-21')).toBe(true);
    expect(feedbackAsked(store, 'stowe', '2026-11-22')).toBe(false);
    expect(feedbackAsked(store, 'killington', '2026-11-21')).toBe(false);
    expect(store.get('feedbackQueue', [])).toEqual([]);
  });

  it('queues a rating with only the known tags', () => {
    const store = memory();
    answerFeedback(store, 'stowe', '2026-11-21', { rating: 2, tags: ['icy', 'nonsense'] });
    expect(store.get('feedbackQueue', [])).toEqual([{ resort: 'stowe', day: '2026-11-21', rating: 2, tags: ['icy'] }]);
  });

  it('keeps answers queued while offline and sends them in order when back online', async () => {
    const store = memory();
    answerFeedback(store, 'stowe', '2026-11-20', { rating: 5, tags: [] });
    answerFeedback(store, 'stowe', '2026-11-21', { rating: 3, tags: ['windy'] });
    const offline = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await flushFeedback(store, offline)).toBe(0);
    expect(store.get('feedbackQueue', [])).toHaveLength(2);
    const sent = [];
    const online = async (body) => { sent.push(JSON.parse(body)); return { ok: true, status: 200 }; };
    expect(await flushFeedback(store, online)).toBe(2);
    expect(sent.map((s) => s.day)).toEqual(['2026-11-20', '2026-11-21']);
    expect(store.get('feedbackQueue', [])).toEqual([]);
  });

  it('drops an answer the server refused as invalid but keeps one it rate-limited, and stops at the first failure', async () => {
    const store = memory();
    for (const d of ['2026-11-18', '2026-11-19', '2026-11-20']) answerFeedback(store, 'stowe', d, { rating: 4, tags: [] });
    const statuses = [400, 429];
    const send = vi.fn(async () => ({ ok: false, status: statuses.shift() }));
    expect(await flushFeedback(store, send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.get('feedbackQueue', []).map((q) => q.day)).toEqual(['2026-11-19', '2026-11-20']);
  });
});

import { describe, it, expect } from 'vitest';
import { fromR2 } from '../worker/maps.js';

// a pretend R2 bucket: get() returns the object, or one without a body when the phone's copy is current
const bucket = (files) => ({
  async get(key, { onlyIf } = {}) {
    if (!(key in files)) return null;
    const httpEtag = `"${key.length}"`;
    if (onlyIf?.get?.('if-none-match') === httpEtag) return { httpEtag };
    return { httpEtag, body: files[key] };
  },
});
const req = (path, headers = {}) => [new Request(`https://x${path}`, { headers }), new URL(`https://x${path}`)];
const ids = new Set(['test-mtn']);

describe('map files from R2', () => {
  const env = { MAPS: bucket({ 'data/test-mtn/resort.json': '{"id":"test-mtn"}' }) };
  it('serves a listed resort from the bucket', async () => {
    const [q, u] = req('/data/test-mtn/resort.json');
    const r = await fromR2(q, env, u, ids);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/json');
    expect(await r.text()).toBe('{"id":"test-mtn"}');
  });
  it('answers 304 when the phone already has it', async () => {
    const [q, u] = req('/data/test-mtn/resort.json', { 'if-none-match': '"25"' });
    const r = await fromR2(q, env, u, ids);
    expect(r.status).toBe(304);
  });
  it('leaves other resorts, other paths and an unbound bucket to the static files', async () => {
    for (const p of ['/data/stowe/resort.json', '/data/index.json', '/api/me', '/data/test-mtn/../x.json']) {
      const [q, u] = req(p);
      expect(await fromR2(q, env, u, ids)).toBe(null);
    }
    const [q, u] = req('/data/test-mtn/resort.json');
    expect(await fromR2(q, {}, u, ids)).toBe(null);
  });
  it('404 for a missing file of a listed resort', async () => {
    const [q, u] = req('/data/test-mtn/surround.bin');
    expect((await fromR2(q, env, u, ids)).status).toBe(404);
  });
});

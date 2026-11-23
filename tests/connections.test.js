// Runs and lifts stay joined the way directions use them (tools/check_connections.py).
// Each mountain checked here has an allow-list in tests/fixtures/connections/<id>.json: the problems known when it
// was last rebuilt and looked at, each with the reason it is left. A rebuild that adds a new run no lift reaches, a new
// dead end, a lift cut off from the rest, a lift end with no run, a ski join that climbs, or a run drawn twice on the
// same ground ("doubled": one run mapped twice, or a hand-drawn run OpenStreetMap now maps too) fails here.
// Update an allow-list only after looking at the new problem on the map (and say why in its "why").
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = 'tests/fixtures/connections';
const GUARDED = ['unreachable', 'dead_end', 'outside_core', 'lift_end', 'uphill', 'doubled'];
// maps kept in R2 are only checked where they have been downloaded (node tools/maps_r2.mjs pull --all)
const ids = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  .filter((id) => existsSync(`public/data/${id}/resort.json`));

describe('connections', () => {
  let found = {};
  if (ids.length) {
    const tmp = mkdtempSync(join(tmpdir(), 'conn-'));
    try {
      execFileSync('python3', ['tools/check_connections.py', ...ids, '--quiet', '--json', join(tmp, 'c.json')], { stdio: 'ignore' });
      found = JSON.parse(readFileSync(join(tmp, 'c.json'), 'utf8'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  it.skipIf(!ids.length)('the checker ran on every mountain with an allow-list', () => {
    expect(Object.keys(found).sort()).toEqual([...ids].sort());
  });
  for (const id of ids) {
    it(`${id}: no new connection problems`, () => {
      const allow = JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));
      const fresh = [];
      for (const k of GUARDED) for (const p of found[id][k]) if (!(allow[k] || {})[p]) fresh.push(`${k}: ${p}`);
      expect(fresh).toEqual([]);
    });
  }
});

// The "doubled" check itself, on a made-up map: a 300 m run, a copy of it 6 m to the side (drawn twice: listed), a
// run 40 m away (a separate run: not listed).
describe('connections: doubled runs', () => {
  it('lists a run drawn twice and leaves a separate run alone', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dbl-'));
    try {
      const line = (dx, name, id) => {
        const pts = [];
        for (let y = 300; y >= 0; y -= 10) pts.push(100 + dx, y);
        return { id, name, d: 1, len: 300, pts };
      };
      // ...and a hand-drawn copy of Side Street 200 m away: the same name as an OpenStreetMap run, so drawn twice
      const trails = [line(0, 'Main Street', 0), line(6, 'Main Street Copy', 1), line(40, 'Side Street', 2),
        { ...line(240, 'Side Street', 3), traced: true }];
      const nodes = [[100, 300, 300], [100, 0, 0], [106, 300, 300], [106, 0, 0], [140, 300, 300], [140, 0, 0], [340, 300, 300], [340, 0, 0]];
      const edges = trails.map((t, i) => ({ a: 2 * i, b: 2 * i + 1, k: 'p', r: i, len: 300, pts: t.pts }));
      mkdirSync(join(tmp, 'fake'));
      writeFileSync(join(tmp, 'fake', 'resort.json'), JSON.stringify({ trails, lifts: [], pois: [], graph: { nodes, edges } }));
      execFileSync('python3', ['tools/check_connections.py', 'fake', '--data', tmp, '--quiet', '--json', join(tmp, 'c.json')], { stdio: 'ignore' });
      const out = JSON.parse(readFileSync(join(tmp, 'c.json'), 'utf8')).fake;
      expect(out.doubled.sort()).toEqual(['Main Street ~ Main Street Copy', 'Side Street ~ Side Street']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

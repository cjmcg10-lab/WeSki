// Runs and lifts stay joined the way directions use them (tools/check_connections.py).
// Each mountain checked here has an allow-list in tests/fixtures/connections/<id>.json: the problems known when it
// was last rebuilt and looked at, each with the reason it is left. A rebuild that adds a new run no lift reaches, a new
// dead end, a lift cut off from the rest, a lift end with no run, or a ski join that climbs fails here.
// Update an allow-list only after looking at the new problem on the map (and say why in its "why").
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = 'tests/fixtures/connections';
const GUARDED = ['unreachable', 'dead_end', 'outside_core', 'lift_end', 'uphill'];
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

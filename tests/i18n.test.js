import { describe, it, expect } from 'vitest';
import EN from '../src/i18n/en.js';
import { LANGS, t, trText, useTable } from '../src/i18n.js';
import { placeTr } from '../src/placenames.js';

const holes = (s) => [...String(s).matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join(',');

describe('translations', () => {
  for (const [code] of LANGS.filter(([c]) => c !== 'en')) {
    it(`${code}: every entry matches an English one and keeps its {0} {1} slots`, async () => {
      const tbl = (await import(`../src/i18n/${code}.js`)).default;
      const bad = [];
      for (const [id, tr] of Object.entries(tbl)) {
        if (!(id in EN)) bad.push(`${id}: no English entry`);
        else if (holes(tr) !== holes(EN[id])) bad.push(`${id}: slots ${holes(tr)} vs ${holes(EN[id])}`);
      }
      expect(bad).toEqual([]);
      const missing = Object.keys(EN).filter((id) => !(id in tbl));
      expect(missing.length).toBeLessThan(10);
    });
  }
  it('translates whole phrases, patterns and pieces', async () => {
    useTable('es', (await import('../src/i18n/es.js')).default);
    expect(t('Directions to {0}', 'Bob')).toBe('Cómo llegar a Bob');
    expect(trText('Use my location')).toBe('Usar mi ubicación');
    expect(trText('  Directions to Lift 7 ')).toBe('  Cómo llegar a Lift 7 ');
    expect(trText('Live · updated just now · on a lift')).toBe('En directo · actualizado ahora mismo · en un remonte');
    expect(trText('Upper Northway')).toBe('Upper Northway');
    useTable('en', null);
    expect(t('Directions to {0}', 'Bob')).toBe('Directions to Bob');
  });
});

describe('place names', () => {
  it('translates the common words and leaves the name', () => {
    expect(placeTr('Talstation Furi', 'en')).toBe('Bottom station Furi');
    expect(placeTr('Gandegghütte', 'en')).toBe('Gandegg Hut');
    expect(placeTr('Refuge de Caron', 'de')).toBe('Hütte von Caron');
    expect(placeTr('Two Elk Lodge', 'de')).toBe('Two Elk Hütte');
  });
  it('adds nothing when the reader already understands it', () => {
    expect(placeTr('Golden Peak Lodge', 'en')).toBe(null);
    expect(placeTr('Talstation Furi', 'de')).toBe(null);
    expect(placeTr('Westendorf', 'en')).toBe(null);
    expect(placeTr('Chalet du Yéti', 'en')).toBe(null);
  });
});

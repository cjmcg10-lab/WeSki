import { describe, it, expect, vi } from 'vitest';

const store = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
vi.stubGlobal('window', { addEventListener: () => {} });
vi.stubGlobal('document', { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [] });
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline in this test')));

const hill = (id) => ({ id, name: id, region: 'Vermont', country: 'United States', tz: 'America/New_York', lat: 44.5, lon: -72.8, baseLat: 44.5, baseLon: -72.8, top: 900, base: 400 });
store.set('weski:fcList', JSON.stringify([hill('alpha'), hill('beta')]));

const { init, sheetCalendar, onClick, sheetEdit } = await import('../src/forecast/ui.js');
const host = { sheet: () => 'forecast', open: () => {}, render: () => {}, announce: () => {} };
const click = (act, extra = {}) => onClick({ dataset: { act, ...extra } });

describe('leaving the edit screen after removing every mountain', () => {
  it('shows the empty-list prompt, not an empty calendar', () => {
    init(host);
    expect(sheetCalendar()[1]).not.toContain('fc-empty');
    click('fc-edit');
    sheetEdit();
    click('fc-remove', { r: 'alpha' });
    click('fc-remove', { r: 'beta' });
    click('fc-home');
    expect(sheetCalendar()[1]).toContain('fc-empty');
  });
});

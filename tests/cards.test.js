import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Every built mountain's picture in the app is its mountain card, made from our own 3D map by
// tools/mountain_cards.mjs (tools/pipeline.py runs it after a build). A new mountain without one fails here:
// run `PW_CHROMIUM=/opt/pw-browsers/chromium node tools/mountain_cards.mjs --missing` and commit public/photos.
const dir = new URL('../public/photos/', import.meta.url);
const built = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'));
const cards = JSON.parse(readFileSync(new URL('cards.json', dir), 'utf8'));

/** Width and height of a JPEG, from its start-of-frame marker. */
function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

describe('mountain cards', () => {
  it('every built mountain has a card, at both sizes', () => {
    const none = built.filter((r) => !cards[r.id]).map((r) => r.id);
    expect(none, `no card for ${none.join(', ')}: node tools/mountain_cards.mjs --missing`).toEqual([]);
    for (const r of built) {
      for (const [f, w, h] of [[`${r.id}.jpg`, 768, 360], [`${r.id}-s.jpg`, 208, 112]]) {
        const p = new URL(f, dir);
        expect(existsSync(p), `public/photos/${f} is missing`).toBe(true);
        expect(jpegSize(readFileSync(p)), `public/photos/${f} has the wrong size`).toEqual([w, h]);
      }
    }
  });

  it('holds only cards of built mountains (no left-over photos)', () => {
    const ids = new Set(built.map((r) => r.id));
    expect(Object.keys(cards).filter((id) => !ids.has(id))).toEqual([]);
    const stray = readdirSync(dir).filter((f) => f !== 'cards.json' && !(f.endsWith('.jpg') && ids.has(f.replace(/(-s)?\.jpg$/, ''))));
    expect(stray).toEqual([]);
  });
});

// The app's language. Every English phrase the app shows has a number in i18n/en.js; each other
// language is a file with the same numbers (i18n/<code>.js), loaded only when picked. Anything
// missing in a language falls back to English.
//
// Two ways text gets translated:
//  - t('Directions to {0}', name) in code, for words that never reach the page as HTML
//    (map labels, spoken directions, pop-up questions);
//  - everything put on the page is translated as it appears: a watcher looks at each new piece
//    of text and swaps it when it is a known phrase, or matches a known pattern such as
//    "{0} runs · {1}". Names of runs, lifts and people never match, so they stay as they are.
import EN, { CODE_ONLY } from './i18n/en.js';
import { prefs } from './store.js';

export const LANGS = [
  ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'],
  ['pt', 'Português'], ['nl', 'Nederlands'], ['ja', '日本語'], ['ko', '한국어'], ['zh', '中文（简体）'],
];
const LOADERS = {
  es: () => import('./i18n/es.js'), fr: () => import('./i18n/fr.js'), de: () => import('./i18n/de.js'),
  it: () => import('./i18n/it.js'), pt: () => import('./i18n/pt.js'), nl: () => import('./i18n/nl.js'),
  ja: () => import('./i18n/ja.js'), ko: () => import('./i18n/ko.js'), zh: () => import('./i18n/zh.js'),
};
const SPEECH = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN' };

const BY_TEXT = new Map(Object.entries(EN).map(([id, s]) => [s, +id]));
let lang = 'en', table = null;          // table: id -> translation for the current language
let exact = new Map(), patterns = [];
const listeners = new Set();

/** The language to start with: the saved choice, else the phone's language if we have it. */
export function initialLang() {
  const saved = prefs.get('lang', null);
  if (saved && (saved === 'en' || LOADERS[saved])) return saved;
  for (const l of (typeof navigator !== 'undefined' && navigator.languages) || []) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (c === 'en' || LOADERS[c]) return c;
  }
  return 'en';
}
export const getLang = () => lang;
export const speechLang = () => SPEECH[lang] || 'en-US';
export const onLangChange = (fn) => listeners.add(fn);

/** Switch language (loads its file first). Translates what is already on screen. */
export async function setLang(code, save = true) {
  if (code !== 'en' && !LOADERS[code]) code = 'en';
  const next = code === 'en' ? null : (await LOADERS[code]()).default;
  lang = code; table = next;
  if (save) prefs.set('lang', code);
  build();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    if (observer) retranslate(document.body);
  }
  for (const fn of listeners) fn(code);
}

/** For tests: use a language table directly. */
export function useTable(code, tbl) { lang = code; table = tbl; build(); if (observer) retranslate(document.body); for (const fn of listeners) fn(code); }

function build() {
  exact = new Map(); patterns = [];
  if (!table) return;
  for (const [id, en] of Object.entries(EN)) {
    const tr = table[id];
    if (tr == null || tr === '') continue;
    if (/\{\d\}/.test(en)) {
      if (CODE_ONLY.some(([a, b]) => id >= a && id <= b)) continue;
      const parts = en.split(/\{(\d)\}/);
      let src = '^', order = [];
      for (let i = 0; i < parts.length; i++) {
        if (i % 2) { src += '(.+?)'; order.push(+parts[i]); } else src += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      const lit = parts.filter((_, i) => i % 2 === 0).join('').length;
      if (lit >= 2) patterns.push({ re: new RegExp(src + '$', 's'), order, tr, lit });
    } else exact.set(en, tr);
  }
  patterns.sort((a, b) => b.lit - a.lit);
}

const fill = (s, args) => s.replace(/\{(\d)\}/g, (m, i) => (args[+i] ?? ''));

/** Translate an English phrase from en.js, filling {0}, {1}… with the arguments. */
export function t(en, ...args) {
  if (table) {
    const id = BY_TEXT.get(en);
    const tr = id != null ? table[id] : null;
    if (tr) return fill(tr, args);
  }
  return fill(en, args);
}

function one(core) {
  let out = exact.get(core);
  if (out != null) return out;
  for (const p of patterns) {
    if (core.length < p.lit) continue;
    const m = p.re.exec(core);
    if (!m) continue;
    if (m.slice(1).some((v) => /(^|\s)· |[.!?]\s+[A-Z][a-z]{2,}\s/.test(v))) continue;   // a pattern never swallows " · " pieces or sentences
    const vals = [];
    p.order.forEach((n, i) => { const v = m[i + 1]; vals[n] = exact.get(v.trim()) ?? v; });
    return fill(p.tr, vals);
  }
  return null;
}
/** Each part of "a · b · c", or each sentence, on its own (for text the app builds from pieces). */
function parts(core, sep, re) {
  const bits = core.split(re).map((b) => b.trim()).filter(Boolean);
  if (bits.length < 2) return null;
  let hit = 0;
  const out = [];
  for (let i = 0; i < bits.length;) {
    let done = false;
    for (let j = bits.length; j > i && !done; j--) {        // longest run of pieces that is a known phrase
      const x = j === i + 1 ? one(bits[i]) : exact.get(bits.slice(i, j).join(sep));   // patterns never span pieces
      if (x != null) { out.push(x); hit++; i = j; done = true; }
    }
    if (!done) out.push(bits[i++]);
  }
  return hit ? out.join(sep) : null;
}

/** Translate a piece of text as it appears on the page (exact phrase, pattern, or its parts). */
export function trText(s) {
  if (!table || !s) return s;
  const core = s.trim();
  if (!core || !/[A-Za-z]/.test(core)) return s;
  const pre = core.match(/^[—·•]\s+/)?.[0];
  if (pre) { const rest = trText(core.slice(pre.length)); return rest === core.slice(pre.length) ? s : s.replace(core, pre + rest); }
  let out = one(core);
  if (out == null) out = parts(core, ' · ', / · /);
  if (out == null) out = parts(core, ' ', /(?<=[.!?])\s+/);
  if (out == null) return s;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  return lead + out + trail;
}

// ---------- the page watcher
const ORIG = new WeakMap();      // text node -> its English text
const MINE = new WeakMap();      // text node -> what we last wrote into it
const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'svg', 'SVG', 'CANVAS']);
let observer = null;

function skip(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
    if (SKIP.has(e.nodeName) || e.getAttribute('translate') === 'no') return true;
  }
  return false;
}
function doText(n) {
  if (MINE.get(n) === n.data) { if (!table) { n.data = ORIG.get(n); MINE.delete(n); } else if (ORIG.has(n)) { const tr = trText(ORIG.get(n)); if (tr !== n.data) { n.data = tr; MINE.set(n, tr); } } return; }
  ORIG.set(n, n.data);
  if (!table || !n.parentNode || skip(n.parentNode)) return;
  const tr = trText(n.data);
  if (tr !== n.data) { n.data = tr; MINE.set(n, tr); }
}
function doAttrs(el) {
  if (!el.getAttribute || skip(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const key = 'i18n' + a.replace(/-/g, ''), cur = el.getAttribute(a);
    if (el.dataset[key + 'Out'] !== cur) el.dataset[key] = cur;     // new English from the app
    const tr = table ? trText(el.dataset[key]) : el.dataset[key];
    if (tr !== cur) el.setAttribute(a, tr);
    el.dataset[key + 'Out'] = tr;
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.nodeName) || n.getAttribute('translate') === 'no') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}
function retranslate(root) { walk(root); }

/** Start translating the page as the app changes it. */
export function watchPage() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}

// for checking translations from the browser console
if (typeof window !== 'undefined') window.skiwithmeI18n = { useTable, trText, setLang };

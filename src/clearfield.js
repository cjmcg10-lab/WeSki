// A clear (X) button in every text field the app shows (owner's request, 2026-11-23).
// One watcher adds it to every text-like <input> and <textarea> as it appears on the page, wherever it was built
// (index.html, the panels in main.js, the Forecast screens), so no screen needs its own code for it.
// The X shows only while the field has text. Tapping it empties the field, sends the same "input" event typing
// would (so search results reset), and keeps the field focused so the keyboard stays up for a new search.
// A field can opt out with data-noclear.

const TEXTLIKE = new Set(['', 'text', 'search', 'email', 'tel', 'url']);
const X_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** True for the fields that get an X: text-like inputs and text areas, never switches, sliders, dates or numbers. */
export function wantsClear(el) {
  if (!el || el.dataset?.noclear != null || el.closest?.('.clr')) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return TEXTLIKE.has((el.getAttribute('type') || '').toLowerCase());
}

/** Put one field inside a wrapper with its X button. */
function addClear(el) {
  const wrap = document.createElement('span');
  wrap.className = 'clr' + (el.tagName === 'TEXTAREA' ? ' area' : '') + (el.closest('label.search') ? ' in-search' : '');
  const had = document.activeElement === el;
  el.replaceWith(wrap);
  wrap.appendChild(el);
  if (had) el.focus({ preventScroll: true });   // moving a field drops its focus
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'clr-x';
  b.tabIndex = -1;                       // the keyboard's own delete does the same; keep Tab moving between fields
  b.setAttribute('aria-label', 'Clear the text');
  b.innerHTML = `<i>${X_SVG}</i>`;
  wrap.appendChild(b);
  syncClear(el);
}

/** Show the X only while the field has text. */
export function syncClear(el) {
  const wrap = el?.parentNode;
  if (wrap?.classList?.contains('clr')) wrap.classList.toggle('has-val', !!el.value);
}

/** Add X buttons to the fields under root now (the watcher does it too, a moment later). */
export function scan(root) {
  if (root?.nodeType !== 1) return;
  if (wantsClear(root)) addClear(root);
  for (const el of root.querySelectorAll('input, textarea')) if (wantsClear(el)) addClear(el);
}

/** Empty the field next to an X, keep it focused and tell the app as if the person had deleted the text. */
export function clearField(b) {
  const el = b.parentNode.querySelector('input, textarea');
  if (!el) return;
  el.value = '';
  el.focus({ preventScroll: true });
  el.dispatchEvent(new Event('input', { bubbles: true }));
  syncClear(el);
}

let started = false;
/** Start watching the page for fields. */
export function watchClearButtons(doc = document) {
  if (started) return;
  started = true;
  scan(doc.body);
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) scan(n); })
    .observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener('input', (e) => syncClear(e.target), true);
  doc.addEventListener('focusin', (e) => syncClear(e.target));     // catches values the app set in code
  // pressing the X must not take focus from the field (that would close the phone's keyboard)
  const keep = (e) => { if (e.target.closest?.('.clr-x')) e.preventDefault(); };
  doc.addEventListener('pointerdown', keep, true);
  doc.addEventListener('mousedown', keep, true);
  doc.addEventListener('click', (e) => {
    const b = e.target.closest?.('.clr-x');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    clearField(b);
  }, true);
}

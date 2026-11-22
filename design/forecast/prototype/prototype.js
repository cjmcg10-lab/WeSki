/* PROTOTYPE — design artifact from /sdlc:generate-ux. Not production code.
   Implementation is produced by /sdlc:generate-code from ux-prd.md. */

/* Draws the phone frame, the seven Forecast screens and the "Prototype states" panel.
   All data comes from mock/data.js (fixtures). Nothing is fetched and nothing is saved. */
(function () {
  'use strict';

  const M = window.FC_MOCK;
  const STATES = ['default', 'loading', 'empty', 'error', 'partial', 'offline', 'no-permission'];
  const SCREENS = {
    s1: { label: 'Forecast', name: 'S1 Forecast', file: 's1-forecast.html' },
    s2: { label: 'Day view', name: 'S2 Day view', file: 's2-day-view.html' },
    s3: { label: 'Add a mountain', name: 'S3 Add a mountain', file: 's3-add-a-mountain.html' },
    s4: { label: 'Drop a pin', name: 'S4 Drop a pin', file: 's4-drop-a-pin.html' },
    s5: { label: 'Edit list', name: 'S5 Edit list', file: 's5-edit-list.html' },
    s6: { label: 'Plan a trip', name: 'S6 Plan a trip', file: 's6-plan-a-trip.html' },
    s7: { label: 'How scores work', name: 'S7 How scores work', file: 's7-how-scores-work.html' },
    wx: { label: 'Mountain weather' },
    host: { label: 'Section' }
  };
  // What each state shows, and the stated reason where a state cannot occur.
  const STATE_NOTES = {
    s1: {
      default: 'Six fixture mountains, nine days. Look for the Closed day (Cannon, Monday), Insufficient data (Niseko, Wednesday; Burklyn Hill today, too few hours with data), "Under 3 h of data" (Cannon, today), "Day over" (Niseko, today), the Pinned mountain and Cardrona (New Zealand, out of season: closed every day). Panel option "Refresh fails" shows the failed-Refresh line.',
      loading: 'Mountain names show at once; score cells are placeholders. Tapping a cell opens the day view in its loading state.',
      empty: 'No mountains on the list yet.',
      error: 'No forecast could be loaded. The first "Try again" fails again (to show that wording); the second recovers.',
      partial: 'Burke Mountain failed to load (Try again: fails once, then loads). Cannon Mountain shows a stale forecast ("As of 3 h ago"). Refresh before the retry ends with "Updated. 1 mountain couldn\'t load."',
      offline: 'Saved forecasts show; the pin was never loaded on this phone so its cells read "Offline".',
      'no-permission': 'Cannot occur: the calendar needs no device permission and no sign-in. Showing default.'
    },
    s2: {
      default: 'Hourly detail (today and tomorrow). Step forward to see time blocks (days 3–5) and a range (days 6–9).',
      loading: 'Opened here, the score from the calendar cell shows at once and the detail is loading. Opened from a loading calendar cell (S1 in loading), the score is a placeholder too.',
      empty: 'The Closed variant. (Insufficient data: open Niseko Hirafu, Wednesday, in the default state.)',
      error: 'Refresh failed; the saved forecast still shows. Opened from a "–" cell on the calendar in its error state, or on the pin\'s day, nothing is saved and only "Try again" shows.',
      partial: 'Stale forecast, two ski hours with no forecast, and a summit value that is not in the forecast.',
      offline: 'Saved forecast with an offline banner. Cannon Mountain, Sunday: score saved but no hourly detail. The pin\'s day: nothing saved.',
      'no-permission': 'Cannot occur: the day view needs no device permission and no sign-in. Showing default.'
    },
    s3: {
      default: 'SkiWithMe mountains and "Near you" show before you type. Type to search (try "jay", "snow", "franconia", "paradiski", "cardrona").',
      loading: 'The worldwide list is still loading; only SkiWithMe mountains are searched.',
      empty: 'No mountain matches the search.',
      error: 'The worldwide list failed to load. Tap Add on any row to see the could-not-save message under that row; "Try again" fails once more, then saves.',
      partial: 'The worldwide list is partly loaded.',
      offline: 'Offline. Both wordings are shown: list saved on the phone, and list not saved.',
      'no-permission': 'Cannot occur: search asks for no device permission. Showing default.'
    },
    s4: {
      default: 'Move the map with the arrow buttons or keyboard arrows, name the mountain, save.',
      loading: 'Map and elevation are loading.',
      empty: 'The place search found nothing.',
      error: 'The map could not load; coordinates are open. Saving also fails in this state: twice, then it saves.',
      partial: 'Only part of the map loaded and the elevation is unknown.',
      offline: 'Offline: no map, coordinates are open.',
      'no-permission': 'Location is turned off for the site, so "Use my location" cannot centre the map.'
    },
    s5: {
      default: 'Reorder with Move up and Move down, remove, undo in place. Undo rows stay until Forecast is closed. Remove every mountain and go back: the calendar still offers "Edit list".',
      loading: 'Cannot occur: the list is read from the phone in one step, before the screen draws. Showing default.',
      empty: 'The list is empty.',
      error: 'Changes could not be saved on the phone.',
      partial: 'One saved mountain is no longer in the worldwide list.',
      offline: 'Works the same offline: the list lives on the phone. No banner by design.',
      'no-permission': 'Cannot occur: editing the list needs no device permission. Showing default.'
    },
    s6: {
      default: 'Pick days; mountains are ranked for just those days, on their open days only. Cannon Mountain is closed one day ("Coverage 3 of 4 days · 1 closed"); Cardrona is closed on all of them and is listed last. "Later dates" opens From and To date fields.',
      loading: 'Scores for the picked days are loading.',
      empty: 'No days picked. (Fewer than two mountains, and dates beyond range, are also designed: remove mountains or use Later dates.)',
      error: 'Scores could not be loaded. The first "Try again" fails again; the second recovers.',
      partial: 'Burke Mountain failed (Try again: fails once, then loads); Cannon Mountain is stale.',
      offline: 'Ranking from saved forecasts.',
      'no-permission': 'Cannot occur: the trip planner needs no device permission. Showing default.'
    },
    s7: {
      default: 'The explainer. Each section opens and closes.',
      loading: 'Cannot occur: the text ships with the app. Showing default.',
      empty: 'Cannot occur: the text is fixed and never empty. Showing default.',
      error: 'Cannot occur: nothing is loaded, so nothing can fail. Showing default.',
      partial: 'Designed variant: the "Detail by distance" section leaves out days 10 to 15 until phase 7. That is what default shows.',
      offline: 'Works the same offline: the text ships with the app.',
      'no-permission': 'Cannot occur: the explainer needs no device permission. Showing default.'
    }
  };

  const qs = new URLSearchParams(location.search);
  const root = document.body.getAttribute('data-root') || '';
  const app = {
    theme: qs.get('theme') === 'light' ? 'light' : 'dark',
    pstate: STATES.indexOf(qs.get('state')) >= 0 ? qs.get('state') : 'default',
    bg: 'map', stack: [], opener: 'tab-forecast', hpos: 0, noHist: false,
    units: 'imp', sortCol: null, lastSort: 0, cell: { r: 0, c: 0 }, block: 'morning',
    q: '', sessionAdded: {}, saveFail: {}, edit: null, retried: {}, tries: {}, gone: 'row', wxAdded: false, wxFail: 0, wxNote: '', highlight: null, hlNew: false, refreshOut: null, refreshFails: false,
    pin: null, draft: null, later: { open: false, from: '', to: '' }, open7: { 0: true }, proMsg: '', s1Keep: null, alerted: ''
  };
  function resetFixtures() {
    app.mountains = JSON.parse(JSON.stringify(M.mountains));
    app.watch = M.watchlist.slice();
    app.tripDays = M.tripDays.slice();
    app.sortCol = null; app.cell = { r: 0, c: 0 }; app.q = ''; app.sessionAdded = {}; app.saveFail = {}; app.edit = null;
    app.retried = {}; app.tries = {}; app.gone = 'row'; app.wxAdded = false; app.wxFail = 0; app.refreshOut = null; app.wxNote = ''; app.units = 'imp';
    app.later = { open: false, from: '', to: '' }; app.draft = null; app.pin = null; app.s1Keep = null;
  }
  resetFixtures();

  /* ---------- small helpers ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.prototype.slice.call((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D0 = new Date(M.today + 'T12:00:00Z');
  const dateAt = (i) => new Date(D0.getTime() + i * 864e5);
  const fmt = (i, o) => new Intl.DateTimeFormat(M.locale, Object.assign({ timeZone: 'UTC' }, o)).format(dateAt(i));
  const longDate = (i) => fmt(i, { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDate = (i) => fmt(i, { weekday: 'short', month: 'short', day: 'numeric' });
  const wkday = (i) => fmt(i, { weekday: 'short' });
  const fmtHour = (h) => new Intl.DateTimeFormat(M.locale, { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, h)));
  const range = (a, b) => fmtHour(a) + '–' + fmtHour(b);
  const spoken = (a, b) => fmtHour(a) + ' to ' + fmtHour(b);
  // A time span or score range: the dash form is for the eye, the "to" form is what is read aloud.
  const rangeHTML = (a, b) => `<span aria-hidden="true">${range(a, b)}</span><span class="sr">${spoken(a, b)}</span>`;
  const nowIn = (tz) => new Intl.DateTimeFormat(M.locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(M.now));
  const updatedAt = () => nowIn(M.phoneTz);
  function zoneOf(tz) {
    const p = new Intl.DateTimeFormat(M.locale, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(M.now));
    const z = p.filter((x) => x.type === 'timeZoneName')[0];
    return z ? z.value : tz;
  }
  const num = (n) => new Intl.NumberFormat(M.locale).format(n);
  // One whole sentence per engine code (mock/data.js "text"); {h: 12} parameters are hours.
  function tx(x) {
    if (x == null) return '';
    if (typeof x === 'string') x = { code: x, args: [] };
    const t = M.text[x.code] || x.code;
    return t.replace(/\{(\d)\}/g, (_, i) => { const a = (x.args || [])[+i]; return a && a.h != null ? fmtHour(a.h) : a && a.mo != null ? monthName(a.mo) : String(a); });
  }
  // {mo: 6} parameters are months (1–12), named in the phone's language.
  function monthName(mo) { return new Intl.DateTimeFormat(M.locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, mo - 1, 15))); }
  // A list of dates ("Fri 4, Sun 6 and Tue 8") is joined by the language's own list rule, never by a comma in code.
  const listOf = (arr) => (typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(M.locale, { style: 'long', type: 'conjunction' }).format(arr) : arr.join(', '));
  // Each count has its own whole phrase, so no plural is ever built from pieces.
  const COUNT = {
    mountain: ['{n} mountain', '{n} mountains'], added: ['{n} mountain added to your list.', '{n} mountains added to your list.'],
    found: ['{n} mountain found.', '{n} mountains found.'], foundHead: ['{n} mountain found', '{n} mountains found'],
    picked: ['{n} day picked: {span}.', '{n} days picked: {span}.'], pickedOnly: ['{n} day picked.', '{n} days picked.'], place: ['{n} place found.', '{n} places found.'],
    noFc: ['{n} ski hour has no forecast; the day score uses the hours that do.', '{n} ski hours have no forecast; the day score uses the hours that do.'],
    notYet: ['{n} not yet in forecast range: {span}.', '{n} not yet in forecast range: {span}.'],
    // The Coverage line, visible and spoken, one whole string per plural form of the picked-day count {n}.
    cov: ['Coverage {cov} of {n} day', 'Coverage {cov} of {n} days'], covClosed: ['Coverage {cov} of {n} day · {closed} closed', 'Coverage {cov} of {n} days · {closed} closed'],
    rank: ['Rank {rank}. Average {avg}, {label}. Strongest: {strong}, {sday}. Weakest: {weak}, {wday}. Coverage {cov} of {n} day.', 'Rank {rank}. Average {avg}, {label}. Strongest: {strong}, {sday}. Weakest: {weak}, {wday}. Coverage {cov} of {n} days.'],
    rankClosed: ['Rank {rank}. Average {avg}, {label}. Strongest: {strong}, {sday}. Weakest: {weak}, {wday}. Coverage {cov} of {n} day, {closed} closed.', 'Rank {rank}. Average {avg}, {label}. Strongest: {strong}, {sday}. Weakest: {weak}, {wday}. Coverage {cov} of {n} days, {closed} closed.'],
    // Refresh where some rows still fail (decision H4): no "Forecasts updated" toast.
    updPartial: ["Updated. 1 mountain couldn't load.", "Updated. {n} mountains couldn't load."],
    // The grid caption, one whole sentence per variant and plural form of the mountain count (the calendar always has 9 or 15 days).
    capOrder: ['Ski scores by mountain and day: {n} mountain, {d} days, in your order. Use the arrow keys to move between days. Press Enter to open a day.', 'Ski scores by mountain and day: {n} mountains, {d} days, in your order. Use the arrow keys to move between days. Press Enter to open a day.'],
    capSorted: ['Ski scores by mountain and day: {n} mountain, {d} days, sorted by {date}, highest score first. Use the arrow keys to move between days. Press Enter to open a day.', 'Ski scores by mountain and day: {n} mountains, {d} days, sorted by {date}, highest score first. Use the arrow keys to move between days. Press Enter to open a day.']
  };
  const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : o[k]));
  const count = (key, n, o) => fill(COUNT[key][n === 1 ? 0 : 1], Object.assign({ n: n }, o));
  // Whole sentences with placeholders, one per variant: nothing shown or spoken is joined from pieces of a sentence.
  const T = {
    still: {
      forecasts: "Still couldn't load forecasts. Try again later.", day: "Still couldn't load this day. Try again later.",
      list: "Still couldn't load the worldwide list. Try again later.", map: "Still couldn't load the map. Try again later.",
      trip: "Still couldn't load scores for your trip. Try again later.", row: "Still couldn't load {name}. Try again later.",
      save: "Still couldn't save {name}. Try again later."
    },
    saveFail: "Couldn't save {name}. This device may be in private browsing or out of space.",
    pinSaveFail: "Couldn't save this mountain. Your pin and name are still here. This device may be in private browsing or out of space.",
    pinSaveStill: "Still couldn't save {name}. Try again later. Your pin and name are still here.",
    added: '{name} added to your list.', removed: '{name} removed.',
    rowFail: "Couldn't load the forecast for {name}.", cardFail: "Couldn't load {name}'s forecast.",
    loaded: '{name} forecast loaded.',
    // Part 0 §0.9.1: name; name and region when two listed mountains share a name; and the country too when the region is also the same.
    name: { one: '{name}', two: '{name}, {region}', three: '{name}, {region}, {country}' },
    dupName: 'You already have a mountain called {name}. Choose another name.',
    sortHead: { no: ', {date}, sort by this day', yes: ', {date}, sorted, highest score first' },
    sortSay: 'Sorted by {date}, best first. {name} is first.',
    chip: ', {date}, pick this day',
    cellWho: { plain: '{name}, {date}', tag: '{name}, {tag}, {date}' },
    cell: {
      loading: '{who}: Loading.', none: "{who}: couldn't load.", closed: '{who}: Closed.',
      insufficient: '{who}: Insufficient data.', offline: '{who}: Offline. No forecast saved.',
      range: '{who}: ski score between {lo} and {hi}. Outlook. {conf}.',
      rangeLabel: '{who}: ski score between {lo} and {hi}, {label}. Outlook. {conf}.',
      over: '{who}: ski score {n}, {label}. Day over. {conf}.',
      hours: '{who}: ski score {n}, {label}. Best window {a} to {b}. {conf}.',
      short: '{who}: ski score {n}, {label}. Best window: under 3 hours of data. {conf}.',
      morning: '{who}: ski score {n}, {label}. Best window morning. {conf}.',
      midday: '{who}: ski score {n}, {label}. Best window midday. {conf}.',
      afternoon: '{who}: ski score {n}, {label}. Best window afternoon. {conf}.'
    },
    shortWin: 'Best window: under 3 hours of data',
    allClosed: 'Closed on all your days.', rankAllClosed: 'Rank {rank}. Closed on all your days.',
    refreshFail: "Couldn't refresh. Showing forecasts as of {time}.",
    dayBtn: {
      scored: ': ski score {n}, {label}. {name}.', range: ': ski score between {lo} and {hi}. {name}.',
      closed: ': Closed. {name}.', insufficient: ': Insufficient data. {name}.', notYet: ': Not yet. {name}.'
    },
    span: '{a} – {b}', spanSay: '{a} to {b}', noDays: 'No days picked.',
    rankNone: 'Rank {rank}. Insufficient data on every picked day.'
  };
  const band = (s) => M.bands.filter((b) => s >= b.min)[0] || M.bands[M.bands.length - 1];
  // Each confidence level has its own visible and spoken strings; nothing is lower-cased in code.
  const CONF = {
    high: { n: 3, word: 'Confidence: High', short: 'High', say: 'Confidence high' },
    medium: { n: 2, word: 'Confidence: Medium', short: 'Med', say: 'Confidence medium' },
    low: { n: 1, word: 'Confidence: Low', short: 'Low', say: 'Confidence low' }
  };
  const TIMING = { high: 'Window timing confidence: High.', medium: 'Window timing confidence: Medium.', low: 'Window timing confidence: Low.' };
  const lower = (c) => (c === 'high' ? 'medium' : 'low');
  function confHTML(c, short, withSr) {
    const k = CONF[c];
    return `<span class="conf"><span aria-hidden="true"><i class="${k.n > 0 ? 'f' : ''}"></i> <i class="${k.n > 1 ? 'f' : ''}"></i> <i class="${k.n > 2 ? 'f' : ''}"></i></span> <span aria-hidden="true">${short ? k.short : k.word}</span>${withSr ? `<span class="sr">${k.say}</span>` : ''}</span>`;
  }
  const temp = (f) => (app.units === 'imp' ? Math.round(f) + '°F' : Math.round((f - 32) * 5 / 9) + '°C');
  const speed = (mph) => (app.units === 'imp' ? Math.round(mph) + ' mph' : Math.round(mph * 1.609) + ' km/h');
  const dist = (mi) => (app.units === 'imp' ? mi + ' mi' : Math.round(mi * 1.609) + ' km');
  const elev = (ft) => (ft == null ? 'Elevation unknown' : app.units === 'imp' ? num(ft) + ' ft' : num(Math.round(ft * 0.3048)) + ' m');
  const snowAmt = (inch) => (app.units === 'imp' ? inch + ' in' : Math.round(inch * 2.54) + ' cm');
  const mt = (id) => app.mountains[id];
  const place = (m) => m.region + ', ' + m.country;
  const full = (m) => m.name + (m.sector ? ', ' + m.sector + ' sector' : '') + ', ' + m.region + ', ' + m.country;
  // Two mountains on the list (or waiting on an Undo row) with the same name are told apart by region,
  // in every cell name and control name that carries the mountain's name.
  // If the region is the same too (two pins given one name, both "Dropped pin"), the country follows; a pin's country is its coordinates.
  const listed = () => app.watch.concat((app.edit || []).filter((e) => e.removed).map((e) => e.id));
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  function nameOf(id) {
    const m = mt(id); if (!m) return '';
    const twins = listed().filter((x) => x !== id && mt(x) && same(mt(x).name, m.name));
    return fill(!twins.length ? T.name.one : twins.some((x) => same(mt(x).region, m.region)) ? T.name.three : T.name.two, m);
  }
  const top = () => app.stack[app.stack.length - 1];
  const inForecast = () => !!top() && /^s[1-7]$/.test(top().screen);
  const st = () => app.pstate;
  const staleSay = () => `Forecast as of ${M.staleHours} hours ago`;
  const staleHTML = () => `<span aria-hidden="true">◷ As of ${M.staleHours} h ago</span><span class="sr">${staleSay()}</span>`;

  // The best 3 hours in a row; with no 3-hour run of data, the best run of 2, else 1 (decision H2): "short".
  function bestWindow(hours) {
    let bi = -1, bv = -1, len = 3;
    for (; len >= 1 && bi < 0; len--) {
      for (let i = 0; i + len <= hours.length; i++) {
        const w = hours.slice(i, i + len);
        if (w.some((v) => v == null)) continue;
        const v = w.reduce((a, b) => a + b, 0) / len;
        if (v > bv) { bv = v; bi = i; }
      }
    }
    len++;
    let pi = 0;
    hours.forEach((v, i) => { if (v != null && (hours[pi] == null || v > hours[pi])) pi = i; });
    return { i: bi, len: len, short: len < 3, avg: Math.round(bv), a: bi < 0 ? null : M.hours[bi], b: bi < 0 ? null : M.hours[bi] + len, peak: pi };
  }
  const inWin = (w, i) => !w.short && w.i >= 0 && i >= w.i && i < w.i + w.len;
  const BLOCKS = [['morning', 'Morning'], ['midday', 'Midday'], ['afternoon', 'Afternoon']];
  function bestBlock(d) {
    let b = BLOCKS[0];
    BLOCKS.forEach((x) => { if (d.blocks[x[0]] > d.blocks[b[0]]) b = x; });
    return b[1];
  }
  const isFailed = (id) => st() === 'partial' && id === M.failedId && !app.retried[id];
  // The first "Try again" on anything fails again, so the "still couldn't" wording can be seen; the second works.
  function secondTry(key) { app.tries[key] = (app.tries[key] || 0) + 1; return app.tries[key] > 1; }
  const STALE_REASON = { code: 'conf.stale', args: [M.staleHours] };
  // The day as the current prototype state would show it.
  function eff(id, i) {
    const m = mt(id), d = m.days && m.days[i];
    if (!d) return { status: 'none' };
    if (st() === 'offline' && m.uncached) return { status: 'offline' };
    if (st() === 'partial' && id === M.staleId && d.conf) {
      return Object.assign({}, d, { conf: lower(d.conf), stale: true, reason: STALE_REASON });
    }
    return d;
  }
  const sortVal = (d) => (d.status === 'scored' && !d.ended ? d.score : d.status === 'range' ? (d.lo + d.hi) / 2 : null);
  function rowOrder() {
    if (app.sortCol == null) return app.watch.slice();
    const c = app.sortCol, rank = { high: 3, medium: 2, low: 1 };
    return app.watch.slice().sort((a, b) => {
      const da = isFailed(a) ? { status: 'x' } : eff(a, c), db = isFailed(b) ? { status: 'x' } : eff(b, c);
      const va = sortVal(da), vb = sortVal(db);
      if (va == null && vb == null) return app.watch.indexOf(a) - app.watch.indexOf(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (vb - va) || (rank[db.conf] - rank[da.conf]) || (app.watch.indexOf(a) - app.watch.indexOf(b));
    });
  }
  // What the day view says aloud when a day opens by stepping.
  function daySay(d) {
    if (d.status === 'scored') return `Ski score ${d.score}, ${band(d.score).label}.`;
    if (d.status === 'range') return `Ski score between ${d.lo} and ${d.hi}.`;
    if (d.status === 'closed') return 'Closed.';
    return 'Insufficient data.';
  }

  /* ---------- live regions and timed messages ---------- */
  // A newer message in the same region replaces one that has not been put in yet, so two never land together.
  let sayT = null, alertT = null, toastT = null, sayP = null, alertP = null;
  function say(text) {
    const n = $('#fc-status'); if (!n) return;
    n.textContent = ''; clearTimeout(sayT); clearTimeout(sayP);
    sayP = setTimeout(() => { n.textContent = text; sayT = setTimeout(() => { n.textContent = ''; }, 5000); }, 100);
  }
  function alertMsg(text) {
    const n = $('#fc-alert'); if (!n) return;
    n.textContent = ''; clearTimeout(alertT); clearTimeout(alertP);
    alertP = setTimeout(() => { n.textContent = text; alertT = setTimeout(() => { n.textContent = ''; }, 5000); }, 100);
  }
  // A toast stays 6 seconds and is never the only copy: the same words go to the status region.
  function toast(text) {
    const n = $('#fc-toast'); if (!n) return;
    n.textContent = text; n.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(() => { n.hidden = true; n.textContent = ''; }, 6000);
    say(text);
  }

  /* ---------- fixed markup ---------- */
  const PEAKS = '<svg class="peaks" viewBox="0 0 260 80" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false"><path class="p1" d="M0 79 60 70 92 58 118 64 150 40 172 50 196 22 224 46 260 60V80H0z" opacity=".55"/><path class="p2" d="M92 58 118 64 150 40z" opacity=".6"/><path class="p3" d="M150 40 172 50 196 22z" opacity=".75"/><path class="p4" d="M196 22 224 46 260 60 214 52z" opacity=".7"/><path class="p5" d="M196 22 205 34 196 31 188 37z"/><path class="p5" d="M150 40 157 47 149 45 144 49z" opacity=".9"/><path class="p6" d="M118 64 150 40 160 60z" opacity=".7"/><path class="p4" d="M172 50 196 22 190 60z" opacity=".6"/></svg>';
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
  const TAB_ICONS = {
    map: '<path d="M2 20 9 7l4 6 3-4 6 11z" fill="currentColor"/>',
    group: '<circle cx="8" cy="8" r="3.5" fill="currentColor"/><circle cx="17" cy="9" r="2.8" fill="currentColor"/><path d="M1.5 20c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5zM15 20c0-2.5-.8-4.3-2-5.6 4.5-1.400 9 .6 9 5.600z" fill="currentColor"/>',
    stats: '<path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M12 12 18 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    history: '<path d="M5 5h14M5 12h14M5 19h9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    forecast: '<rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7 17l3.500-4 2.500 2.500 2-2 2 3.500z" fill="currentColor"/>',
    more: '<circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/>'
  };
  const TABS = [['map', 'Map'], ['group', 'Group'], ['stats', 'Stats'], ['history', 'History'], ['forecast', 'Forecast'], ['more', 'More']];
  const MAPART = '<svg class="mapart" viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><path class="shade" d="M0 620 110 380 190 470 280 250 430 560V900H0z"/><path class="rock" d="M0 700 90 470 170 560 280 250 380 520 430 480V900H0z"/><path class="snow" d="M280 250l40 108-34-22-20 40-22-50-30 22z"/><path class="run" d="M282 300C260 420 320 470 250 560S180 700 220 820"/><path class="run" d="M300 330c40 90-10 160 50 250s20 160 40 240"/><path class="run" d="M262 330C200 400 190 480 130 560S90 700 80 820"/></svg>';

  function buildShell() {
    const phone = $('#phone');
    const jay = mt(M.mapMountain);
    phone.innerHTML = `
      <div id="app-bg">
        ${MAPART}
        <div id="topbar"><img src="${root}assets/logo.png" alt="" width="44" height="44"><div class="brand">SkiWithMe<span id="resort-name" tabindex="-1" translate="no">${esc(jay.name)}</span></div></div>
        <p class="standin">Static stand-in for the 3D map</p>
        <button id="infobar" type="button" data-act="open-wx" data-fkey="infobar"><span class="sr">Mountain weather: </span><span class="nm" translate="no">${esc(jay.name)}</span><span class="wx">18°F · light snow ›</span></button>
      </div>
      <section id="start" aria-label="Start screen" hidden>
        <div class="start-top"><img src="${root}assets/logo.png" alt="" width="44" height="44"><h2>SkiWithMe</h2><p>Your mountain. Your crew.</p></div>
        <div id="start-panel">
          <h3>Find your mountain</h3>
          <p class="sub">Static stand-in for the start screen. Only the two buttons below are part of this prototype.</p>
          <div class="start-actions">
            <button class="btn outline" type="button" data-act="join">Join Group</button>
            <button class="btn outline" type="button" data-act="open-forecast" data-fkey="start-forecast">Forecast</button>
          </div>
        </div>
      </section>
      <section id="sheet" role="dialog" aria-labelledby="sheet-title" hidden>
        <div class="sheet-head"><div class="grab" aria-hidden="true"></div>${PEAKS}
          <div class="head-row"><h2 id="sheet-title" tabindex="-1"></h2><button class="x" type="button" data-act="close" aria-label="Close">✕</button></div>
          <div id="back-slot"></div>
        </div>
        <div id="sheet-body"></div>
        <p id="fc-toast" class="toast" hidden></p>
        <div id="fc-status" class="sr" role="status" aria-live="polite" aria-atomic="true"></div>
        <div id="fc-alert" class="sr" role="alert" aria-atomic="true"></div>
      </section>
      <nav id="tabs" aria-label="Sections">
        ${TABS.map((t) => `<button type="button" data-act="tab" data-v="${t[0]}" data-fkey="tab-${t[0]}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TAB_ICONS[t[0]]}</svg><span>${t[1]}</span></button>`).join('')}
      </nav>`;
    // Prototype scaffolding, not part of the product: the way from the phone to the Prototype states panel.
    if (!$('#leave-phone')) {
      const a = document.createElement('a');
      a.id = 'leave-phone'; a.className = 'proto-leave'; a.href = '#proto-panel'; a.textContent = 'Leave the phone'; a.setAttribute('data-act', 'leave');
      phone.insertAdjacentElement('afterend', a);
    }
  }

  /* ---------- screen: S1 calendar ---------- */
  // The cell's accessible name is its own text (no aria-label): one hidden sentence, then the picture of it.
  // "tag" is "Top pick" or "Close call" when the row head shows that tag and this is the sorted column.
  function cellParts(id, c, tag) {
    const d = eff(id, c);
    const who = fill(tag ? T.cellWho.tag : T.cellWho.plain, { name: nameOf(id), tag: tag, date: longDate(c) });
    const nm = (k, o) => fill(T.cell[k], Object.assign({ who: who }, o));
    // aria-busy sits on the placeholder wrapper only; the cell and its name stay outside it.
    if (st() === 'loading') return { cls: '', name: nm('loading'), html: '<span class="busy" aria-busy="true"><span class="skel w60 tall"></span><span class="skel w80"></span></span>' };
    if (st() === 'error') return { cls: '', name: nm('none'), html: '<span class="glyph">–</span>' };
    if (d.status === 'closed') return { cls: 'closed', name: nm('closed'), html: '<span class="glyph">⦸</span><span class="cell-label">Closed</span>' };
    if (d.status === 'insufficient') return { cls: 'insuff', name: nm('insufficient'), html: '<span class="glyph">–</span><span class="cell-label">Insufficient data</span>' };
    if (d.status === 'offline') return { cls: 'off', name: nm('offline'), html: '<span class="glyph">–</span><span class="cell-label">Offline</span>' };
    const stale = d.stale ? ' ' + staleSay() + '.' : '';          // a second whole sentence
    if (d.status === 'range') {
      const one = band(d.lo).n === band(d.hi).n, b = band((d.lo + d.hi) / 2);
      return {
        cls: 'b' + b.n, name: nm(one ? 'rangeLabel' : 'range', { lo: d.lo, hi: d.hi, label: b.label, conf: CONF[d.conf].say }) + stale,
        html: `<span class="cell-score range">${d.lo}–${d.hi}</span>${one ? `<span class="cell-label">${b.label}</span>` : ''}<span class="cell-win">Outlook</span>${confHTML(d.conf, true)}`
      };
    }
    const b = band(d.score), o = { n: d.score, label: b.label, conf: CONF[d.conf].say };
    let win, key;
    if (d.ended) { win = 'Day over'; key = 'over'; }
    else if (d.hours && c < 2 && bestWindow(d.hours).short) { win = 'Under 3 h of data'; key = 'short'; }
    else if (d.hours && c < 2) { const w = bestWindow(d.hours); win = range(w.a, w.b); key = 'hours'; o.a = fmtHour(w.a); o.b = fmtHour(w.b); }
    else { win = bestBlock(d); key = win.toLowerCase(); }
    return {
      cls: 'b' + b.n, name: nm(key, o) + stale,
      html: `<span class="cell-score">${d.score}</span><span class="cell-label">${b.label}</span><span class="cell-win">${win}</span>${confHTML(d.conf, true)}`
    };
  }
  function gridHTML() {
    const rows = rowOrder(), n = M.days, loading = st() === 'loading';
    const caption = count(app.sortCol == null ? 'capOrder' : 'capSorted', rows.length, { d: n, date: app.sortCol == null ? '' : longDate(app.sortCol) });
    // Top pick on the first row; "Close call" on both of the first two rows when they are within the forecast's uncertainty.
    const rowTag = {};
    if (app.sortCol != null && rows[0] && !isFailed(rows[0]) && sortVal(eff(rows[0], app.sortCol)) != null) {
      const v0 = sortVal(eff(rows[0], app.sortCol)), v1 = rows[1] && !isFailed(rows[1]) ? sortVal(eff(rows[1], app.sortCol)) : null;
      if (v1 != null && v0 - v1 <= M.tripUncertainty) { rowTag[rows[0]] = 'Close call'; rowTag[rows[1]] = 'Close call'; } else rowTag[rows[0]] = 'Top pick';
    }
    let head = '<th scope="col" class="corner">Mountain</th>';
    for (let c = 0; c < n; c++) {
      const dow = dateAt(c).getUTCDay(), wk = dow === 0 || dow === 6, sorted = app.sortCol === c;
      const showMo = c === 0 || dateAt(c).getUTCDate() === 1;
      // The name starts with the words on screen ("Sat 6"); the full date and the action follow, hidden. Only the glyph is hidden from speech.
      head += `<th scope="col" class="date" aria-sort="${sorted ? 'descending' : 'none'}"><button type="button" class="date-btn${wk ? ' wkend' : ''}" data-act="sort" data-r="-1" data-c="${c}" tabindex="-1"><span>${c === 0 ? 'Today' : wkday(c)}</span> <b>${fmt(c, { day: 'numeric' })}</b>${showMo ? ` <span class="mo">${fmt(c, { month: 'short' })}</span>` : ''}<span class="sr">${esc(fill(sorted ? T.sortHead.yes : T.sortHead.no, { date: longDate(c) }))}</span><span class="sortglyph" aria-hidden="true">${sorted ? '▼' : '↕'}</span></button></th>`;
    }
    let body = '';
    rows.forEach((id, r) => {
      const m = mt(id), failed = isFailed(id), tags = [];
      const tagTxt = rowTag[id] || '';
      if (tagTxt) tags.push(tagTxt === 'Close call' ? '<span class="tag warn">Close call</span>' : '<span class="tag top">Top pick</span>');
      // "New" is only for a row added in this visit; a row reached with "Show" gets the outline alone.
      if (app.highlight === id && app.hlNew) tags.unshift('<span class="tag top newtag">New</span>');
      if (m.kind === 'pin') tags.unshift('<span class="tag">Pinned</span>');
      let line = '';
      if (st() === 'partial' && id === M.staleId) line = `<span class="st stale">${staleHTML()}</span>`;
      else if (st() === 'offline' && m.uncached) line = '<span class="st">Forecast loads when you\'re back online.</span>';
      // Out of season (Southern Hemisphere in December): the season line, then the zone line.
      if (m.season && !line) line = `<span class="st">${esc(tx({ code: 'closed.season', args: [{ mo: m.season.opens }] }))}</span>`;
      if (m.tz !== M.phoneTz && (!line || m.season)) line += `<span class="st"><span aria-hidden="true">${esc(zoneOf(m.tz))} time</span><span class="sr">Times in ${esc(zoneOf(m.tz))} local time</span></span>`;
      // Row headers take focus after an add or a save (data-c -1), and Left Arrow from the first day reaches them.
      body += `<tr class="${app.highlight === id ? 'new' : ''}"><th scope="row" class="rowhead" data-rowhead="${id}" data-r="${r}" data-c="-1" tabindex="-1"><span class="nm" translate="no">${esc(m.name)}</span>${tags.join(' ')}<span class="rg">${esc(place(m))}</span>${line}</th>`;
      if (failed) {
        const again = app.tries['row:' + id], who = esc(nameOf(id));
        // The cell is named by its message alone (aria-labelledby), so the button's words are not part of the cell's name.
        body += `<td role="gridcell" colspan="${n}" class="failrow" aria-labelledby="fail-${id}" data-act="cell" data-id="${id}" data-r="${r}" data-c="0" tabindex="-1"><div class="msg"><span id="fail-${id}">${fill(esc(again ? T.still.row : T.rowFail), { name: `<span translate="no">${who}</span>` })}</span><button type="button" class="btn sm alt" data-act="retry" data-id="${id}" data-r="${r}" data-c="1" tabindex="-1">Try again<span class="sr">: ${who}</span></button></div></td>`;
      } else {
        for (let c = 0; c < n; c++) {
          const p = cellParts(id, c, c === app.sortCol ? tagTxt : '');
          body += `<td role="gridcell" class="cell ${p.cls}" data-act="cell" data-id="${id}" data-r="${r}" data-c="${c}" tabindex="-1"><span class="sr">${esc(p.name)}</span><div class="cell-in" aria-hidden="true">${p.html}</div></td>`;
        }
      }
      body += '</tr>';
    });
    return `${loading ? '<p class="note">Loading forecasts…</p>' : ''}<div class="grid-wrap" id="grid-wrap"><table class="fc-grid" id="fc-grid" role="grid" aria-rowcount="${rows.length + 1}" aria-colcount="${n + 1}">
      <caption class="sr">${esc(caption)}</caption>
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const EMPTY_ART = '<svg viewBox="0 0 260 80" aria-hidden="true" focusable="false" class="peaks-art"><path class="p1" d="M0 79 60 70 92 58 118 64 150 40 172 50 196 22 224 46 260 60V80H0z"/><path class="p3" d="M150 40 172 50 196 22z"/><path class="p5" d="M196 22 205 34 196 31 188 37z"/></svg>';
  function unitsSeg() {
    return `<div class="seg" role="radiogroup" aria-label="Units">
      <button type="button" role="radio" aria-checked="${app.units === 'imp'}" tabindex="${app.units === 'imp' ? 0 : -1}" data-act="units" data-v="imp">°F · in</button>
      <button type="button" role="radio" aria-checked="${app.units === 'met'}" tabindex="${app.units === 'met' ? 0 : -1}" data-act="units" data-v="met">°C · cm</button></div>`;
  }
  const CREDIT = { nws: 'Weather: <a class="link" href="https://www.weather.gov/" rel="noopener">US National Weather Service</a>', met: 'Weather: <a class="link" href="https://www.met.no/en" rel="noopener">MET Norway</a> (CC BY 4.0)' };
  const CREDITS = `<span>${CREDIT.met}</span><span>${CREDIT.nws}</span>`;
  const STILL = (key) => `<span class="still">${esc(T.still[key])}</span>`;
  // Refresh outcomes (decision H4). The footer line appears once Refresh has ended on this screen, and then stays:
  // offline, the "will refresh" line; a failed refresh (panel option "Refresh fails"), N-S1-05; some rows still failing,
  // "Updated. {n} mountains couldn't load." In the error state nothing goes in the footer: the error card's text changes instead.
  const OFFLINE_REFRESH = "You're offline. Forecasts will refresh when you're back online.";
  const refreshBtn = () => `<button type="button" class="btn sm alt" data-act="refresh" data-fkey="refresh">${st() === 'offline' ? 'Refresh when online' : 'Refresh'}</button>`;
  function refreshLine() {
    const r = app.refreshOut;
    if (!r || r.key !== topKey()) return '';
    return r.kind === 'offline' ? OFFLINE_REFRESH : r.kind === 'fail' ? fill(T.refreshFail, { time: updatedAt() }) : r.kind === 'partial' ? count('updPartial', r.n) : '';
  }
  const refreshNote = () => { const t = refreshLine(); return t ? `<p>${esc(t)}</p>` : ''; };
  const pendingUndo = () => (app.edit || []).some((e) => e.removed) || app.gone === 'removed';
  function viewS1() {
    const s = st();
    if (s === 'empty' || !app.watch.length) {
      // While a removal can still be undone, the way back to Edit list stays.
      const edit = !app.watch.length && pendingUndo() ? '<button type="button" class="btn alt" data-act="go" data-v="s5">Edit list</button>' : '';
      return { title: 'Forecast', body: `<div class="empty">${EMPTY_ART}<h3 class="title">Where should you ski?</h3><p>Add the mountains you're thinking about. We'll score each day so you can compare them at a glance.</p><button type="button" class="btn" data-act="go" data-v="s3">Add a mountain</button>${edit}</div>` };
    }
    let h = '', alert = '';
    if (s === 'offline') h += `<div class="wx-note warn">You're offline. Showing forecasts as of ${updatedAt()}. We'll refresh when you're back online.</div>`;
    if (s === 'error') {
      // A failed "Try again" or Refresh replaces the card's text; the sentence never shows twice.
      alert = "Couldn't load any forecasts. Your mountains are saved. Check your connection and try again.";
      h += `<div class="wx-note bad">${app.tries.s1 ? STILL('forecasts') : alert}<button type="button" class="btn sm alt" data-act="recover" data-what="forecasts">Try again</button></div>`;
    }
    h += `<div class="toolbar" role="group" aria-label="Forecast actions">
      <button type="button" class="btn sm" data-act="go" data-v="s3">Add a mountain</button>
      <button type="button" class="btn sm alt" data-act="go" data-v="s5">Edit list</button>
      <button type="button" class="btn sm alt" data-act="today">Back to today</button>
      <button type="button" class="btn sm alt" data-act="go" data-v="s6">Plan a trip</button></div>`;
    h += `<p class="legend"><span>Score out of 100</span><span><span class="conf"><span aria-hidden="true"><i class="f"></i> <i class="f"></i> <i></i></span></span> Bars show confidence</span><span>Tap a score for hourly detail</span><button type="button" class="link" data-act="go" data-v="s7">How scores work</button></p>`;
    h += app.sortCol == null ? '<p class="sortline">Your order · tap a date to sort by it</p>'
      : `<p class="sortline"><span>Sorted by ${esc(shortDate(app.sortCol))}</span><button type="button" class="link" data-act="unsort">Show your order</button></p>`;
    h += gridHTML();
    h += `<div class="wx-foot"><div class="line"><span>${s === 'loading' ? 'Loading forecasts…' : s === 'error' ? '' : 'Updated ' + updatedAt()}</span>${refreshBtn()}</div>${refreshNote()}
      <div class="line">${unitsSeg()}</div>
      ${s === 'partial' ? '<p>Some forecasts are older than usual. The weather service is delayed.</p>' : ''}
      <p>All times are each mountain's local time.</p><div class="line">${CREDITS}</div></div>`;
    return { title: 'Forecast', body: h, after: setRoving, alert: alert };
  }
  function gridTarget(r, c) {
    // A failed row has two stops: the spanning cell (column 0) and its "Try again" button to the right of it.
    const fail = $(`#fc-grid td.failrow[data-r="${r}"]`);
    if (fail) return c < 0 ? $(`#fc-grid th[data-r="${r}"]`) : c === 0 ? fail : $('[data-act="retry"]', fail);
    return $(`#fc-grid [data-r="${r}"][data-c="${c}"]`) || $(`#fc-grid [data-r="${r}"][data-c="0"]`);
  }
  function setRoving() {
    const g = $('#fc-grid'); if (!g) return;
    const rows = rowOrder().length;
    app.cell.r = Math.max(-1, Math.min(rows - 1, app.cell.r));
    if (app.cell.r < 0 && app.cell.c < 0) app.cell.c = 0;
    $$('[data-r]', g).forEach((e) => e.setAttribute('tabindex', '-1'));
    const t = gridTarget(app.cell.r, app.cell.c) || gridTarget(0, 0);
    if (t) t.setAttribute('tabindex', '0');
  }
  function gridKey(e) {
    const cur = e.target.closest('[data-r]'); if (!cur || !cur.closest('#fc-grid')) return;
    let r = +cur.getAttribute('data-r'), c = app.cell.r === r ? app.cell.c : +cur.getAttribute('data-c');
    const rows = rowOrder().length, last = M.days - 1;
    switch (e.key) {
      case 'ArrowRight': c++; break;
      case 'ArrowLeft': c--; break;
      case 'ArrowDown': r++; break;
      case 'ArrowUp': r--; break;
      case 'Home': if (e.ctrlKey) r = 0; c = 0; break;
      case 'End': if (e.ctrlKey) r = rows - 1; c = last; break;
      case 'PageDown': c += 7; break;
      case 'PageUp': c -= 7; break;
      case 'Enter': case ' ':
        if (cur.tagName === 'BUTTON' && cur.getAttribute('data-act') === 'retry') return;   // the button's own Enter / Space retries the row
        else if (cur.tagName === 'TD') { e.preventDefault(); openDay(cur.getAttribute('data-id'), +cur.getAttribute('data-c'), cur); }
        else if (cur.tagName === 'TH') e.preventDefault();          // a row header does nothing
        return;
      default: return;
    }
    e.preventDefault();
    r = Math.max(-1, Math.min(rows - 1, r));
    app.cell = { r: r, c: Math.max(r < 0 ? 0 : -1, Math.min(last, c)) };
    if (r >= 0 && r === +cur.getAttribute('data-r') && $(`#fc-grid td.failrow[data-r="${r}"]`)) app.cell.c = Math.min(1, app.cell.c);   // failed row: header, cell, button
    setRoving();
    const t = $('#fc-grid [tabindex="0"]');
    if (t) { t.focus(); if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  // Click and Enter do the same thing on every cell, loading and failed ones included.
  function openDay(id, day, from) {
    if (from && from.hasAttribute('data-r')) app.cell = { r: +from.getAttribute('data-r'), c: +from.getAttribute('data-c') };
    // The day view opens knowing what the cell knew: nothing yet (loading), or nothing saved (calendar error).
    nav('s2', { id: id, day: day, skel: st() === 'loading', noCache: st() === 'error' });
  }

  /* ---------- screen: S2 day view ---------- */
  function chartHTML(d, w) {
    const X0 = 16, STEP = 42, BW = 30, BASE = 150;
    let bars = '';
    d.hours.forEach((v, i) => {
      const x = X0 + i * STEP;
      if (v == null) {
        bars += `<rect class="gapbar" x="${x}" y="${BASE - 40}" width="${BW}" height="40"/><text x="${x + BW / 2}" y="${BASE - 46}" text-anchor="middle">–</text>`;
      } else {
        const best = inWin(w, i);
        bars += `<rect class="bar${best ? ' best' : ''}" x="${x}" y="${BASE - v}" width="${BW}" height="${v}" rx="3"/><text x="${x + BW / 2}" y="${BASE - v - 5}" text-anchor="middle">${v}</text>`;
        if (i === w.peak) bars += `<text x="${x + BW / 2}" y="${BASE - v - 19}" text-anchor="middle">▲ Peak hour</text>`;
      }
      bars += `<text x="${x + BW / 2}" y="${BASE + 15}" text-anchor="middle">${esc(fmtHour(M.hours[i]))}</text>`;
    });
    let brk = '';
    if (w.i >= 0 && !w.short) {
      const x1 = X0 + w.i * STEP, x2 = X0 + (w.i + w.len - 1) * STEP + BW;
      brk = `<path class="brk" d="M${x1} 24V17H${x2}V24"/><text x="${(x1 + x2) / 2}" y="12" text-anchor="middle">Best window</text>`;
    }
    const peakV = d.hours[w.peak];
    const sum = `Hourly ski scores from ${fmtHour(M.hours[0])} to ${fmtHour(M.hours[M.hours.length - 1] + 1)}. Highest ${peakV} at ${fmtHour(M.hours[w.peak])}.${w.short ? ` ${T.shortWin}.` : w.i >= 0 ? ` Best window ${spoken(w.a, w.b)}, averaging ${w.avg}.` : ''}`;
    return `<figure class="chart"><svg viewBox="0 0 320 170" role="img" aria-labelledby="chart-sum" focusable="false">${brk}${bars}<path class="axis" d="M8 ${BASE}.5H312"/></svg><figcaption id="chart-sum">${esc(sum)}</figcaption></figure>`;
  }
  function hoursList(d, w) {
    return '<ol class="hours" role="list">' + d.hours.map((v, i) => {
      const tags = (inWin(w, i) ? '<span class="tag top">Best window</span>' : '') + (i === w.peak && v != null ? '<span class="tag">Peak hour</span>' : '');
      return `<li><span class="h">${esc(fmtHour(M.hours[i]))}</span>${v == null ? '<span class="s">No data</span>' : `<span class="s">${v} ${band(v).label} ${tags}</span><span class="f">${esc(tx(d.factors[i]))}</span>`}</li>`;
    }).join('') + '</ol>';
  }
  const PART_NAMES = { snow: 'Snow surface', vis: 'Visibility', wind: 'Wind', comfort: 'Comfort' };
  function condCol(title, x, missingVis) {
    const shift = { morning: 0, midday: 4, afternoon: 2 }[app.block];
    const t = x.t + shift, snow = x.precip === 'precip.light_snow' ? ' · ' + snowAmt(2) : '';
    return `<div class="box"><h4>${title}</h4><dl class="kv">
      <dt>Temperature</dt><dd>${temp(t)}, feels like ${temp(t - Math.round(x.wind * 0.8))}</dd>
      <dt>Wind and gusts</dt><dd>${speed(x.wind)}, gusts ${speed(x.wind * 1.8)}</dd>
      <dt>Precipitation</dt><dd>${esc(tx(x.precip))}${snow}</dd>
      <dt>Visibility</dt><dd>${missingVis ? 'Not in forecast' : dist(x.vis)}</dd>
      <dt>Snow surface</dt><dd>${esc(tx(x.snow))}</dd></dl></div>`;
  }
  function baseSummit(m, d, partial) {
    const one = m.summitFt == null || partial;
    const seg = `<div class="seg" role="radiogroup" aria-label="Time of day">${BLOCKS.map((b) => `<button type="button" role="radio" aria-checked="${app.block === b[0]}" tabindex="${app.block === b[0] ? 0 : -1}" data-act="block" data-v="${b[0]}">${b[1]}</button>`).join('')}</div>`;
    const cols = one ? `<div class="cols2 one">${condCol('Mountain (one estimate)', d.wx.base, partial)}</div>`
      : `<div class="cols2">${condCol('Base · ' + elev(m.baseFt), d.wx.base, false)}${condCol('Summit · ' + elev(m.summitFt), d.wx.summit, false)}</div>`;
    const note = m.kind === 'pin' ? '' : one ? '<p class="note">The weather service can\'t tell the base and summit apart here, so this is one estimate for the whole mountain. Confidence is lowered.</p>' : '';
    return `<section class="card" aria-labelledby="h-bs"><h3 id="h-bs">Base and summit</h3>${seg}${unitsSeg()}${cols}${note}</section>`;
  }
  function heroHTML(d) {
    if (d.status === 'range') {
      const same = band(d.lo).n === band(d.hi).n, b = band((d.lo + d.hi) / 2);
      return `<div class="wx-hero b${b.n}"><div class="num"><span aria-hidden="true">${d.lo}–${d.hi}</span><span class="sr">Score between ${d.lo} and ${d.hi}</span></div>${same ? `<div class="lab">${b.label}</div>` : ''}<div class="cap">Likely ski score range</div><div>${confHTML(d.conf, false, true)}</div><div class="why">${esc(tx(d.reason))}</div></div>`;
    }
    const b = band(d.score);
    return `<div class="wx-hero b${b.n}"><div class="num">${d.score}</div><div class="lab">${b.label}</div><div class="cap">Ski score out of 100</div><div>${confHTML(d.conf, false, true)}</div><div class="why">${esc(tx(d.reason))}</div></div>`;
  }
  const SCORE_H = '<h3 class="sr">Ski score</h3>', FACTS_H = '<h3 class="sr">Key facts</h3>';
  function viewS2(p) {
    const m = mt(p.id), s = st(), day = p.day, last = M.days - 1;
    if (!m) return viewS1();
    let d = eff(p.id, day), h = '', alert = '';
    const cached = !m.uncached;
    if (s === 'empty') d = { status: 'closed' };
    if (s === 'partial' && (d.status === 'scored' || d.status === 'range')) {
      d = Object.assign({}, d, { stale: true, conf: d.stale ? d.conf : lower(d.conf), reason: STALE_REASON });
      if (d.hours) {
        d.hours = d.hours.slice(); d.hours[5] = null; d.hours[6] = null; d.missing = d.hours.filter((v) => v == null).length;
        const r = M.scoreDay(d.hours);                    // the same edge rules as the engine: too many gaps is Insufficient data
        d = r.status === 'scored' ? Object.assign(d, { score: r.score }) : { status: 'insufficient', reason: r.reason };
      }
    }
    // E3: this mountain was just added from the Mountain weather row; Undo sits at the top until Forecast closes.
    const nmHTML = `<span translate="no">${esc(nameOf(p.id))}</span>`;
    if (p.added && app.wxAdded) h += `<div class="erow undo-row"><span>${fill(esc(T.added), { name: nmHTML })}</span><button type="button" class="btn sm alt" data-act="wx-undo" data-fkey="s2-undo">Undo<span class="sr"> adding ${esc(nameOf(p.id))}</span></button></div>`;
    // The implicit add could not be saved: the row says so and offers the retry, in the same place.
    else if (p.added && app.wxFail) h += `<div class="erow undo-row"><span>${fill(esc(app.wxFail > 1 ? T.still.save : T.saveFail), { name: nmHTML })}</span><button type="button" class="btn sm alt" data-act="wx-retry" data-fkey="s2-wxretry">Try again: add ${nmHTML}</button></div>`;
    h += `<div><h3 class="plain">${esc(longDate(day))}</h3><p class="sub">Times are local to <span translate="no">${esc(m.name)}</span> (${esc(zoneOf(m.tz))}).</p></div>`;
    // A stepper that has nowhere to go is not drawn (no disabled buttons).
    h += `<div class="stepper" role="group" aria-label="Change day">${day > 0 ? `<button type="button" class="btn sm alt" data-act="step" data-v="-1" data-fkey="step-prev"><span aria-hidden="true">‹ </span>${wkday(day - 1)}<span class="sr">, previous day, ${esc(longDate(day - 1))}</span></button>` : ''}${day < last ? `<button type="button" class="btn sm alt next" data-act="step" data-v="1" data-fkey="step-next">${wkday(day + 1)}<span aria-hidden="true"> ›</span><span class="sr">, next day, ${esc(longDate(day + 1))}</span></button>` : ''}</div>`;
    const foot = `<div class="wx-foot"><div class="line"><span>${s === 'loading' ? 'Updating…' : 'Updated ' + updatedAt()}</span><span>${CREDIT[m.source === 'nws' ? 'nws' : 'met']}</span>${refreshBtn()}</div>${refreshNote('day')}
      <div class="inline-links"><button type="button" class="link" data-act="go" data-v="s7">How scores work</button>${m.built ? `<button type="button" class="link" data-act="open-map">Open the <span translate="no">${esc(m.name)}</span> map</button>` : ''}</div></div>`;
    // The title is the mountain (with its region when two listed mountains share a name); the day follows it, hidden,
    // so focus on the title reads both. It changes on every day step.
    const title = { title: nameOf(p.id), nameTitle: true, titleSr: ', ' + longDate(day) };
    const rowFail = isFailed(p.id);                      // opened from a failed row's spanning cell
    // A failed "Try again" or Refresh replaces the card's text with the "Still couldn't" sentence.
    const again = rowFail ? app.tries['row:' + p.id] : app.tries.s2;
    const tryBtn = rowFail ? `<button type="button" class="btn sm alt" data-act="retry" data-id="${p.id}">Try again</button>`
      : '<button type="button" class="btn sm alt" data-act="recover" data-what="day">Try again</button>';
    const hasScore = d.status === 'scored' || d.status === 'range';

    // Offline: the banner sentence is also spoken once when the day opens or is stepped to (N-S2-05).
    if (s === 'offline') {
      if (!cached) { const t = "This day isn't saved on this device. It will load when you're back online."; return Object.assign(title, { alert: t, polite: true, body: h + `<div class="wx-note warn">${t}</div>` + foot }); }
      const t = `You're offline. Showing the forecast as of ${updatedAt()}.`;
      h += `<div class="wx-note warn">${t}</div>`;
      title.alert = t; title.polite = true;
      d = mt(p.id).days[day];
      // The score was saved with the calendar, but this day's detail was never opened.
      const nd = M.offlineNoDetail;
      if (nd && nd.id === p.id && nd.day === day && hasScore) {
        const t2 = 'Hourly detail needs a connection.';
        return Object.assign(title, { alert: t2, body: h + SCORE_H + heroHTML(d) + `<div class="wx-note warn">${t2}</div>` + foot });
      }
    }
    if (s === 'error' || rowFail) {
      // Nothing saved: a pin never loaded, a failed row, or a "–" cell on the calendar in its error state.
      if (!cached || rowFail || p.noCache) {
        alert = "Couldn't load this day. Check your connection and try again.";
        return Object.assign(title, { alert: alert, body: h + `<div class="wx-note bad">${again ? STILL('day') : alert}${tryBtn}</div>` + foot });
      }
      alert = `Couldn't refresh this day. Showing the forecast as of ${updatedAt()}.`;
      title.alert = alert; title.polite = true;         // the saved day still shows, so this one is not urgent
      h += `<div class="wx-note bad">${again ? STILL('day') : alert}${tryBtn}</div>`;
    }
    if (s === 'loading') {
      // Opened from a loading calendar cell there is no score yet: the hero is a placeholder too.
      h += SCORE_H + (p.skel || !hasScore ? '<div class="wx-hero"><span class="busy" aria-busy="true"><span class="skel w40 tall"></span><span class="skel w60"></span></span></div>' : heroHTML(d));
      h += '<p class="note">Loading the detail for this day…</p><div aria-busy="true"><div class="card"><span class="skel w40"></span><span class="skel tall"></span><span class="skel w80"></span></div><div class="card"><span class="skel w60"></span><span class="skel tall"></span></div></div>';
      return Object.assign(title, { body: h + foot });
    }
    // Closed and Insufficient data have one way on: the next-day stepper above.
    if (d.status === 'closed') {
      // Out of season (Southern Hemisphere in December): "Closed for the season." and the month it opens.
      h += d.season ? `<div class="card empty"><p class="glyph" aria-hidden="true">⦸</p><h3 class="plain">Closed for the season.</h3><p>${esc(tx(d.reason))}</p></div>`
        : `<div class="card empty"><p class="glyph" aria-hidden="true">⦸</p><h3 class="plain">Closed on this day</h3><p>${esc(tx({ code: 'closed.ops_report', args: [m.name] }))}</p></div>`;
      return Object.assign(title, { body: h + foot });
    }
    if (d.status === 'insufficient' || d.status === 'offline' || d.status === 'none') {
      h += `<div class="card empty"><h3 class="plain">Insufficient data</h3><p>There isn't enough weather data to score this day.</p><p>${esc(tx(d.reason || 'insuff.not_loaded'))}</p><p class="note">This is not a low score.</p></div>`;
      return Object.assign(title, { body: h + foot });
    }
    if (d.ended) h += `<div class="wx-note warn">Skiing has ended for this day at <span translate="no">${esc(m.name)}</span> (local time ${nowIn(m.tz)}). This is the forecast as it stood.</div>`;
    if (d.stale) h += `<div class="wx-note warn">The weather service is delayed. <span aria-hidden="true">Forecast as of ${M.staleHours} h ago.</span><span class="sr">${staleSay()}.</span> Confidence is lowered.</div>`;
    if (m.kind === 'pin') h += `<div class="wx-note warn">Pinned mountain: we only know one point at ${elev(m.baseFt)}. There's no separate base and summit, and ski hours are assumed.</div>`;
    h += SCORE_H + heroHTML(d);
    const skiBox = m.hoursPublished ? `<div class="box"><span class="cap">Ski hours</span><b>${rangeHTML(M.skiHours[0], M.skiHours[1])}</b></div>`
      : `<div class="box"><span class="cap">Ski hours</span><b>Assumed ${rangeHTML(M.skiHours[0], M.skiHours[1])}</b><small>No published hours</small></div>`;
    if (d.status === 'range') {
      h += `<p>${esc(tx(d.outlook))}</p><p class="note">No best window yet. Timing isn't predictable this far ahead.</p><p class="note">Hourly detail starts ${esc(longDate(day - 1))}.</p>`;
      return Object.assign(title, { body: h + foot });
    }
    h += `<p>${esc(tx(d.explain))}</p>` + FACTS_H;
    if (d.hours && day < 2) {
      const w = bestWindow(d.hours);
      // With no 3 hours in a row of data the box says so in one sentence instead of a window time (decision H2).
      const winBox = w.short ? `<div class="box"><b class="whole">${T.shortWin}</b></div>`
        : `<div class="box"><span class="cap">Best window</span><b>${w.i < 0 ? '–' : rangeHTML(w.a, w.b)}</b>${w.i < 0 ? '' : `<small>averaging ${w.avg}</small>`}</div>`;
      h += `<div class="boxes b3">${winBox}<div class="box"><span class="cap">Peak hour</span><b>${fmtHour(M.hours[w.peak])}</b><small>${d.hours[w.peak]} ${band(d.hours[w.peak]).label}</small></div>${skiBox}</div>`;
      h += `<p class="sub">${TIMING[d.timing]} ${esc(tx(d.timingReason))}</p>`;
      h += `<section class="card" aria-labelledby="h-hr"><h3 id="h-hr">Hourly scores</h3>${chartHTML(d, w)}${d.missing ? `<p class="note">${count('noFc', d.missing)}</p>` : ''}${hoursList(d, w)}</section>`;
    } else {
      h += `<div class="boxes b3"><div class="box"><span class="cap">Best window</span><b>${bestBlock(d)}</b></div>${skiBox}</div>`;
      h += `<section class="card" aria-labelledby="h-tb"><h3 id="h-tb">Scores by time of day</h3><ol class="boxes b3" role="list">${BLOCKS.map((b) => `<li class="box"><span class="cap">${b[1]}</span><b>${d.blocks[b[0]]}</b><small>${band(d.blocks[b[0]]).label}</small></li>`).join('')}</ol><p class="note">Hourly detail isn't reliable this far out. These blocks are the best guide.</p></section>`;
    }
    h += `<section class="card" aria-labelledby="h-pt"><h3 id="h-pt">What moved the score</h3><div class="boxes b4">${d.parts.map((x) => `<div class="box"><span class="cap">${PART_NAMES[x.key]}</span><b>${x.score}</b><small>${M.weights[x.key]}% of the score</small><small>${esc(tx(x.cap))}</small></div>`).join('')}</div></section>`;
    h += baseSummit(m, d, s === 'partial');
    return Object.assign(title, { body: h + foot });
  }

  /* ---------- screen: S3 add a mountain ---------- */
  const MAX_RESULTS = 30;
  const fromTrip = () => app.stack.some((x) => x.screen === 's6');
  function searchList() {
    const s = st(), q = app.q.trim().toLowerCase();
    let list = M.catalog.filter((c) => (s === 'loading' || s === 'error') ? c.built : s === 'partial' ? c.country !== 'Japan' : true);
    if (!q) {
      const near = M.nearYou.map((id) => list.filter((c) => c.id === id)[0]).filter(Boolean);
      return { idle: true, near: near, list: list.filter((c) => c.built && M.nearYou.indexOf(c.id) < 0).slice(0, MAX_RESULTS) };
    }
    list = list.map((c) => {
      const name = (c.name + ' ' + (c.sector || '')).toLowerCase();
      let why = '';
      if (name.indexOf(q) < 0 && (c.region + ' ' + c.country).toLowerCase().indexOf(q) < 0) {
        if (c.town && c.town.toLowerCase().indexOf(q) >= 0) why = `Matches “${app.q.trim()}” (nearby town)`;
        else if (c.alias && c.alias.toLowerCase().indexOf(q) >= 0) why = `Matches “${app.q.trim()}” (other name)`;
        else return null;
      }
      return Object.assign({ why: why }, c);
    }).filter(Boolean);
    return { idle: false, list: list.slice(0, MAX_RESULTS) };
  }
  // One row: name, then region and country. The row is not focusable; it has one trailing control,
  // and every control name carries region and country so two "Snow Valley" rows never sound alike.
  function resultRow(c) {
    const watched = app.watch.indexOf(c.id) >= 0, mine = app.sessionAdded[c.id], nm = esc(full(c)), fail = app.saveFail[c.id];
    let ctl, err = '';
    if (fail && !watched) {
      ctl = '';
      const short = `<span translate="no">${esc(c.name)}</span>`;
      // The retry's words on screen are its name's first words; region and country follow, hidden, as on every row control.
      err = `<p class="err rowerr"><span>${fill(esc(fail > 1 ? T.still.save : T.saveFail), { name: short })}</span><button type="button" class="btn sm alt" data-act="add" data-id="${c.id}">Try again: add ${short}<span class="sr">${c.sector ? ', ' + esc(c.sector) + ' sector' : ''}, ${esc(c.region)}, ${esc(c.country)}</span></button></p>`;
    } else if (watched && mine) ctl = `<span class="state">Added</span><button type="button" class="btn sm alt" data-act="unadd" data-id="${c.id}" aria-label="Remove ${nm}">Remove</button>`;
    // Opened from Plan a trip, "Show" would leave the trip, so only the status text shows (decision H11).
    else if (watched) ctl = `<span class="state">On your list</span>${fromTrip() ? '' : `<button type="button" class="btn sm alt" data-act="show-row" data-id="${c.id}" aria-label="Show ${nm} on the calendar">Show</button>`}`;
    else ctl = `<button type="button" class="btn sm" data-act="add" data-id="${c.id}" aria-label="Add ${nm}">Add</button>`;
    return `<li class="srow"><div class="main"><b translate="no">${esc(c.name)}</b>${c.sector ? `<small>${esc(c.sector)} sector</small>` : ''}<small>${esc(c.region)}, ${esc(c.country)}${c.built ? ' · SkiWithMe map' : ''}</small>${c.why ? `<small>${esc(c.why)}</small>` : ''}${c.limited ? '<small>Limited terrain data: forecasts will be less detailed</small>' : ''}</div>${ctl ? `<div class="ctl">${ctl}</div>` : ''}${err}</li>`;
  }
  function resultsHTML() {
    const s = st();
    if (s === 'empty' && !app.q) app.q = 'Mt Nowhere';
    const res = searchList();
    if (!res.idle && !res.list.length) {
      return `<div class="card" data-nomatch="1"><h3 class="plain">No mountain called “${esc(app.q.trim())}” found.</h3><p>Check the spelling, try a nearby town, or add it yourself by dropping a pin.</p><p><button type="button" class="btn alt" data-act="go" data-v="s4">Drop a pin on a map</button></p></div>`;
    }
    const sec = (id, head, list) => (list.length ? `<section aria-labelledby="${id}"><h3 id="${id}">${head}</h3><ul class="results" role="list">${list.map(resultRow).join('')}</ul></section>` : '');
    if (res.idle) return sec('h-near', 'Near you', res.near) + sec('h-res', 'SkiWithMe mountains', res.list);
    return sec('h-res', count('foundHead', res.list.length), res.list);
  }
  const noMatch = () => { const r = searchList(); return !r.idle && !r.list.length; };
  function stickyHTML() {
    const n = Object.keys(app.sessionAdded).length;
    return n ? `<button type="button" class="btn" data-act="show-forecast" data-fkey="s3-sticky">${fromTrip() ? 'Back to trip' : 'Show on calendar'} (${n})</button>` : '';
  }
  const PIN_LINK = '<button type="button" class="row-link" data-act="go" data-v="s4"><span><b>Can\'t find your mountain?</b><small>Drop a pin on a map</small></span><span class="chev" aria-hidden="true">›</span></button>';
  function viewS3() {
    const s = st();
    let alert = '';
    let h = `<div><label class="lbl" for="fc-q">Search mountains</label><p class="hint" id="fc-q-hint">Search the worldwide list by name, nearby town or region.</p><div class="search">${SEARCH_ICON}<input id="fc-q" type="search" placeholder="Name, nearby town or region" aria-describedby="fc-q-hint" autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(s === 'empty' && !app.q ? 'Mt Nowhere' : app.q)}"></div></div>`;
    if (s === 'loading') h += '<div class="card"><p>Loading the worldwide list… Searching SkiWithMe mountains for now. (62%)</p><progress class="progress" aria-label="Loading the worldwide list" max="100" value="62">62%</progress></div>';
    if (s === 'partial') h += '<p class="wx-note warn">Some mountains may be missing while the list finishes loading.</p>';
    let polite = false;
    if (s === 'error') {
      alert = "Couldn't load the worldwide list. You can still search SkiWithMe mountains.";
      h += `<div class="wx-note bad">${alert}${app.tries.s3 ? STILL('list') : ''}<button type="button" class="btn sm alt" data-act="recover" data-what="list">Try loading the list again</button></div>`;
    }
    if (s === 'offline') {
      // Spoken once when the screen opens (N-S3-10; the other wording is N-S3-06).
      alert = "You're offline. You can add mountains now; their forecasts load when you're back online."; polite = true;
      h += `<p class="wx-note warn">${alert}</p><p class="fixture-flag">Other wording, when the worldwide list was never saved on this phone:</p><p class="wx-note warn">You're offline. Only SkiWithMe mountains can be searched until you reconnect.</p>`;
    }
    h += `<div id="fc-results">${resultsHTML()}</div>`;
    h += `<div id="fc-pinlink">${noMatch() ? '' : PIN_LINK}</div>`;       // the no-match card already offers the pin
    h += `<div class="sticky-bar" id="fc-sticky">${stickyHTML()}</div>`;
    return { title: 'Add a mountain', body: h, alert: alert, polite: polite };
  }
  function addMountain(id) {
    const c = M.catalog.filter((x) => x.id === id)[0];
    if (!mt(id)) {
      app.mountains[id] = {
        id: id, kind: 'catalog', name: c.name + (c.sector ? ' ' + c.sector : ''), region: c.region, country: c.country, tz: c.tz,
        baseFt: c.baseFt, summitFt: c.summitFt, built: c.built, source: c.source, hoursPublished: c.built, uncached: true,
        days: JSON.parse(JSON.stringify(M.makeForecast(c.name.length + c.region.length, false)))
      };
    }
    if (app.watch.indexOf(id) < 0) app.watch.push(id);
    app.sessionAdded[id] = true;
  }

  /* ---------- screen: S4 drop a pin ---------- */
  const fmtLL = (lat, lon) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
  const fakeElev = (lat, lon) => Math.max(300, Math.round(2340 + (lat - 44.936) * 4000 + (lon + 72.504) * 3000));
  const STORAGE_WHY = 'This device may be in private browsing or out of space.';
  function readoutText() {
    const s = st(), p = app.pin, ll = fmtLL(p.lat, p.lon);
    if (s === 'loading') return `Pin at ${ll} · Finding elevation…`;
    if (s === 'partial' || s === 'error') return `Pin at ${ll} · Elevation unknown`;
    if (s === 'offline') return `Pin at ${ll} · Unknown until you're back online`;
    return `Pin at ${ll} · ${elev(fakeElev(p.lat, p.lon))}`;
  }
  function newPin(editId) {
    const m = editId && mt(editId);
    return { editId: editId || null, lat: m ? m.lat : M.pinStart.lat, lon: m ? m.lon : M.pinStart.lon, zoom: 3, name: m ? m.name : '', touched: false, coords: null, pq: '', found: null, errs: {}, denied: false, saveFail: 0 };
  }
  function foundHTML() {
    const s = st(), pin = app.pin, pq = s === 'empty' && !pin.pq ? 'Nowhereville' : pin.pq;
    if (s === 'empty' || pin.found === 'none') return `<p class="wx-note warn">No place called “${esc(pq)}” found. Try a nearby town, or move the map yourself.</p>`;
    if (pin.found) return `<ul role="list">${pin.found.map((x, i) => `<li class="srow"><div class="main"><b translate="no">${esc(x.name)}</b><small>${esc(x.region)}</small></div><div class="ctl"><button type="button" class="btn sm alt" data-act="place" data-v="${i}" aria-label="Go here: ${esc(x.name)}, ${esc(x.region)}">Go here</button></div></li>`).join('')}</ul>`;
    return '';
  }
  function findPlaces() {
    const q = app.pin.pq.trim().toLowerCase();
    const f = q.length >= 2 ? M.places.filter((x) => x.name.toLowerCase().indexOf(q) >= 0) : [];
    app.pin.found = q.length < 2 ? null : f.length ? f : 'none';
    return f.length;
  }
  const mapStyle = (pin) => `--px:${Math.round(pin.lon * -4000) % 96}px;--py:${Math.round(pin.lat * 4000) % 96}px;--pz:${pin.zoom}`;
  function viewS4(p) {
    // A new pin is a draft that survives leaving this screen (position and typed name) until it is saved.
    if (p.editId) { if (!app.pin || app.pin.editId !== p.editId) app.pin = newPin(p.editId); }
    else {
      if (!app.draft) app.draft = newPin(null);
      app.pin = app.draft;
      if (!app.pin.touched && !app.pin.name && app.q.trim() && app.q !== 'Mt Nowhere') app.pin.name = app.q.trim();   // carried over from the search
    }
    const s = st(), pin = app.pin, edit = !!pin.editId;
    const noMap = s === 'error' || s === 'offline', coordsOpen = pin.coords == null ? noMap : pin.coords;
    let h = '', alert = '';
    if (s === 'no-permission' || pin.denied) h += '<div class="wx-note warn" id="pin-denied">Location is off for SkiWithMe, so we can\'t centre the map on you. Search for a nearby town instead. To allow location, change it in your browser\'s settings for this site.</div>';
    if (s === 'offline') { alert = "You're offline. The map needs a connection, but you can enter coordinates now."; h += `<div class="wx-note warn">${alert}</div>`; }   // N-S4-08, spoken once
    if (s === 'error') {
      alert = "The map couldn't load. Enter the coordinates instead, or try again.";
      h += `<div class="wx-note bad">${alert}${app.tries.s4 ? STILL('map') : ''}<button type="button" class="btn sm alt" data-act="recover" data-what="map">Try again</button></div>`;
    }
    const pq = s === 'empty' && !pin.pq ? 'Nowhereville' : pin.pq;
    h += `<div><label class="lbl" for="pin-q">Find the area</label><p class="hint" id="pin-q-hint">Places show as you type.</p><div class="search">${SEARCH_ICON}<input id="pin-q" type="search" placeholder="Town, lake or peak" autocomplete="off" aria-describedby="pin-q-hint" value="${esc(pq)}"></div><div id="pin-found">${foundHTML()}</div></div>`;
    if (!noMap) {
      h += `<div class="pinmap${s === 'loading' ? ' blank' : s === 'partial' ? ' half' : ''}" id="pinmap" role="group" aria-roledescription="map" aria-label="Map. Move the map to put the pin on the ski area. Arrow keys move the map; plus and minus zoom." aria-describedby="pin-readout" tabindex="0" style="${mapStyle(pin)}">
        <span class="lab">${s === 'loading' ? 'Loading map…' : s === 'partial' ? 'Part of the map could not load' : 'Static stand-in for the map (map tiles are an open question)'}</span>
        <span class="zoomlab" id="pin-zoom">Zoom ${pin.zoom} of 6</span>
        <svg class="pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 22s-7-6.600-7-12a7 7 0 0 1 14 0c0 5.400-7 12-7 12z" fill="currentColor"/><circle class="dot" cx="12" cy="10" r="2.600"/></svg>
        <div class="mapctl pan"><button type="button" class="n" data-act="pan" data-v="n" aria-label="Move map north">↑</button><button type="button" class="w" data-act="pan" data-v="w" aria-label="Move map west">←</button><button type="button" class="s" data-act="pan" data-v="s" aria-label="Move map south">↓</button><button type="button" class="e" data-act="pan" data-v="e" aria-label="Move map east">→</button></div>
        <div class="mapctl zoom"><button type="button" data-act="zoom" data-v="1" aria-label="Zoom in">+</button><button type="button" data-act="zoom" data-v="-1" aria-label="Zoom out">−</button></div></div>`;
    }
    h += `<p class="readout" id="pin-readout">${esc(readoutText())}</p>`;
    if (s === 'partial') h += '<p class="note">Elevation unknown: forecast uses the weather model\'s height and confidence is lower.</p>';
    h += `<div class="btnrow"><button type="button" class="btn sm alt" data-act="locate">Use my location</button><button type="button" class="btn sm alt" data-act="coords" data-fkey="pin-coords-btn" aria-expanded="${coordsOpen}" aria-controls="pin-coords">Enter coordinates</button></div>`;
    h += `<div class="card" id="pin-coords"${coordsOpen ? '' : ' hidden'}><fieldset class="plainset"><legend class="lbl">Coordinates</legend><div class="pair">
        <div><label class="lbl" for="pin-lat">Latitude</label><p class="hint" id="pin-lat-h">e.g. 44.936</p><input class="field" id="pin-lat" inputmode="decimal" autocomplete="off" value="${pin.lat.toFixed(3)}" aria-describedby="pin-lat-h${pin.errs.lat ? ' pin-lat-e' : ''}"${pin.errs.lat ? ' aria-invalid="true"' : ''}>${pin.errs.lat ? `<p class="err" id="pin-lat-e">${pin.errs.lat}</p>` : ''}</div>
        <div><label class="lbl" for="pin-lon">Longitude</label><p class="hint" id="pin-lon-h">e.g. -72.504</p><input class="field" id="pin-lon" inputmode="decimal" autocomplete="off" value="${pin.lon.toFixed(3)}" aria-describedby="pin-lon-h${pin.errs.lon ? ' pin-lon-e' : ''}"${pin.errs.lon ? ' aria-invalid="true"' : ''}>${pin.errs.lon ? `<p class="err" id="pin-lon-e">${pin.errs.lon}</p>` : ''}</div>
      </div></fieldset><p><button type="button" class="btn sm alt" data-act="apply-coords">Move the pin here</button></p></div>`;
    h += `<div id="pin-name-wrap"><label class="lbl" for="pin-name">Name this mountain</label><input class="field" id="pin-name" autocomplete="off" required value="${esc(pin.name)}"${pin.errs.name ? ' aria-invalid="true" aria-describedby="pin-name-e"' : ''}>${pin.errs.name ? `<p class="err" id="pin-name-e">${esc(pin.errs.name)}</p>` : ''}</div>`;
    h += `<section class="card" aria-labelledby="h-tl"><h3 id="h-tl">What we can forecast here</h3><p>One point only: we don't know where the lifts, base and summit are, so you'll see one estimate for the whole mountain with lower confidence. Ski hours are assumed to be ${rangeHTML(M.skiHours[0], M.skiHours[1])}. Times use the time zone at the pin. You can move the pin later.</p></section>`;
    if (pin.saveFail) h += `<p class="wx-note bad" id="pin-savefail">${esc(pin.saveFail > 1 ? fill(T.pinSaveStill, { name: pin.name.trim() }) : T.pinSaveFail)}</p>`;
    h += `<button type="button" class="btn" data-act="save-pin">${edit ? 'Save changes' : 'Save mountain'}</button>`;
    if (edit) h += '<button type="button" class="btn danger" data-act="remove-pin">Remove this mountain</button>';
    return { title: edit ? 'Edit pin' : 'Drop a pin', body: h, alert: alert, polite: true };   // the coordinate fields still work, so the map error is not urgent
  }
  function readPinInputs() {
    const p = app.pin; if (!p) return;
    const n = $('#pin-name'), q = $('#pin-q');
    if (n) p.name = n.value;
    if (q) p.pq = q.value;
  }
  const NAME_ERR = 'Give this mountain a name.';
  // A pin may not take the name of a mountain already on the list (same name, ignoring case); the pin being edited is not counted.
  function nameErr(v) {
    const t = v.trim(); if (!t) return NAME_ERR;
    const taken = app.watch.some((x) => x !== (app.pin && app.pin.editId) && mt(x) && same(mt(x).name, t));
    return taken ? fill(T.dupName, { name: t }) : '';
  }
  // The name is checked when the field is left, in place, so a tap that is already under way is not lost.
  // Once the field has an error, it is checked again on every change.
  function markNameErr() {
    const n = $('#pin-name'), w = $('#pin-name-wrap'); if (!n || !w || !app.pin) return;
    const msg = nameErr(n.value), old = $('#pin-name-e');
    app.pin.errs.name = msg;
    if (msg && old) old.textContent = msg;
    if (msg && !old) { n.setAttribute('aria-invalid', 'true'); n.setAttribute('aria-describedby', 'pin-name-e'); const e = document.createElement('p'); e.className = 'err'; e.id = 'pin-name-e'; e.textContent = msg; w.appendChild(e); }
    if (!msg && old) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); old.remove(); }
  }
  function movePin(dLat, dLon, quiet) {
    const p = app.pin, step = 0.04 / p.zoom;
    p.lat = Math.max(-90, Math.min(90, p.lat + dLat * step));
    p.lon = Math.max(-180, Math.min(180, p.lon + dLon * step));
    const map = $('#pinmap'), ro = $('#pin-readout');
    if (map) map.setAttribute('style', mapStyle(p));
    if (ro) ro.textContent = readoutText();
    const la = $('#pin-lat'), lo = $('#pin-lon');
    if (la) la.value = p.lat.toFixed(3);
    if (lo) lo.value = p.lon.toFixed(3);
    if (!quiet) say(readoutText());
  }

  /* ---------- screen: S5 edit list ---------- */
  function syncEdit() {
    if (!app.edit) app.edit = app.watch.map((id) => ({ id: id, removed: false }));
    app.edit = app.edit.filter((e) => e.removed || app.watch.indexOf(e.id) >= 0);
    app.watch.forEach((id) => { if (!app.edit.some((e) => e.id === id && !e.removed)) { app.edit = app.edit.filter((e) => e.id !== id); app.edit.push({ id: id, removed: false }); } });
    app.watch = app.edit.filter((e) => !e.removed).map((e) => e.id);
  }
  // An Undo row stays where the mountain was until Forecast is closed. Done and Back do not clear it.
  const undoRow = (name, actName, id) => `<li class="erow undo-row"><span>${fill(esc(T.removed), { name: `<span translate="no">${esc(name)}</span>` })}</span><button type="button" class="btn sm alt" data-act="${actName}"${id ? ` data-id="${id}"` : ''}>Undo<span class="sr"> removing ${esc(name)}</span></button></li>`;
  function viewS5() {
    syncEdit();
    const s = st(), live = app.edit.filter((e) => !e.removed), g = M.goneEntry;
    const goneRow = s === 'partial' && app.gone === 'row', goneUndo = s === 'partial' && app.gone === 'removed';
    const anyLive = live.length > 0 || goneRow, anyUndo = app.edit.some((e) => e.removed) || goneUndo;
    let h = '', alert = '';
    if (s === 'error') {
      alert = "Couldn't save your changes. They'll last until you close the app. This device may be in private browsing or out of space.";
      h += `<div class="wx-note bad">${alert}</div>`;
    }
    const emptyBlock = '<div class="empty"><h3 class="title">Your list is empty</h3><p>Add a mountain to start comparing ski days.</p><button type="button" class="btn" data-act="go" data-v="s3">Add a mountain</button></div>';
    if (s === 'empty' || (!anyLive && !anyUndo)) return { title: 'Edit list', body: h + emptyBlock, alert: alert };
    if (anyLive) h += '<p class="sub">Drag to reorder, or use the arrows. The calendar shows mountains in this order.</p>';
    h += '<ol class="edit-list" role="list" aria-label="Your mountains, in calendar order">';
    let pos = 0;
    app.edit.forEach((e) => {
      // Every control name carries the mountain; when two on the list share a name, the region too.
      const m = mt(e.id), who = esc(nameOf(e.id));
      if (e.removed) { h += undoRow(nameOf(e.id), 'undo', e.id); return; }
      const first = pos === 0, lastOne = pos === live.length - 1; pos++;
      h += `<li class="erow"><span class="handle" aria-hidden="true">≡</span><div class="main"><b translate="no">${esc(m.name)}</b><small>${esc(place(m))}</small>${m.kind === 'pin' ? '<span class="tag">Pinned</span>' : ''}</div><div class="ctl">
        ${first ? '' : `<button type="button" class="btn sm alt" data-act="move" data-v="-1" data-id="${e.id}">Move up<span class="sr">: ${who}</span></button>`}
        ${lastOne ? '' : `<button type="button" class="btn sm alt" data-act="move" data-v="1" data-id="${e.id}">Move down<span class="sr">: ${who}</span></button>`}
        <button type="button" class="btn sm alt" data-act="remove" data-id="${e.id}">Remove<span class="sr"> ${who}</span></button>
        ${m.kind === 'pin' ? `<button type="button" class="btn sm alt" data-act="edit-pin" data-id="${e.id}">Edit pin<span class="sr">: ${who}</span></button>` : ''}</div></li>`;
    });
    if (goneRow) {
      h += `<li class="erow"><span class="handle" aria-hidden="true">≡</span><div class="main"><b translate="no">${esc(g.name)}</b><small>${esc(place(g))}</small><small class="gone-line">No longer in the worldwide list</small></div><div class="ctl"><button type="button" class="btn sm alt" data-act="gone-keep" aria-label="Keep as a pin: ${esc(g.name)}">Keep as a pin</button><button type="button" class="btn sm alt" data-act="gone-remove" aria-label="Remove ${esc(g.name)}">Remove</button></div></li>`;
    } else if (goneUndo) h += undoRow(g.name, 'gone-undo', null);
    h += '</ol>';
    if (!anyLive) h += emptyBlock;                        // below the Undo rows, so a removal can still be undone; "Add a mountain" shows only here
    h += '<button type="button" class="btn" data-act="back">Done</button>';
    return { title: 'Edit list', body: h, alert: alert };
  }

  /* ---------- screen: S6 plan a trip ---------- */
  const MAX_LATER = 14;
  const isoDay = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return isNaN(d) ? null : Math.round((d.getTime() - D0.getTime()) / 864e5); };
  // Later dates: days inside the forecast range select their chips; days beyond it are listed as "Not yet",
  // up to MAX_LATER days (stated under the chips: "Later dates show up to 14 days.").
  function laterOut() {
    const f = app.later.from ? isoDay(app.later.from) : null, t = app.later.to ? isoDay(app.later.to) : f;
    if (f == null || t == null || t < f) return [];
    const out = [];
    for (let i = Math.max(f, M.days); i <= t && out.length < MAX_LATER; i++) out.push(i);
    return out;
  }
  // The days a range adds are remembered, so changing or clearing the range unpicks them and leaves the chips the user pressed.
  function applyLater() {
    const L = app.later, f = L.from ? isoDay(L.from) : null, t = L.to ? isoDay(L.to) : f;
    L.err = '';
    if (f != null && t < f) { L.err = 'The end date must be on or after the start date.'; return; }   // the earlier picks stand
    app.tripDays = app.tripDays.filter((d) => (L.added || []).indexOf(d) < 0);
    L.added = [];
    if (f == null) return;
    for (let i = Math.max(0, f); i <= Math.min(t, M.days - 1); i++) if (app.tripDays.indexOf(i) < 0) { app.tripDays.push(i); L.added.push(i); }
  }
  function tripRank(days) {
    const out = [], failed = [];
    app.watch.forEach((id, order) => {
      if (isFailed(id)) { failed.push(id); return; }
      const cells = days.map((i) => {
        const d = eff(id, i);
        if (d.status === 'scored') return { i: i, v: d.score, txt: String(d.score), lab: band(d.score).label, b: band(d.score).n, k: 'scored', o: { n: d.score, label: band(d.score).label } };
        if (d.status === 'range') { const v = Math.round((d.lo + d.hi) / 2); return { i: i, v: v, txt: d.lo + '–' + d.hi, lab: 'Outlook', b: band(v).n, k: 'range', o: { lo: d.lo, hi: d.hi } }; }
        // Owner decision H3: a closed day is shown as "Closed", never a number, and counts toward neither coverage nor the average.
        if (d.status === 'closed') return { i: i, v: null, txt: '⦸', lab: 'Closed', b: 0, na: true, closed: true, k: 'closed', o: {} };
        return { i: i, v: null, txt: '–', lab: 'Insufficient data', b: 0, na: true, k: 'insufficient', o: {} };
      });
      const have = cells.filter((c) => c.v != null), closed = cells.filter((c) => c.closed).length;
      const avg = have.length ? Math.round(have.reduce((a, c) => a + c.v, 0) / have.length) : null;
      const strong = have.slice().sort((a, b) => b.v - a.v)[0], weak = have.slice().sort((a, b) => a.v - b.v)[0];
      out.push({ id: id, order: order, cells: cells, cov: have.length, closed: closed, allClosed: closed === cells.length, avg: avg, strong: strong, weak: weak });
    });
    // A mountain closed on every picked day is listed last; the rest rank on their open days: coverage, average, weakest day, your order.
    out.sort((a, b) => (a.allClosed - b.allClosed) || (b.cov - a.cov) || ((b.avg || 0) - (a.avg || 0)) || ((b.weak ? b.weak.v : 0) - (a.weak ? a.weak.v : 0)) || (a.order - b.order));
    return { ranked: out, failed: failed };
  }
  // The visible short date: "Fri 4" inside the calendar, "Dec 16" beyond it (Part 0 §0.9.7).
  const visDate = (i) => (i < M.days ? `${wkday(i)} ${fmt(i, { day: 'numeric' })}` : fmt(i, { month: 'short', day: 'numeric' }));
  // A run of days is one span; anything else is a list of dates joined by the language's list rule. The spoken form uses long dates and "to".
  function spanTxt(days, speak) {
    const f = speak ? longDate : visDate;
    if (days.length > 1 && days.every((d, i) => i === 0 || d === days[i - 1] + 1)) return fill(speak ? T.spanSay : T.span, { a: f(days[0]), b: f(days[days.length - 1]) });
    return listOf(days.map(f));
  }
  // One or two whole sentences: the days picked, then (if any) the days not in range yet.
  function tripSummary(days, out, speak) {
    out = out || [];
    const n = days.length + out.length;
    if (!n) return T.noDays;
    const first = days.length ? count('picked', n, { span: spanTxt(days, speak) }) : count('pickedOnly', n);
    return out.length ? first + ' ' + count('notYet', out.length, { span: spanTxt(out, speak) }) : first;
  }
  const tripSumHTML = (days, out) => `<span aria-hidden="true">${esc(tripSummary(days, out))}</span><span class="sr">${esc(tripSummary(days, out, true))}</span>`;
  function viewS6() {
    const s = st(), days = s === 'empty' ? [] : app.tripDays.slice().sort((a, b) => a - b), out = s === 'empty' ? [] : laterOut();
    let h = '', alert = '', polite = false;
    if (s === 'offline') { alert = `You're offline. Ranking uses forecasts as of ${updatedAt()}.`; polite = true; h += `<div class="wx-note warn">${alert}</div>`; }   // N-S6-04, spoken once
    let chips = '';
    // The first chip reads "Today"; the others the weekday and date.
    for (let i = 0; i < M.days; i++) chips += `<button type="button" class="chip" data-act="chip" data-v="${i}" aria-pressed="${days.indexOf(i) >= 0}">${i === 0 ? '<span>Today</span>' : `<span>${wkday(i)}</span> <b>${fmt(i, { day: 'numeric' })}</b>`}<span class="sr">${esc(fill(T.chip, { date: longDate(i) }))}</span></button>`;
    const enters = out.length ? longDate(out[0] - (M.days - 1)) : '';
    const L = app.later;
    // The "enters forecast range" note sits under the picked-days summary, outside the Later dates disclosure (decision H11).
    const entersNote = enters ? `<p class="note">${days.length ? `Your trip enters forecast range on ${esc(enters)}. Those days aren't ranked yet.` : `None of these days are in forecast range yet. Your trip enters range on ${esc(enters)}.`}</p>` : '';
    h += `<section><h3 id="h-days">Which days will you ski?</h3><div class="chips" role="group" aria-labelledby="h-days">${chips}</div>
      <p class="hint">Later dates show up to ${MAX_LATER} days.</p>
      <p class="sub" id="trip-sum">${tripSumHTML(days, out)}</p>${entersNote}</section>
      <div class="learn"><button type="button" class="fold" data-act="later" data-fkey="later-btn" aria-expanded="${!!L.open}" aria-controls="trip-later">Later dates</button>
      <div class="learn-text stack" id="trip-later"${L.open ? '' : ' hidden'}><p class="hint">Planning further ahead? Pick the dates and we'll rank them as soon as they are in forecast range.</p><div class="pair"><div><label class="lbl" for="trip-from">From</label><input class="field" type="date" id="trip-from" value="${esc(L.from)}"></div><div><label class="lbl" for="trip-to">To</label><input class="field" type="date" id="trip-to" value="${esc(L.to)}"${L.err ? ' aria-invalid="true" aria-describedby="trip-to-e"' : ''}>${L.err ? `<p class="err" id="trip-to-e">${L.err}</p>` : ''}</div></div>
      <p><button type="button" class="btn sm alt" data-act="later-clear" data-fkey="later-clear">Clear dates</button></p></div></div>`;
    if (s === 'error') {
      alert = "Couldn't load scores for your trip. Your dates are saved. Check your connection and try again.";
      h += `<div class="wx-note bad">${alert}${app.tries.s6 ? STILL('trip') : ''}<button type="button" class="btn sm alt" data-act="recover" data-what="trip">Try again</button></div>`;
      return { title: 'Plan a trip', body: h, alert: alert };
    }
    if (app.watch.length < 2) {
      h += '<div class="empty"><p>Add at least two mountains to compare them for your trip.</p><button type="button" class="btn" data-act="go" data-v="s3">Add a mountain</button></div>';
      return { title: 'Plan a trip', body: h, alert: alert, polite: polite };
    }
    if (!days.length) {
      if (!out.length) h += '<div class="empty"><h3 class="title">Pick the days you plan to ski</h3><p>We\'ll rank your mountains for just those days.</p></div>';
      return { title: 'Plan a trip', body: h, alert: alert, polite: polite };
    }
    if (s === 'loading') {
      h += '<section aria-labelledby="h-rank"><h3 id="h-rank">Ranking</h3><p class="note">Loading scores for your trip…</p><div class="stack">' + app.watch.slice(0, 3).map((id) => `<div class="card rank-card"><h4 translate="no">${esc(nameOf(id))}</h4><span class="busy" aria-busy="true"><span class="skel w60"></span><span class="skel tall"></span></span></div>`).join('') + '</div></section>';
      return { title: 'Plan a trip', body: h };
    }
    const t = tripRank(days), near = (a, b) => a && b && a.cov === b.cov && a.avg != null && b.avg != null && Math.abs(a.avg - b.avg) <= M.tripUncertainty;
    const stat = (c) => (c ? String(c.v) : '–');
    let list = '';
    t.ranked.forEach((r, i) => {
      const m = mt(r.id), b = r.avg == null ? null : band(r.avg), prev = t.ranked[i - 1];
      const wd = (x) => fmt(x.i, { weekday: 'long' });
      // Spoken twin of the four boxes below: one whole sentence set per variant and plural form.
      const srSum = r.allClosed ? fill(T.rankAllClosed, { rank: i + 1 }) : r.avg == null ? fill(T.rankNone, { rank: i + 1 })
        : count(r.closed ? 'rankClosed' : 'rank', days.length, { rank: i + 1, avg: r.avg, label: b.label, strong: stat(r.strong), sday: wd(r.strong), weak: stat(r.weak), wday: wd(r.weak), cov: r.cov, closed: r.closed });
      // A day button's name starts with the date on it ("Sat 6"), then the score, and ends with the mountain (and its region
      // when two listed mountains share a name): "Sat 6: ski score 86, Epic. Jay Peak." No two buttons and no day chip share a name.
      const btnName = (k, i2, o) => esc(fill(T.dayBtn[k], Object.assign({ name: nameOf(r.id) }, o)));
      const dayBtn = (c) => `<li><button type="button" class="daybtn${c.b ? ' b' + c.b : ''}${c.na ? ' na' : ''}" data-act="open-day" data-id="${r.id}" data-v="${c.i}"><span>${wkday(c.i)} ${fmt(c.i, { day: 'numeric' })}</span><span class="sr">${btnName(c.k, c.i, c.o)}</span><b aria-hidden="true">${c.txt}</b><span aria-hidden="true">${c.lab}</span></button></li>`;
      // A "Not yet" day has no day view; its button stays enabled and says when the day enters range.
      const notYet = (i2) => `<li><button type="button" class="daybtn na" data-act="not-yet" data-id="${r.id}" data-v="${i2}"><span>${esc(fmt(i2, { month: 'short', day: 'numeric' }))}</span><span class="sr">${btnName('notYet', i2)}</span><b aria-hidden="true">–</b><span aria-hidden="true">Not yet</span></button></li>`;
      const why = app.notYet && app.notYet.id === r.id ? `<p class="note">${esc(longDate(app.notYet.i))} enters forecast range on ${esc(longDate(app.notYet.i - (M.days - 1)))}.</p>` : '';
      // The Coverage box holds the whole line ("Coverage 3 of 4 days · 1 closed"), one string per plural form.
      const covLine = count(r.closed ? 'covClosed' : 'cov', days.length, { cov: r.cov, closed: r.closed });
      const boxes = r.allClosed ? `<p aria-hidden="true">${T.allClosed}</p>`
        : `<div class="boxes b4" aria-hidden="true"><div class="box"><span class="cap">Average</span><b>${r.avg == null ? '–' : r.avg}</b><small>${b ? b.label : 'Insufficient data'}</small></div><div class="box"><b class="whole">${esc(covLine)}</b></div><div class="box"><span class="cap">Strongest</span><b>${stat(r.strong)}</b><small>${r.strong ? wkday(r.strong.i) : ''}</small></div><div class="box"><span class="cap">Weakest</span><b>${stat(r.weak)}</b><small>${r.weak ? wkday(r.weak.i) : ''}</small></div></div>`;
      list += `<li class="card rank-card"><div class="rank-head"><span class="no" aria-hidden="true">${i + 1}</span><h4 id="rk-${r.id}" tabindex="-1" translate="no">${esc(nameOf(r.id))}</h4>${m.kind === 'pin' ? '<span class="tag">Pinned</span>' : ''}${st() === 'partial' && r.id === M.staleId ? `<span class="tag warn">${staleHTML()}</span>` : ''}</div>
        ${near(prev, r) ? `<p class="closecall">Close call: <span translate="no">${esc(nameOf(prev.id))}</span> and <span translate="no">${esc(nameOf(r.id))}</span> are closer than the forecast can tell apart.</p>` : ''}<p class="sr">${esc(srSum)}</p>
        ${boxes}
        <ul class="daybtns" role="list">${r.cells.map(dayBtn).join('')}${out.map(notYet).join('')}</ul>${why}</li>`;
    });
    t.failed.forEach((id) => {
      const again = app.tries['row:' + id], who = esc(nameOf(id));
      list += `<li class="card rank-card"><h4 id="rk-${id}" tabindex="-1" translate="no">${who}</h4><p>${fill(esc(again ? T.still.row : T.cardFail), { name: `<span translate="no">${who}</span>` })}</p><button type="button" class="btn sm alt" data-act="retry" data-id="${id}">Try again<span class="sr">: ${who}</span></button></li>`;
    });
    h += `<section aria-labelledby="h-rank"><h3 id="h-rank">Ranking</h3><ol class="stack" role="list">${list}</ol></section><p class="note">Closed days and days without a score don't count. A mountain closed on all your days is listed last.</p>`;
    return { title: 'Plan a trip', body: h, alert: alert, polite: polite };
  }

  /* ---------- screen: S7 how scores work ---------- */
  const BANDS_TABLE = () => `<table class="bands"><caption>Score labels</caption><thead><tr><th scope="col">Label</th><th scope="col">Score</th></tr></thead><tbody>${M.bands.map((b) => `<tr><th scope="row">${b.label}</th><td><span aria-hidden="true">${b.min}–${b.max}</span><span class="sr">${b.min} to ${b.max}</span></td></tr>`).join('')}</tbody></table>`;
  const EXPLAIN = [
    ['What the score means', () => '<p>Each day gets a ski score out of 100 for an all-around skier on lift-served terrain. An 80 means about the same kind of day at any mountain, anywhere.</p>'],
    ['What goes into it', () => '<p>Every ski hour is scored on four things, at the base and at the summit.</p><ul class="stack" role="list"><li><b>Snow surface 45%</b> — what the snow will feel like, from the last two to three days of weather: new snow, rain that refroze, softening in the sun.</li><li><b>Visibility 25%</b> — fog on the summit, flat light, heavy snowfall.</li><li><b>Wind 20%</b> — wind and gusts at that height.</li><li><b>Comfort 10%</b> — how cold it feels and whether rain or snow is falling.</li></ul><p>A clear day on grippy groomers can score high with no new snow.</p>'],
    ['How a day is scored', () => '<p>The day score mixes the whole day with its best stretch: 60% from the average of all ski hours, 40% from the best three hours in a row. A day averaging 70 with a best stretch of 85 scores 76. The best window and the peak hour are shown separately.</p><p>A day needs at least 3 ski hours with weather data, and no more than half of its ski hours missing. Otherwise it shows Insufficient data instead of a score.</p><p>If no 3 hours in a row have data, the best stretch uses the longest run there is, and the day view shows "Best window: under 3 hours of data". Scores are rounded to the nearest whole number, halves up.</p>'],
    ['Score labels', () => BANDS_TABLE() + '<p>When a day shows a range, the label only appears if the whole range fits one label.</p>'],
    ['Confidence', () => '<p>Confidence says how sure the forecast is, not how good the day is. A great day can have low confidence. It depends on how far ahead the day is, how fresh the forecast is, whether weather models agree, and whether the base and summit can be told apart. The best window\'s timing has its own confidence.</p>'],
    ['Detail by distance', () => '<p>Today and tomorrow: hourly detail. Days 3 to 5: a daily score and a broad window such as Morning. Days 6 to 9: a likely range.</p>'],
    ['Closed and insufficient data', () => '<p>Closed means the mountain has confirmed it is closed that day. Insufficient data means there isn\'t enough weather information to score the day fairly. Neither is a low score.</p>'],
    ['Tags and statuses', () => '<dl class="kv terms"><dt>Pinned</dt><dd>A mountain you added by dropping a pin. We know one point, so you see one estimate for the whole mountain.</dd><dt>Outlook</dt><dd>Days 6 to 9 show a likely score range, not hourly detail.</dd><dt>Top pick</dt><dd>The highest ski score for the date you sorted by.</dd><dt>Close call</dt><dd>Two mountains are closer than the forecast can tell apart.</dd><dt>Day over</dt><dd>Ski hours have ended at that mountain. The score is the forecast as it stood.</dd></dl>'],
    ['Base and summit', () => '<p>The base and summit are scored separately and averaged. When the weather service can\'t tell them apart, you\'ll see one estimate for the whole mountain and lower confidence. We never make up summit wind or visibility.</p>'],
    ['Times and weather services', () => '<p>All times are in each mountain\'s local time. Weather comes from the US National Weather Service in the United States and MET Norway elsewhere. When a weather service is delayed, you\'ll see the last good forecast and how old it is.</p>']
  ];
  function viewS7() {
    const h = EXPLAIN.map((x, i) => `<div class="learn"><h3 class="plain"><button type="button" class="fold" data-act="fold" data-v="${i}" aria-expanded="${!!app.open7[i]}" aria-controls="learn-${i}">${x[0]}</button></h3><div class="learn-text stack" id="learn-${i}"${app.open7[i] ? '' : ' hidden'}>${x[1]()}</div></div>`).join('');
    return { title: 'How scores work', body: h };          // no Done button: the back control is the way out
  }

  /* ---------- host stand-ins ---------- */
  function viewWx() {
    const id = M.mapMountain, m = mt(id), watched = app.watch.indexOf(id) >= 0, nm = `<span translate="no">${esc(m.name)}</span>`;
    let row;
    if (st() === 'loading') row = `<button type="button" class="row-link" data-act="wx-loading" data-fkey="wx-row"><span><b>Loading ski score…</b>${app.wxNote ? `<small>${esc(app.wxNote)}</small>` : ''}</span></button>`;
    else if (app.wxAdded && watched) row = `<div class="row-link wx-added"><span><b>${fill(esc(T.added), { name: nm })}</b></span><span class="ctl"><button type="button" class="btn sm alt" data-act="wx-day" data-fkey="wx-open">Open day view<span class="sr">: ${esc(m.name)}</span></button><button type="button" class="btn sm alt" data-act="wx-undo" data-fkey="wx-undo">Undo<span class="sr"> adding ${esc(m.name)}</span></button></span></div>`;
    // Error state, mountain on the list: the score could not load; the one button opens the day view in its error state.
    else if (watched && st() === 'error') row = `<div class="row-link wx-added"><span><b>Ski score couldn't load.</b></span><span class="ctl"><button type="button" class="btn sm alt" data-act="wx-day" data-fkey="wx-row">Open day view<span class="sr">: ${esc(m.name)}</span></button></span></div>`;
    else if (watched) {
      const d = eff(id, 0), b = d.score != null ? band(d.score) : null;
      // The name starts with the words on screen; the mountain follows, hidden.
      row = `<button type="button" class="row-link" data-act="wx-day" data-fkey="wx-row"><span><b>Ski score today</b><small>${b ? d.score + ' ' + b.label : 'Insufficient data'} · Tap to see the best hours</small><span class="sr">. ${esc(m.name)}.</span></span><span class="chev" aria-hidden="true">›</span></button>`;
    } else row = `<button type="button" class="row-link" data-act="wx-add" data-fkey="wx-row"><span><b>Add ${nm} to your list</b><small>Adds it and opens today's day view.</small></span><span class="chev" aria-hidden="true">+</span></button>`;
    return { title: 'Mountain weather', body: `<p class="fixture-flag">Static stand-in for the host's Mountain weather sheet. Only the ski score row is part of Forecast.</p><div class="boxes b3"><div class="box"><span class="cap">Summit</span><b>${temp(9)}</b></div><div class="box"><span class="cap">Base</span><b>${temp(18)}</b></div><div class="box"><span class="cap">Wind</span><b>${speed(12)}</b></div></div>${row}` };
  }
  const viewHost = (p) => ({ title: p.title, body: `<p class="fixture-flag">The ${esc(p.title)} section is not part of this prototype.</p>` });
  const VIEWS = { s1: viewS1, s2: viewS2, s3: viewS3, s4: viewS4, s5: viewS5, s6: viewS6, s7: viewS7, wx: viewWx, host: viewHost };

  /* ---------- rendering ---------- */
  function keyOf(el) {
    if (!el || !el.getAttribute) return null;
    return el.getAttribute('data-fkey') || (el.id ? '#' + el.id : null) ||
      (el.getAttribute('data-act') ? ['act', el.getAttribute('data-act'), el.getAttribute('data-id'), el.getAttribute('data-v'), el.getAttribute('data-r'), el.getAttribute('data-c')].join('|') : null);
  }
  function findByKey(key) {
    if (!key) return null;
    if (key[0] === '#') return document.getElementById(key.slice(1));
    return $$('[data-fkey],[data-act]', $('#phone')).filter((e) => keyOf(e) === key)[0] || null;
  }
  const topKey = () => (top() ? top().screen + JSON.stringify(top().p) : '');
  function focusTitle() { const t = $('#sheet-title'); if (t) t.focus(); }
  function render(focus) {
    const sheet = $('#sheet'), body = $('#sheet-body');
    const keep = focus === 'keep' && document.activeElement && sheet.contains(document.activeElement) ? keyOf(document.activeElement) : null;
    const same = app.rendered === topKey(), sc = body.scrollTop, gw0 = $('#grid-wrap'), gs = gw0 ? [gw0.scrollLeft, gw0.scrollTop] : null;
    document.documentElement.setAttribute('data-theme', app.theme);
    const open = app.stack.length > 0, onStart = app.bg === 'start';
    $('#app-bg').hidden = onStart; $('#start').hidden = !onStart; $('#tabs').hidden = onStart;
    // Everything in the app outside the sheet, except the tab bar, is inert while a sheet is open.
    $('#app-bg').inert = open; $('#start').inert = open;
    sheet.hidden = !open; sheet.classList.toggle('over-start', onStart);
    const cur = !open ? 'map' : inForecast() ? 'forecast' : top().screen === 'host' ? top().p.tab : 'map';
    $$('#tabs button').forEach((b) => { if (b.getAttribute('data-v') === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (open) {
      const t = top(), v = VIEWS[t.screen](t.p);
      const title = $('#sheet-title');
      title.textContent = '';
      const tn = document.createElement('span'); tn.textContent = v.title; if (v.nameTitle) tn.setAttribute('translate', 'no'); title.appendChild(tn);
      if (v.titleSr) { const ts = document.createElement('span'); ts.className = 'sr'; ts.textContent = v.titleSr; title.appendChild(ts); }   // S2: ", Saturday, December 5"
      const prev = app.stack[app.stack.length - 2];
      // The back control names where it goes; from the explainer opened on a day, that is the mountain.
      const backTo = !prev ? '' : prev.screen === 's2' && mt(prev.p.id) ? `<span translate="no">${esc(nameOf(prev.p.id))}</span>` : esc(SCREENS[prev.screen].label);
      $('#back-slot').innerHTML = prev ? `<button type="button" class="back" data-act="back"><span aria-hidden="true">‹ </span>${backTo}</button>` : '';
      body.innerHTML = v.body + (inForecast() ? `<p class="fixture-flag">${esc(M.fixtureNote)}</p>` : '');
      if (v.after) v.after();
      if (same) { body.scrollTop = sc; const gw = $('#grid-wrap'); if (gw && gs) { gw.scrollLeft = gs[0]; gw.scrollTop = gs[1]; } }
      else body.scrollTop = 0;
      app.rendered = topKey();
      // An error is spoken once when the screen first shows it: assertive when it blocks the screen, polite when the screen still works.
      const ak = v.alert ? topKey() + '|' + st() : '';
      if (ak && app.alerted !== ak) (v.polite ? say : alertMsg)(v.alert);
      app.alerted = ak; app.lastAlert = v.polite ? v.alert || '' : '';
    } else { app.rendered = ''; app.alerted = ''; }
    renderPanel();
    if (focus === 'title') focusTitle();
    else if (typeof focus === 'function') focus();
    else if (keep) { const e = findByKey(keep); if (e) e.focus(); else focusTitle(); }
  }

  /* ---------- navigation ---------- */
  function pushHist() {
    if (app.noHist) return;
    try { app.hpos++; history.pushState({ d: app.hpos }, ''); } catch (e) { app.noHist = true; }
  }
  function saveView(t) {
    t.scroll = $('#sheet-body').scrollTop;
    const gw = $('#grid-wrap'); if (gw) t.grid = [gw.scrollLeft, gw.scrollTop];
  }
  // Going forward: focus lands on the new screen's title (S3: its search field). Every screen is a history entry.
  function nav(screen, p, quiet) {
    const t = top();
    if (t) { t.returnKey = keyOf(document.activeElement); saveView(t); }
    if (screen === 's3') { app.sessionAdded = {}; app.saveFail = {}; }
    app.stack.push({ screen: screen, p: p || {} });
    pushHist();
    if (!quiet) render(screen === 's3' ? () => { const i = $('#fc-q'); if (i) i.focus(); } : 'title');
  }
  // Going back (Back, Escape, Done, the phone's own Back): focus returns to the control that opened the screen.
  function popTo(n, focusFn) {
    if (n <= 0) { closeSheet(); return; }
    app.stack.length = n;
    const t = top();
    render(() => {
      $('#sheet-body').scrollTop = t.scroll || 0;                 // scroll first, then focus
      const gw = $('#grid-wrap'); if (gw && t.grid) { gw.scrollLeft = t.grid[0]; gw.scrollTop = t.grid[1]; }
      if (focusFn) { focusFn(); return; }
      let e = null;
      if (t.screen === 's1' && t.returnKey && t.returnKey.indexOf('act|cell') === 0) e = $('#fc-grid [tabindex="0"]');
      e = e || findByKey(t.returnKey);
      if (e) e.focus(); else focusTitle();
    });
  }
  function back() {
    if (!app.stack.length) return;
    if (!app.noHist && history.state && history.state.d === app.hpos && app.hpos > 0) { history.back(); return; }
    popTo(app.stack.length - 1);
  }
  // Closing Forecast is the moment Undo rows end. The calendar's scroll position is kept for next time.
  function closeSheet(focusFn) {
    const s1 = app.stack[0] && app.stack[0].screen === 's1' ? app.stack[0] : null;
    if (s1) { if (app.stack.length === 1) saveView(s1); app.s1Keep = { scroll: s1.scroll || 0, grid: s1.grid || null }; }
    app.stack = []; app.edit = null; app.sessionAdded = {}; app.saveFail = {}; app.wxAdded = false; app.wxFail = 0; app.refreshOut = null; app.wxNote = ''; app.highlight = null; app.pin = null;
    if (app.gone === 'removed') app.gone = 'done';
    render(focusFn || (() => { const o = findByKey(app.opener) || $('#tabs [data-v="forecast"]'); if (o && !o.closest('[hidden]')) o.focus(); }));
  }
  function openForecast(openerKey) {
    app.opener = openerKey; app.stack = [];
    nav('s1', {}, true);
    render(() => {
      const k = app.s1Keep, gw = $('#grid-wrap');
      if (k) { $('#sheet-body').scrollTop = k.scroll; if (gw && k.grid) { gw.scrollLeft = k.grid[0]; gw.scrollTop = k.grid[1]; } }
      focusTitle();
    });
  }
  function jump(screen) {                       // "Prototype states" panel: go straight to a screen
    const jay = M.mapMountain;
    const paths = {
      s1: [['s1']], s2: [['s1'], ['s2', { id: app.watch.indexOf(jay) >= 0 ? jay : app.watch[0], day: 1 }]], s3: [['s1'], ['s3']],
      s4: [['s1'], ['s3'], ['s4']], s5: [['s1'], ['s5']], s6: [['s1'], ['s6']], s7: [['s1'], ['s7']]
    };
    if (screen === 's2' && !app.watch.length) resetFixtures();
    app.stack = (paths[screen] || paths.s1).map((x) => ({ screen: x[0], p: x[1] || {} }));
    app.pin = null; app.opener = 'tab-forecast';
    if (app.bg === 'start') app.opener = 'start-forecast';
  }
  // Back to the calendar with one row outlined for 4 seconds; focus goes to that row's header.
  // A row added in this visit is also tagged "New"; a row reached with "Show" (isNew false) is not.
  function showRow(id, msg, isNew) {
    app.highlight = id; app.hlNew = isNew !== false; app.sortCol = null;
    app.cell = { r: Math.max(0, app.watch.indexOf(id)), c: -1 };
    app.stack.length = 1; app.stack[0].returnKey = null; app.stack[0].grid = null;
    render(() => { const t = $(`#fc-grid [data-rowhead="${id}"]`); if (t) { t.focus(); if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else focusTitle(); });
    if (msg) say(msg);
    setTimeout(() => { if (app.highlight === id) { app.highlight = null; $$('tr.new').forEach((r) => r.classList.remove('new')); $$('.newtag').forEach((r) => r.remove()); } }, 4000);
  }

  /* ---------- actions ---------- */
  let downXY = null;
  const focusSel = (sel) => () => { const e = $(sel); if (e) e.focus(); else focusTitle(); };
  function act(el, e) {
    const a = el.getAttribute('data-act'), id = el.getAttribute('data-id'), v = el.getAttribute('data-v');
    switch (a) {
      case 'leave': { if (e) e.preventDefault(); const s = $('#proto-panel summary'); if (s) s.focus(); break; }
      case 'tab':
        if (v === 'forecast') {
          if (inForecast() && top().screen === 's1') closeSheet();
          // A day view opened from the Mountain weather row has no calendar under it: the tab opens the calendar, focus on its title.
          else if (inForecast() && app.stack[0].screen !== 's1') { app.stack = [{ screen: 's1', p: {} }]; render('title'); }
          else if (inForecast()) popTo(1);
          else openForecast('tab-forecast');
        } else if (v === 'map') closeSheet();
        else { closeSheet(() => {}); app.opener = 'tab-' + v; app.stack = [{ screen: 'host', p: { title: el.textContent.trim(), tab: v } }]; render('title'); }
        break;
      case 'open-forecast': openForecast(el.getAttribute('data-fkey') || 'tab-forecast'); break;
      case 'open-wx': app.opener = 'infobar'; app.stack = []; nav('wx', {}); break;
      case 'join': setProMsg('Join Group belongs to the host app and is not part of this prototype.'); break;
      case 'close': closeSheet(); break;
      case 'back': back(); break;
      case 'go': nav(v, {}); break;
      case 'recover': {
        const scr = top().screen, what = el.getAttribute('data-what') || 'day';
        // Fails once; message and button stay. The repeated map failure is polite (N-S4-14): the coordinates still work.
        if (!secondTry(scr)) { render('keep'); (what === 'map' ? say : alertMsg)(T.still[what]); break; }
        app.pstate = 'default'; app.tries = {}; app.refreshOut = null; syncUrl(); render('keep');
        if (scr === 's1') toast('Forecasts updated'); else say('Loaded.');
        if (!$('#sheet').contains(document.activeElement)) focusTitle();
        break;
      }
      case 'refresh':
        if (st() === 'offline') { app.refreshOut = { key: topKey(), kind: 'offline' }; render('keep'); say(OFFLINE_REFRESH); break; }   // no toast: the line now stays in the footer
        el.textContent = 'Updating…';
        setTimeout(() => {
          if (!top()) return;
          const scr = top().screen;
          if (st() === 'error') {                                       // the error card's text changes; nothing in the footer, no toast
            app.tries[scr] = Math.max(1, app.tries[scr] || 0); render('keep'); alertMsg(T.still[scr === 's2' ? 'day' : 'forecasts']);
            return;
          }
          if (app.refreshFails && st() === 'default') {                 // panel option "Refresh fails": N-S1-05, polite, the line stays
            app.refreshOut = { key: topKey(), kind: 'fail' }; render('keep'); say(fill(T.refreshFail, { time: updatedAt() }));
            return;
          }
          const failing = scr === 's1' ? app.watch.filter(isFailed).length : 0;
          if (failing) {                                                // some rows still fail: no "Forecasts updated"
            app.refreshOut = { key: topKey(), kind: 'partial', n: failing }; render('keep'); say(count('updPartial', failing));
            return;
          }
          app.refreshOut = null;
          const b = findByKey('refresh'); if (b) b.textContent = 'Refresh'; toast('Forecasts updated');
        }, 900);
        break;
      case 'today': {
        app.cell = { r: Math.max(0, app.cell.r), c: 0 }; setRoving();
        const gw = $('#grid-wrap'); if (gw) gw.scrollLeft = 0;
        const t = $('#fc-grid [tabindex="0"]'); if (t) t.focus();       // on a failed row this is the spanning cell
        const h = $('#fc-grid th.date'); if (h) { h.classList.add('flash'); setTimeout(() => h.classList.remove('flash'), 1500); }
        say('Showing today.');
        break;
      }
      case 'sort': {
        const c = +el.getAttribute('data-c');
        app.sortCol = app.sortCol === c ? null : c; app.lastSort = c; app.cell = { r: -1, c: c };
        render('keep'); const t = $('#fc-grid [tabindex="0"]'); if (t) t.focus();
        if (app.sortCol == null) say('Back to your order.');
        else say(fill(T.sortSay, { date: longDate(c), name: nameOf(rowOrder()[0]) }));
        break;
      }
      case 'unsort': app.sortCol = null; app.cell = { r: -1, c: app.lastSort }; render(focusSel('#fc-grid [tabindex="0"]')); say('Back to your order.'); break;
      case 'cell':
        if (downXY && e && e.clientX != null && (Math.abs(e.clientX - downXY[0]) > 10 || Math.abs(e.clientY - downXY[1]) > 10)) break;   // a swipe, not a tap
        openDay(id, +el.getAttribute('data-c'), el); break;
      case 'retry': {
        const nm = nameOf(id), s1 = top().screen === 's1', s2 = top().screen === 's2';
        if (!secondTry('row:' + id)) { render('keep'); (s2 ? alertMsg : say)(s2 ? T.still.day : fill(T.still.row, { name: nm })); break; }
        app.retried[id] = true;
        if (s2) render('title');
        else if (s1) { app.cell = { r: rowOrder().indexOf(id), c: 0 }; render(focusSel('#fc-grid [tabindex="0"]')); }
        else render(focusSel('#rk-' + id));
        say(fill(T.loaded, { name: nm }));
        break;
      }
      case 'units': app.units = v; render('keep'); say(v === 'imp' ? 'Showing °F and inches.' : 'Showing °C and centimetres.'); break;
      case 'block': app.block = v; render('keep'); break;
      case 'step': case 'goto-day': {
        const t = top(), day = a === 'step' ? t.p.day + (+v) : +v, key = keyOf(el);
        t.p = Object.assign({}, t.p, { day: day }); app.rendered = topKey();
        // Focus stays on the stepper that was used; if that one is gone, the other one; failing that, the title.
        render(a === 'step' ? () => { const k = findByKey(key) || findByKey('step-prev') || findByKey('step-next'); if (k) k.focus(); else focusTitle(); } : 'title');
        // A polite banner sentence for the new day (offline, N-S2-05; a refresh that failed) follows the day, in one message.
        say(`${longDate(day)}. ${daySay(st() === 'empty' ? { status: 'closed' } : eff(t.p.id, day))}${app.lastAlert ? ' ' + app.lastAlert : ''}`);
        break;
      }
      case 'open-day': nav('s2', { id: id, day: +v }); break;
      case 'not-yet': app.notYet = { id: id, i: +v }; render('keep'); say(`${longDate(+v)} enters forecast range on ${longDate(+v - (M.days - 1))}.`); break;
      case 'open-map':                                             // closes Forecast; focus lands on the resort name in the app header
        app.bg = 'map'; closeSheet(focusSel('#resort-name'));
        setProMsg('"Open the map" closes Forecast and flies to that mountain (static stand-in here). Focus is on the mountain name in the header.');
        break;
      case 'add': {
        const c = M.catalog.filter((x) => x.id === id)[0];
        // Saving fails in the error state: the message stays under the row. Like every retry here, the first
        // "Try again" fails once more (so the "still couldn't" wording can be seen) and the next one saves.
        if (st() === 'error' && (app.saveFail[id] || 0) < 2) {
          app.saveFail[id] = (app.saveFail[id] || 0) + 1;
          render(focusSel(`#fc-results [data-act="add"][data-id="${id}"]`));
          alertMsg(fill(app.saveFail[id] > 1 ? T.still.save : T.saveFail, { name: c.name }));
          break;
        }
        delete app.saveFail[id];
        addMountain(id); render(focusSel(`#fc-results [data-act="unadd"][data-id="${id}"]`)); say(fill(T.added, { name: nameOf(id) }));
        break;
      }
      case 'unadd': { const nm = nameOf(id); app.watch = app.watch.filter((x) => x !== id); delete app.sessionAdded[id]; render(focusSel(`#fc-results [data-act="add"][data-id="${id}"]`)); say(`${nm} removed from your list.`); break; }
      case 'show-row': showRow(id, `${nameOf(id)} is already on your list.`, false); break;
      case 'show-forecast': {
        const ids = Object.keys(app.sessionAdded), msg = count('added', ids.length);
        if (fromTrip()) { popTo(app.stack.map((x) => x.screen).indexOf('s6') + 1, focusTitle); say(msg); }
        else showRow(ids[0], msg);                                 // focus: the row header of the first mountain added
        break;
      }
      case 'place': { readPinInputs(); const x = app.pin.found[+v]; app.pin.lat = x.lat; app.pin.lon = x.lon; app.pin.found = null; render(focusSel('#pinmap')); say(`Map moved to ${x.name}. ${readoutText()}`); break; }
      case 'pan': movePin(v === 'n' ? 1 : v === 's' ? -1 : 0, v === 'e' ? 1 : v === 'w' ? -1 : 0); break;
      case 'zoom': {
        app.pin.zoom = Math.max(1, Math.min(6, app.pin.zoom + (+v)));
        const map = $('#pinmap'), z = $('#pin-zoom');
        if (map) map.setAttribute('style', mapStyle(app.pin));
        if (z) z.textContent = `Zoom ${app.pin.zoom} of 6`;
        say(`Zoom level ${app.pin.zoom} of 6.`);
        break;
      }
      case 'locate':
        readPinInputs();
        if (st() === 'no-permission') { app.pin.denied = true; render(focusSel('#pin-q')); say("Location is off for SkiWithMe, so we can't centre the map on you. Search for a nearby town instead."); }
        else { app.pin.lat = 44.588; app.pin.lon = -71.944; render('keep'); say(`Map centred on your location. ${readoutText()}`); }
        break;
      case 'coords': {
        readPinInputs();
        const open = el.getAttribute('aria-expanded') === 'true';
        app.pin.coords = !open;
        render(focusSel('[data-fkey="pin-coords-btn"]'));           // focus stays on the disclosure; the next Tab is Latitude
        break;
      }
      case 'apply-coords': {
        readPinInputs(); const la = parseFloat($('#pin-lat').value), lo = parseFloat($('#pin-lon').value), errs = {};
        if (isNaN(la) || la < -90 || la > 90) errs.lat = 'Enter a latitude between -90 and 90.';
        if (isNaN(lo) || lo < -180 || lo > 180) errs.lon = 'Enter a longitude between -180 and 180.';
        app.pin.errs = Object.assign({ name: app.pin.errs.name }, errs); app.pin.coords = true;
        if (errs.lat || errs.lon) { render(focusSel(errs.lat ? '#pin-lat' : '#pin-lon')); alertMsg(errs.lat || errs.lon); }
        else { app.pin.lat = la; app.pin.lon = lo; render('keep'); say(readoutText()); }
        break;
      }
      case 'save-pin': {
        readPinInputs(); const p = app.pin; p.errs = { lat: p.errs.lat, lon: p.errs.lon };
        // An empty name, or the name of a mountain already on the list: inline error, focus stays in the field, announced assertively.
        const bad = nameErr(p.name);
        if (bad) { p.errs.name = bad; render(focusSel('#pin-name')); alertMsg(bad); break; }
        if (st() === 'error' && p.saveFail < 2) {                  // fails twice (the second shows "still couldn't"), then saves
          p.saveFail++; render('keep');
          alertMsg(p.saveFail > 1 ? fill(T.pinSaveStill, { name: p.name.trim() }) : T.pinSaveFail);
          break;
        }
        const unknown = st() === 'partial' || st() === 'offline';
        if (p.editId) {                                            // back to Edit list, focus on that row's Edit pin
          const pid = p.editId;
          Object.assign(mt(pid), { name: p.name.trim(), lat: p.lat, lon: p.lon });
          app.pin = null;
          popTo(app.stack.length - 1, focusSel(`[data-act="edit-pin"][data-id="${pid}"]`));
          say(`${nameOf(pid)} updated.`);
          break;
        }
        const pid = 'pin-' + p.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + app.watch.length;
        app.mountains[pid] = { id: pid, kind: 'pin', name: p.name.trim(), region: 'Dropped pin', country: fmtLL(p.lat, p.lon), tz: M.phoneTz, baseFt: unknown ? null : fakeElev(p.lat, p.lon), summitFt: null, lat: p.lat, lon: p.lon, built: false, source: 'nws', hoursPublished: false, uncached: true, days: JSON.parse(JSON.stringify(M.makeForecast(p.name.length + 3, true))) };
        app.watch.push(pid);
        app.pin = null; app.draft = null;                          // the draft ends when the pin is saved
        showRow(pid, `${nameOf(pid)} added to your list as a pin.`);
        break;
      }
      case 'remove-pin': {
        const pid = app.pin.editId; syncEdit();
        app.edit.forEach((x) => { if (x.id === pid) x.removed = true; }); app.watch = app.watch.filter((x) => x !== pid); app.pin = null;
        popTo(app.stack.length - 1, focusSel(`[data-act="undo"][data-id="${pid}"]`));
        say(`${nameOf(pid)} removed. Undo is available.`);
        break;
      }
      case 'edit-pin': nav('s4', { editId: id }); break;
      case 'move': {
        syncEdit(); const live = app.edit.filter((x) => !x.removed), i = live.findIndex((x) => x.id === id), j = i + (+v);
        if (j < 0 || j >= live.length) break;
        const a1 = app.edit.indexOf(live[i]), b1 = app.edit.indexOf(live[j]);
        app.edit[a1] = live[j]; app.edit[b1] = live[i];
        app.watch = app.edit.filter((x) => !x.removed).map((x) => x.id); app.sortCol = null;
        render(() => { const t = $(`[data-act="move"][data-v="${v}"][data-id="${id}"]`) || $(`[data-act="move"][data-id="${id}"]`); if (t) t.focus(); });
        say(`${nameOf(id)} moved to position ${j + 1} of ${live.length}.`);
        break;
      }
      case 'remove': syncEdit(); app.edit.forEach((x) => { if (x.id === id) x.removed = true; }); app.watch = app.watch.filter((x) => x !== id); delete app.sessionAdded[id]; render(focusSel(`[data-act="undo"][data-id="${id}"]`)); say(`${nameOf(id)} removed. Undo is available.`); break;
      case 'undo': app.edit.forEach((x) => { if (x.id === id) x.removed = false; }); app.watch = app.edit.filter((x) => !x.removed).map((x) => x.id); render(focusSel(`[data-act="remove"][data-id="${id}"]`)); say(`${nameOf(id)} is back on your list.`); break;
      case 'gone-remove': app.gone = 'removed'; render(focusSel('[data-act="gone-undo"]')); say(`${M.goneEntry.name} removed. Undo is available.`); break;
      case 'gone-undo': app.gone = 'row'; render(focusSel('[data-act="gone-remove"]')); say(`${M.goneEntry.name} is back on your list.`); break;     // both choices return
      case 'gone-keep': {
        const g = JSON.parse(JSON.stringify(M.goneEntry)); g.kind = 'pin'; g.summitFt = null; g.uncached = true; g.days = JSON.parse(JSON.stringify(M.makeForecast(5, true)));
        app.mountains[g.id] = g; app.watch.push(g.id); app.gone = 'kept';
        render(focusSel(`[data-act="edit-pin"][data-id="${g.id}"]`)); say(`${g.name} kept as a pin.`);
        break;
      }
      case 'chip': {
        const i = +v, k = app.tripDays.indexOf(i);
        app.notYet = null;
        if (st() === 'empty') { app.pstate = 'default'; app.tripDays = [i]; syncUrl(); }
        else if (k >= 0) app.tripDays.splice(k, 1);
        else app.tripDays.push(i);
        app.later.added = (app.later.added || []).filter((x) => x !== i);   // a chip the user touched is theirs, not the range's
        render('keep');
        const days = app.tripDays.slice().sort((x, y) => x - y), t = days.length && app.watch.length > 1 && st() !== 'loading' && st() !== 'error' ? tripRank(days).ranked[0] : null;
        say(tripSummary(days, laterOut(), true) + (t ? ` Ranking updated. ${nameOf(t.id)} is first.` : ''));
        break;
      }
      case 'later': app.later.open = !app.later.open; render('keep'); break;                 // focus stays on the disclosure button
      case 'later-clear': app.later.from = ''; app.later.to = ''; applyLater(); app.notYet = null; render('keep'); say('Dates cleared.'); break;   // unpicks the days the range added
      case 'fold': app.open7[v] = !app.open7[v]; render('keep'); break;
      case 'wx-day': nav('s2', { id: M.mapMountain, day: 0, added: app.wxAdded, noCache: st() === 'error' }); break;
      case 'wx-add':                                               // one tap: add, then open today's day view with Undo at its top
        if (st() === 'error') {                                    // the add cannot be saved: the day view still opens, with the retry row at its top
          app.wxFail = 1;
          nav('s2', { id: M.mapMountain, day: 0, added: true });
          alertMsg(fill(T.saveFail, { name: mt(M.mapMountain).name }));
          break;
        }
        app.wxFail = 0; app.watch.push(M.mapMountain); app.wxAdded = true;
        nav('s2', { id: M.mapMountain, day: 0, added: true });
        app.stack[app.stack.length - 2].returnKey = 'wx-open';     // coming back lands on "Open day view"
        say(fill(T.added, { name: nameOf(M.mapMountain) }));
        break;
      case 'wx-retry': {                                           // fails once more, then saves: the row becomes "added" + Undo, focus on Undo
        const nm = mt(M.mapMountain).name;
        if (app.wxFail < 2) { app.wxFail = 2; render('keep'); alertMsg(fill(T.still.save, { name: nm })); break; }
        app.wxFail = 0; app.watch.push(M.mapMountain); app.wxAdded = true;
        if (app.stack.length > 1) app.stack[app.stack.length - 2].returnKey = 'wx-open';
        render(() => { const u = findByKey('s2-undo'); if (u) u.focus(); else focusTitle(); });
        say(fill(T.added, { name: nm }));
        break;
      }
      case 'wx-undo': {                                            // from either place: ends on the weather sheet, on the single Add button
        const wnm = nameOf(M.mapMountain); app.watch = app.watch.filter((x) => x !== M.mapMountain); app.wxAdded = false;
        if (top().screen === 's2') popTo(app.stack.length - 1, () => { const u = findByKey('wx-row'); if (u) u.focus(); else focusTitle(); });
        else render(() => { const u = findByKey('wx-row'); if (u) u.focus(); });
        say(`${wnm} removed from your list.`);
        break;
      }
      case 'wx-loading': app.wxNote = 'Still loading the ski score.'; render('keep'); say(app.wxNote); break;
      /* ----- prototype panel ----- */
      case 'p-rfail': app.refreshFails = !app.refreshFails; app.refreshOut = null; render(); break;
      case 'p-screen': jump(v); syncUrl(v); render(); break;
      case 'p-state': app.pstate = v; app.retried = {}; app.tries = {}; app.saveFail = {}; app.refreshOut = null; app.notYet = null; app.wxNote = ''; if (app.gone !== 'kept') app.gone = 'row'; if (app.pin) { app.pin.denied = false; app.pin.saveFail = 0; app.pin.found = null; app.pin.pq = ''; } if (v !== 'empty' && app.q === 'Mt Nowhere') app.q = ''; if (!app.stack.length) jump(defaultScreen()); syncUrl(); render(); break;
      case 'p-theme': app.theme = v; syncUrl(); render(); break;
      case 'p-bg': app.bg = v; app.stack = []; syncUrl(); render(); break;
      case 'p-wx': app.bg = 'map'; app.opener = 'infobar'; app.stack = [{ screen: 'wx', p: {} }]; render(); break;
      case 'p-reset': resetFixtures(); app.notYet = null; app.pstate = 'default'; jump(defaultScreen()); syncUrl(); render(); break;
    }
  }

  /* ---------- prototype panel (outside the phone) ---------- */
  const defaultScreen = () => (document.body.getAttribute('data-screen') || 's1');
  function setProMsg(t) { app.proMsg = t; const n = $('#proto-msg'); if (n) n.textContent = t; }
  function syncUrl(screen) {
    try {
      const u = new URLSearchParams();
      const s = screen || (inForecast() ? top().screen : null);
      if (s && s !== defaultScreen()) u.set('screen', s);
      if (app.pstate !== 'default') u.set('state', app.pstate);
      if (app.theme !== 'dark') u.set('theme', app.theme);
      const q = u.toString();
      history.replaceState(history.state, '', location.pathname + (q ? '?' + q : ''));
    } catch (e) { /* file:// in some browsers: the address simply does not change */ }
  }
  function renderPanel() {
    const mount = $('#proto-panel'); if (!mount) return;
    const cur = inForecast() ? top().screen : null;
    const btn = (actName, v, label, on) => `<button type="button" class="proto-btn" data-act="${actName}" data-v="${v}" aria-pressed="${on}">${label}</button>`;
    const note = cur ? STATE_NOTES[cur][app.pstate] : app.stack.length ? 'A host screen is open. Pick a Forecast screen to use the state switch.' : 'Forecast is closed. Open it from the Forecast tab, or pick a screen.';
    const wasOpen = mount.firstElementChild ? mount.firstElementChild.open : true;
    const focusKey = mount.contains(document.activeElement) ? (document.activeElement.tagName === 'SUMMARY' ? 'summary' : document.activeElement.getAttribute('data-act') + '|' + document.activeElement.getAttribute('data-v')) : null;
    // The status line is mounted empty and filled afterwards, so it is a live region before it has text.
    mount.innerHTML = `<details class="proto-panel"${wasOpen ? ' open' : ''}><summary>Prototype states</summary>
      <h2 id="pp-screen">Screen</h2><div class="proto-row" role="group" aria-labelledby="pp-screen">${['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((s) => btn('p-screen', s, SCREENS[s].name + '<span class="sr"> in the phone</span>', cur === s)).join('')}</div>
      <h2 id="pp-state">State</h2><div class="proto-row" role="group" aria-labelledby="pp-state">${STATES.map((s) => btn('p-state', s, s, app.pstate === s)).join('')}</div>
      <p class="proto-note"><b>${cur ? SCREENS[cur].name + ' · ' + app.pstate : 'No Forecast screen'}:</b> ${esc(note)}</p>
      <p class="proto-note" id="proto-msg" role="status"></p>
      <h2 id="pp-theme">Theme</h2><div class="proto-row" role="group" aria-labelledby="pp-theme">${btn('p-theme', 'dark', 'Dark', app.theme === 'dark')}${btn('p-theme', 'light', 'Light', app.theme === 'light')}</div>
      <h2 id="pp-bg">Entry points</h2><div class="proto-row" role="group" aria-labelledby="pp-bg">${btn('p-bg', 'map', 'Map and tab bar', app.bg === 'map' && !app.stack.length)}${btn('p-bg', 'start', 'Start screen', app.bg === 'start' && !app.stack.length)}${btn('p-wx', 'wx', 'Mountain weather row', !!top() && top().screen === 'wx')}</div>
      <h2 id="pp-opt">Options</h2><div class="proto-row" role="group" aria-labelledby="pp-opt">${btn('p-rfail', 'on', 'Refresh fails', app.refreshFails)}</div>
      <p class="proto-note">"Refresh fails" applies to the default state: Refresh on the calendar or a day view then ends with "${esc(fill(T.refreshFail, { time: updatedAt() }))}"</p>
      <h2 id="pp-fx">Fixtures</h2><div class="proto-row" role="group" aria-labelledby="pp-fx"><button type="button" class="proto-btn" data-act="p-reset" data-v="reset">Reset fixtures</button></div>
      <p class="proto-note">${esc(M.fixtureNote)} Fixture "today" is ${esc(longDate(0))}.</p></details>`;
    if (app.proMsg) setTimeout(() => setProMsg(app.proMsg), 0);
    if (focusKey === 'summary') { const s = $('summary', mount); if (s) s.focus(); }
    else if (focusKey) { const e = $$('[data-act]', mount).filter((x) => x.getAttribute('data-act') + '|' + x.getAttribute('data-v') === focusKey)[0]; if (e) e.focus(); }
  }

  /* ---------- events ---------- */
  const sheetStops = () => $$('button, a[href], input, select, textarea, [tabindex="0"]', $('#sheet')).filter((x) => x.offsetParent !== null);
  function wire() {
    document.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]'); if (!el) return;
      if (el.getAttribute('data-act') === 'cell' && e.target.closest('button')) return;
      // Some browsers do not focus a button on click; focus it so "focus stays where it was" holds everywhere.
      if (document.activeElement !== el && $('#phone').contains(el) && el.focus) el.focus({ preventScroll: true });
      act(el, e);
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (e.key === 'Escape' && app.stack.length && (t === document.body || $('#phone').contains(t))) {
        e.preventDefault();
        // In the search field the first Escape clears the text; the second goes back.
        if (t.id === 'fc-q' && t.value) { t.value = ''; app.q = ''; refreshResults(); return; }
        if (app.stack.length === 1) closeSheet(); else back();
        return;
      }
      // While a sheet is open, Tab runs sheet → tab bar → "Leave the phone" → back to the top of the sheet.
      if (e.key === 'Tab' && app.stack.length) {
        const stops = sheetStops();
        if (!e.shiftKey && t.id === 'leave-phone' && stops[0]) { e.preventDefault(); stops[0].focus(); return; }
        if (e.shiftKey && stops[0] && (t === stops[0] || t.id === 'sheet-title')) { e.preventDefault(); $('#leave-phone').focus(); return; }
      }
      if (t.closest && t.closest('#fc-grid')) { gridKey(e); return; }
      if (t.getAttribute && t.getAttribute('role') === 'radio' && /^Arrow/.test(e.key)) {
        const all = $$('[role="radio"]', t.parentNode), i = all.indexOf(t), fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        const nx = all[(i + (fwd ? 1 : all.length - 1)) % all.length];
        e.preventDefault(); nx.focus(); nx.click();
        return;
      }
      if (t.id === 'pinmap') {
        const k = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
        if (k) { e.preventDefault(); const f = e.shiftKey ? 4 : 1; movePin(k[0] * f, k[1] * f); }   // Shift + arrow moves four times as far
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); act($('[data-act="zoom"][data-v="1"]')); }
        else if (e.key === '-') { e.preventDefault(); act($('[data-act="zoom"][data-v="-1"]')); }
        return;
      }
      // Result lists (S3 mountains, S4 places): Arrow Down from the field reaches the first row's button; Arrow Up / Down move
      // between row buttons; Arrow Up from the first row returns to the field; Home / End go to the first / last row.
      if ((t.id === 'fc-q' || t.id === 'pin-q') && e.key === 'ArrowDown') { const b = $(t.id === 'fc-q' ? '#fc-results li button' : '#pin-found li button'); if (b) { e.preventDefault(); b.focus(); } return; }
      const lst = t.tagName === 'BUTTON' && t.closest ? t.closest('#fc-results, #pin-found') : null;
      if (lst && t.closest('li') && /^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) {
        const btns = $$('li', lst).map((li) => $('button', li)).filter(Boolean), i = btns.indexOf(t);
        if (i < 0) return;
        e.preventDefault();
        const to = e.key === 'Home' ? btns[0] : e.key === 'End' ? btns[btns.length - 1] : e.key === 'ArrowDown' ? btns[Math.min(btns.length - 1, i + 1)]
          : i === 0 ? $(lst.id === 'fc-results' ? '#fc-q' : '#pin-q') : btns[i - 1];
        if (to) to.focus();
        return;
      }
      if (t.id === 'pin-q' && e.key === 'Enter') { e.preventDefault(); clearTimeout(placeT); runPlaceSearch(); }
      // Enter in "Name this mountain" is the primary Save button (Part 0 §0.9.5).
      if (t.id === 'pin-name' && e.key === 'Enter') { e.preventDefault(); const b = $('[data-act="save-pin"]'); if (b) act(b, e); }
    });
    document.addEventListener('focusin', (e) => {
      const c = e.target.closest && e.target.closest('#fc-grid [data-r]');
      if (!c || c.getAttribute('tabindex') === '0') return;
      app.cell = { r: +c.getAttribute('data-r'), c: +c.getAttribute('data-c') };
      setRoving();
    });
    document.addEventListener('focusout', (e) => { if (e.target.id === 'pin-name') { readPinInputs(); markNameErr(); } });
    let typeT = null, countT = null, placeT = null;
    function refreshResults() {
      const r = $('#fc-results'), l = $('#fc-pinlink'), s = $('#fc-sticky');
      if (r) r.innerHTML = resultsHTML();
      if (l) l.innerHTML = noMatch() ? '' : PIN_LINK;
      if (s) s.innerHTML = stickyHTML();
    }
    function runPlaceSearch() {
      readPinInputs();
      const n = findPlaces(), f = $('#pin-found');
      if (f) f.innerHTML = foundHTML();
      if (app.pin.found) say(n ? count('place', n) : `No place called “${app.pin.pq.trim()}” found. Try a nearby town, or move the map yourself.`);
    }
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'fc-q') {
        app.q = t.value;
        clearTimeout(typeT); clearTimeout(countT);
        typeT = setTimeout(refreshResults, 150);
        countT = setTimeout(() => {                                // the count is spoken 500 ms after typing stops
          const r = searchList();
          if (r.idle) return;
          say(r.list.length ? count('found', r.list.length) : `No mountain called “${app.q.trim()}” found.`);
        }, 500);
      } else if (t.id === 'pin-name') { readPinInputs(); app.pin.touched = true; if (app.pin.errs.name) markNameErr(); }   // re-checked on change once it has errored
      else if (t.id === 'pin-q') { readPinInputs(); clearTimeout(placeT); placeT = setTimeout(runPlaceSearch, 500); }
    });
    document.addEventListener('change', (e) => {
      const id = e.target.id;
      if (id !== 'trip-from' && id !== 'trip-to') return;
      app.later[id === 'trip-from' ? 'from' : 'to'] = e.target.value; app.notYet = null;
      applyLater(); render('keep');
      if (app.later.err) alertMsg(app.later.err);
      else say(tripSummary(app.tripDays.slice().sort((x, y) => x - y), laterOut(), true));
    });
    window.addEventListener('popstate', (e) => {
      const d = (e.state && e.state.d) || 0, goingBack = d < app.hpos;
      app.hpos = d;
      if (goingBack && app.stack.length) popTo(app.stack.length - 1);
    });
  }

  /* ---------- start ---------- */
  function start() {
    if (!$('#phone')) return;
    try { history.replaceState({ d: 0 }, ''); } catch (e) { app.noHist = true; }
    buildShell();
    wire();
    const want = qs.get('screen') || defaultScreen();
    if (want === 'start') app.bg = 'start';
    else if (want === 'map') app.bg = 'map';
    else if (want === 'wx') { app.opener = 'infobar'; app.stack = [{ screen: 'wx', p: {} }]; }
    else jump(SCREENS[want] && SCREENS[want].file ? want : 's1');
    const s2 = app.stack.filter((x) => x.screen === 's2')[0];
    if (s2) {
      if (qs.get('m') && mt(qs.get('m'))) s2.p.id = qs.get('m');
      if (qs.get('day') != null && +qs.get('day') >= 0 && +qs.get('day') < M.days) s2.p.day = +qs.get('day');
    }
    render();
  }
  window.FC_PROTO = { app: app, render: render, states: STATES, screens: SCREENS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

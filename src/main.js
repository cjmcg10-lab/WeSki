import { Geo, nearestOnLine } from './geo.js';
import { Router, suggestMeetingPoint, DIFF_NAMES, TOLERANCE, GRADE_NAMES } from './routing.js';
import { Guide, Speaker } from './voice.js';
import { Tracker, LiftSense, computeStats, smoothSpeed, ST } from './tracker.js';
import { SkiMap, COLORS, ZONES, fmtAge } from './map.js';
import { Locator } from './location.js';
import { scheme, cls, runColor, runSym, runCss, levelName, classesUsed } from './rating.js';
import { GroupClient, createGroup } from './group.js';
import { sessions, kv, prefs, persist } from './store.js';
import { loadWeather, describeCode, hourIndex, skiNotes } from './weather.js';
import { COMING_SOON } from './resorts.js';
import { Clouds } from './clouds.js';

const $ = (s) => document.querySelector(s);

/** Dark by default; light can be chosen in More. */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f5f7fa' : '#030b16');
}
applyTheme((() => { try { return JSON.parse(localStorage.getItem('weski:theme')) || 'dark'; } catch { return 'dark'; } })());

/**
 * Use the whole screen. An iPhone home-screen app with a see-through status bar reports a
 * viewport that is one status bar shorter than the screen, which left an unused strip at
 * the bottom; in that mode the real height is the screen's.
 */
function fitScreen() {
  const portrait = window.innerHeight >= window.innerWidth;
  const h = navigator.standalone === true && portrait ? Math.max(window.innerHeight, screen.height) : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', h + 'px');
}
fitScreen();
window.addEventListener('resize', fitScreen);
window.addEventListener('orientationchange', () => setTimeout(fitScreen, 250));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STALE_S = 120;          // a friend's location older than this is "stale"
const PALETTE = ['#ff3b30', '#ff9f0a', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff2d92', '#8e6e53'];
const AVATARS = [['boy-ski', 'Boy skier'], ['girl-ski', 'Girl skier'], ['boy-board', 'Boy boarder'], ['girl-board', 'Girl boarder']];
const DIFF_SYM = ['●', '■', '◆', '◆◆'];

const S = {
  resort: null, geo: null, router: null, map: null, loc: null,
  profile: prefs.get('profile', null) || { id: randomId(), name: '', avatar: 'boy-ski', color: PALETTE[5] },
  units: prefs.get('units', 'imperial'),
  crumbsOn: prefs.get('crumbsOn', false), crumbScope: 'session',
  maxDiff: prefs.get('maxDiff', 2),
  uphill: prefs.get('uphill', 'normal'),   // uphill tolerance for directions: low | normal | high
  voice: prefs.get('voice', false),        // spoken directions
  closures: new Set(),
  place: null,              // the resort currently open (an entry of PLACES)
  testMode: prefs.get('testMode', false),
  showFps: prefs.get('showFps', false),
  fps120: prefs.get('fps120', false),
  me: null,                 // {x, y, lat, lon, heading, acc, t}
  gpsMsg: '',
  group: null,              // {code, client, state, status}
  sharing: false,
  tracker: null, session: null,
  nav: null,                // {target, route, problem, lastCalc}
  pin: null,
  tab: 'map', sheet: null,
  player: null,
};
prefs.set('profile', S.profile);

function randomId() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- formatting
const imp = () => S.units === 'imperial';
const fmtSpeed = (ms) => (imp() ? ms * 2.23694 : ms * 3.6).toFixed(ms * 2.2 >= 99.5 ? 0 : 1);
const speedUnit = () => (imp() ? 'mph' : 'km/h');
const fmtDist = (m) => (imp() ? (m < 300 ? `${Math.round(m * 3.28084)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`) : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const distParts = (m) => (imp() ? [(m / 1609.34).toFixed(1), 'mi'] : [(m / 1000).toFixed(1), 'km']);
const vertParts = (m) => (imp() ? [Math.round(m * 3.28084).toLocaleString(), 'ft'] : [Math.round(m).toLocaleString(), 'm']);
const fmtVert = (m) => vertParts(m).join(' ');
const fmtDur = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m} min` : `${s}s`; };
const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = (t) => new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}

/** Picture of a rider for the avatar picker and member lists (64x64). */
function avatarSvg(type, color) {
  const [who, ride] = type.split('-');
  const girl = who === 'girl', board = ride === 'board';
  const dark = '#1b2430', skin = '#f2c49b', hair = '#8a4b22';
  // pose: skier faces forward in a tuck with poles; boarder stands side-on, arms out for balance
  const snow = `<ellipse cx="32" cy="${board ? 56 : 58}" rx="29" ry="5.500" fill="#eaf2f9"/><ellipse cx="32" cy="${board ? 57.500 : 59.500}" rx="20" ry="2.200" fill="#c9d8e6"/>`;
  const gear = board
    ? `<rect x="9" y="50" width="46" height="5.500" rx="2.750" fill="${dark}" transform="rotate(-7 32 53)"/><rect x="13" y="50.800" width="38" height="2.200" rx="1.100" fill="${color}" opacity=".85" transform="rotate(-7 32 53)"/><rect x="22" y="48.500" width="5" height="4" rx="1" fill="#59636e" transform="rotate(-7 32 53)"/><rect x="37" y="48.500" width="5" height="4" rx="1" fill="#59636e" transform="rotate(-7 32 53)"/>`
    : `<rect x="18" y="52" width="5" height="10" rx="2.500" fill="${dark}" transform="rotate(8 20 57)"/><rect x="41" y="52" width="5" height="10" rx="2.500" fill="${dark}" transform="rotate(-8 44 57)"/><path d="M19 49l-3 9M45 49l3 9" stroke="${dark}" stroke-width="4.500" stroke-linecap="round"/>`;
  const poles = board ? '' : `<path d="M13 27 9 55M51 27l4 28" stroke="#7a8794" stroke-width="1.600" stroke-linecap="round"/><circle cx="9" cy="54" r="2.300" fill="none" stroke="#7a8794" stroke-width="1.300"/><circle cx="55" cy="54" r="2.300" fill="none" stroke="#7a8794" stroke-width="1.300"/>`;
  const legs = board
    ? `<path d="M26 38l-3 11M38 38l3 10" stroke="${dark}" stroke-width="6.500" stroke-linecap="round"/><rect x="19" y="46" width="8" height="5" rx="2" fill="#39424e"/><rect x="38" y="45" width="8" height="5" rx="2" fill="#39424e"/>`
    : `<path d="M27 38l-6 11M37 38l6 11" stroke="${dark}" stroke-width="6.500" stroke-linecap="round"/><rect x="16" y="46" width="8" height="5" rx="2" fill="#39424e"/><rect x="40" y="46" width="8" height="5" rx="2" fill="#39424e"/>`;
  const torso = girl
    ? `<path d="M24 22h16l4 18H20z" fill="${color}"/><path d="M22 34h20" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>`
    : `<rect x="22" y="21" width="20" height="19" rx="5" fill="${color}"/><path d="M32 22v17" stroke="#000" stroke-opacity=".22" stroke-width="1.500"/><rect x="24" y="31" width="6" height="5" rx="1.200" fill="#000" fill-opacity=".18"/>`;
  const arms = board
    ? `<path d="M23 25 11 31M41 25l12-3" stroke="${color}" stroke-width="5.500" stroke-linecap="round"/><circle cx="10" cy="31.500" r="3" fill="${dark}"/><circle cx="54" cy="21.500" r="3" fill="${dark}"/>`
    : `<path d="M23 25l-9 5M41 25l9 5" stroke="${color}" stroke-width="5.500" stroke-linecap="round"/><circle cx="13.500" cy="29" r="3" fill="${dark}"/><circle cx="50.500" cy="29" r="3" fill="${dark}"/>`;
  const braids = girl ? `<path d="M24.500 15c-4 3-4.500 9-3 14M39.500 15c4 3 4.500 9 3 14" stroke="${hair}" stroke-width="3.400" fill="none" stroke-linecap="round"/><circle cx="21.700" cy="29.500" r="2" fill="${color}"/><circle cx="42.300" cy="29.500" r="2" fill="${color}"/>` : '';
  const head = `<circle cx="32" cy="13" r="7.500" fill="${skin}"/><path d="M23.800 12.500a8.200 8.200 0 0 1 16.400 0z" fill="${color}"/><path d="M23.800 12.500a8.200 8.200 0 0 1 16.400 0z" fill="#fff" fill-opacity=".35"/><rect x="24.500" y="10.800" width="15" height="5.200" rx="2.600" fill="${dark}"/><rect x="26" y="11.800" width="12" height="3.200" rx="1.600" fill="#6fd3ff"/><path d="M27.500 12.600h4" stroke="#fff" stroke-opacity=".8" stroke-width="1" stroke-linecap="round"/><path d="M29.500 18.300q2.500 1.600 5 0" stroke="#b9774f" stroke-width="1.100" fill="none" stroke-linecap="round"/>${girl ? '' : `<path d="M26 20.500h12" stroke="${dark}" stroke-width="2.200" stroke-linecap="round" opacity=".55"/>`}`;
  return `<svg viewBox="0 0 64 64">${snow}${poles}${gear}${legs}${braids}${torso}${arms}${head}</svg>`;
}

// ---------- resorts
let PLACES = [];            // every resort in the picker; the ones with `available` have a built map
const fetchOk = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r; });
async function loadPlaces() {
  if (PLACES.length) return;
  const built = await fetchOk('/data/index.json').then((r) => r.json());
  const have = new Set(built.map((r) => r.id));
  PLACES = [...built.map((r) => ({ ...r, available: true })), ...COMING_SOON.filter((r) => !have.has(r.id))];
}
const placeById = (id) => PLACES.find((r) => r.id === id);
/** Settings that belong to one mountain (closures, saved routes, tracks...) are stored per resort. */
const pkey = (k) => `${k}:${S.place.id}`;
const resortOf = (session) => session.resort || 'jay-peak'; // sessions saved before multi-resort were all Jay Peak

// ---------- boot
let mapP = null, mapId = null, ticking = false;

/** Open a resort: load its data and build its 3D map (replacing any other mountain that was open). */
function initMap(id) {
  if (mapP && mapId === id) return mapP;
  const prev = mapP;
  mapId = id;
  return (mapP = (async () => {
    if (prev) await prev.catch(() => {});
    await loadPlaces();
    const pl = placeById(id);
    if (!pl?.available) throw new Error('no map for ' + id);
    const [resort, buf, sur] = await Promise.all([
      fetchOk(`/data/${id}/resort.json`).then((r) => r.json()),
      fetchOk(`/data/${id}/terrain.bin`).then((r) => r.arrayBuffer()),
      fetchOk(`/data/${id}/surround.bin`).then((r) => r.arrayBuffer()).catch(() => null),
    ]);
    if (mapId !== id) return;                 // another resort was picked while this one was loading
    if (S.map) {                              // leaving the previous mountain
      S.loc?.setSim(false); S.loc?.stop();
      S.map.dispose();
      S.map = null;
    }
    S.place = pl;
    S.resort = resort;
    S.geo = new Geo(resort, new Uint16Array(buf));
    S.router = new Router(resort, S.geo);
    S.closures = new Set(prefs.get(pkey('closures'), id === 'jay-peak' ? prefs.get('closures', []) : []));
    S.me = null; S.pin = null; S.nav = null; S.wx = null; S.history = null; S.historyLoaded = false; S.crumbRec = null;
    const q0 = S.map?.q || 0;   // keep the quality step the phone settled on at the last resort
    S.map = new SkiMap($('#map'), resort, S.geo, sur ? new Uint16Array(sur) : null);
    S.map.maxFps = S.fps120 ? 120 : 60;
    if (q0) S.map.setQuality(q0);
    fpsReadout();
    S.map.setUnits(S.units);
    S.map.setClosures(S.closures);
    S.map.onTap(onMapTap);
    S.sense = new LiftSense(resort.lifts, S.geo); S.lift = null;
    S.loc = new Locator(S.geo, onFix, (m) => { S.gpsMsg = m; renderChrome(); if (m.startsWith('Location is blocked')) toast(m, 7000); });
    if (S.testMode) S.loc.setSim(true);
    $('#brand-resort').textContent = pl.name;
    prefs.set('lastResort', id);
    try { S.tracksSaved = (await kv.get(pkey('tracks'))) || []; } catch { S.tracksSaved = []; }
    renderChrome();
    await recoverSession();
    if (S.crumbsOn) { startCrumbs(); loadHistory(); }
    if (!ticking) { ticking = true; setInterval(tick, 1000); }
    window.weski = S; // handy for debugging from the Safari console
  })().catch((e) => { if (mapId === id) { mapP = null; mapId = null; } throw e; }));
}

function bootFailed(e) {
  console.error(e);
  const msg = navigator.onLine === false
    ? 'You are offline and the map has not been downloaded on this phone yet. Connect once to load it.'
    : 'Could not load the map. Check your connection and reopen.';
  if ($('#splash-msg')) $('#splash-msg').textContent = msg; else toast(msg, 8000);
}

function hideSplash() {
  const sp = $('#splash');
  if (!sp) return;
  sp.classList.add('done');
  setTimeout(() => sp.remove(), 600);
}

async function boot() {
  try { await loadPlaces(); } catch (e) { bootFailed(e); return; }
  // Straight to the map when rejoining a group (you're mid-ski-day) or when asked to skip.
  const saved = prefs.get('group', null), q = new URLSearchParams(location.search);
  if (saved || q.has('skip')) {
    const want = (saved && saved.resort) || q.get('skip') || 'jay-peak';
    try {
      await initMap(placeById(want)?.available ? want : 'jay-peak');
      hideSplash();
      if (saved) joinGroup(saved.code, saved.sharing, true);
    } catch (e) { bootFailed(e); }
    return;
  }
  try { await openStart(); hideSplash(); } catch (e) {
    // The globe is a nicety: if it can't load, go straight to the last mountain.
    console.warn('start screen unavailable', e);
    $('#start').classList.add('hidden');
    const last = prefs.get('lastResort', 'jay-peak');
    try { await initMap(placeById(last)?.available ? last : 'jay-peak'); hideSplash(); } catch (err) { bootFailed(err); }
  }
}

// ---------- start screen (globe + resort picker)
let globe = null, clouds = null;
/** Show the globe. With `from` (a resort) it starts on the ground there, hidden, ready to pull back. */
async function openStart(from = null) {
  const el = $('#start');
  const [{ Globe }, meta, bin] = await Promise.all([import('./globe.js'), fetchOk('/data/globe.json').then((r) => r.json()), fetchOk('/data/globe.bin').then((r) => r.arrayBuffer()), loadPlaces()]);
  el.classList.toggle('prep', !!from);          // laid out but invisible until the map has flown out
  el.classList.remove('hidden');
  $('#resort-card').classList.add('hidden');
  $('#start-panel').classList.toggle('hidden', !!from);
  $('.start-top').classList.toggle('hidden', !!from);
  $('#f-resort').value = '';
  renderResortList('');
  globe = new Globe($('#globe'), meta, new Int16Array(bin), PLACES);
  if (from) globe.surface(from);
}

function renderResortList(q) {
  q = q.trim().toLowerCase();
  const list = PLACES.filter((r) => !q || r.name.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
  $('#resort-list').innerHTML = list.length
    ? list.map((r) => `<button class="resort-row" data-act="pick-resort" data-id="${r.id}"><span class="dotc ${r.available ? 'on' : ''}"></span><span class="grow"><b>${esc(r.name)}</b><small>${esc(r.region)}</small></span><span class="tag ${r.available ? 'avail' : ''}">${r.available ? 'Ready' : 'Coming soon'}</span></button>`).join('')
    : '<p class="start-empty">No resort matches that search yet.</p>';
}

async function pickResort(id) {
  const r = placeById(id);
  if (!r || !globe) return;
  $('#f-resort').blur();
  $('#start-panel').classList.add('hidden');
  await globe.flyTo(r);
  const card = $('#resort-card');
  card.innerHTML = `<h2>${esc(r.name)}</h2><p class="region">${esc(r.region)}</p>
    ${r.available ? `<div class="facts"><div><b>${fmtVert(r.top)}</b><span>Summit</span></div><div><b>${fmtVert(r.top - r.base)}</b><span>Vertical</span></div><div><b>${r.trails}</b><span>Trails</span></div><div><b>${r.lifts}</b><span>Lifts</span></div></div>
      <button class="ski-here" data-act="ski-here" data-id="${r.id}">Ski here</button>`
    : '<p class="soon">The 3D map for this resort has not been built yet.</p><button class="ski-here off" disabled>Map coming soon</button>'}
    <button class="back" data-act="resort-back">‹ All resorts</button>`;
  card.classList.remove('hidden');
  // build the mountain while the card is on screen, then hold it still until it is needed
  if (r.available) initMap(r.id).then(() => { if (globe && S.map) S.map.setPaused(true); }).catch(() => {});
}

async function skiHere(btn) {
  btn.disabled = true; btn.textContent = 'Loading the mountain…';
  const r = placeById(btn.dataset.id);
  try { await initMap(r.id); } catch (e) { btn.disabled = false; btn.textContent = 'Ski here'; bootFailed(e); return; }
  const g = globe;
  globe = null;
  $('#resort-card').classList.add('hidden');
  $('.start-top').classList.add('hidden');
  document.body.classList.add('flying');
  // One continuous zoom: the globe dives until the land colour under the resort fills the
  // screen; the 3D map starts high above the mountain in haze of exactly that colour and
  // keeps descending as the haze clears. No fade, no cut.
  const color = g.colorAt(r);
  const landing = S.map.fly(1, color, 2.3);
  S.map.setPaused(true);                        // hold the map's first frame while the globe is on top
  // Clouds: near the end of the dive you drop into a cloud layer; the globe hands over to the
  // mountain inside it, and you come out of the bottom of the clouds above the resort.
  const sky = (clouds ||= new Clouds($('#clouds')));
  sky.start(1);
  const into = new Promise((res) => setTimeout(() => sky.to(1, 0.75).then(res), 700));
  await Promise.all([g.dive(1.45), into]);
  S.map.setPaused(false);
  $('#start').classList.add('hidden');
  g.dispose();
  sky.to(0, 1.25).then(() => sky.stop());
  await landing;
  document.body.classList.remove('flying');
  renderChrome();
}

/** Leave the mountain: climb away into the haze, then pull back from the ground to the spinning globe. */
async function exitToGlobe() {
  closeSheet();
  document.body.classList.add('flying');
  try {
    await openStart(S.place);
    const sky = (clouds ||= new Clouds($('#clouds')));
    sky.start(-1);                              // climb up into the clouds, swap inside them, come out above the globe
    const into = new Promise((res) => setTimeout(() => sky.to(1, 0.7).then(res), 800));
    await Promise.all([S.map.fly(-1, globe.colorAt(S.place), 1.5), into]);
    $('#start').classList.remove('prep');
    S.map.setPaused(true);
    sky.to(0, 1.1).then(() => sky.stop());
    await globe.rise(1.8);
    $('.start-top').classList.remove('hidden');
    $('#start-panel').classList.remove('hidden');
  } catch (e) {
    // no globe available (e.g. first run offline): stay on the mountain
    console.warn(e);
    clouds?.stop();
    $('#start').classList.add('hidden');
    S.map.setPaused(false);
    await S.map.fly(1, '#b9d7f0', 1.2);
    toast('The resort picker could not be opened.');
  }
  document.body.classList.remove('flying');
}

/** "Choose a different resort": wrap up the ski day (saving it or not), then go back to the globe. */
async function leaveResort(save) {
  $('#modal').classList.add('hidden');
  if (S.player) stopReplay();
  if (S.nav) endNav();
  await stopCrumbs();
  if (S.group) {
    S.group.client.leave();
    S.group = null; S.sharing = false; prefs.set('group', null);
    S.map.setFriends([]); S.map.setMeet(null);
  }
  if (S.session) {
    if (save) await endSession('Ski day saved.');
    else {
      const id = S.session.id;
      S.session = null; S.tracker = null;
      releaseWake();
      try { await sessions.del(id); } catch { /* nothing stored yet */ }
      toast('Left without saving this session.');
    }
  }
  S.historyLoaded = false;
  S.loc.stop();
  S.me = null; S.map.setMe(null);
  S.pin = null; S.map.setPin(null);
  renderChrome();
  await exitToGlobe();
}

function askLeaveResort() {
  const st = S.tracker ? S.tracker.stats : null;
  const what = S.session
    ? `This ${S.session.kind === 'group' ? 'group session' : 'tracking session'} has ${st.runCount} run${st.runCount === 1 ? '' : 's'} and ${S.tracker.points.length} GPS points${S.session.routes.length ? `, plus ${S.session.routes.length} route${S.session.routes.length > 1 ? 's' : ''}` : ''}.`
    : 'Nothing is being tracked right now, so there is no new ski data to save.';
  $('#modal').innerHTML = `<div class="modal-box"><h2>Choose a different resort?</h2>
    <p>${what}${S.group ? ' You will also leave your group.' : ''}</p>
    <button class="btn go" data-act="exit-save">Save ski data and exit</button>
    <button class="btn danger" data-act="exit-nosave">Exit without saving</button>
    <button class="btn alt" data-act="modal-cancel">Stay at ${esc(S.place.name)}</button></div>`;
  $('#modal').classList.remove('hidden');
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
persist();
document.addEventListener('click', onClick);
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('visibilitychange', () => { if (!S.map) return; if (document.visibilityState === 'visible') wakeLock(); else autosave(); });
window.addEventListener('pagehide', () => { autosave(); if (S.crumbRec) saveTracks(true); });
boot();

// ---------- location
function onFix(fix) {
  const [x, y] = S.geo.toLocal(fix.lat, fix.lon);
  let heading = fix.heading;
  if (heading == null && S.me) {
    const d = Math.hypot(x - S.me.x, y - S.me.y);
    heading = d > 3 ? Math.atan2(x - S.me.x, y - S.me.y) : S.me.heading;
  }
  // speed from consecutive fixes (lightly smoothed) drives the riding animation
  let speed = S.me?.speed || 0;
  if (S.me && fix.t > S.me.t) speed = speed * 0.4 + (Math.hypot(x - S.me.x, y - S.me.y) / ((fix.t - S.me.t) / 1000)) * 0.6;
  if (speed > 45) speed = 0;
  S.me = { x, y, lat: fix.lat, lon: fix.lon, heading, acc: fix.acc, t: fix.t, inBounds: S.geo.inBounds(x, y), speed };
  S.gpsMsg = '';
  if (S.tracker) S.tracker.add(fix); else if (S.crumbRec) S.crumbRec.add(fix);
  // Lift riding is worked out from every fix, whether or not stats or directions are on.
  const was = S.lift?.id;
  S.lift = S.me.inBounds && !(fix.acc > 60) ? S.sense.update(x, y, fix.t) : null;
  if (S.lift?.id !== was && S.nav) S.nav.lastCalc = 0;   // getting on or off a lift changes the route at once
  const riding = speed > 1.2 && !S.lift;
  S.map.setMe(S.me.inBounds ? { x, y, heading, avatar: S.profile.avatar, color: S.profile.color, moving: riding, lift: S.lift } : null);
  if (S.group && S.sharing) {
    const now = Date.now(), last = S.lastSent;
    const moved = last ? Math.hypot(x - last.x, y - last.y) : Infinity;
    if (!last || now - last.t > (moved > 4 ? 4000 : 20000)) {
      S.lastSent = { x, y, t: now };
      S.group.client.sendPos({ lat: fix.lat, lon: fix.lon, acc: fix.acc, spd: Math.min(60, speed), hdg: heading == null ? null : (heading * 180) / Math.PI, st: S.lift ? 'lift' : S.tracker ? ['idle', 'ski', 'lift'][S.tracker.state] : speed > 2.5 ? 'ski' : 'idle' });
    }
  }
  if (S.followMe && S.me.inBounds) { S.map.focus(x, y, 700); S.followMe = false; }
  if (S.nav) recalcNav();
  renderChrome();
  if (S.tab === 'track' && S.sheet === 'track') renderTrackLive();
}

/** Optional frames-per-second readout (More > Show frame rate). */
function fpsReadout() {
  let el = document.getElementById('fps');
  clearInterval(fpsReadout.timer);
  if (!S.showFps) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'fps'; el.style.cssText = 'position:fixed;left:12px;top:calc(env(safe-area-inset-top,0px) + 58px);z-index:30;font:600 12px/1 ui-monospace,monospace;color:#fff;background:rgba(10,20,30,.72);padding:5px 7px;border-radius:8px;pointer-events:none'; document.body.appendChild(el); }
  const tick = () => { const p = S.map?.perf; el.textContent = p ? `${p.fps} fps · Q${p.q}${p.limited ? ' · slowed by phone' : ''}` : 'move the map…'; };
  tick(); fpsReadout.timer = setInterval(tick, 500);
}

function ensureLocation() {
  if (!S.loc.active) S.loc.start();
}

let lock = null;
async function wakeLock() {
  // Keep the screen awake while tracking/sharing: iOS stops web GPS when the screen locks.
  if (!(S.tracker || S.crumbRec || S.nav || (S.group && S.sharing)) || document.visibilityState !== 'visible') return;
  try { if (!lock || lock.released) lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported / denied */ }
}
function releaseWake() { if (!(S.tracker || S.crumbRec || S.nav || (S.group && S.sharing))) { lock?.release?.().catch(() => {}); lock = null; } }

// ---------- sessions (solo tracking and group sessions)
function startSession(kind) {
  if (S.tracker) { if (kind === 'group') { S.session.kind = 'group'; S.session.group = S.group?.code; } return; }
  S.tracker = new Tracker(S.geo, S.resort.lifts);
  stopCrumbs();                               // stats tracking records the track itself from here on
  S.session = { id: 's' + Date.now(), resort: S.place.id, kind, group: kind === 'group' ? S.group?.code : null, start: Date.now(), end: null, active: true, routes: [], points: S.tracker.points, stats: null };
  ensureLocation();
  wakeLock();
}

async function autosave() {
  if (!S.session) return;
  S.session.stats = stripStats(S.tracker.stats);
  S.session.end = Date.now();
  try { await sessions.put({ ...S.session }); } catch (e) { console.warn('autosave failed', e); }
}

async function endSession(reason) {
  if (!S.session) return null;
  const s = S.session;
  s.stats = stripStats(S.tracker.stats);
  s.end = s.points.length ? s.points[s.points.length - 1][0] : Date.now();
  if (s.points.length) s.start = Math.min(s.start, s.points[0][0]);
  s.active = false;
  S.session = null; S.tracker = null;
  releaseWake();
  const worth = s.points.length >= 5 || s.routes.length;
  try { if (worth) await sessions.put(s); else await sessions.del(s.id); } catch (e) { toast('Could not save this session on the phone.'); return null; }
  S.historyLoaded = false;
  if (S.crumbsOn) { loadHistory(); startCrumbs(); }
  if (worth) toast(`${reason} Saved ${s.stats.runCount} run${s.stats.runCount === 1 ? '' : 's'} to History.`);
  renderChrome();
  return worth ? s : null;
}

function stripStats(st) {
  const { speed, state, rejected, ...rest } = st;
  return { ...rest, rejected };
}

/** After the app was closed mid-session: resume if it was moments ago, otherwise file it in History. */
async function recoverSession() {
  let list = [];
  try { list = await sessions.list(); } catch { return; }
  for (const s of list.filter((x) => x.active)) {
    const lastT = s.points.length ? s.points[s.points.length - 1][0] : s.start;
    if (!S.session && resortOf(s) === S.place.id && Date.now() - lastT < 10 * 60 * 1000) {
      S.tracker = new Tracker(S.geo, S.resort.lifts);
      S.tracker.points = s.points;
      S.tracker.state = s.points.length ? s.points[s.points.length - 1][4] : 0;
      S.session = s;
      ensureLocation(); wakeLock();
      toast('Resumed your tracking session.');
    } else {
      s.active = false; s.end = lastT; s.stats = stripStats({ ...computeStats(s.points), rejected: s.stats?.rejected || 0 });
      if (s.points.length >= 5 || s.routes?.length) await sessions.put(s); else await sessions.del(s.id);
    }
  }
}

// ---------- my tracks (breadcrumbs)
// "Show where I've skied" works on its own: with stats tracking off it runs a light,
// location-only recorder. Those tracks are kept for the map only - never in History.
const MAX_TRACK_POINTS = 60000;

/** Keep just the skied parts of a recording (plus the point before each, so segments join up). */
function skiOnly(P) {
  const out = [];
  let kept = -2;
  for (let i = 1; i < P.length; i++) {
    if (P[i][4] !== ST.SKI || P[i][5]) continue;
    if (kept !== i - 1) out.push([...P[i - 1].slice(0, 4), 0, 1]);   // start of a stretch: marked as a gap so it isn't joined to the last one
    out.push(P[i].slice(0, 6));
    kept = i;
  }
  return out;
}

function startCrumbs() {
  if (!S.crumbsOn || S.tracker || S.crumbRec || !S.map) return;
  S.crumbRec = new Tracker(S.geo, S.resort.lifts);
  ensureLocation();
  wakeLock();
}

async function saveTracks(withLive = false) {
  const lists = withLive && S.crumbRec ? [...S.tracksSaved, skiOnly(S.crumbRec.points)] : S.tracksSaved;
  try { await kv.set(pkey('tracks'), lists.filter((l) => l.length > 1)); } catch { /* storage full or unavailable */ }
}

/** Stop the location-only recorder and keep what it recorded. */
async function stopCrumbs() {
  if (!S.crumbRec) return;
  const pts = skiOnly(S.crumbRec.points);
  S.crumbRec = null;
  if (pts.length > 1) {
    S.tracksSaved.push(pts);
    let total = S.tracksSaved.reduce((n, l) => n + l.length, 0);
    while (total > MAX_TRACK_POINTS && S.tracksSaved.length > 1) total -= S.tracksSaved.shift().length;   // oldest tracks go first
    await saveTracks();
  }
  releaseWake();
}

/** Draw a light dotted trail of where you have skied. */
function showTracks() {
  if (!S.map) return;
  if (!S.crumbsOn) { S.map.setBreadcrumbs(null); return; }
  const lists = [];
  if (S.tracker) lists.push(S.tracker.points);
  if (S.crumbRec) lists.push(S.crumbRec.points);
  if (S.crumbScope === 'all') {
    lists.push(...(S.tracksSaved || []));
    for (const s of S.history || []) lists.push(s.points);
  }
  S.map.setBreadcrumbs(lists);
}

function tracksCard() {
  const all = S.crumbScope === 'all';
  const saved = (S.tracksSaved || []).length + (S.history || []).length;
  return `<div class="card"><h3>My tracks</h3>
    <div class="rowf"><div class="grow"><b>Show where I've skied</b><div class="sub">A dotted pink trail on the map along the runs you come down. Lift rides are left out.</div></div><label class="switch"><input type="checkbox" id="f-crumbs" ${S.crumbsOn ? 'checked' : ''} /><i></i></label></div>
    <div class="seg" style="margin-top:10px"><button data-act="crumb-scope" data-v="session" class="${all ? '' : 'on'}">This outing</button><button data-act="crumb-scope" data-v="all" class="${all ? 'on' : ''}">Everything saved${saved ? ` (${saved})` : ''}</button></div>
    <p class="note">${all
    ? `<b>Everything saved</b> draws every run you have ever recorded at ${esc(S.place.name)} on this phone: all past days in History plus any saved location-only tracks.`
    : '<b>This outing</b> draws only the runs since you turned this on (or started tracking) today, so the map shows just the current day out.'}</p>
    <p class="note">${S.crumbsOn ? (S.tracker ? 'Recording along with your stats.' : `Recording your location only — no speed or run stats, and nothing is added to History.${S.me ? '' : ' Waiting for GPS.'}`) : 'Works with or without stats tracking. Needs the app open with the screen on.'}</p>
    ${(S.tracksSaved || []).length ? '<button class="btn alt" data-act="clear-tracks" style="margin-bottom:0">Clear saved location-only tracks</button>' : ''}</div>`;
}

// ---------- group
async function joinGroup(code, sharing = false, silent = false) {
  code = code.toUpperCase().trim();
  if (S.group) S.group.client.stop();
  const g = (S.group = { code, state: null, status: 'connecting', client: null });
  S.sharing = sharing;
  g.client = new GroupClient(code, S.profile, {
    status: (st) => { g.status = st; renderChrome(); refreshGroupSheet(); },
    state: (st) => {
      const first = !g.state;
      g.state = st; g.skew = g.client.skew || 0;
      if (first) {
        startSession('group');
        if (S.closures.size && !st.closures.length) g.client.setClosures([...S.closures]);
        if (!silent) toast(`Joined group ${code}`);
      }
      if (st.closures.join() !== [...S.closures].sort().join() && !(first && S.closures.size && !st.closures.length)) setClosures(new Set(st.closures), false);
      syncFriends();
      if (S.nav) recalcNav();
      renderChrome();
      refreshGroupSheet();
    },
    error: (m) => toast(m),
    ended: (reason, message) => {
      const was = S.group === g;
      if (was) { S.group = null; S.sharing = false; prefs.set('group', null); S.map.setFriends([]); S.map.setMeet(null); }
      if (was && S.nav && ['friend', 'meet'].includes(S.nav.target.type)) endNav();
      if (reason === 'closed') endSession('The group was closed.'); else if (reason !== 'left') toast(message || 'Could not join that group.');
      renderChrome();
      if (S.sheet === 'group') renderSheet();
    },
  });
  g.client.sharing = sharing;
  prefs.set('group', { code, sharing, resort: S.place.id });
  if (sharing) { ensureLocation(); wakeLock(); }
  renderChrome();
}

async function leaveGroup(closeForAll) {
  const g = S.group;
  if (!g) return;
  if (closeForAll) { g.client.close(); return; } // server confirms with "closed" -> ended('closed')
  g.client.leave();
  S.group = null; S.sharing = false; prefs.set('group', null);
  S.map.setFriends([]); S.map.setMeet(null);
  if (S.nav && ['friend', 'meet'].includes(S.nav.target.type)) endNav();
  await endSession('You left the group.');
  renderChrome(); renderSheet();
}

function setSharing(on) {
  S.sharing = on;
  S.group?.client.setSharing(on);
  prefs.set('group', { code: S.group.code, sharing: on, resort: S.place.id });
  if (on) { ensureLocation(); wakeLock(); S.lastSent = null; if (S.me) onFix({ lat: S.me.lat, lon: S.me.lon, acc: S.me.acc, heading: S.me.heading, t: Date.now() }); }
  else releaseWake();
  renderChrome(); renderSheet();
}

/** Group members other than me, with local coordinates and how old their location is. */
/** The lift someone reported as riding is on, from their position: {id, frac, down} or null. */
function liftAt(x, y) {
  let best = null;
  for (const l of S.resort.lifts) {
    const n = nearestOnLine(l.pts, x, y);
    if (n.d < 45 && (!best || n.d < best.d)) best = { d: n.d, id: l.id, frac: n.along / (l.len || 1), down: false };
  }
  return best;
}

function friends() {
  const g = S.group;
  if (!g?.state) return [];
  const now = Date.now() - (g.skew || 0);
  return g.state.members.filter((m) => m.id !== S.profile.id).map((m) => {
    const f = { ...m, age: null, stale: true, has: false, paused: !m.sharing && !!m.pos };
    if (m.pos) {
      [f.x, f.y] = S.geo.toLocal(m.pos.lat, m.pos.lon);
      f.age = Math.max(0, (now - m.pos.at) / 1000);
      f.has = true;
      f.inBounds = S.geo.inBounds(f.x, f.y);
      f.heading = m.pos.hdg == null ? null : (m.pos.hdg * Math.PI) / 180;
      f.lift = m.pos.st === 'lift' ? liftAt(f.x, f.y) : null;
      f.stale = f.age > STALE_S || !m.sharing;
      f.moving = !f.stale && f.age < 30 && m.pos.spd > 1.2 && m.pos.st !== 'lift';
    }
    return f;
  });
}

function syncFriends() {
  const g = S.group;
  S.map.setFriends(friends().filter((f) => f.has && f.inBounds));
  const meet = g?.state?.meet;
  if (meet) { const [x, y] = S.geo.toLocal(meet.lat, meet.lon); S.map.setMeet({ x, y, name: meet.name }); }
  else S.map.setMeet(null);
}

function setClosures(set, share = true) {
  S.closures = set;
  prefs.set(pkey('closures'), [...set]);
  S.map.setClosures(set);
  if (share && S.group) S.group.client.setClosures([...set]);
  if (S.nav) recalcNav(true);
}

// ---------- navigation
const routeOpts = () => ({ maxDiff: S.maxDiff, closed: S.closures, tol: S.uphill });

function startNav(target) {
  S.nav = { target, route: null, problem: null, lastCalc: 0, key: '', fresh: true };
  guide.reset();
  ensureLocation(); wakeLock();
  closeSheet();
  recalcNav(true);
  if (S.nav?.route) S.map.fit(S.nav.route.pts);
}

function endNav() {
  S.nav = null;
  speaker.stop(); releaseWake(); setPocket(false);
  S.map.setRoute(null);
  S.loc.simPath = null;
  renderChrome();
}

function navDest() {
  const t = S.nav.target;
  if (t.type === 'poi') { const p = S.resort.pois[t.id]; return { place: { node: p.n }, name: p.name, x: p.x, y: p.y }; }
  if (t.type === 'pin') return S.pin ? { place: { x: S.pin.x, y: S.pin.y }, name: 'Dropped pin', x: S.pin.x, y: S.pin.y } : null;
  if (t.type === 'meet') { const m = S.map.meet; return m ? { place: { x: m.x, y: m.y }, name: m.name || 'Meeting point', x: m.x, y: m.y } : null; }
  const f = friends().find((m) => m.id === t.id);
  if (!f) return { gone: true, name: t.name };
  return { friend: f, name: f.name, place: f.has ? { x: f.x, y: f.y } : null, x: f.x, y: f.y };
}

/** Recompute the route. Runs whenever I move, my friend moves, or limits/closures change. */
function recalcNav(force = false) {
  const nav = S.nav;
  if (!nav) return;
  const now = Date.now();
  if (!force && now - nav.lastCalc < 1500) return;
  nav.lastCalc = now;
  const dest = navDest();
  nav.problem = null; nav.warn = null; nav.over = null;
  if (!dest || dest.gone) { nav.problem = { title: `${dest?.name || 'That place'} is no longer available`, text: dest?.gone ? 'They left the group.' : '' }; nav.route = null; }
  else {
    nav.name = dest.name;
    const f = dest.friend;
    if (f && !f.has) nav.problem = { title: `${f.name} isn't sharing a location`, text: 'Ask them to turn on sharing, or pick a meeting point.', meet: true };
    else if (!S.me) nav.problem = { title: 'Waiting for your location…', text: S.gpsMsg || 'Allow location access so directions can start from where you are.' };
    else {
      if (f && f.stale) nav.warn = { title: `${f.name}'s location is stale`, text: `${f.paused ? 'They paused sharing. ' : ''}Last update ${fmtAge(f.age)} — this route goes to where they were.`, meet: true };
      // on a lift, directions start from where it lets you off
      const r = S.router.route(S.lift ? { lift: S.lift.id, frac: S.lift.frac, down: S.lift.down, x: S.me.x, y: S.me.y } : { x: S.me.x, y: S.me.y }, dest.place, routeOpts());
      if (r.ok) {
        // A reroute is a new list of steps, not just the old list getting shorter as you ski it.
        const sig = (rt) => rt.steps.map((s) => `${s.kind}:${s.name}`).join('|');
        const changed = !!nav.route && !(`|${sig(nav.route)}`).endsWith(`|${sig(r)}`);
        if (changed) { nav.fresh = true; nav.rerouted = true; if (!force) toast(f ? `Rerouted — ${f.name} or you moved` : 'Rerouted'); }
        nav.route = r;
        nav.over = overWarning(r);
        recordRoute(dest.name, r);
        const left = Math.hypot(S.me.x - dest.x, S.me.y - dest.y);
        nav.arrived = left < 30;
      } else {
        nav.route = null;
        const who = f ? f.name : dest.name;
        nav.problem = {
          from_off_network: { title: "You're off the mapped trails", text: 'Directions start once you are within 250 m of a mapped trail, lift or base area here.', meet: !!f },
          to_off_network: { title: `${who} is off the mapped network`, text: 'Their location is not near any mapped trail, lift or walkway, so there is no verified route.', meet: !!f },
          no_route_closures: { title: `Closures block the way to ${who}`, text: 'Every route uses a lift or trail you marked closed. Reopen it in More → Closures if that has changed, or meet somewhere you can both reach.', meet: true },
          no_route: { title: `No mapped route to ${who}`, text: 'The mapped trails, lifts and walkways do not connect you.', meet: true },
        }[r.reason];
      }
    }
  }
  S.map.setRoute(nav.route ? nav.route.pts : null);
  speakNav();
  renderChrome();
}

// ---------- spoken directions
const speaker = new Speaker();
const spokenDist = (m) => {
  if (!imp()) return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} metres` : `${(m / 1000).toFixed(1)} kilometres`;
  const ft = m * 3.28084;
  return ft < 1000 ? `${Math.max(50, Math.round(ft / 50) * 50)} feet` : `${(m / 1609.34).toFixed(1)} miles`;
};
const guide = new Guide(spokenDist);

/** Say whatever is due for the current position (called after every route update). */
function speakNav() {
  const nav = S.nav;
  if (!nav || !nav.route) return;
  if (S.voice) for (const line of guide.update(nav, S.me?.speed || 0)) speaker.say(line, nav.fresh);
  nav.fresh = false; nav.rerouted = false;
}

function setVoice(on) {
  S.voice = on; prefs.set('voice', on);
  if (on) {
    speaker.unlock();
    if (!speaker.ok) toast('This browser has no speech voice.');
    else if (S.nav?.route) { guide.reset(); S.nav.fresh = true; speakNav(); }
    else speaker.say('Spoken directions are on.');
    wakeLock();
  } else { speaker.stop(); setPocket(false); }
  renderChrome();
}
// Speech may only start from a tap on iPhone: unlock it on the first touch after opening the app.
document.addEventListener('pointerdown', () => { if (S.voice) speaker.unlock(); }, { once: true });

/** Pocket mode: a black, touch-proof screen that keeps the phone awake so GPS and voice keep going in a pocket. */
function setPocket(on) {
  const el = $('#pocket');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  if (on) wakeLock();
}
{
  let hold = null;
  const el = document.getElementById('pocket');
  const end = () => { clearTimeout(hold); el.classList.remove('holding'); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('holding'); hold = setTimeout(() => { end(); setPocket(false); }, 1500); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, end);
}

/** Warning text when a route has to use trails above the skier's chosen maximum. */
function overWarning(r) {
  if (!r.over.length) return null;
  const names = [...new Set(r.over.map((s) => `${s.name} (${levelName(S.resort, s.d)})`))];
  const dist = fmtDist(r.over.reduce((n, s) => n + s.dist, 0)), lim = levelName(S.resort, S.maxDiff);
  const later = r.over.filter((s, i) => !(r.overNow && s === r.steps[0]));
  if (r.overNow && !later.length) return { title: `You're on a trail above your ${lim} limit`, text: `This route gets you off ${names.join(', ')} the quickest way (${dist}), then stays within your limit.` };
  if (r.overNow) return { title: `Above your ${lim} limit`, text: `You're on a harder trail now, and there is no other way from here: ${dist} on ${names.join(', ')}. Take it slow or ask patrol for help.` };
  return { title: `No ${lim}-only way there`, text: `The only route includes ${dist} above your limit: ${names.join(', ')}. Everything else stays within it.` };
}

function recordRoute(name, r) {
  const rec = { t: Date.now(), to: name, time: r.time, dist: r.dist, steps: r.steps.map((s) => ({ kind: s.kind, name: s.name, d: s.d, dist: s.dist })), pts: r.pts.map((v) => Math.round(v)) };
  // Kept with the current session, or in a standalone list when nothing is being tracked.
  const list = S.session ? S.session.routes : prefs.get(pkey('routes'), []), last = list[list.length - 1];
  if (last && last.to === name && Date.now() - last.t < 30 * 60 * 1000) list[list.length - 1] = { ...rec, t: last.t };
  else list.push(rec);
  if (!S.session) prefs.set(pkey('routes'), list.slice(-15));
}

/** Offer a shared meeting point both people can reach, and share it with the group. */
function proposeMeet() {
  const f = S.nav?.target.type === 'friend' ? friends().find((m) => m.id === S.nav.target.id) : null;
  const me = S.me && S.router.snap(S.me.x, S.me.y) ? { x: S.me.x, y: S.me.y } : null;
  const fr = f?.has && S.router.snap(f.x, f.y) ? { x: f.x, y: f.y } : null;
  const best = suggestMeetingPoint(S.router, me, fr, routeOpts());
  if (!best) { toast('No meeting point is reachable with the current closures.'); return; }
  const p = best.poi, [lat, lon] = S.geo.toLatLon(p.x, p.y), name = p.name.replace(' (base)', ' base');
  if (S.group) S.group.client.setMeet({ lat, lon, name });
  S.map.setMeet({ x: p.x, y: p.y, name });
  toast(`Meeting point: ${name}${S.group ? ' — shared with your group' : ''}`, 4500);
  S.nav = { target: { type: 'meet', name }, route: null, problem: null, lastCalc: 0 };
  recalcNav(true);
  if (S.nav.route) S.map.fit(S.nav.route.pts);
}

// ---------- map taps
function onMapTap(ev) {
  if (S.player) return;
  if (ev.type === 'ground') { S.pin = { x: ev.x, y: ev.y }; S.map.setPin(S.pin); openSheet('place', { type: 'pin' }); }
  else openSheet('place', ev);
}

/** Legend card for the zones this resort actually has. */
function zonesCard() {
  const R = S.resort, have = {};
  const add = (k, name) => { (have[k] ||= new Set()); if (name) have[k].add(name); };
  for (const t of R.trails) { const z = t.z || (t.slow ? 'slow' : null); if (z) add(z, t.name); }
  for (const p of R.parks) add('park', p.name);
  for (const z of R.zones || []) add(z.kind, z.name);
  const rows = Object.keys(ZONES).filter((k) => have[k]).map((k) => {
    const Z = ZONES[k], names = [...have[k]].filter((n) => n !== Z.name), hatch = k === 'free' || k === 'extreme';
    const bg = hatch ? `repeating-linear-gradient(135deg, rgb(${Z.rgb}) 0 5px, #f6fafd 5px 10px)` : `rgb(${Z.rgb})`;
    const list = names.length ? ` Here: ${names.slice(0, 8).map(esc).join(', ')}${names.length > 8 ? ` and ${names.length - 8} more` : ''}.` : '';
    return `<div class="legend-row"><div class="sw"><div class="band" style="background:${bg};color:${Z.ink}">${Z.sym}</div></div><span><b>${Z.name}</b> — ${Z.text}${k === 'free' || k === 'extreme' ? '' : list}</span></div>`;
  });
  const lit = R.trails.some((t) => t.lit) ? '<p class="note">☾ Tap a run to see whether it is lit for night skiing.</p>' : '';
  const src = R.sources.zones ? `Zones come from: ${esc(R.sources.zones)}.${R.parks.some((p) => p.approx) ? ' Positions marked approximate on the map are estimates.' : ''} Slow and family zones are only shown where they have been checked against the resort’s own trail map.`
    : `No zones are recorded for ${esc(S.place.name)} yet.`;
  return `<div class="card"><h3>Zones (painted on the snow)</h3>${rows.join('')}${lit}<p class="note">${src} Signs and ropes on the mountain always win.</p></div>`;
}

function describeSpot(x, y) {
  let best = null;
  for (const t of S.resort.trails) { const n = nearestOnLine(t.pts, x, y); if (n.d < 45 && (!best || n.d < best.d)) best = { d: n.d, t }; }
  const bits = [`Elevation ${fmtVert(S.geo.elev(x, y))}`];
  if (best) {
    bits.unshift(`<span class="${runCss(S.resort, best.t)}">${runSym(S.resort, best.t)}</span> On ${esc(best.t.name || 'a connector trail')}${best.t.glade ? ' (glade)' : ''}`);
    if (best.t.u) bits.push('Rating not in the map data: shown as a guess');
    const tag = (k, name) => `<span class="zn" style="--zn-l:${ZONES[k].ink};--zn-d:rgb(${ZONES[k].rgb})">${ZONES[k].sym} ${esc(name || ZONES[k].name)}</span>`;
    const tz = best.t.z || (best.t.slow ? 'slow' : null);
    if (tz) bits.push(tag(tz));
    const park = S.resort.parks.find((p) => nearestOnLine(p.pts, x, y).d < 30);
    if (park) bits.push(tag('park', park.name));
    const zone = (S.resort.zones || []).find((p) => nearestOnLine(p.pts, x, y).d < 25);
    if (zone) bits.push(tag(zone.kind, zone.name));
    if (best.t.lit) bits.push('☾ Lit for night skiing');
    if (S.closures.has('t' + best.t.id)) bits.push('Marked closed');
  }
  return bits.join(' · ');
}

// ---------- chrome (pills, nav banner, tabs)
function renderChrome() {
  const gp = $('#gps-pill');
  if (S.testMode) { gp.textContent = S.me ? (S.lift ? '● On lift' : 'Test location') : 'Test mode: tap map'; gp.className = 'pill warn'; }
  else if (S.me && Date.now() - S.me.t < 20000) { gp.textContent = S.lift ? '● On lift' : S.tracker ? ['● Tracking', '● Skiing', '● On lift'][S.tracker.state] : `GPS ±${Math.round(S.me.acc)} m`; gp.className = 'pill ok'; }
  else if (S.loc?.active) { gp.textContent = 'Finding GPS…'; gp.className = 'pill warn'; }
  else { gp.textContent = 'GPS off'; gp.className = 'pill'; }
  const g = $('#group-pill');
  if (S.group) {
    const n = S.group.state?.members.length || 1;
    g.textContent = `${S.group.code} · ${n}${S.group.status === 'online' ? '' : ' · offline'}${S.sharing ? ' · sharing' : ''}`;
    g.className = 'pill' + (S.sharing && S.group.status === 'online' ? ' live' : '');
  } else g.className = 'pill hidden';
  $('#mode-btn').textContent = S.map?.mode === '3d' ? '2D' : '3D';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));

  const nb = $('#navbar'), nav = S.nav;
  if (!nav || S.player) { nb.classList.add('hidden'); S.navHtml = ''; return; }
  nb.classList.remove('hidden');
  const r = nav.route, p = nav.problem, w = nav.warn;
  const box = (b) => `<div class="warnbox"><b>${esc(b.title)}</b>${esc(b.text)}</div>`;
  let html = `<div class="row"><div class="to">To ${esc(nav.name || nav.target.name || 'destination')}</div><button class="${S.voice ? 'voice on' : 'voice'}" data-act="voice" aria-label="Spoken directions ${S.voice ? 'on' : 'off'}">${S.voice ? '🔊 Voice on' : '🔇 Voice off'}</button><button class="end" data-act="end-nav">End</button></div>`;
  if (r) {
    html += `<div class="meta">${nav.arrived ? "You've arrived" : `${fmtDur(r.time)} · ${fmtDist(r.dist)} · ↓${fmtVert(r.vertDown)} ↑${fmtVert(r.vertUp)}${r.climb >= 1 ? ` · ${fmtVert(r.climb)} on foot` : ''}`}</div>`;
    const s = r.steps[0];
    if (s && !nav.arrived) html += `<div class="next">${stepIcon(s)}<span>${stepText(s)}${r.steps[1] ? `, then ${stepText(r.steps[1], true)}` : ''}</span></div>`;
  }
  if (nav.over && r) html += `<div class="warnbox over"><b>⚠ ${esc(nav.over.title)}</b>${esc(nav.over.text)}</div>`;
  if (w) html += box(w);
  if (p) html += box(p);
  html += '<div class="btns">';
  if (r) html += `<button data-act="steps">Steps (${r.steps.length})</button>`;
  if ((p?.meet || w?.meet)) html += `<button class="primary" data-act="meet">Set a shared meeting point</button>`;
  if (S.voice && r) html += `<button data-act="pocket">Pocket mode</button>`;
  if (S.testMode && r && !nav.arrived) html += `<button data-act="sim-go">▶ Simulate skiing it</button>`;
  html += '</div>';
  if (html !== S.navHtml) { S.navHtml = html; nb.innerHTML = html; } // don't replace buttons mid-tap
}

function stepIcon(s) {
  const bg = s.kind === 'ski' ? runColor(S.resort, s) : s.kind === 'lift' ? COLORS.lift : s.kind === 'up' || s.kind === 'cross' ? '#b3620a' : '#59636e';
  return `<span class="ico step-ico" style="background:${bg};width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center;color:#fff;font-weight:800;flex:none">${s.kind === 'ski' ? runSym(S.resort, s)[0] : s.kind === 'lift' ? '↑' : s.kind === 'up' ? '⇡' : s.kind === 'cross' ? '⇢' : 'W'}</span>`;
}
function stepText(s, lower) {
  const how = s.grade <= 0 ? 'Skate back' : s.grade === 1 ? 'Climb back' : 'Sidestep back up';
  const t = s.kind === 'ski' ? `Ski ${s.name}` : s.kind === 'lift' ? `Ride ${s.name}`
    : s.kind === 'up' ? `${how} ${fmtDist(s.dist)}${s.name ? ` ${s.grade <= 0 ? 'along' : 'on'} ${s.name}` : ''}`
    : s.kind === 'cross' ? `Cut across ${fmtDist(s.dist)}${s.to ? ` to ${s.to}` : ''}`
    : s.kind === 'walk' ? `Walk ${fmtDist(s.dist)}` : `Continue ${fmtDist(s.dist)}`;
  return esc(lower ? t[0].toLowerCase() + t.slice(1) : t);
}

// ---------- sheets
function openSheet(name, arg) {
  S.sheet = name; S.sheetArg = arg;
  if (['group', 'track', 'history', 'more'].includes(name)) S.tab = name;
  $('#sheet').classList.remove('hidden');
  renderSheet();
  renderChrome();
}
function closeSheet() {
  S.sheet = null; S.tab = 'map';
  $('#sheet').classList.add('hidden');
  renderChrome();
}

function renderSheet() {
  if (!S.sheet) return;
  const fn = { group: sheetGroup, track: sheetTrack, history: sheetHistory, session: sheetSession, more: sheetMore, legend: sheetLegend, place: sheetPlace, steps: sheetSteps, closures: sheetClosures, weather: sheetWeather }[S.sheet];
  const [title, html, small] = fn(S.sheetArg);
  const body = $('#sheet-body'), keep = body.scrollTop, same = $('#sheet-title').textContent === title;
  $('#sheet-title').textContent = title;
  // don't clobber a text field the person is typing in
  const a = document.activeElement;
  if (same && a && body.contains(a) && a.tagName === 'INPUT' && a.type !== 'checkbox') return;
  if (same && html === S.sheetHtml) return; // nothing changed: leave the DOM (and any tap in progress) alone
  S.sheetHtml = html;
  body.innerHTML = html;
  $('#sheet').classList.toggle('small', !!small);
  if (same) body.scrollTop = keep;
}

function profileForm() {
  const p = S.profile;
  return `<div class="card"><h3>You</h3>
    <label class="lbl">Display name (optional)</label><input class="field" id="f-name" maxlength="20" placeholder="Optional" value="${esc(p.name)}" autocomplete="off" />
    <label class="lbl">Avatar</label><div class="avatars">${AVATARS.map(([k, n]) => `<button data-act="avatar" data-v="${k}" class="${p.avatar === k ? 'on' : ''}">${avatarSvg(k, p.color)}${n}</button>`).join('')}</div>
    <label class="lbl">Color</label><div class="swatches">${PALETTE.map((c) => `<button data-act="color" data-v="${c}" class="${p.color === c ? 'on' : ''}" style="background:${c}" aria-label="color"></button>`).join('')}</div>
  </div>`;
}

function sheetGroup() {
  const g = S.group;
  if (!g) {
    return ['Group', `${profileForm()}
      <div class="card"><h3>Start a private group</h3><p class="sub">Up to 20 people. Share the code with friends; nobody can see a location until that person turns sharing on.</p><button class="btn" data-act="create-group">Create group</button></div>
      <div class="card"><h3>Join with a code</h3><input class="field code" id="f-code" maxlength="6" placeholder="CODE" autocapitalize="characters" autocomplete="off" /><button class="btn alt" data-act="join-group">Join group</button></div>`];
  }
  const st = g.state, mine = st?.members.find((m) => m.id === S.profile.id);
  const owner = st?.owner === S.profile.id;
  const people = st ? [mine, ...friends()].filter(Boolean) : [];
  S.groupSig = groupSig();
  const rows = people.map((m) => {
    const me = m.id === S.profile.id, [status, cls] = memberStatus(m);
    return `<div class="member"><div class="dot" style="background:${m.color}22">${avatarSvg(m.avatar, m.color)}</div>
      <div class="grow" style="flex:1;min-width:0"><div class="nm">${esc(m.name)}${me ? ' <span class="tag">you</span>' : ''}${st.owner === m.id ? ' <span class="tag">creator</span>' : ''}</div><div class="st ${cls}" data-st="${m.id}">${status}</div></div>
      ${me ? '' : `<button class="btn sm go" data-act="nav-friend" data-id="${m.id}">Directions</button>`}</div>`;
  }).join('');
  const meet = st?.meet;
  return [`Group ${g.code}`, `
    <div class="card"><div class="bigcode">${g.code}</div><p class="sub" style="text-align:center;margin:4px 0 8px">${g.status === 'online' ? `${st?.members.length || 1} of ${st?.max || 20} people` : g.status === 'connecting' ? 'Connecting…' : 'Offline — reconnecting…'}</p><button class="btn alt" data-act="share-code">Share invite</button></div>
    <div class="card"><div class="rowf"><div class="grow"><b>Share my GPS location</b><div class="sub">${S.sharing ? 'On — your group sees you live. Turn off to pause.' : 'Off — your group cannot see you.'}</div></div><label class="switch"><input type="checkbox" id="f-share" ${S.sharing ? 'checked' : ''} /><i></i></label></div>
      <p class="note">Keep WeSki open with the screen on while sharing: iPhone pauses web-app GPS when the screen locks. Your last location then shows as stale with its time.</p></div>
    <div class="card"><h3>Members</h3>${rows || '<p class="sub">Connecting…</p>'}</div>
    ${meet ? `<div class="card"><h3>Meeting point</h3><div class="rowf"><div class="grow"><b>${esc(meet.name)}</b><div class="sub">Set by ${esc(meet.by)} at ${fmtClock(meet.at + (g.skew || 0))}</div></div><button class="btn sm go" data-act="nav-meet">Directions</button></div><button class="btn alt" data-act="clear-meet">Clear meeting point</button></div>` : ''}
    ${S.editProfile ? profileForm() : '<button class="btn alt" data-act="edit-profile">Edit my name, avatar and color</button>'}
    <button class="btn danger" data-act="leave-group">Leave group &amp; save my runs</button>
    ${owner ? '<button class="btn danger" data-act="close-group">Close group for everyone</button>' : ''}
    <p class="note">Leaving or closing saves your runs, routes and stats to History on this phone. Closing deletes every shared location from the server.</p>`];
}

function memberStatus(m) {
  const me = m.id === S.profile.id;
  let status, cls = '';
  if (me) return [S.sharing ? (S.me ? 'Sharing your location' : 'Sharing on — waiting for GPS') : 'Not sharing', ''];
  if (!m.has) status = m.sharing ? 'Sharing on — no location yet' : 'Not sharing';
  else if (!m.sharing) { status = `Paused · last updated ${fmtAge(m.age)}`; cls = 'stale'; }
  else if (m.stale) { status = `Stale · last updated ${fmtAge(m.age)}`; cls = 'stale'; }
  else status = `Live · updated ${fmtAge(m.age)}${m.pos.st === 'lift' ? ' · on a lift' : m.pos.st === 'ski' ? ' · skiing' : ''}`;
  if (!m.online) status += ' · app closed';
  if (m.has && !m.inBounds) status += ` · away from ${S.place.name}`;
  return [status, cls];
}

/** Everything about the group sheet except the ticking "updated Xs ago" texts. */
function groupSig() {
  const g = S.group, st = g?.state;
  return JSON.stringify([g?.code, g?.status, S.sharing, S.editProfile, st?.owner, st?.meet, st?.members.map((m) => [m.id, m.name, m.avatar, m.color])]);
}

/** Update the group sheet without replacing buttons under the user's finger. */
function refreshGroupSheet() {
  if (S.sheet !== 'group') return;
  if (groupSig() !== S.groupSig) { renderSheet(); return; }
  const mine = S.group?.state?.members.find((m) => m.id === S.profile.id);
  for (const m of [mine, ...friends()].filter(Boolean)) {
    const el = document.querySelector(`[data-st="${m.id}"]`);
    if (!el) continue;
    const [status, cls] = memberStatus(m);
    if (el.textContent !== status) el.textContent = status;
    el.className = 'st ' + cls;
  }
}

function statGrid(st, live) {
  const d = distParts(st.skiDist), v = vertParts(st.vert);
  return `<div class="stats">
    ${live ? `<div class="stat hero"><b>${fmtSpeed(st.speed)}<small>${speedUnit()}</small></b><span>Current speed</span> <span class="state-chip ${['', 'ski', 'lift'][st.state]}">${['Stopped', 'Skiing', 'On lift'][st.state]}</span></div>` : ''}
    <div class="stat"><b>${fmtSpeed(st.avgSpeed)}<small>${speedUnit()}</small></b><span>Avg ski speed</span></div>
    <div class="stat"><b>${fmtSpeed(st.topSpeed)}<small>${speedUnit()}</small></b><span>Top speed</span></div>
    <div class="stat"><b>${st.runCount}</b><span>Runs</span></div>
    <div class="stat"><b>${d[0]}<small>${d[1]}</small></b><span>Ski distance</span></div>
    <div class="stat"><b>${v[0]}<small>${v[1]}</small></b><span>Vertical</span></div>
    <div class="stat"><b>${fmtDur(st.skiTime).replace(' min', 'm')}</b><span>Ski time</span></div>
  </div>
  <div class="card"><h3>Lifts (not counted in ski stats)</h3><div class="liftbox"><span><b>${st.liftCount}</b> rides</span><span><b>${fmtVert(st.liftVert)}</b> up</span><span><b>${fmtDist(st.liftDist)}</b></span><span><b>${fmtDur(st.liftTime)}</b></span></div></div>`;
}

function sheetTrack() {
  if (!S.tracker) {
    return ['Stats', `<div class="card"><p class="sub">Track speed, runs, distance and vertical. Lift rides are detected and kept separate, and GPS spikes are filtered out.</p>
      <button class="btn go" data-act="start-track">Start tracking</button>
      <p class="note">Joining a group starts a group session automatically. Everything is saved on this phone when you end.</p></div>
      ${tracksCard()}
      ${S.gpsMsg ? `<p class="note">${esc(S.gpsMsg)}</p>` : ''}`];
  }
  const st = S.tracker.stats, s = S.session;
  return [s.kind === 'group' ? `Group session ${s.group || ''}` : 'Solo tracking', `<div id="live-stats">${statGrid(st, true)}</div>
    ${tracksCard()}
    <p class="note">Started ${fmtClock(s.start)} · ${S.tracker.points.length} GPS points${st.rejected ? ` · ${st.rejected} bad fixes filtered` : ''}${S.me ? '' : ' · waiting for GPS'}</p>
    ${s.kind === 'group' && S.group ? '<p class="note">This session ends and saves when you leave or close the group.</p><button class="btn danger" data-act="leave-group">Leave group &amp; save</button>' : '<button class="btn danger" data-act="end-track">End &amp; save</button>'}`];
}
function renderTrackLive() {
  const el = $('#live-stats');
  if (el && S.tracker) el.innerHTML = statGrid(S.tracker.stats, true);
}

function sheetHistory() {
  const list = S.history || [];
  if (!S.historyLoaded) { loadHistory(); return ['History', '<p class="sub">Loading…</p>']; }
  const loose = prefs.get(pkey('routes'), []);
  const looseHtml = loose.length ? `<div class="card"><h3>Recent directions</h3>${loose.slice().reverse().map((r, k) => routeRow(r, 'loose', loose.length - 1 - k)).join('')}</div>` : '';
  if (!list.length) return [`History · ${S.place.name}`, looseHtml + (S.historyElsewhere ? `<p class="note">${S.historyElsewhere} saved session${S.historyElsewhere > 1 ? 's' : ''} at other resorts — open that resort to see ${S.historyElsewhere > 1 ? 'them' : 'it'}.</p>` : '') + '<div class="card"><p class="sub">No saved sessions here yet. End a tracking session or leave a group and your runs, routes and stats appear here — stored on this phone and available offline.</p></div>'];
  return [`History · ${S.place.name}`, `<div class="card">${list.map((s) => `<button class="list-item" data-act="open-session" data-id="${s.id}"><div class="grow"><div class="t">${fmtDate(s.start)} <span class="tag ${s.kind}">${s.kind === 'group' ? 'Group ' + esc(s.group || '') : 'Solo'}</span></div><div class="s">${fmtClock(s.start)}–${fmtClock(s.end)} · ${s.stats.runCount} runs · ${fmtVert(s.stats.vert)} · top ${fmtSpeed(s.stats.topSpeed)} ${speedUnit()}${s.routes?.length ? ` · ${s.routes.length} route${s.routes.length > 1 ? 's' : ''}` : ''}</div></div><span class="chev">›</span></button>`).join('')}</div>${looseHtml}<p class="note">Stored on this phone only. Works offline.${S.historyElsewhere ? ` ${S.historyElsewhere} more session${S.historyElsewhere > 1 ? 's' : ''} at other resorts — open that resort to see ${S.historyElsewhere > 1 ? 'them' : 'it'}.` : ''}</p>`];
}
async function loadHistory() {
  // History, replay and tracks are per mountain: a recording only makes sense on the map it was made on.
  let all = [];
  try { all = (await sessions.list()).filter((s) => !s.active); } catch { /* storage unavailable */ }
  S.history = all.filter((s) => resortOf(s) === S.place.id);
  S.historyElsewhere = all.length - S.history.length;
  showTracks();
  S.historyLoaded = true;
  if (S.sheet === 'history' || S.sheet === 'session') renderSheet();
}

function sheetSession(id) {
  const s = (S.history || []).find((x) => x.id === id);
  if (!s) return ['Session', '<p class="sub">Not found.</p>'];
  const runs = s.stats.runs.map((r, i) => `<button class="list-item" data-act="replay" data-id="${s.id}" data-run="${i}"><div class="grow"><div class="t">Run ${i + 1} · ${fmtClock(r.t0)}</div><div class="s">${fmtDist(r.dist)} · ${fmtVert(r.vert)} · top ${fmtSpeed(r.top)} ${speedUnit()} · ${fmtDur(r.time)}</div></div><span class="chev">▶</span></button>`).join('');
  const routes = (s.routes || []).map((r, i) => routeRow(r, s.id, i)).join('');
  return [`${fmtDate(s.start)} · ${s.kind === 'group' ? 'Group' : 'Solo'}`, `
    <button class="btn" data-act="replay" data-id="${s.id}" ${s.points.length < 2 ? 'disabled' : ''}>▶ Replay on map</button>
    ${statGrid(s.stats, false)}
    <div class="card"><h3>Runs</h3>${runs || '<p class="sub">No complete runs in this session.</p>'}</div>
    ${routes ? `<div class="card"><h3>Routes</h3>${routes}</div>` : ''}
    <button class="btn alt" data-act="tab" data-tab="history">Back to history</button>
    <button class="btn danger" data-act="delete-session" data-id="${s.id}">Delete session</button>`];
}

function routeRow(r, id, i) {
  return `<button class="list-item" data-act="show-route" data-id="${id}" data-i="${i}"><div class="grow"><div class="t">To ${esc(r.to)} · ${fmtDate(r.t)} ${fmtClock(r.t)}</div><div class="s">${fmtDur(r.time)} · ${fmtDist(r.dist)} · ${r.steps.filter((x) => x.name).map((x) => esc(x.name)).slice(0, 4).join(' → ')}</div></div><span class="chev">›</span></button>`;
}

function sheetMore() {
  const off = prefs.get(pkey('offline'), null);
  return ['More', `
    <div class="card"><h3>My hardest trail</h3><div class="seg">${DIFF_NAMES.map((n, i) => `<button data-act="max-diff" data-v="${i}" class="${S.maxDiff === i ? 'on' : ''}"><span class="${runCss(S.resort, { d: i })}">${runSym(S.resort, { d: i })}</span> ${levelName(S.resort, i)}</button>`).join('')}</div><p class="note">Directions keep you on trails up to this level. If you're already on something harder, or there is no other way, you still get a route — with a warning — that leaves the harder terrain as soon as possible.</p></div>
    <div class="card"><h3>Uphill tolerance</h3><div class="seg">${Object.entries(TOLERANCE).filter(([k]) => k !== 'none').map(([k, t]) => `<button data-act="uphill" data-v="${k}" class="${S.uphill === k ? 'on' : ''}">${t.label}</button>`).join('')}</div><p class="note">${{ low: 'Low: only an easy skate or a step or two up; otherwise directions take the downhill way round.', normal: 'Normal: accepts a short moderate climb or a cut-across to the next trail when it saves a lot of time.', high: 'High: accepts a real sidestep or short boot-pack to avoid a lap.' }[S.uphill]} Steeper ground, harder trails and steep side slopes all count against a climb.</p></div>
    <div class="card"><div class="rowf"><div class="grow"><b>Spoken directions</b><div class="sub">Turn-by-turn voice through the speaker or headphones, timed ahead of each turn for your speed. The screen must stay on: use Pocket mode while riding.</div></div><label class="switch"><input type="checkbox" id="f-voice" ${S.voice ? 'checked' : ''} /><i></i></label></div></div>
    <div class="card"><h3>Closures</h3><div class="rowf"><div class="grow sub">${S.closures.size ? `${closedNames().length} marked closed: ${esc(closedNames().slice(0, 4).join(', '))}${closedNames().length > 4 ? '…' : ''}` : 'Mark lifts or trails you have confirmed are closed. Directions avoid them.'}</div><button class="btn sm" data-act="open-closures">Edit</button></div>${S.group ? '<p class="note">Closures are shared with your group.</p>' : ''}</div>
    <div class="card"><h3>Offline map</h3><div id="offline-box">${off ? `<p class="ok-text">✓ Whole resort saved on this phone (${(off.bytes / 1048576).toFixed(1)} MB, ${fmtDate(off.at)})</p>` : '<p class="sub">Download the entire ${esc(S.place.name)} map — 3D terrain, trails, lifts, buildings and the app itself — so it opens with no signal.</p>'}</div><button class="btn ${off ? 'alt' : ''}" data-act="download">${off ? 'Download again' : 'Download resort map'}</button></div>
    <div class="card"><h3>Appearance</h3><div class="seg"><button data-act="theme" data-v="dark" class="${document.documentElement.dataset.theme === 'light' ? '' : 'on'}">Dark</button><button data-act="theme" data-v="light" class="${document.documentElement.dataset.theme === 'light' ? 'on' : ''}">Light</button></div></div>
    <div class="card"><h3>Units</h3><div class="seg"><button data-act="units" data-v="imperial" class="${imp() ? 'on' : ''}">mph · ft</button><button data-act="units" data-v="metric" class="${imp() ? '' : 'on'}">km/h · m</button></div></div>
    <div class="card"><div class="rowf"><div class="grow"><b>Show frame rate</b><div class="sub">A small readout on the map: frames per second while you move it, and the automatic quality step (Q0 best – Q3 lightest). The app lowers quality by itself when the phone can’t keep up. “Slowed by phone” means the phone is holding the app back (usually heat), which lower quality cannot fix.</div></div><label class="switch"><input type="checkbox" id="f-fps" ${S.showFps ? 'checked' : ''} /><i></i></label></div><div class="rowf"><div class="grow"><b>120 fps motion</b><div class="sub">Off: the map moves at up to 60 frames a second, which keeps the phone cooler and the battery going. On: up to 120 on screens that support it.</div></div><label class="switch"><input type="checkbox" id="f-fps120" ${S.fps120 ? 'checked' : ''} /><i></i></label></div></div>
    <div class="card"><div class="rowf"><div class="grow"><b>Test mode (simulate my location)</b><div class="sub">Try sharing and rerouting away from the mountain: tap the map, then “Put me here”.</div></div><label class="switch"><input type="checkbox" id="f-test" ${S.testMode ? 'checked' : ''} /><i></i></label></div></div>
    <button class="btn alt" data-act="legend">Map legend</button>

    <button class="btn exit" data-act="change-resort">Choose a different resort</button>
    <div class="card"><h3>Install on iPhone</h3><p class="sub">In Safari tap Share, then “Add to Home Screen”. Open WeSki from the icon for full screen and offline use.</p></div>
    <div class="card"><h3>Map data</h3><p class="sub">Terrain: ${esc(S.resort.sources.terrain)}.<br>Trails, lifts, buildings, places: ${esc(S.resort.sources.map)}.<br>Zones: ${S.resort.sources.zones ? esc(S.resort.sources.zones) : 'none recorded for this resort yet'}.</p><p class="note">Not an official ${esc(S.place.name)} product. Always obey on-mountain signs, ropes and ski patrol. Closures here are what you mark, not a live resort feed.</p></div>`];
}

function closedNames() {
  const n = new Set();
  for (const id of S.closures) { const o = id[0] === 't' ? S.resort.trails[+id.slice(1)] : S.resort.lifts[+id.slice(1)]; if (o?.name) n.add(o.name); }
  return [...n];
}

function sheetClosures() {
  const q = (S.closureQ || '').toLowerCase();
  const names = new Map();
  for (const t of S.resort.trails) if (t.name) { const e = names.get(t.name) || { d: t.d, c: t.c, ids: [] }; e.ids.push('t' + t.id); names.set(t.name, e); }
  const row = (name, ids, badge) => {
    const on = ids.every((i) => S.closures.has(i));
    return `<div class="list-item"><div class="grow t" style="font-weight:600">${badge} ${esc(name)}</div><span class="sub">${on ? 'Closed' : 'Open'}</span><label class="switch"><input type="checkbox" data-closure="${ids.join(',')}" ${on ? 'checked' : ''} /><i></i></label></div>`;
  };
  const lifts = S.resort.lifts.filter((l) => l.name.toLowerCase().includes(q)).map((l) => row(l.name, ['l' + l.id], `<span style="color:${COLORS.lift}">↑</span>`)).join('');
  const trails = [...names.entries()].filter(([n]) => n.toLowerCase().includes(q)).sort((a, b) => a[0].localeCompare(b[0])).map(([n, e]) => row(n, e.ids, `<span class="${runCss(S.resort, e)}">${runSym(S.resort, e)}</span>`)).join('');
  return ['Confirmed closures', `<input class="field" id="f-closure-q" placeholder="Search lifts and trails" value="${esc(S.closureQ || '')}" autocomplete="off" />
    <p class="note">Switch on anything you have confirmed is closed (lift board, patrol, rope). ${S.group ? 'Shared with your group.' : ''}</p>
    <div class="card" id="closure-list"><h3>Lifts</h3>${lifts || '<p class="sub">None</p>'}<h3 style="margin-top:14px">Trails</h3>${trails || '<p class="sub">None</p>'}</div>
    <button class="btn alt" data-act="clear-closures">Reopen everything</button><button class="btn alt" data-act="tab" data-tab="more">Done</button>`];
}

function sheetLegend() {
  const line = (c, label, dash) => `<div class="legend-row"><div class="sw"><div class="ln" style="background:${dash ? `repeating-linear-gradient(90deg, ${c} 0 9px, transparent 9px 15px)` : c}"></div></div>${label}</div>`;
  const ic = (c, ch, label) => `<div class="legend-row"><div class="sw"><div class="ic" style="background:${c}">${ch}</div></div>${label}</div>`;
  return ['Legend', `<div class="card"><h3>Trail difficulty</h3>
      ${(() => { const sc = scheme(S.resort); return classesUsed(S.resort).map((c) => line(sc.colors[c], `<b class="${sc.css[c]}">${sc.syms[c]}</b>&nbsp; ${sc.legend[c]}`)).join(''); })()}
      ${line(scheme(S.resort).colors[1], 'Dashed = glade: an ungroomed run through the trees', true)}${line(COLORS.closed, 'Marked closed', true)}</div>
    ${zonesCard()}
    <div class="card"><h3>Lifts &amp; routes</h3>${line(COLORS.lift, `Lift (one ${scheme(S.resort).liftWord} line per lift, just above and between its two cables)`)}${line(COLORS.route, 'Your directions')}${line(COLORS.track, 'Replayed run (grey = lift ride)')}<div class="legend-row"><div class="sw"><span class="crumb"></span></div>My tracks: dotted trail of where you have skied (Stats tab)</div></div>
    <div class="card"><h3>Places &amp; people</h3>${ic('#14365f', 'L', 'Base lodge / hotel')}${ic(COLORS.lift, '↑', 'Lift base')}${ic('#c7641a', 'F', 'Food &amp; drink')}${ic('#59636e', '•', 'Services')}${ic('#5d6875', '▲', 'Summit')}
      ${ic(PALETTE[5], 'A', 'Friend — avatar in 3D, colored circle with name in 2D (grey = stale location)')}${ic('#d92d20', '', 'Dropped pin')}${ic('#c96f00', '⚑', 'Group meeting point')}</div>`];
}

function sheetPlace(ev) {
  if (ev.type === 'poi') {
    const p = S.resort.pois[ev.id];
    const kind = { lodge: 'Lodge', lift: 'Lift base', lifttop: 'Lift top', food: 'Food & drink', peak: 'Summit', service: 'Service', parking: 'Parking', shelter: 'Shelter' }[p.kind];
    return [p.name, `<p class="sub">${kind} · Elevation ${fmtVert(S.geo.elev(p.x, p.y))}</p><button class="btn go" data-act="nav-poi" data-id="${p.id}">Directions</button>`, true];
  }
  if (ev.type === 'friend') {
    const f = friends().find((m) => m.id === ev.id);
    if (!f) return ['Friend', '<p class="sub">No longer in the group.</p>', true];
    return [f.name, `<div class="rowf"><div class="dot" style="width:48px;height:48px;border-radius:50%;background:${f.color}22;display:grid;place-items:center">${avatarSvg(f.avatar, f.color)}</div><div class="grow"><div class="sub ${f.stale ? 'warn-ink' : ''}">${!f.sharing ? 'Sharing paused' : f.stale ? 'Location is stale' : 'Live'} · last updated ${fmtAge(f.age)}</div><div class="sub">${describeSpot(f.x, f.y)}</div></div></div><button class="btn go" data-act="nav-friend" data-id="${f.id}">Directions to ${esc(f.name)}</button>`, true];
  }
  if (ev.type === 'meet') {
    const m = S.map.meet;
    return [m?.name || 'Meeting point', `<p class="sub">Shared meeting point${S.group?.state?.meet ? ` set by ${esc(S.group.state.meet.by)}` : ''}</p><button class="btn go" data-act="nav-meet">Directions</button>${S.group ? '<button class="btn alt" data-act="clear-meet">Clear meeting point</button>' : ''}`, true];
  }
  const p = S.pin;
  return ['Dropped pin', `<p class="sub">${describeSpot(p.x, p.y)}</p><button class="btn go" data-act="nav-pin">Directions</button>
    ${S.group ? '<button class="btn alt" data-act="meet-here">Make this the group meeting point</button>' : ''}
    ${S.testMode ? '<button class="btn alt" data-act="sim-here">Put me here (test mode)</button>' : ''}
    <button class="btn alt" data-act="remove-pin">Remove pin</button>`, true];
}

function sheetSteps() {
  const r = S.nav?.route;
  if (!r) return ['Directions', '<p class="sub">No route.</p>', true];
  return [`To ${S.nav.name}`, `<p class="sub">${fmtDur(r.time)} · ${fmtDist(r.dist)} · your limit: ${levelName(S.resort, S.maxDiff)}</p>${S.nav.over ? `<div class="card bad"><b>⚠ ${esc(S.nav.over.title)}</b><br>${esc(S.nav.over.text)}</div>` : ''}<div class="card">${r.steps.map((s) => `<div class="step">${stepIcon(s)}<div><b>${stepText(s)}</b><div class="sub">${fmtDist(s.dist)} · ${fmtDur(s.time)}${s.kind === 'ski' ? ` · ${DIFF_NAMES[s.d]}` : ''}${s.climb >= 1 ? ` · ${fmtVert(s.climb)} climb` : ''}${s.grade >= 0 ? ` · ${GRADE_NAMES[s.grade]}` : s.kind === 'cross' ? ' · level or downhill' : ''}${s.over ? ' · <b class="danger-ink">⚠ above your limit</b>' : ''}</div></div></div>`).join('')}</div><p class="note">Routes use mapped trails, lifts and walking links, plus short climbs and cut-acrosses allowed by your uphill tolerance (${TOLERANCE[S.uphill].label}, set in More). A cut-across is judged from the terrain only: the app cannot see trees, ropes or signs, so look before you go. Times are estimates.</p>`];
}

// ---------- weather
const tempU = (c) => (imp() ? Math.round(c * 1.8 + 32) : Math.round(c));
const fmtTemp = (c) => `${tempU(c)}°`;
const fmtWind = (ms) => `${Math.round(imp() ? ms * 2.23694 : ms * 3.6)}`;
const fmtSnow = (cm) => (imp() ? `${cm / 2.54 < 0.95 && cm > 0.2 ? '<1' : Math.round(cm / 2.54)} in` : `${cm < 0.95 && cm > 0.2 ? '<1' : Math.round(cm)} cm`);
const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const hourLabel = (iso) => { const h = +iso.slice(11, 13); return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`; };
const dayLabel = (iso, i) => (i === 0 ? 'Today' : new Date(iso + 'T12:00').toLocaleDateString([], { weekday: 'short' }));

async function refreshWeather(force) {
  S.wx = S.wx || {};
  S.wx.loading = true;
  if (S.sheet === 'weather') renderSheet();
  try { S.wx = { data: await loadWeather(S.place, force) }; } catch (e) { S.wx = { error: navigator.onLine === false ? 'You are offline and no forecast is saved on this phone yet.' : 'The weather service did not answer. Try again in a moment.' }; }
  if (S.sheet === 'weather') renderSheet();
}

function sheetWeather() {
  const wx = S.wx || {};
  if (wx.error) return [`Ski weather · ${S.place.name}`, `<div class="card"><p class="sub">${esc(wx.error)}</p><button class="btn alt" data-act="wx-refresh">Try again</button></div>`];
  if (!wx.data) return [`Ski weather · ${S.place.name}`, '<div class="card"><p class="sub">Loading the forecast…</p></div>'];
  const { summit: s, base: b, at, stale } = wx.data, c = s.current, d = s.daily, h = s.hourly, hi = hourIndex(s);
  const [label, glyph] = describeCode(c.weather_code);
  const day = (i) => ({ snow: d.snowfall_sum[i] || 0, rain: d.rain_sum[i] || 0, gust: d.wind_gusts_10m_max[i] || 0, feelsMin: d.apparent_temperature_min[i], tMax: d.temperature_2m_max[i], tMin: d.temperature_2m_min[i] });
  const vis = h.visibility?.[hi], frz = h.freezing_level_height?.[hi];
  const next24 = h.snowfall.slice(hi, hi + 24).reduce((n, v) => n + (v || 0), 0);
  const notes = (i, cur) => skiNotes(day(i), cur, fmtSnow).map(([k, t]) => `<div class="wx-note ${k}">${esc(t)}</div>`).join('');
  const cell = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const hours = h.time.slice(hi, hi + 12).map((t, k) => {
    const i = hi + k;
    return `<div class="wx-hour"><span>${k === 0 ? 'Now' : hourLabel(t)}</span><i>${describeCode(h.weather_code[i])[1]}</i><b>${fmtTemp(h.temperature_2m[i])}</b><small>${h.snowfall[i] > 0.05 ? '❄ ' + fmtSnow(h.snowfall[i]) : (h.precipitation_probability[i] ?? 0) + '%'}</small><small>${fmtWind(h.wind_gusts_10m[i])} ${speedUnit()}</small></div>`;
  }).join('');
  const today = `
    <div class="wx-hero"><div class="g">${glyph}</div><div><div class="t">${fmtTemp(c.temperature_2m)}<small> summit</small></div><div class="l">${label} · feels like ${fmtTemp(c.apparent_temperature)}</div><div class="l">Base ${fmtTemp(b.current.temperature_2m)} · today ${fmtTemp(d.temperature_2m_min[0])} to ${fmtTemp(d.temperature_2m_max[0])}</div></div></div>
    ${notes(0, { vis })}
    <div class="stats" style="margin-top:10px">
      ${cell(fmtSnow(d.snowfall_sum[0] || 0), 'New snow today')}${cell(fmtSnow(next24), 'Next 24 h')}${cell(c.snow_depth != null ? fmtSnow(c.snow_depth * 100) : '–', 'Snow depth')}
      ${cell(`${fmtWind(c.wind_speed_10m)}<small>${speedUnit()}</small>`, `Wind ${compass(c.wind_direction_10m)}`)}${cell(`${fmtWind(c.wind_gusts_10m)}<small>${speedUnit()}</small>`, 'Gusts')}${cell(`${fmtWind(d.wind_gusts_10m_max[0])}<small>${speedUnit()}</small>`, 'Peak gust today')}
      ${cell(vis != null ? (imp() ? `${(vis / 1609.34).toFixed(vis < 1609 ? 1 : 0)}<small>mi</small>` : `${(vis / 1000).toFixed(vis < 1000 ? 1 : 0)}<small>km</small>`) : '–', 'Visibility')}${cell(frz != null ? fmtVert(frz).replace(' ', '<small>') + '</small>' : '–', 'Freezing level')}${cell(`${d.precipitation_probability_max[0] ?? 0}<small>%</small>`, 'Precip chance')}
    </div>
    <div class="card"><h3>Next 12 hours at the summit · temp, snow or precip chance, gusts</h3><div class="wx-hours">${hours}</div></div>
    <p class="note">Sunrise ${hourLabelFull(d.sunrise[0])} · sunset ${hourLabelFull(d.sunset[0])} · cloud cover ${c.cloud_cover}%</p>`;
  const week = S.wxWeek ? `<div class="card"><h3>7-day ski forecast (summit)</h3>${d.time.map((t, i) => {
    const n = skiNotes(day(i), null, fmtSnow)[0];
    return `<div class="wx-day"><b class="dn">${dayLabel(t, i)}</b><i>${describeCode(d.weather_code[i])[1]}</i><span class="tt">${fmtTemp(d.temperature_2m_min[i])} / ${fmtTemp(d.temperature_2m_max[i])}</span><span class="sn ${d.snowfall_sum[i] >= 5 ? 'pow' : ''}">❄ ${fmtSnow(d.snowfall_sum[i] || 0)}</span><span class="wd">${fmtWind(d.wind_gusts_10m_max[i])} ${speedUnit()}</span><small class="${n[0]}">${esc(describeCode(d.weather_code[i])[0])}${d.rain_sum[i] >= 1 ? ' · rain' : ''} · ${d.precipitation_probability_max[i] ?? 0}% precip · feels ${fmtTemp(d.apparent_temperature_min[i])} at coldest${n[0] !== 'good' || d.snowfall_sum[i] >= 5 ? ' · ' + esc(n[1].split(':')[0].split(' — ')[0]) : ''}</small></div>`;
  }).join('')}<p class="note">Columns: low / high, new snow, peak gust.</p></div>` : '';
  return [`Ski weather · ${S.place.name}`, `${today}
    <button class="btn ${S.wxWeek ? 'alt' : ''}" data-act="wx-week">${S.wxWeek ? 'Hide 7-day forecast' : 'Show 7-day forecast'}</button>${week}
    <p class="note">${stale ? 'Could not refresh — showing the forecast saved ' : 'Updated '}${fmtClock(at)}${wx.loading ? ' · refreshing…' : ''} · Summit ${fmtVert(S.place.top)}, base ${fmtVert(S.place.base)} · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a></p>
    <button class="btn alt" data-act="wx-refresh">Refresh</button>`];
}
const hourLabelFull = (iso) => { const h = +iso.slice(11, 13); return `${h % 12 || 12}:${iso.slice(14, 16)} ${h < 12 ? 'am' : 'pm'}`; };

// ---------- playback
function startReplay(s, runIdx) {
  let pts = s.points;
  if (runIdx != null) { const r = s.stats.runs[runIdx]; pts = s.points.slice(r.i0, r.i1 + 1); }
  if (pts.length < 2) return;
  closeSheet();
  S.player = { pts, i: 0, t: pts[0][0], playing: true, rate: 20, label: runIdx != null ? `Run ${runIdx + 1}` : fmtDate(s.start), sid: s.id };
  document.body.classList.add('playing');
  S.map.setTrack(pts);
  const flat = [];
  for (const p of pts) if (S.geo.inBounds(p[1], p[2])) flat.push(p[1], p[2]);
  if (flat.length >= 4) S.map.fit(flat);
  $('#player').classList.remove('hidden');
  $('#player').innerHTML = `<div class="row"><button data-act="play-toggle" id="pl-play">❚❚</button><input type="range" id="pl-seek" min="0" max="1000" value="0" /><button data-act="play-rate" id="pl-rate">20×</button><button data-act="play-close">✕</button></div><div class="info"><span id="pl-a"></span><span id="pl-b"></span></div>`;
  S.player.last = performance.now();
  requestAnimationFrame(playFrame);
  renderChrome();
}

function playFrame(now) {
  const P = S.player;
  if (!P) return;
  const dt = Math.min(0.5, (now - P.last) / 1000);
  P.last = now;
  const t0 = P.pts[0][0], t1 = P.pts[P.pts.length - 1][0];
  if (P.playing) {
    P.t += dt * 1000 * P.rate;
    // skip long gaps (lunch, GPS off) quickly
    if (P.t >= t1) { P.t = t1; P.playing = false; $('#pl-play').textContent = '▶'; }
  }
  while (P.i < P.pts.length - 2 && P.pts[P.i + 1][0] <= P.t) P.i++;
  while (P.i > 0 && P.pts[P.i][0] > P.t) P.i--;
  const a = P.pts[P.i], b = P.pts[Math.min(P.i + 1, P.pts.length - 1)];
  if (P.playing && b[0] - a[0] > 60000 && P.t < b[0] - 2000) { P.t = b[0] - 2000; P.jump = true; }
  const f = b[0] > a[0] ? Math.min(1, Math.max(0, (P.t - a[0]) / (b[0] - a[0]))) : 0;
  const x = a[1] + (b[1] - a[1]) * f, y = a[2] + (b[2] - a[2]) * f;
  const sp = smoothSpeed(P.pts, Math.min(P.i + 1, P.pts.length - 1));
  const hd = Math.hypot(b[1] - a[1], b[2] - a[2]) > 0.5 ? Math.atan2(b[1] - a[1], b[2] - a[2]) : P.hd;
  P.hd = hd;
  // Same avatar and riding animation as live tracking: carving while skiing, still on lifts and stops.
  S.map.setPlayhead(S.geo.inBounds(x, y) ? { x, y, heading: hd, avatar: S.profile.avatar, color: S.profile.color, moving: P.playing && b[4] === ST.SKI && sp > 1.2, lift: b[4] === ST.LIFT ? liftAt(x, y) : null, snap: P.seeking || P.jump } : null);
  P.jump = false;
  if (!P.seeking) $('#pl-seek').value = String(Math.round(((P.t - t0) / (t1 - t0 || 1)) * 1000));
  const st = b[4];
  $('#pl-a').textContent = `${P.label} · ${fmtClock(P.t)} · ${['stopped', 'skiing', 'on lift'][st]}`;
  $('#pl-b').textContent = `${fmtSpeed(smoothSpeed(P.pts, Math.min(P.i + 1, P.pts.length - 1)))} ${speedUnit()} · ${fmtVert(b[3])}`;
  requestAnimationFrame(playFrame);
}

function stopReplay() {
  const sid = S.player?.sid;
  S.player = null;
  document.body.classList.remove('playing');
  $('#player').classList.add('hidden');
  S.map.setTrack(null); S.map.setPlayhead(null);
  if (sid) openSheet('session', sid);
  renderChrome();
}

// ---------- offline download
async function downloadOffline() {
  const box = $('#offline-box');
  try {
    // the app itself plus this mountain's map
    const list = (await (await fetch('/offline.json', { cache: 'no-store' })).json()).concat(['resort.json', 'terrain.bin', 'surround.bin'].map((f) => `/data/${S.place.id}/${f}`));
    const cache = await caches.open('weski-map');
    let done = 0, bytes = 0;
    box.innerHTML = `<p class="sub">Downloading… <span id="dl-n">0</span>/${list.length}</p><progress id="dl-p" max="${list.length}" value="0"></progress>`;
    for (const url of list) {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(url);
      const blob = await res.clone().blob();
      bytes += blob.size;
      await cache.put(url, res);
      done++;
      $('#dl-n').textContent = done; $('#dl-p').value = done;
    }
    prefs.set(pkey('offline'), { at: Date.now(), bytes });
    toast(`${S.place.name} is saved for offline use.`);
  } catch (e) {
    toast('Download failed. Check your connection and try again.');
  }
  if (S.sheet === 'more') renderSheet();
}

// ---------- events
function onInput(e) {
  const t = e.target;
  if (t.id === 'f-resort') { if (e.type === 'input') renderResortList(t.value); return; } // not on blur: that would redraw under the tap
  if (t.id === 'f-name') { S.profile.name = t.value.trim().slice(0, 20); prefs.set('profile', S.profile); if (e.type === 'change' && S.group) S.group.client.updateProfile(S.profile); }
  else if (t.id === 'f-share' && e.type === 'change') setSharing(t.checked);
  else if (t.id === 'f-crumbs' && e.type === 'change') {
    S.crumbsOn = t.checked; prefs.set('crumbsOn', S.crumbsOn);
    if (S.crumbsOn) { startCrumbs(); if (!S.historyLoaded) loadHistory(); if (!S.me && !S.tracker) toast(S.testMode ? 'Test mode: tap the map, then “Put me here”.' : 'Finding your location…'); }
    else stopCrumbs();
    showTracks(); renderSheet(); renderChrome();
  }
  else if (t.id === 'f-voice' && e.type === 'change') { setVoice(t.checked); renderSheet(); }
  else if (t.id === 'f-fps' && e.type === 'change') { S.showFps = t.checked; prefs.set('showFps', S.showFps); fpsReadout(); }
  else if (t.id === 'f-fps120' && e.type === 'change') { S.fps120 = t.checked; prefs.set('fps120', S.fps120); if (S.map) S.map.maxFps = S.fps120 ? 120 : 60; }
  else if (t.id === 'f-test' && e.type === 'change') {
    S.testMode = t.checked; prefs.set('testMode', S.testMode);
    S.loc.setSim(S.testMode);
    if (!S.testMode) { S.me = null; S.map.setMe(null); if (S.tracker || S.sharing) S.loc.start(); }
    toast(S.testMode ? 'Test mode on: tap the map, then “Put me here”.' : 'Test mode off: using real GPS.');
    renderChrome();
  } else if (t.id === 'f-closure-q') {
    S.closureQ = t.value;
    const tmp = document.createElement('div'); tmp.innerHTML = sheetClosures()[1];
    $('#closure-list').innerHTML = tmp.querySelector('#closure-list').innerHTML;
  } else if (t.dataset.closure && e.type === 'change') {
    const set = new Set(S.closures);
    for (const id of t.dataset.closure.split(',')) t.checked ? set.add(id) : set.delete(id);
    setClosures(set);
    t.closest('.list-item').querySelector('.sub').textContent = t.checked ? 'Closed' : 'Open';
  } else if (t.id === 'pl-seek' && S.player) {
    const P = S.player, t0 = P.pts[0][0], t1 = P.pts[P.pts.length - 1][0];
    P.t = t0 + ((t1 - t0) * +t.value) / 1000;
    P.seeking = e.type === 'input';
  }
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, d = b.dataset;
  switch (act) {
    case 'tab':
      if (d.tab === 'track' && !S.historyLoaded) loadHistory();
      if (d.tab === 'map') closeSheet();
      else if (S.sheet === d.tab) closeSheet();
      else openSheet(d.tab);
      break;
    case 'close-sheet': closeSheet(); break;
    case 'mode': S.map.setMode(S.map.mode === '3d' ? '2d' : '3d'); renderChrome(); break;
    case 'legend': openSheet('legend'); break;
    case 'weather': if (S.sheet === 'weather') closeSheet(); else { openSheet('weather'); refreshWeather(false); } break;
    case 'wx-week': S.wxWeek = !S.wxWeek; renderSheet(); break;
    case 'wx-refresh': refreshWeather(true); break;
    case 'pick-resort': pickResort(d.id); break;
    case 'ski-here': skiHere(b); break;
    case 'resort-back': $('#resort-card').classList.add('hidden'); $('#start-panel').classList.remove('hidden'); globe?.release(); break;
    case 'change-resort': askLeaveResort(); break;
    case 'exit-save': leaveResort(true); break;
    case 'exit-nosave': leaveResort(false); break;
    case 'modal-cancel': $('#modal').classList.add('hidden'); break;
    case 'locate':
      if (S.testMode) { if (S.me) S.map.focus(S.me.x, S.me.y, 700); else toast('Test mode: tap the map, then “Put me here”.'); break; }
      ensureLocation();
      if (S.me && S.me.inBounds) S.map.focus(S.me.x, S.me.y, 700);
      else if (S.me) toast(`You're outside the ${S.place.name} map area — your position will appear when you're at the resort.`, 4500);
      else { S.followMe = true; toast('Finding your location…'); }
      renderChrome();
      break;
    case 'edit-profile': S.editProfile = true; renderSheet(); break;
    case 'avatar': S.profile.avatar = d.v; prefs.set('profile', S.profile); S.group?.client.updateProfile(S.profile); renderSheet(); break;
    case 'color': S.profile.color = d.v; prefs.set('profile', S.profile); S.group?.client.updateProfile(S.profile); renderSheet(); break;
    case 'create-group':
      b.disabled = true;
      try { await joinGroup(await createGroup()); openSheet('group'); } catch (err) { toast(err.message); b.disabled = false; }
      break;
    case 'join-group': {
      const code = ($('#f-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) { toast('Enter the 6-character group code.'); break; }
      joinGroup(code); openSheet('group');
      break;
    }
    case 'share-code': {
      const text = `Join my WeSki group at ${S.place.name}. Open ${location.origin} and enter code ${S.group.code}`;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else { try { await navigator.clipboard.writeText(text); toast('Invite copied.'); } catch { toast(`Code: ${S.group.code}`); } }
      break;
    }
    case 'leave-group': if (confirm('Leave this group? Your runs, routes and stats will be saved on this phone.')) leaveGroup(false); break;
    case 'close-group': if (confirm('Close the group for everyone? All shared locations are deleted and each person keeps their own runs.')) leaveGroup(true); break;
    case 'nav-friend': { const f = friends().find((m) => m.id === d.id); if (f) startNav({ type: 'friend', id: f.id, name: f.name }); break; }
    case 'nav-poi': startNav({ type: 'poi', id: +d.id, name: S.resort.pois[+d.id].name }); break;
    case 'nav-pin': startNav({ type: 'pin', name: 'Dropped pin' }); break;
    case 'nav-meet': startNav({ type: 'meet', name: S.map.meet?.name || 'Meeting point' }); break;
    case 'end-nav': endNav(); break;
    case 'steps': openSheet('steps'); break;
    case 'clear-tracks': if (confirm('Remove the saved location-only tracks from the map? Sessions in History are not affected.')) { S.tracksSaved = []; await saveTracks(); S.map.crumbCount = -2; showTracks(); renderSheet(); } break;
    case 'crumb-scope': S.crumbScope = d.v; if (!S.historyLoaded) loadHistory(); showTracks(); renderSheet(); break;
    case 'theme': prefs.set('theme', d.v); applyTheme(d.v); renderSheet(); break;
    case 'meet': proposeMeet(); break;
    case 'meet-here': {
      const [lat, lon] = S.geo.toLatLon(S.pin.x, S.pin.y);
      S.group.client.setMeet({ lat, lon, name: 'Meeting point' });
      toast('Meeting point shared with your group.'); closeSheet();
      break;
    }
    case 'clear-meet': S.group?.client.setMeet(null); S.map.setMeet(null); if (S.nav?.target.type === 'meet') endNav(); closeSheet(); break;
    case 'remove-pin': S.pin = null; S.map.setPin(null); if (S.nav?.target.type === 'pin') endNav(); closeSheet(); break;
    case 'sim-here': S.loc.simTeleport(S.pin.x, S.pin.y); S.pin = null; S.map.setPin(null); closeSheet(); toast('Test location set.'); break;
    case 'sim-go': if (S.nav?.route) { S.loc.simFollow(S.nav.route.pts, 9); toast('Simulating movement along the route…'); } break;
    case 'start-track': startSession('solo'); if (!S.me) toast(S.testMode ? 'Tracking started (test mode).' : 'Tracking started — finding GPS…'); renderSheet(); renderChrome(); break;
    case 'end-track': if (confirm('End tracking and save this session?')) { const s = await endSession('Tracking ended.'); S.historyLoaded = false; if (s) { await loadHistory(); openSheet('session', s.id); } else { toast('Nothing recorded yet, so nothing was saved.'); renderSheet(); } } break;
    case 'open-session': openSheet('session', d.id); break;
    case 'delete-session': if (confirm('Delete this session from this phone?')) { await sessions.del(d.id); S.historyLoaded = false; openSheet('history'); } break;
    case 'replay': { const s = S.history.find((x) => x.id === d.id); if (s) startReplay(s, d.run != null ? +d.run : null); break; }
    case 'show-route': { const r = d.id === 'loose' ? prefs.get(pkey('routes'), [])[+d.i] : S.history.find((x) => x.id === d.id)?.routes[+d.i]; if (r) { S.map.setRoute(r.pts); S.map.fit(r.pts); closeSheet(); toast(`Saved route to ${r.to}. Tap the map to dismiss.`); S.savedRouteShown = true; } break; }
    case 'play-toggle': { const P = S.player; if (P.t >= P.pts[P.pts.length - 1][0]) { P.t = P.pts[0][0]; P.i = 0; } P.playing = !P.playing; b.textContent = P.playing ? '❚❚' : '▶'; break; }
    case 'play-rate': { const P = S.player, r = [5, 20, 60, 180]; P.rate = r[(r.indexOf(P.rate) + 1) % r.length]; b.textContent = P.rate + '×'; break; }
    case 'play-close': stopReplay(); break;
    case 'uphill': S.uphill = d.v; prefs.set('uphill', S.uphill); if (S.nav) recalcNav(true); renderSheet(); break;
    case 'voice': setVoice(!S.voice); break;
    case 'pocket': setPocket(true); break;
    case 'max-diff': S.maxDiff = +d.v; prefs.set('maxDiff', S.maxDiff); if (S.nav) recalcNav(true); renderSheet(); break;
    case 'units': S.units = d.v; prefs.set('units', S.units); S.map.setUnits(S.units); renderSheet(); renderChrome(); break;
    case 'open-closures': S.closureQ = ''; openSheet('closures'); break;
    case 'clear-closures': setClosures(new Set()); renderSheet(); break;
    case 'download': b.disabled = true; await downloadOffline(); break;
  }
}

// History list refresh whenever the tab opens; saved-route overlay dismissal
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act="tab"][data-tab="history"]');
  if (b) { S.historyLoaded = false; loadHistory(); }
});
$('#map').addEventListener('pointerdown', () => { if (S.savedRouteShown && !S.nav) { S.map.setRoute(null); S.savedRouteShown = false; } });

/** Once a second: refresh "last updated" ages, stale flags, autosave. */
let ticks = 0;
function tick() {
  ticks++;
  if (S.group?.state) {
    syncFriends();
    refreshGroupSheet();
    if (S.sheet === 'place' && S.sheetArg?.type === 'friend') renderSheet();
    if (S.nav?.target.type === 'friend' && ticks % 5 === 0) recalcNav(true);
  }
  if (S.session && ticks % 20 === 0) autosave();
  if (S.crumbsOn && (S.tracker || S.crumbRec) && ticks % 4 === 0) showTracks();
  if (S.crumbRec && ticks % 30 === 0) saveTracks(true);
  if (ticks % 5 === 0) renderChrome();
  if (S.sheet === 'track' && S.tracker) renderTrackLive();
}

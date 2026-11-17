import '@fontsource-variable/montserrat';
import '@fontsource-variable/nunito-sans';
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
import { dragPanel } from './drag.js';
import { parseLook, lookString, CHARACTERS, SKIN, HAIR_COLORS, LENS, HAT_COLORS, PANTS, GEAR, HEADS, HAIRS } from './look.js';
import { avatarThumb, mountPreview } from './avatarview.js';

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
  favs: new Set(prefs.get('favorites', [])), favOnly: false, nearMe: null,
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
    prefs.set('lastResort', id);
    try { S.tracksSaved = (await kv.get(pkey('tracks'))) || []; } catch { S.tracksSaved = []; }
    renderChrome();
    S.wx = null; refreshWeather(false).catch(() => {});
    await recoverSession();
    if (S.crumbsOn) { startCrumbs(); loadHistory(); }
    if (!ticking) { ticking = true; setInterval(tick, 1000); }
    window.skiwithme = S; // handy for debugging from the Safari console
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
  setTimeout(maybeInstallGuide, 1800);
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
  el.classList.toggle('fade', !!from);
  el.classList.remove('focus');
  el.classList.remove('hidden');
  $('#resort-card').classList.add('hidden');
  $('#start-panel').classList.remove('hidden', 'mini');
  $('.start-top').classList.remove('hidden');
  $('#f-resort').value = '';
  renderResortList('');
  globe = new Globe($('#globe'), meta, new Int16Array(bin), PLACES);
  layoutGlobe(false);                           // measured with the list in place, so the globe lands in the right spot
  $('#start-panel').classList.toggle('hidden', !!from);
  $('.start-top').classList.toggle('hidden', !!from);
  if (from) globe.surface(from);
}

/** Size the resting globe to the space between the title and the mountain list. */
function layoutGlobe(animate = true) {
  if (!globe) return;
  const box = $('#start').getBoundingClientRect(), top = $('.start-top').getBoundingClientRect().bottom - box.top + 14;
  const p = $('#start-panel');
  let bottom = box.height;
  if (!p.classList.contains('hidden')) bottom = box.height - p.offsetHeight + (p.classList.contains('mini') ? miniShift() : 0);
  globe.setFrame(top, bottom - 14, animate);
}
/** How far the mountain list slides down when shrunk: only its grab bar and title stay on screen. */
function miniShift() {
  const p = $('#start-panel'), h = p.querySelector('h2');
  return Math.max(0, p.offsetHeight - (h.offsetTop + h.offsetHeight + 16));
}
function setStartMini(on) {
  const p = $('#start-panel');
  if (p.classList.contains('mini') === on) return;
  p.style.setProperty('--mini', miniShift() + 'px');
  p.classList.toggle('mini', on);
  if (on) $('#f-resort').blur();
  layoutGlobe(true);
}

function renderResortList(q) {
  q = (q ?? $('#f-resort').value).trim().toLowerCase();
  let list = PLACES.filter((r) => !q || r.name.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
  if (S.favOnly) list = list.filter((r) => S.favs.has(r.id));
  const near = S.nearMe;
  const dist = (r) => (near ? kmBetween(near.lat, near.lon, r.lat, r.lon) : 0);
  // nearest first with "Use my location"; otherwise favourites, then ready maps, in the usual order
  const last = prefs.get('lastResort', null);
  // the last mountain visited always comes first; then nearest first with "Use my location",
  // otherwise favourites, then ready maps, in the usual order
  list = list.map((r, i) => ({ r, i, d: dist(r) })).sort((a, b) => ((b.r.id === last) - (a.r.id === last)) || (near ? a.d - b.d : (S.favs.has(b.r.id) - S.favs.has(a.r.id)) || (b.r.available - a.r.available) || a.i - b.i));
  const away = (km) => (imp() ? `${Math.round(km / 1.609).toLocaleString()} mi` : `${Math.round(km).toLocaleString()} km`);
  $('#near-btn').classList.toggle('on', !!near);
  $('#fav-btn').classList.toggle('on', !!S.favOnly);
  $('#resort-list').innerHTML = list.length
    ? list.map(({ r, d }) => `<button class="mrow ${r.id === last ? 'sel' : ''}" data-act="pick-resort" data-id="${r.id}">${thumbSvg(r)}<span class="grow"><span class="nm"><b>${esc(r.name)}</b>${S.favs.has(r.id) ? '<span class="star">★</span>' : ''}${r.id === last ? '<span class="lastv">Last visited</span>' : ''}</span><small>${esc(r.region)}${near ? ` · ${away(d)}` : ''}</small>${r.available ? '' : '<em class="soon-tag">Map coming soon</em>'}</span><i>›</i></button>`).join('')
    : `<p class="start-empty">${S.favOnly && !S.favs.size ? 'No favorites yet. Open a mountain and tap its star to add it here.' : 'No mountain matches that search yet.'}</p>`;
  if (globe && !$('#start').classList.contains('focus')) requestAnimationFrame(() => layoutGlobe(true));
}

/** Great-circle distance in km. */
function kmBetween(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** A small painted mountain for each resort (the same picture every time for the same resort). */
function thumbSvg(r) {
  let h = 0;
  for (const c of r.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  const px = 38 + rnd() * 30, py = 10 + rnd() * 8, lx = 10 + rnd() * 20, ly = 26 + rnd() * 8, rx = 84 + rnd() * 16, ry = 22 + rnd() * 10;
  const k = 'g' + r.id.replace(/[^a-z0-9]/g, '');
  const trees = Array.from({ length: 9 }, (_, i) => { const x = i * 12.5 + rnd() * 6, t = 40 + rnd() * 6; return `M${x.toFixed(1)} 56 ${(x + 3.5).toFixed(1)} ${t.toFixed(1)} ${(x + 7).toFixed(1)} 56z`; }).join('');
  return `<svg class="thumb" viewBox="0 0 104 56" aria-hidden="true"><defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f8fd6"/><stop offset="1" stop-color="#a8d4f5"/></linearGradient><clipPath id="c${k}"><rect width="104" height="56" rx="9"/></clipPath></defs><g clip-path="url(#c${k})">
    <rect width="104" height="56" fill="url(#${k})"/>
    <path d="M-4 56 ${lx} ${ly} ${lx + 18} 40 ${px} ${py} ${rx} ${ry} 110 46V56z" fill="#c9daea"/>
    <path d="M${px} ${py} ${rx} ${ry} 110 46V56H${px + 6}z" fill="#8fadc9"/>
    <path d="M${px} ${py} ${px + 7} ${py + 9} ${px + 2} ${py + 8} ${px - 2} ${py + 13} ${px - 6} ${py + 8}z" fill="#fff"/>
    <path d="M${px - 2} ${py + 14} C${px - 14} ${py + 24} ${px + 10} ${py + 30} ${px - 8} 50" stroke="#fff" stroke-width="2.200" fill="none" opacity=".9"/>
    <path d="${trees}" fill="#1d4a3a"/><path d="M0 52h104v4H0z" fill="#eef5fb"/></g></svg>`;
}

const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"><path d="M12 3.200l2.700 5.600 6.100.8-4.500 4.200 1.100 6.100L12 17l-5.400 2.900 1.100-6.100L3.200 9.600l6.100-.8z"/></svg>';
function resortCard(r) {
  const fav = S.favs.has(r.id);
  return `<button class="back" data-act="resort-back">‹ All mountains</button>
    <div class="head">${thumbSvg(r)}<div class="grow"><h2>${esc(r.name)}</h2><p class="region">${esc(r.region)}</p></div><button class="fav ${fav ? 'on' : ''}" data-act="fav" data-id="${r.id}">${STAR}${fav ? 'Favorite' : 'Favorite'}</button></div>
    ${r.available ? `<div class="facts"><div><b>${fmtVert(r.top)}</b><span>Summit</span></div><div><b>${fmtVert(r.top - r.base)}</b><span>Vertical</span></div><div><b>${r.trails}</b><span>Trails</span></div><div><b>${r.lifts}</b><span>Lifts</span></div></div>
      <button class="ski-here" data-act="ski-here" data-id="${r.id}">Ski Here</button>`
    : '<p class="soon">The 3D map for this mountain has not been built yet.</p><button class="ski-here off" disabled>Map coming soon</button>'}
    <button class="btn outline join-btn" data-act="start-join">Join Group</button>`;
}

async function pickResort(id) {
  const r = placeById(id);
  if (!r || !globe) return;
  $('#f-resort').blur();
  $('#start-panel').classList.add('hidden');
  $('#start').classList.add('focus');
  const card = $('#resort-card');
  card.innerHTML = resortCard(r);
  card.classList.remove('hidden');
  card.dataset.id = r.id;
  // build the mountain while the card is on screen, then hold it still until it is needed
  if (r.available) initMap(r.id).then(() => { if (globe && S.map) S.map.setPaused(true); }).catch(() => {});
  await globe.flyTo(r);
}

function toggleFav(id) {
  if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
  prefs.set('favorites', [...S.favs]);
  const card = $('#resort-card');
  if (!card.classList.contains('hidden') && card.dataset.id === id) card.innerHTML = resortCard(placeById(id));
  renderResortList();
}

/** "Use my location": sort the list by distance from here (asks for location once). */
function nearMe() {
  if (S.nearMe) { S.nearMe = null; renderResortList(); return; }
  if (!navigator.geolocation) { toast('This browser cannot share its location.'); return; }
  $('#near-btn').classList.add('on');
  toast('Finding your location…', 2500);
  navigator.geolocation.getCurrentPosition(
    (p) => { S.nearMe = { lat: p.coords.latitude, lon: p.coords.longitude }; S.favOnly = false; renderResortList(); toast('Nearest mountains first.'); },
    (e) => { $('#near-btn').classList.remove('on'); toast(e.code === 1 ? 'Location is blocked. Allow it for this site in Settings to sort by distance.' : 'Could not find your location. Try again outside or near a window.', 5000); },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
  );
}

/** Joined from inside a mountain, but the group is on another one: offer to go there. */
function offerGroupMountain(code, r) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box"><h2>Your group is at ${esc(r.name)}</h2><p>Group ${esc(code)} is skiing at ${esc(r.name)}, not ${esc(S.place.name)}. Go there to see everyone on the right map?</p>
    <button class="btn" data-act="go-group-mtn" data-code="${esc(code)}" data-id="${r.id}">Go to ${esc(r.name)}</button><button class="btn alt" data-act="modal-cancel">Stay here</button></div>`;
  m.classList.remove('hidden');
}
async function goGroupMountain(code, id) {
  $('#modal').classList.add('hidden');
  await leaveResort(true);                       // saves the day so far, leaves the group here, back to the globe
  if (globe) await travelToGroup(code, placeById(id));
}

// ---------- join a group from the start screen: the code says which mountain, so go straight there
function startJoinAsk() {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box"><h2>Join a group</h2><p>Enter the code your friend shared. You'll go straight to the mountain the group is on.</p>
    <input class="field code" id="f-join" maxlength="6" placeholder="CODE" autocapitalize="characters" autocomplete="off" />
    <p class="err" id="join-err"></p>
    <button class="btn" data-act="start-join-go">Join Group</button><button class="btn alt" data-act="modal-cancel">Cancel</button></div>`;
  m.classList.remove('hidden');
  setTimeout(() => $('#f-join')?.focus(), 50);
}

async function startJoinGo(btn) {
  const code = ($('#f-join').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const err = (t) => { $('#join-err').textContent = t; btn.disabled = false; btn.textContent = 'Join Group'; };
  if (!/^[A-Z2-9]{6}$/.test(code)) return err('A group code is 6 letters and numbers.');
  btn.disabled = true; btn.textContent = 'Finding the group…';
  let info;
  try {
    const res = await fetch(`/api/groups/${code}`, { cache: 'no-store' });
    if (res.status === 404) return err('No group with that code. Check it with your friend.');
    if (!res.ok) throw new Error();
    info = await res.json();
  } catch { return err(navigator.onLine === false ? 'You are offline. Joining a group needs a connection.' : 'Could not reach the group. Try again in a moment.'); }
  let r = info.resort ? placeById(info.resort) : null;
  if (!r && info.near) r = PLACES.filter((p) => p.available).map((p) => ({ p, d: kmBetween(info.near.lat, info.near.lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d).find((x) => x.d < 60)?.p;
  if (!r) return err('This group has not picked a mountain yet. Ask your friend to open the group on their mountain.');
  if (!r.available) return err(`This group is at ${r.name}, whose map is not ready yet.`);
  $('#modal').classList.add('hidden');
  await travelToGroup(code, r);
}

/** From the globe: fly to the group's mountain and join it there. */
async function travelToGroup(code, r) {
  $('#start-panel').classList.add('hidden');
  $('#start').classList.add('focus');
  const card = $('#resort-card');
  card.innerHTML = `<p class="soon" style="text-align:center;margin:10px 0 14px">Joining group <b>${code}</b> at <b>${esc(r.name)}</b>…</p>`;
  card.classList.remove('hidden'); card.dataset.id = r.id;
  initMap(r.id).catch(() => {});
  await globe.flyTo(r, 1.4);
  await goSki(r.id, null, code);
}

const skiHere = (btn) => goSki(btn.dataset.id, btn);
/** Dive from the globe into a mountain; with `joinCode`, join that group once there. */
async function goSki(id, btn, joinCode = null) {
  if (btn) { btn.disabled = true; btn.textContent = 'Loading the mountain…'; }
  const r = placeById(id);
  try { await initMap(r.id); } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Ski Here'; } bootFailed(e); return; }
  const g = globe;
  globe = null;
  $('#resort-card').classList.add('hidden');
  $('#start').classList.add('fade');           // the mountain backdrop and title fade as the dive starts
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
  if (joinCode) { await joinGroup(joinCode); openSheet('group'); }
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
    $('#start').classList.remove('fade');
    $('#start-panel').classList.remove('hidden', 'mini');
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
// Pull panels down by their grab bar: the mountain list shrinks (the globe grows into the space),
// every other panel closes.
dragPanel($('#start-panel'), { zone: 70, offset: () => ($('#start-panel').classList.contains('mini') ? miniShift() : 0),
  onDown: () => setStartMini(true), onUp: () => setStartMini(false), onTap: () => { if ($('#start-panel').classList.contains('mini')) setStartMini(false); } });
dragPanel($('#sheet'), { zone: 64, onDown: () => closeSheet() });
window.addEventListener('resize', () => requestAnimationFrame(() => layoutGlobe(false)));
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('visibilitychange', () => { if (!S.map) return; if (document.visibilityState === 'visible') wakeLock(); else autosave(); });
window.addEventListener('pagehide', () => { autosave(); if (S.crumbRec) saveTracks(true); });
boot();

// ---------- first run: how to put the app on the home screen
let installEvt = null;   // Android Chrome offers its own install prompt, which we can trigger from a button
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (S.installOs) renderInstall(); });
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function maybeInstallGuide() {
  if (standalone() || prefs.get('installSeen', false)) return;
  if (!$('#modal').classList.contains('hidden')) { setTimeout(maybeInstallGuide, 4000); return; }
  prefs.set('installSeen', true);
  S.installOs = /android/i.test(navigator.userAgent) ? 'android' : 'apple';
  renderInstall();
  $('#modal').classList.remove('hidden');
}
const STEP = (n, html) => `<li><span class="n">${n}</span><span>${html}</span></li>`;
const SHARE_ICO = '<svg class="inl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6a1.500 1.500 0 0 0-1.500 1.500v8A1.500 1.500 0 0 0 6 21h12a1.500 1.500 0 0 0 1.500-1.500v-8A1.500 1.500 0 0 0 18 10h-2"/></svg>';
const DOTS_ICO = '<svg class="inl" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
function renderInstall() {
  const os = S.installOs;
  const steps = os === 'apple'
    ? STEP(1, `Open this page in <b>Safari</b>.`) + STEP(2, `Tap the <b>Share</b> button ${SHARE_ICO} at the bottom of the screen (on iPad, at the top).`) + STEP(3, 'Scroll down and tap <b>Add to Home Screen</b>.') + STEP(4, 'Tap <b>Add</b>. Open SkiWithMe from its new icon.')
    : STEP(1, `Open this page in <b>Chrome</b>.`) + STEP(2, `Tap the menu ${DOTS_ICO} at the top right.`) + STEP(3, 'Tap <b>Add to Home screen</b> (or <b>Install app</b>).') + STEP(4, 'Tap <b>Install</b>. Open SkiWithMe from its new icon.');
  $('#modal').innerHTML = `<div class="modal-box install"><button class="x" data-act="modal-cancel" aria-label="Close">✕</button>
    <img src="/icons/icon-192.png" alt="" width="64" height="64" /><h2>Add SkiWithMe to your home screen</h2>
    <p>It then opens full screen like an app, keeps working with no signal, and is one tap away on the lift.</p>
    <div class="seg"><button data-act="install-os" data-v="apple" class="${os === 'apple' ? 'on' : ''}">iPhone</button><button data-act="install-os" data-v="android" class="${os === 'android' ? 'on' : ''}">Android</button></div>
    <ol class="steps">${steps}</ol>
    ${os === 'android' && installEvt ? '<button class="btn" data-act="install-now">Install now</button>' : ''}
    <button class="btn alt" data-act="modal-cancel">Maybe later</button></div>`;
}

/** Shown when tracking starts (unless switched off): the screen has to stay on, pocket mode helps. */
function trackNotice() {
  if (prefs.get('trackNoteOff', false)) return;
  $('#modal').innerHTML = `<div class="modal-box"><button class="x" data-act="modal-cancel" aria-label="Close">✕</button>
    <h2>Keep SkiWithMe open</h2>
    <p>Tracking only runs while the app is open on screen. If the phone locks or you switch apps, tracking pauses until you come back.</p>
    <p>To save battery, turn on <b>Pocket mode</b>: the screen goes dark and ignores touches in your pocket, while tracking, GPS and spoken directions keep going. Press and hold to unlock.</p>
    <label class="check"><input type="checkbox" id="f-tracknote" /> Don't show this again</label>
    <button class="btn" data-act="track-pocket">Turn on pocket mode</button>
    <button class="btn alt" data-act="modal-cancel">Got it</button></div>`;
  $('#modal').classList.remove('hidden');
}

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
  S.me = { x, y, lat: fix.lat, lon: fix.lon, alt: fix.alt, heading, acc: fix.acc, t: fix.t, inBounds: S.geo.inBounds(x, y), speed };
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
    <div class="rowf"><div class="grow"><h4 style="margin:0 0 3px">Show where I've skied</h4><div class="sub">A dotted pink trail on the map along the runs you come down.</div></div><label class="switch"><input type="checkbox" id="f-crumbs" ${S.crumbsOn ? 'checked' : ''} /><i></i></label></div>
    <div class="seg" style="margin-top:12px"><button data-act="crumb-scope" data-v="session" class="${all ? '' : 'on'}">Today</button><button data-act="crumb-scope" data-v="all" class="${all ? 'on' : ''}">All saved${saved ? ` (${saved})` : ''}</button></div>
    <p class="note" style="font-size:14px">Tracks show downhill runs, excluding lifts.${S.crumbsOn ? (S.tracker ? ' Recording along with your stats.' : ` Recording your location only: no stats, and nothing is added to History.${S.me ? '' : ' Waiting for GPS.'}`) : ''}</p>
    <div class="rowf" style="gap:10px;font-weight:600;font-size:14.5px">${ICON.info}<span>Keep the app open and screen on while tracking.</span></div>
    ${(S.tracksSaved || []).length ? '<button class="btn alt" data-act="clear-tracks" style="margin:12px 0 0">Clear saved location-only tracks</button>' : ''}</div>`;
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
      if (first && st.resort && st.resort !== S.place.id && placeById(st.resort)?.available) offerGroupMountain(g.code, placeById(st.resort));
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
  }, S.place.id);
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
  if (t.type === 'pin') return S.pin ? { place: { x: S.pin.x, y: S.pin.y }, name: S.pin.name || 'Dropped pin', x: S.pin.x, y: S.pin.y } : null;
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
  else if (ev.type === 'me') S.map.wave('me');                  // tap yourself: your rider waves
  else {
    if (ev.type === 'friend') S.map.wave(ev.id);                // a friend's rider waves, and their card opens
    openSheet('place', ev);
  }
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
  if (S.testMode) { gp.innerHTML = ICON.sim + (S.me ? (S.lift ? 'On lift' : 'Simulation') : 'Simulation: tap map'); gp.className = 'pill sim'; }
  else if (S.me && Date.now() - S.me.t < 20000) { gp.textContent = S.lift ? '● On lift' : S.tracker ? ['● Tracking', '● Skiing', '● On lift'][S.tracker.state] : `GPS ±${Math.round(S.me.acc)} m`; gp.className = 'pill ok'; }
  else if (S.loc?.active) { gp.textContent = 'Finding GPS…'; gp.className = 'pill warn'; }
  else { gp.textContent = 'GPS off'; gp.className = 'pill hidden'; }
  const g = $('#group-pill');
  if (S.group) {
    const n = S.group.state?.members.length || 1;
    g.textContent = `${S.group.code} · ${n}${S.group.status === 'online' ? '' : ' · offline'}${S.sharing ? ' · sharing' : ''}`;
    g.className = 'pill' + (S.sharing && S.group.status === 'online' ? ' live' : '');
  } else g.className = 'pill hidden';
  // the mountain button shows when no status needs the space
  $('#resort-btn').classList.toggle('hidden', !gp.classList.contains('hidden') || !!S.group);
  $('#resort-btn-name').textContent = S.place?.name || '';
  $('#infobar').classList.toggle('hidden', !S.place);
  $('#searchbtn').classList.toggle('hidden', !S.place);
  // top left: the elevation where you stand (terrain height on the map, GPS height off it)
  const fresh = S.me && Date.now() - S.me.t < 20000;
  const ev = !fresh ? (S.loc?.active ? 'Finding…' : 'GPS OFF') : S.me.inBounds ? fmtVert(S.geo.elev(S.me.x, S.me.y)) : Number.isFinite(S.me.alt) ? fmtVert(S.me.alt) : '—';
  $('#elev-val').textContent = ev;
  $('#elev').classList.toggle('off', !fresh);
  $('#info-name').textContent = S.place?.name || '';
  const cur = S.wx?.data?.summit?.current;
  $('#info-wx').textContent = cur ? `${emo(describeCode(cur.weather_code)[1])} ${fmtTemp(cur.temperature_2m)}${tUnit()}` : '';
  document.body.classList.toggle('navigating', !!S.nav && !S.player);
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
  const fresh = S.sheet !== name || $('#sheet').classList.contains('hidden');
  S.sheet = name; S.sheetArg = arg;
  if (fresh) { S.sheetHtml = null; $('#sheet-title').textContent = ''; $('#sheet-body').scrollTop = 0; }
  const tab = { group: 'group', customize: 'group', track: 'track', history: 'history', session: 'history', more: 'more', routeprefs: 'more', advanced: 'more', closures: 'more' }[name];
  if (tab) S.tab = tab;
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
  const fn = { group: sheetGroup, track: sheetTrack, history: sheetHistory, session: sheetSession, more: sheetMore, legend: sheetLegend, place: sheetPlace, steps: sheetSteps, closures: sheetClosures, weather: sheetWeather, routeprefs: sheetRoutePrefs, advanced: sheetAdvanced, search: sheetSearch, customize: sheetCustomize }[S.sheet];
  const [title, html, small] = fn(S.sheetArg);
  const body = $('#sheet-body'), keep = body.scrollTop, same = $('#sheet-title').textContent === title;
  // size first, before any early return, so a panel never keeps the short size of the one before it
  $('#sheet').classList.toggle('small', !!small);
  $('#sheet-title').textContent = title;
  $('#sheet-title').classList.toggle('long', title.length > 19);
  // don't clobber a text field the person is typing in
  const a = document.activeElement;
  if (same && a && body.contains(a) && a.tagName === 'INPUT' && a.type !== 'checkbox') return;
  if (same && html === S.sheetHtml) return; // nothing changed: leave the DOM (and any tap in progress) alone
  S.sheetHtml = html;
  body.innerHTML = html;
  if (same) body.scrollTop = keep;
  const pv = $('#av-preview');
  if (pv) { try { mountPreview(pv, S.profile.avatar, S.profile.color); } catch { pv.innerHTML = avatarSvg(S.profile.avatar.split('~')[0], S.profile.color); } }
}

// ---------- small line icons used in the panels
const ICON = {
  route: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.500"/><circle cx="18" cy="5" r="2.500"/><path d="M8.500 19H15a3.500 3.500 0 0 0 0-7H9a3.500 3.500 0 0 1 0-7h6.500"/></svg>',
  map: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6.500 9 4l6 2.500L21 4v13.500L15 20l-6-2.500L3 20z"/><path d="M9 4v13.500M15 6.500V20"/></svg>',
  gear: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.200"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/></svg>',
  mtn: '<svg viewBox="0 0 32 20" width="40" height="25" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round" style="vertical-align:-6px;margin-right:12px"><path d="M1 19 11 6l5 6 4-4 11 11z"/><path d="M8 10l3 2 2-2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6a1.500 1.500 0 0 0-1.500 1.500v8A1.500 1.500 0 0 0 6 21h12a1.500 1.500 0 0 0 1.500-1.500v-8A1.500 1.500 0 0 0 18 10h-2"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linejoin="round"><path d="M12 3 2.500 8 12 13l9.500-5z"/><path d="M2.500 12 12 17l9.500-5"/><path d="M2.500 16 12 21l9.500-5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.500 4.500 5.500v6c0 4.500 3.200 8.200 7.500 10 4.300-1.800 7.500-5.500 7.500-10v-6z"/><path d="M12 8.500v7M8.500 12h7"/></svg>',
  mic: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2.500" width="6" height="12" rx="3"/><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21M8.500 21h7"/></svg>',
  ban: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200"><circle cx="12" cy="12" r="9"/><path d="M5.700 5.700l12.600 12.600"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.800" style="flex:none"><rect x="7" y="2.500" width="10" height="19" rx="2.500"/><path d="M11 18.500h2"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.800" style="flex:none"><circle cx="12" cy="12" r="9.500"/><path d="M12 11v6M12 7.500v.01" stroke-linecap="round" stroke-width="2.200"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px"><path d="M20 11a8 8 0 0 0-14.500-4.500L4 8M4 4v4h4M4 13a8 8 0 0 0 14.500 4.500L20 16M20 20v-4h-4"/></svg>',
  sim: '<svg viewBox="0 0 24 24"><path d="M3 11 21 3l-8 18-2-8z" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round"/></svg>',
};
const FIRST_DAY = `<svg viewBox="0 0 210 120" aria-hidden="true"><path d="M18 108 70 58 92 74 122 30 150 62 168 50 196 108z" fill="#8fb0cc"/><path d="M122 30 150 62 140 108H96z" fill="#5f84a8"/><path d="M70 58 92 74 80 108H18z" fill="#6f93b5"/><path d="M122 30 131 41 123 39 117 45 112 41z" fill="#f4f8fb"/><path d="M70 58 77 65 70 64 65 67z" fill="#eaf1f7"/><path d="M168 50 175 58 168 57 163 60z" fill="#eaf1f7"/><path d="M122 31V12" stroke="#d9e4ee" stroke-width="2"/><path d="M123 12h16l-4 5 4 5h-16z" fill="#3ee6c4"/><path d="M121 46c-14 8 10 16-4 26s-28 10-12 26" stroke="#fff" stroke-width="4.500" fill="none" stroke-linecap="round"/><path d="M30 108l6-16 6 16zM168 108l6-18 6 18zM186 108l5-13 5 13z" fill="#1f8a6a"/><path d="M8 108h194" stroke="#9fb7cc" stroke-width="2"/></svg>`;

/** A rider picture for lists: 3D when the phone can draw it, the flat drawing otherwise. */
function riderPic(avatar, color, size = 96) {
  try { return `<img class="rider" src="${avatarThumb(avatar, color, size)}" alt="" />`; } catch { return avatarSvg(String(avatar).split('~')[0], color); }
}

function profileFields() {
  const p = S.profile, L = parseLook(p.avatar), base = `${L.who}-${L.ride}`;
  return `<label class="lbl">Display name</label><input class="field" id="f-name" maxlength="20" placeholder="Optional" value="${esc(p.name)}" autocomplete="off" />
    <label class="lbl">Your rider</label>
    <div class="rider-stage"><div id="av-preview" class="av-preview" title="Tap to wave"></div>
      <button class="btn outline sm" data-act="open-sheet" data-s="customize">Customize</button></div>
    <label class="lbl">Characters</label><div class="avatars chars">${CHARACTERS.map(([k, n]) => `<button data-act="avatar" data-v="${k}" class="${base === k ? 'on' : ''}">${riderPic(base === k ? p.avatar : k, p.color)}<span>${n}</span></button>`).join('')}</div>
    <label class="lbl">Jacket color</label><div class="swatches">${PALETTE.map((c) => `<button data-act="color" data-v="${c}" class="${p.color === c ? 'on' : ''}" style="background:${c}" aria-label="color"></button>`).join('')}</div>`;
}

const sw = (k, list, cur, jacket) => `<div class="swatches">${list.map((c, i) => `<button data-act="look" data-k="${k}" data-v="${i}" class="${cur === i ? 'on' : ''} ${c === 'match' ? 'match' : ''}" style="background:${c === 'match' ? jacket : c}" aria-label="${k} ${i}">${c === 'match' ? '=' : ''}</button>`).join('')}</div>`;
const chips = (k, list, cur) => `<div class="seg wrap">${list.map(([, n], i) => `<button data-act="look" data-k="${k}" data-v="${i}" class="${cur === i ? 'on' : ''}">${n}</button>`).join('')}</div>`;
function sheetCustomize() {
  const p = S.profile, L = parseLook(p.avatar);
  return ['Customize rider', `<div class="rider-stage big"><div id="av-preview" class="av-preview" title="Tap to wave"></div><p class="sub">Tap your rider to wave. Your group sees this look on the map.</p></div>
    <div class="card"><h3>Ride</h3><div class="seg"><button data-act="look" data-k="ride" data-v="ski" class="${L.ride === 'ski' ? 'on' : ''}">Skier</button><button data-act="look" data-k="ride" data-v="board" class="${L.ride === 'board' ? 'on' : ''}">Snowboarder</button></div>
      <h3 style="margin-top:14px">Build</h3><div class="seg"><button data-act="look" data-k="who" data-v="boy" class="${L.who === 'boy' ? 'on' : ''}">Square jacket</button><button data-act="look" data-k="who" data-v="girl" class="${L.who === 'girl' ? 'on' : ''}">Fitted jacket</button></div>
      <h3 style="margin-top:14px">Skin tone</h3>${sw('skin', SKIN, L.skin)}</div>
    <div class="card"><h3>Headwear</h3>${chips('head', HEADS, L.head)}<h3 style="margin-top:14px">Hat or helmet color</h3>${sw('hat', HAT_COLORS, L.hat, p.color)}
      <h3 style="margin-top:14px">Goggle lens</h3>${sw('lens', LENS, L.lens)}</div>
    <div class="card"><h3>Hair</h3>${chips('hair', HAIRS, L.hair)}<h3 style="margin-top:14px">Hair color</h3>${sw('hairColor', HAIR_COLORS, L.hairColor)}</div>
    <div class="card"><h3>Jacket</h3><div class="swatches">${PALETTE.map((c) => `<button data-act="color" data-v="${c}" class="${p.color === c ? 'on' : ''}" style="background:${c}" aria-label="color"></button>`).join('')}</div>
      <h3 style="margin-top:14px">Pants</h3>${sw('pants', PANTS, L.pants, p.color)}
      <h3 style="margin-top:14px">${L.ride === 'board' ? 'Snowboard' : 'Skis'}</h3>${sw('gear', GEAR, L.gear)}</div>
    <div class="card"><h3>Extras</h3>
      <div class="rowf"><div class="grow"><h4 style="margin:0">Backpack</h4></div><label class="switch"><input type="checkbox" data-look="pack" ${L.pack ? 'checked' : ''} /><i></i></label></div>
      <div class="divide"></div>
      <div class="rowf"><div class="grow"><h4 style="margin:0">Neck warmer</h4><div class="sub">Same color as the hat.</div></div><label class="switch"><input type="checkbox" data-look="gaiter" ${L.gaiter ? 'checked' : ''} /><i></i></label></div></div>
    <button class="btn" data-act="tab" data-tab="group">Done</button>`];
}
/** Change one part of the look, save it and tell the group. */
function setLook(k, v) {
  const L = parseLook(S.profile.avatar);
  L[k] = k === 'ride' || k === 'who' ? v : +v;
  saveProfile({ avatar: lookString(L) });
}
function saveProfile(change) {
  Object.assign(S.profile, change);
  prefs.set('profile', S.profile);
  S.group?.client.updateProfile(S.profile);
  if (S.me && S.map?.me) S.map.setMe({ ...S.map.me, avatar: S.profile.avatar, color: S.profile.color });
  renderSheet();
}

function profileForm() {
  return `<div class="card"><h3>Your profile</h3>${profileFields()}</div>`;
}

function sheetGroup() {
  const g = S.group;
  if (!g) {
    return ['Group', `<div class="plain"><div class="sec-title">Profile <small>(optional)</small></div>${profileFields()}</div>
      <div class="card"><h4>Create a private group</h4><p class="sub">Up to 20 people. Share the code with friends; nobody can see a location until that person turns sharing on.</p><button class="btn" data-act="create-group">Create Group</button><p class="note" style="text-align:center;margin-bottom:0">Only share your location when you choose.</p></div>
      <div class="card"><h4>Join with a code</h4><input class="field code" id="f-code" maxlength="6" placeholder="CODE" autocapitalize="characters" autocomplete="off" /><button class="btn outline" data-act="join-group" style="margin-bottom:2px">Join Group</button></div>`];
  }
  const st = g.state, mine = st?.members.find((m) => m.id === S.profile.id);
  const owner = st?.owner === S.profile.id;
  const people = st ? [mine, ...friends()].filter(Boolean) : [];
  S.groupSig = groupSig();
  const rows = people.map((m) => {
    const me = m.id === S.profile.id, [status, cls] = memberStatus(m);
    return `<div class="member"><div class="dot" style="background:${m.color}22">${riderPic(m.avatar, m.color)}</div>
      <div class="grow" style="flex:1;min-width:0"><div class="nm">${esc(m.name)}${me ? ' <span class="tag">you</span>' : ''}${st.owner === m.id ? ' <span class="tag">creator</span>' : ''}</div><div class="st ${cls}" data-st="${m.id}">${status}</div></div>
      ${me ? '' : `<button class="btn sm go" data-act="nav-friend" data-id="${m.id}">Directions</button>`}</div>`;
  }).join('');
  const meet = st?.meet;
  return [`Group ${g.code}`, `
    <div class="card"><div class="bigcode">${g.code}</div><p class="sub" style="text-align:center;margin:4px 0 8px">${g.status === 'online' ? `${st?.members.length || 1} of ${st?.max || 20} people` : g.status === 'connecting' ? 'Connecting…' : 'Offline — reconnecting…'}</p><button class="btn alt" data-act="share-code">Share invite</button></div>
    <div class="card"><div class="rowf"><div class="grow"><b>Share my GPS location</b><div class="sub">${S.sharing ? 'On — your group sees you live. Turn off to pause.' : 'Off — your group cannot see you.'}</div></div><label class="switch"><input type="checkbox" id="f-share" ${S.sharing ? 'checked' : ''} /><i></i></label></div>
      <p class="note">Keep SkiWithMe open with the screen on while sharing: iPhone pauses web-app GPS when the screen locks. Your last location then shows as stale with its time.</p></div>
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

function trackChip() {
  if (!S.tracker) return '<div class="status-chip"><i></i>Not tracking</div>';
  return `<div class="status-chip on"><i></i>${S.me ? ['Tracking', 'Skiing', 'On lift'][S.tracker.stats.state] : 'Tracking · finding GPS'}</div>`;
}
const box = (label, val, unit = '') => `<div class="box"><span>${label}</span><b>${val}${unit ? `<small>${unit}</small>` : ''}</b></div>`;

function statGrid(st, live) {
  const d = distParts(st.skiDist), v = vertParts(st.vert);
  return `<div class="boxes b4">${box('Runs', st.runCount)}${box('Vertical', v[0], v[1])}${box('Distance', d[0], d[1])}${live ? box('Speed', fmtSpeed(st.speed), speedUnit()) : box('Top speed', fmtSpeed(st.topSpeed), speedUnit())}</div>
  <div class="boxes b3">${box('Avg ski speed', fmtSpeed(st.avgSpeed), speedUnit())}${live ? box('Top speed', fmtSpeed(st.topSpeed), speedUnit()) : box('Lift rides', st.liftCount)}${box('Ski time', fmtDur(st.skiTime).replace(' min', 'm'))}</div>
  <div class="card"><h3>Lifts (not counted in ski stats)</h3><div class="liftbox"><span><b>${st.liftCount}</b> rides</span><span><b>${fmtVert(st.liftVert)}</b> up</span><span><b>${fmtDist(st.liftDist)}</b></span><span><b>${fmtDur(st.liftTime)}</b></span></div></div>`;
}

function sheetTrack() {
  if (!S.tracker) {
    return ['Your ski day', `${trackChip()}
      <div class="boxes b4">${['Runs', 'Vertical', 'Distance', 'Speed'].map((l) => box(l, '—')).join('')}</div>
      <button class="btn" data-act="start-track">Start tracking</button>
      ${tracksCard()}
      ${S.gpsMsg ? `<p class="note">${esc(S.gpsMsg)}</p>` : ''}
      <p class="foot">Saved on this phone.</p>`];
  }
  const st = S.tracker.stats, s = S.session;
  return [s.kind === 'group' ? `Group ski day ${s.group || ''}` : 'Your ski day', `<div id="live-stats">${trackChip()}${statGrid(st, true)}</div>
    ${tracksCard()}
    <p class="note">Started ${fmtClock(s.start)} · ${S.tracker.points.length} GPS points${st.rejected ? ` · ${st.rejected} bad fixes filtered` : ''}</p>
    ${s.kind === 'group' && S.group ? '<p class="note">This session ends and saves when you leave or close the group.</p><button class="btn danger" data-act="leave-group">Leave group &amp; save</button>' : '<button class="btn danger" data-act="end-track">End &amp; save</button>'}`];
}
function renderTrackLive() {
  const el = $('#live-stats');
  if (el && S.tracker) el.innerHTML = trackChip() + statGrid(S.tracker.stats, true);
}

function sheetHistory() {
  const list = S.history || [];
  if (!S.historyLoaded) { loadHistory(); return ['Your ski days', '<p class="sub">Loading…</p>']; }
  const loose = prefs.get(pkey('routes'), []);
  const looseHtml = loose.length ? `<div class="card"><h3>Recent directions</h3>${loose.slice().reverse().map((r, k) => routeRow(r, 'loose', loose.length - 1 - k)).join('')}</div>` : '';
  const elsewhere = S.historyElsewhere ? `<p class="note">${S.historyElsewhere} saved day${S.historyElsewhere > 1 ? 's' : ''} at other resorts: open that resort to see ${S.historyElsewhere > 1 ? 'them' : 'it'}.</p>` : '';
  // The welcome screen, with its own Start tracking button, only shows before the first saved day at this mountain.
  if (!list.length) {
    return ['Your ski days', `<div class="empty">${FIRST_DAY}<h3>Your first ski day<br>starts here</h3><p>Finish a tracking session to save your runs and replay them.</p>
      ${S.tracker ? '<button class="btn" data-act="tab" data-tab="track">Tracking now: see live stats</button>' : '<button class="btn" data-act="hist-start">Start tracking</button>'}
      <p class="foot">Saved on this phone • Available offline</p></div>${looseHtml}${elsewhere}`];
  }
  return ['Your ski days', `${list.map((s) => `<button class="day-card" data-act="open-session" data-id="${s.id}"><div class="grow"><div class="t">${fmtDate(s.start)} <span class="tag ${s.kind}">${s.kind === 'group' ? 'Group ' + esc(s.group || '') : 'Solo'}</span></div><div class="s">${fmtClock(s.start)}–${fmtClock(s.end)} · ${s.stats.runCount} runs · ${fmtVert(s.stats.vert)} · top ${fmtSpeed(s.stats.topSpeed)} ${speedUnit()}${s.routes?.length ? ` · ${s.routes.length} route${s.routes.length > 1 ? 's' : ''}` : ''}</div></div><span class="chev">›</span></button>`).join('')}
    ${looseHtml}${elsewhere}<p class="foot">Saved on this phone • Available offline</p>`];
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
  const off = prefs.get(pkey('offline'), null), n = closedNames();
  const src = S.resort.sources;
  return ['More', `
    <div class="card"><button class="row-link" data-act="open-sheet" data-s="routeprefs">${ICON.route}<div class="grow">Route preferences<small>Hardest trail: ${esc(levelName(S.resort, S.maxDiff))} · Uphill: ${esc(TOLERANCE[S.uphill].label)}</small></div><span class="chev">›</span></button></div>
    <div class="card"><div class="rowf"><div class="grow"><h4>Spoken directions</h4><div class="sub">Turn-by-turn voice through the speaker or headphones, timed ahead of each turn for your speed.</div></div><label class="switch"><input type="checkbox" id="f-voice" ${S.voice ? 'checked' : ''} /><i></i></label></div>
      <div class="rowf sub" style="margin-top:10px;gap:12px">${ICON.phone}<span>Keep screen on for directions • Use Pocket mode while riding.</span></div></div>
    <div class="card"><div class="rowf"><div class="grow"><h4>Closures</h4><div class="sub">${n.length ? `${n.length} marked closed: ${esc(n.slice(0, 4).join(', '))}${n.length > 4 ? '…' : ''}` : 'Avoid trails and lifts you mark closed.'}</div></div><button class="btn sm" data-act="open-closures">Edit</button></div>${S.group ? '<p class="note">Closures are shared with your group.</p>' : ''}</div>
    <div class="card"><h4>Offline map</h4><div id="offline-box">${off ? `<p class="ok-text" style="font-size:17px;margin:4px 0 2px">✓ ${esc(S.place.name)} saved</p><p class="sub" style="margin:0 0 4px 22px">${(off.bytes / 1048576).toFixed(1)} MB • ${fmtDate(off.at)}</p>` : `<p class="sub">Download the whole ${esc(S.place.name)} map (3D terrain, trails, lifts, buildings and the app itself) so it opens with no signal.</p>`}</div><button class="btn ${off ? 'alt' : ''}" data-act="download">${off ? 'Download again' : 'Download resort map'}</button></div>
    <div class="card"><button class="row-link" data-act="open-sheet" data-s="advanced">${ICON.gear}<div class="grow">Appearance &amp; advanced<small>Dark or light, units, frame rate, simulated location</small></div><span class="chev">›</span></button></div>
    <button class="btn outline" data-act="change-resort">${ICON.mtn}Change mountain</button>
    <div class="card"><h4>Install SkiWithMe</h4><div class="icon-row">${ICON.share}<div class="txt">In Safari tap Share → Add to Home Screen. Open SkiWithMe from the icon for full screen and offline use.</div></div></div>
    <div class="card"><h4>Map credits</h4><div class="icon-row">${ICON.layers}<div class="txt">Terrain: ${esc(src.terrain)}.<br>Trails, lifts, buildings, places: ${esc(src.map)}.${src.zones ? `<br>Zones: ${esc(src.zones)}.` : ''}</div></div></div>
    <div class="card"><div class="icon-row">${ICON.shield}<div class="txt">Not an official ${esc(S.place.name)} product. Closures are user-marked, not a live resort feed. Follow mountain signs, ropes and ski patrol.</div></div></div>`];
}

const UPHILL_TEXT = { low: 'Only an easy skate or a step or two up; otherwise directions take the downhill way round.', normal: 'Allows short climbs when they save time.', high: 'Accepts a real sidestep or short boot-pack to avoid a lap.' };
function sheetRoutePrefs() {
  return ['Route preferences', `
    <div class="card"><h3>Hardest trail</h3><div class="seg">${DIFF_NAMES.map((x, i) => `<button data-act="max-diff" data-v="${i}" class="${S.maxDiff === i ? 'on' : ''}"><span class="${runCss(S.resort, { d: i })}">${runSym(S.resort, { d: i })}</span> ${levelName(S.resort, i)}</button>`).join('')}</div>
      <p class="note" style="font-size:14.5px">Prefer routes within this level. Harder terrain may be unavoidable; warnings appear.</p></div>
    <div class="card"><h3>Uphill tolerance</h3><div class="seg">${Object.entries(TOLERANCE).filter(([k]) => k !== 'none').map(([k, t]) => `<button data-act="uphill" data-v="${k}" class="${S.uphill === k ? 'on' : ''}">${t.label}</button>`).join('')}</div>
      <p class="note" style="font-size:14.5px">${UPHILL_TEXT[S.uphill]}</p></div>
    <div class="card"><div class="rowf" style="gap:14px">${ICON.mic}<div class="grow"><h4 style="margin:0">Spoken directions</h4></div><label class="switch"><input type="checkbox" id="f-voice" ${S.voice ? 'checked' : ''} /><i></i></label></div></div>
    <div class="card"><div class="rowf" style="gap:14px">${ICON.ban}<div class="grow"><h4 style="margin:0">Closures</h4><div class="sub">Manage marked closures.</div></div><button class="btn sm" data-act="open-closures">Edit</button></div></div>
    <button class="btn alt" data-act="tab" data-tab="more">Back to More</button>`];
}

function sheetAdvanced() {
  const L = (k, text) => `<button class="learn ${S.learn?.[k] ? 'open' : ''}" data-act="learn" data-k="${k}">Learn more<i>›</i></button>${S.learn?.[k] ? `<p class="learn-text">${text}</p>` : ''}`;
  const light = document.documentElement.dataset.theme === 'light';
  return ['Appearance & advanced', `
    <div class="card"><h3>Appearance</h3><div class="seg"><button data-act="theme" data-v="dark" class="${light ? '' : 'on'}">Dark</button><button data-act="theme" data-v="light" class="${light ? 'on' : ''}">Light</button></div></div>
    <div class="card"><h3>Units</h3><div class="seg"><button data-act="units" data-v="imperial" class="${imp() ? 'on' : ''}">mph · ft</button><button data-act="units" data-v="metric" class="${imp() ? '' : 'on'}">km/h · m</button></div></div>
    <div class="card"><h3>Advanced</h3>
      <div class="rowf"><div class="grow"><h4>Show frame rate</h4><div class="sub">Show frames per second while you move the map.</div></div><label class="switch"><input type="checkbox" id="f-fps" ${S.showFps ? 'checked' : ''} /><i></i></label></div>
      ${L('fps', 'A small readout on the map: frames per second while you move it, and the automatic quality step (Q0 best to Q3 lightest). The app lowers quality by itself when the phone can’t keep up. “Slowed by phone” means the phone is holding the app back (usually heat), which lower quality cannot fix.')}
      <div class="divide"></div>
      <div class="rowf"><div class="grow"><h4>120 fps motion</h4><div class="sub">Use up to 120 fps (if supported) for smoother motion.</div></div><label class="switch"><input type="checkbox" id="f-fps120" ${S.fps120 ? 'checked' : ''} /><i></i></label></div>
      ${L('fps120', 'Off: the map moves at up to 60 frames a second, which keeps the phone cooler and the battery going. On: up to 120 on screens that support it.')}</div>
    <div class="card"><div class="rowf"><div class="grow"><h4>Simulated location</h4>${S.testMode ? `<span class="pill sim" style="margin:2px 0 6px">${ICON.sim}Simulated location</span>` : ''}<div class="sub">${S.testMode ? 'Tap the map to place your simulated position.' : 'Try sharing and rerouting away from the mountain.'}</div></div><label class="switch"><input type="checkbox" id="f-test" ${S.testMode ? 'checked' : ''} /><i></i></label></div>
      ${L('sim', 'Tap the map, then “Put me here”. Sharing, directions and tracking then use that spot instead of GPS. Turn this off to go back to real GPS.')}</div>
    <button class="btn alt" data-act="tab" data-tab="more">Back to More</button>`];
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
  const sc = scheme(S.resort);
  const line = (c, label, dash, sym) => `<div class="legend-row"><div class="sw"><div class="ln" style="background:${dash ? `repeating-linear-gradient(90deg, ${c} 0 10px, #10202f 10px 16px)` : c}"></div></div>${sym != null ? `<span class="sym">${sym}</span>` : ''}<span>${label}</span></div>`;
  const ic = (c, ch, label) => `<div class="legend-row"><div class="sw"><div class="ic" style="background:${c}">${ch}</div></div><span>${label}</span></div>`;
  return ['Map legend', `<div class="card"><h3>Trail difficulty</h3>
      ${classesUsed(S.resort).map((c) => line(sc.colors[c], sc.legend[c], false, `<b class="${sc.css[c]}">${sc.syms[c]}</b>`)).join('')}
      ${line(sc.colors[1], 'Glades (dashed trail)', true)}${line(COLORS.closed, 'Marked closed (grey dashed)', true)}</div>
    ${zonesCard()}
    <div class="card"><h3>Lifts &amp; routes</h3>${line(COLORS.lift, `Lift (one ${sc.liftWord} line per lift, just above and between its two cables)`)}${line(COLORS.route, 'Your directions')}${line(COLORS.track, 'Replay (grey = lift ride)')}<div class="legend-row"><div class="sw"><span class="crumb"></span></div><span>My tracks</span></div></div>
    <div class="card"><h3>Places &amp; people</h3>${ic('#14365f', 'L', 'Lodge / hotel')}${ic(COLORS.lift, '↑', 'Lift base')}${ic('#c7641a', 'F', 'Food &amp; drink')}${ic('#59636e', '•', 'Services')}${ic('#5d6875', '▲', 'Summit')}
      ${ic(PALETTE[5], 'A', 'Friend (grey = location out of date)')}${ic('#d92d20', '', 'Dropped pin')}${ic('#c96f00', '⚑', 'Group meeting point')}</div>
    <p class="foot">Follow mountain signs and ropes.</p>`];
}

// ---------- search for places, runs and lifts on this mountain
const POI_KIND = { lodge: 'Lodge', lift: 'Lift base', lifttop: 'Lift top', food: 'Food & drink', peak: 'Summit', service: 'Service', parking: 'Parking', shelter: 'Shelter' };
function searchIndex() {
  if (S.searchIdx?.id === S.place.id) return S.searchIdx.items;
  const items = [];
  for (const p of S.resort.pois) if (p.name) items.push({ k: 'poi', v: p.id, name: p.name, sub: POI_KIND[p.kind] || 'Place', badge: '<span class="sbadge poi">⌂</span>' });
  const runs = new Map();
  for (const t of S.resort.trails) if (t.name) { const e = runs.get(t.name) || { ids: [], d: t.d, c: t.c, u: t.u, bb: t.bb }; e.ids.push(t.id); runs.set(t.name, e); }
  for (const [name, e] of runs) items.push({ k: 'trail', v: e.ids.join(','), name, sub: 'Run · ' + levelName(S.resort, e.d), badge: `<span class="sbadge ${runCss(S.resort, e)}">${runSym(S.resort, e)}</span>` });
  for (const l of S.resort.lifts) if (l.name) items.push({ k: 'lift', v: l.id, name: l.name, sub: 'Lift', badge: `<span class="sbadge" style="color:${COLORS.lift}">↑</span>` });
  items.sort((a, b) => a.name.localeCompare(b.name));
  S.searchIdx = { id: S.place.id, items };
  return items;
}
function searchResults() {
  const q = (S.searchQ || '').trim().toLowerCase();
  const all = searchIndex();
  const hit = q ? all.filter((i) => i.name.toLowerCase().includes(q)).sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q))) : all;
  if (!hit.length) return '<p class="sub" style="margin:14px 4px">Nothing on this mountain matches that name.</p>';
  return hit.slice(0, 80).map((i) => `<button class="srow" data-act="search-go" data-k="${i.k}" data-v="${i.v}">${i.badge}<span class="grow"><b>${esc(i.name)}</b><small>${esc(i.sub)}</small></span><i>›</i></button>`).join('');
}
function sheetSearch() {
  return [`Search ${S.place.name}`, `<label class="search"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"><circle cx="10.500" cy="10.500" r="6.500"/><path d="M15.500 15.500 21 21"/></svg><input id="f-search" type="search" placeholder="Lodges, runs, lifts, food…" value="${esc(S.searchQ || '')}" autocomplete="off" autocorrect="off" spellcheck="false" /></label>
    <div id="search-list">${searchResults()}</div>`];
}
/** Show a search result: frame it on the map and offer directions to it. */
function searchGo(k, v) {
  if (k === 'poi') {
    const p = S.resort.pois[+v];
    S.map.focus(p.x, p.y, 650);
    openSheet('place', { type: 'poi', id: p.id });
    return;
  }
  let pts = [], x, y, name;
  if (k === 'trail') {
    const ts = v.split(',').map((i) => S.resort.trails[+i]);
    for (const t of ts) pts.push(...t.pts);
    // directions go to the top of the run, where you would start skiing it
    const top = ts.reduce((a, b) => (b.top > a.top ? b : a));
    [x, y] = [top.pts[0], top.pts[1]]; name = top.name;
  } else {
    const l = S.resort.lifts[+v];
    pts = l.pts; [x, y] = [l.pts[0], l.pts[1]]; name = l.name;   // a lift starts at its bottom station
  }
  S.map.fit(pts);
  S.pin = { x, y, name, kind: k };
  S.map.setPin(S.pin);
  openSheet('place', { type: 'pin' });
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
    return [f.name, `<div class="rowf"><div class="dot" style="width:48px;height:48px;border-radius:50%;background:${f.color}22;display:grid;place-items:center">${riderPic(f.avatar, f.color)}</div><div class="grow"><div class="sub ${f.stale ? 'warn-ink' : ''}">${!f.sharing ? 'Sharing paused' : f.stale ? 'Location is stale' : 'Live'} · last updated ${fmtAge(f.age)}</div><div class="sub">${describeSpot(f.x, f.y)}</div></div></div><button class="btn go" data-act="nav-friend" data-id="${f.id}">Directions to ${esc(f.name)}</button>`, true];
  }
  if (ev.type === 'meet') {
    const m = S.map.meet;
    return [m?.name || 'Meeting point', `<p class="sub">Shared meeting point${S.group?.state?.meet ? ` set by ${esc(S.group.state.meet.by)}` : ''}</p><button class="btn go" data-act="nav-meet">Directions</button>${S.group ? '<button class="btn alt" data-act="clear-meet">Clear meeting point</button>' : ''}`, true];
  }
  const p = S.pin;
  const where = p.kind === 'trail' ? `Top of the run · Elevation ${fmtVert(S.geo.elev(p.x, p.y))}` : p.kind === 'lift' ? `Bottom of the lift · Elevation ${fmtVert(S.geo.elev(p.x, p.y))}` : describeSpot(p.x, p.y);
  return [p.name || 'Dropped pin', `<p class="sub">${where}</p><button class="btn go" data-act="nav-pin">Directions</button>
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
  renderChrome();
}

const EMO = { '☀': '☀️', '⛅': '⛅', '☁': '☁️', '☂': '☔', '❄': '❄️', '⚡': '⚡' };
const emo = (g) => EMO[g] || g;
const tUnit = () => (imp() ? 'F' : 'C');
const unitSplit = (txt) => { const [a, u] = txt.split(' '); return `${a}${u ? `<small>${u}</small>` : ''}`; };

function sheetWeather() {
  const T = 'Mountain weather';
  const wx = S.wx || {};
  if (wx.error) return [T, `<div class="card"><p class="sub">${esc(wx.error)}</p><button class="btn alt" data-act="wx-refresh">Try again</button></div>`];
  if (!wx.data) return [T, '<div class="card"><p class="sub">Loading the forecast…</p></div>'];
  const { summit, base, at, stale } = wx.data;
  const atBase = S.wxSite === 'base', week = S.wxView === 'week';
  const s = atBase ? base : summit, other = atBase ? summit : base, where = atBase ? 'base' : 'summit';
  const c = s.current, d = s.daily, h = s.hourly, hi = hourIndex(s);
  const [label, glyph] = describeCode(c.weather_code);
  const day = (i) => ({ snow: d.snowfall_sum[i] || 0, rain: d.rain_sum[i] || 0, gust: d.wind_gusts_10m_max[i] || 0, feelsMin: d.apparent_temperature_min[i], tMax: d.temperature_2m_max[i], tMin: d.temperature_2m_min[i] });
  const vis = h.visibility?.[hi], frz = h.freezing_level_height?.[hi];
  const next24 = h.snowfall.slice(hi, hi + 24).reduce((n, v) => n + (v || 0), 0);
  const cbox = (v, l) => `<div class="box cap"><b>${v}</b><span>${l}</span></div>`;
  const segs = `<div class="seg solid"><button data-act="wx-site" data-v="summit" class="${atBase ? '' : 'on'}">Summit</button><button data-act="wx-site" data-v="base" class="${atBase ? 'on' : ''}">Base</button></div>
    <div class="seg solid" style="margin-top:8px"><button data-act="wx-view" data-v="today" class="${week ? '' : 'on'}">Today</button><button data-act="wx-view" data-v="week" class="${week ? 'on' : ''}">7 days</button></div>`;
  const foot = `<div class="wx-foot"><div class="grow"><b>${stale ? 'Saved ' : 'Updated '}${fmtClock(at)}${wx.loading ? ' · refreshing…' : ''}</b>Summit ${fmtVert(S.place.top)} / Base ${fmtVert(S.place.base)}<br><a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather by Open-Meteo</a></div><button class="btn" data-act="wx-refresh">${ICON.refresh} Refresh</button></div>`;
  if (week) {
    const rows = d.time.map((t, i) => {
      const n = skiNotes(day(i), null, fmtSnow)[0];
      return `<div class="wx-day"><b class="dn">${dayLabel(t, i)}</b><i>${emo(describeCode(d.weather_code[i])[1])}</i><span class="tt">${fmtTemp(d.temperature_2m_min[i])} / ${fmtTemp(d.temperature_2m_max[i])}</span><span class="sn ${d.snowfall_sum[i] >= 5 ? 'pow' : ''}">❄ ${fmtSnow(d.snowfall_sum[i] || 0)}</span><span class="wd">${fmtWind(d.wind_gusts_10m_max[i])} ${speedUnit()}</span><small class="${n[0]}">${esc(describeCode(d.weather_code[i])[0])}${d.rain_sum[i] >= 1 ? ' · rain' : ''} · ${d.precipitation_probability_max[i] ?? 0}% precip · feels ${fmtTemp(d.apparent_temperature_min[i])} at coldest${n[0] !== 'good' || d.snowfall_sum[i] >= 5 ? ' · ' + esc(n[1].split(':')[0].split(' — ')[0]) : ''}</small></div>`;
    }).join('');
    return [T, `${segs}<div class="card"><h3>7-day ski forecast (${where})</h3><div class="wx-head"><span>Day</span><span>Low / High</span><span>Snow</span><span>Gust</span></div>${rows}</div>${foot}`];
  }
  const hours = h.time.slice(hi, hi + 12).map((t, k) => {
    const i = hi + k;
    return `<div class="wx-hour"><span>${k === 0 ? 'Now' : hourLabel(t)}</span><i>${emo(describeCode(h.weather_code[i])[1])}</i><b>${fmtTemp(h.temperature_2m[i])}</b><small>${h.snowfall[i] > 0.05 ? '❄ ' + fmtSnow(h.snowfall[i]) : (h.precipitation_probability[i] ?? 0) + '%'}</small><small>${fmtWind(h.wind_gusts_10m[i])} ${speedUnit()}</small></div>`;
  }).join('');
  const notes = skiNotes(day(0), { vis }, fmtSnow).map(([k, t]) => `<div class="wx-note ${k}">${esc(t)}</div>`).join('');
  const open = S.wxMore !== false;
  return [T, `${segs}
    <div class="wx-hero"><div class="g">${emo(glyph)}</div><div><div class="t">${fmtTemp(c.temperature_2m)}${tUnit()}</div><div class="l">${label} · Feels like ${fmtTemp(c.apparent_temperature)}${tUnit()}</div><div class="l">${atBase ? 'Summit' : 'Base'} ${fmtTemp(other.current.temperature_2m)}${tUnit()} · today ${fmtTemp(d.temperature_2m_min[0])} to ${fmtTemp(d.temperature_2m_max[0])}</div></div></div>
    ${notes}
    <div class="boxes b3">
      ${cbox(unitSplit(fmtSnow(d.snowfall_sum[0] || 0)), 'New snow')}${cbox(unitSplit(fmtSnow(next24)), 'Next 24 h')}${cbox(c.snow_depth != null ? unitSplit(fmtSnow(c.snow_depth * 100)) : '–', 'Snow depth')}
      ${cbox(`${fmtWind(c.wind_speed_10m)}<small>${speedUnit()}</small>`, `Wind ${compass(c.wind_direction_10m)}`)}${cbox(`${fmtWind(c.wind_gusts_10m)}<small>${speedUnit()}</small>`, 'Gusts')}${cbox(`${fmtWind(d.wind_gusts_10m_max[0])}<small>${speedUnit()}</small>`, 'Peak gust today')}
    </div>
    <div class="wx-more ${open ? 'open' : ''}"><button data-act="wx-more">More conditions<i>⌄</i></button>${open ? `<div class="cols">
      <div><b>${vis != null ? (imp() ? `${(vis / 1609.34).toFixed(vis < 1609 ? 1 : 0)}<small>mi</small>` : `${(vis / 1000).toFixed(vis < 1000 ? 1 : 0)}<small>km</small>`) : '–'}</b><span>Visibility</span></div>
      <div><b>${frz != null ? unitSplit(fmtVert(frz)) : '–'}</b><span>Freezing level</span></div>
      <div><b>${d.precipitation_probability_max[0] ?? 0}<small>%</small></b><span>Precip chance</span></div></div>` : ''}</div>
    <div class="card"><h3>Next 12 hours at the ${where} · temp, snow or precip chance, gusts</h3><div class="wx-hours">${hours}</div></div>
    <p class="wx-sun">Sunrise ${hourLabelFull(d.sunrise[0])} · Sunset ${hourLabelFull(d.sunset[0])} · Cloud cover ${c.cloud_cover}%</p>
    ${foot}`];
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
  if (t.id === 'f-search') { if (e.type === 'input') { S.searchQ = t.value; $('#search-list').innerHTML = searchResults(); } return; } // not on blur: that would redraw under the tap
  if (t.id === 'f-resort') { if (e.type === 'input') renderResortList(t.value); return; } // not on blur: that would redraw under the tap
  if (t.id === 'f-name') { S.profile.name = t.value.trim().slice(0, 20); prefs.set('profile', S.profile); if (e.type === 'change' && S.group) S.group.client.updateProfile(S.profile); }
  else if (t.id === 'f-share' && e.type === 'change') setSharing(t.checked);
  else if (t.id === 'f-crumbs' && e.type === 'change') {
    S.crumbsOn = t.checked; prefs.set('crumbsOn', S.crumbsOn);
    if (S.crumbsOn) { startCrumbs(); if (!S.historyLoaded) loadHistory(); if (!S.me && !S.tracker) toast(S.testMode ? 'Test mode: tap the map, then “Put me here”.' : 'Finding your location…'); }
    else stopCrumbs();
    showTracks(); renderSheet(); renderChrome();
  }
  else if (t.dataset.look && e.type === 'change') setLook(t.dataset.look, t.checked ? 1 : 0);
  else if (t.id === 'f-tracknote' && e.type === 'change') prefs.set('trackNoteOff', t.checked);
  else if (t.id === 'f-voice' && e.type === 'change') { setVoice(t.checked); renderSheet(); }
  else if (t.id === 'f-fps' && e.type === 'change') { S.showFps = t.checked; prefs.set('showFps', S.showFps); fpsReadout(); }
  else if (t.id === 'f-fps120' && e.type === 'change') { S.fps120 = t.checked; prefs.set('fps120', S.fps120); if (S.map) S.map.maxFps = S.fps120 ? 120 : 60; }
  else if (t.id === 'f-test' && e.type === 'change') {
    S.testMode = t.checked; prefs.set('testMode', S.testMode);
    S.loc.setSim(S.testMode);
    if (!S.testMode) { S.me = null; S.map.setMe(null); if (S.tracker || S.sharing) S.loc.start(); }
    toast(S.testMode ? 'Simulated location on: tap the map, then “Put me here”.' : 'Simulated location off: using real GPS.');
    renderChrome(); renderSheet();
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
    case 'wx-site': S.wxSite = d.v; renderSheet(); break;
    case 'wx-view': S.wxView = d.v; $('#sheet-body').scrollTop = 0; renderSheet(); break;
    case 'wx-more': S.wxMore = S.wxMore === false; renderSheet(); break;
    case 'open-sheet': openSheet(d.s); $('#sheet-body').scrollTop = 0; break;
    case 'learn': S.learn = { ...S.learn, [d.k]: !S.learn?.[d.k] }; renderSheet(); break;
    case 'hist-start': startSession('solo'); if (!S.me) toast(S.testMode ? 'Tracking started (simulated location).' : 'Tracking started: finding GPS…'); openSheet('track'); trackNotice(); break;
    case 'wx-refresh': refreshWeather(true); break;
    case 'pick-resort': pickResort(d.id); break;
    case 'ski-here': skiHere(b); break;
    case 'resort-back': $('#resort-card').classList.add('hidden'); $('#start-panel').classList.remove('hidden'); $('#start').classList.remove('focus'); globe?.release(); requestAnimationFrame(() => layoutGlobe(true)); break;
    case 'fav': toggleFav(d.id); break;
    case 'favs': S.favOnly = !S.favOnly; if (S.favOnly) S.nearMe = null; renderResortList(); break;
    case 'near-me': nearMe(); break;
    case 'start-join': startJoinAsk(); break;
    case 'start-join-go': startJoinGo(b); break;
    case 'go-group-mtn': goGroupMountain(d.code, d.id); break;
    case 'change-resort': askLeaveResort(); break;
    case 'exit-save': leaveResort(true); break;
    case 'exit-nosave': leaveResort(false); break;
    case 'modal-cancel': $('#modal').classList.add('hidden'); break;
    case 'install-os': S.installOs = d.v; renderInstall(); break;
    case 'install-now': installEvt?.prompt(); installEvt = null; $('#modal').classList.add('hidden'); break;
    case 'track-pocket': $('#modal').classList.add('hidden'); closeSheet(); setPocket(true); break;
    case 'locate':
      if (S.testMode) { if (S.me) S.map.focus(S.me.x, S.me.y, 700); else toast('Test mode: tap the map, then “Put me here”.'); break; }
      ensureLocation();
      if (S.me && S.me.inBounds) S.map.focus(S.me.x, S.me.y, 700);
      else if (S.me) toast(`You're outside the ${S.place.name} map area — your position will appear when you're at the resort.`, 4500);
      else { S.followMe = true; toast('Finding your location…'); }
      renderChrome();
      break;
    case 'edit-profile': S.editProfile = true; renderSheet(); break;
    case 'avatar': saveProfile({ avatar: d.v }); break;                 // a character: starts from its own look
    case 'color': saveProfile({ color: d.v }); break;
    case 'look': setLook(d.k, d.v); break;
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
      const text = `Join my SkiWithMe group at ${S.place.name}. Open ${location.origin} and enter code ${S.group.code}`;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else { try { await navigator.clipboard.writeText(text); toast('Invite copied.'); } catch { toast(`Code: ${S.group.code}`); } }
      break;
    }
    case 'leave-group': if (confirm('Leave this group? Your runs, routes and stats will be saved on this phone.')) leaveGroup(false); break;
    case 'close-group': if (confirm('Close the group for everyone? All shared locations are deleted and each person keeps their own runs.')) leaveGroup(true); break;
    case 'nav-friend': { const f = friends().find((m) => m.id === d.id); if (f) startNav({ type: 'friend', id: f.id, name: f.name }); break; }
    case 'nav-poi': startNav({ type: 'poi', id: +d.id, name: S.resort.pois[+d.id].name }); break;
    case 'nav-pin': startNav({ type: 'pin', name: S.pin?.name || 'Dropped pin' }); break;
    case 'search': if (S.sheet === 'search') closeSheet(); else { openSheet('search'); setTimeout(() => $('#f-search')?.focus(), 60); } break;
    case 'search-go': $('#f-search')?.blur(); searchGo(d.k, d.v); break;
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
    case 'start-track': startSession('solo'); if (!S.me) toast(S.testMode ? 'Tracking started (test mode).' : 'Tracking started — finding GPS…'); renderSheet(); renderChrome(); trackNotice(); break;
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

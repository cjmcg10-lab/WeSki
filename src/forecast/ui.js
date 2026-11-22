import { t } from '../i18n.js';
import { prefs } from '../store.js';
import { roundHalfUp } from './score/index.js';
import { SNOW_HISTORY_MIN_HOURS } from './score/explain.js';
import { loadCatalog, searchResorts, sameName, resortFor, canForecast, hasHeights } from './resorts.js';
import { VIEW_KEY, loadList, saveList, syncList, add, insertAt, sortRows, topPickId } from './watchlist.js';
import { loadHistory } from '../weather.js';
import { createPinScreen } from './pinscreen.js';
import { MATCH_KM } from './pin.js';
import { loadForecast, withHistory, sourceAgeHours, columnDates, bandOf, timeBlocks, windowSummary, blockOfHour, ageHoursOf, isStale, rescored, localToday, statusAgeHours } from './data.js';
import { esc, codeText, CODE_TEXT, ageText, fmtHour, fmtHourRange, fmtWeekday, fmtDayNumber, fmtLongDate, fmtShortDate, locale } from './text.js';

const SHEETS = ['forecast', 'fcday', 'fcadd', 'fcedit', 'fcpin'];
const FLASH_MS = 4000;
const CONF_LEVEL = { High: 3, Medium: 2, Low: 1 };

let host = null;
const fc = {
  list: [], data: new Map(), started: false, view: { sortDate: null }, updating: false, footer: '',
  scrollLeft: 0, scrollTop: 0, bodyScroll: 0, focusSel: null,
  catalog: null, catalogError: false, q: '', added: [], saveFailed: null, editRows: [], listSaveFailed: false,
  flash: null, tod: null, pinDraft: null, pinView: null,
};

export const isForecastSheet = (name) => SHEETS.includes(name);

export function init(h) {
  host = h;
  fc.list = loadList(prefs);
  fc.view = { sortDate: null, ...prefs.get(VIEW_KEY, {}) };
  window.addEventListener('online', () => { if (isForecastSheet(host.sheet())) { host.announce(t('Back online. Updating forecasts.')); loadAll(true); } });
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const regionOf = (r) => (r.pin ? t('Dropped pin') : r.region);
const nameOf = (r) => (sameName(fc.list, r) ? `${r.name}, ${regionOf(r)}` : r.name);
const coords = (r) => `${r.baseLat.toFixed(3)}, ${r.baseLon.toFixed(3)}`;
const place = (r) => (r.pin ? coords(r) : [r.region, r.country].filter(Boolean).join(' · '));
const pinTags = (r) => (r.pin ? `<span class="tag">${t('Pinned')}</span> <span class="tag warn">${t('Terrain unverified')}</span>` : '');
const MISSING = { top: () => t('Summit height estimated'), base: () => t('Base height estimated'), points: () => t('Location approximate') };
const pinNotes = (r) => [
  t('Pinned mountain, terrain unverified: this forecast is for the point you pinned, not for checked lifts and runs.'),
  r.top == null ? t('One point only, so this is one estimate for the whole mountain, with lower confidence.') : '',
  r.tzGuessed ? t('Time zone estimated from the pin’s position.') : '',
].filter(Boolean);
const missingNotes = (r) => (r.pin ? pinNotes(r) : (r.missing ?? []).map((k) => MISSING[k]?.()).filter(Boolean));
const unavailableText = (r) => (hasHeights(r) ? t('Forecast unavailable: no time zone data for this mountain.') : t('Forecast unavailable: no height data for this mountain.'));
const entry = (id) => fc.data.get(id) ?? { state: 'loading' };
function current(resort) {
  const e = entry(resort.id);
  if (e.fc) {
    const next = rescored(e.fc);
    if (next !== e.fc) setEntry(resort, { fc: next });
  }
  return entry(resort.id);
}
const rows = () => fc.list.map((resort) => { const e = current(resort); return { resort, entry: e, forecast: e.fc }; });
const nextDay = (date) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const canonicalId = (id) => fc.catalog?.getResort(id)?.id ?? id;
const onList = (id) => fc.list.some((r) => canonicalId(r.id) === canonicalId(id));
const dayOf = (forecast, date) => forecast?.scored?.days.find((d) => d.date === date);

// ---------- units
const imperial = () => host.units() === 'imperial';
const fmtTemp = (c) => (c == null ? '–' : `${Math.round(imperial() ? c * 1.8 + 32 : c)}°${imperial() ? 'F' : 'C'}`);
const fmtSpeed = (ms) => (ms == null ? '–' : `${Math.round(imperial() ? ms * 2.23694 : ms * 3.6)} ${imperial() ? 'mph' : 'km/h'}`);
const fmtVis = (m) => (m == null ? '–' : imperial() ? `${(m / 1609.34).toFixed(m < 1609 ? 1 : 0)} mi` : `${(m / 1000).toFixed(m < 1000 ? 1 : 0)} km`);

// ---------- loading
function setEntry(resort, patch) {
  fc.data.set(resort.id, { ...entry(resort.id), ...patch });
}

function focusKey() {
  const el = document.activeElement;
  if (!el || el === document.body || !document.querySelector('#sheet-body')?.contains(el)) return null;
  const q = (k, v) => (v == null ? '' : `[${k}="${CSS.escape(v)}"]`);
  const d = el.dataset;
  if (d.act) return `[data-act="${CSS.escape(d.act)}"]${q('data-r', d.r)}${q('data-d', d.d)}${q('data-dir', d.dir)}${q('data-v', d.v)}`;
  if (d.row) return q('data-row', d.row);
  return el.id ? `#${CSS.escape(el.id)}` : null;
}

function redraw() {
  const sheet = host.sheet();
  if (sheet !== 'forecast' && sheet !== 'fcday') return;
  const own = !fc.focusSel;
  if (own) fc.focusSel = focusKey();
  host.render();
  if (own) fc.focusSel = null;
}

async function loadOne(resort, force) {
  if (!canForecast(resort)) { setEntry(resort, { state: 'nodata' }); redraw(); return; }
  if (!fc.data.has(resort.id)) setEntry(resort, { state: 'loading' });
  try {
    const forecast = await loadForecast(resort, force);
    setEntry(resort, { state: 'ok', fc: forecast, failedRefresh: force && forecast.stale });
    addHistory(resort, forecast, force);
  } catch (e) {
    if (entry(resort.id).fc) setEntry(resort, { failedRefresh: true });
    else setEntry(resort, { state: 'error' });
  }
  redraw();
}

async function addHistory(resort, forecast, force) {
  if (forecast.history && !force) return;
  try {
    const history = await loadHistory(forecast.resort, force);
    const shown = entry(resort.id).fc;
    if (!history || shown?.at !== forecast.at) return;
    setEntry(resort, { fc: withHistory(shown, history) });
    redraw();
  } catch { /* the forecast stays as drawn */ }
}

export async function loadAll(force = false) {
  const watched = [...fc.list];
  if (force && fc.updating) return;
  fc.updating = force;
  fc.footer = '';
  if (force) redraw();
  await Promise.all(watched.map((r) => loadOne(r, force)));
  fc.updating = false;
  if (force) {
    const failed = watched.filter((r) => entry(r.id).state === 'error').length;
    const stale = watched.some((r) => entry(r.id).failedRefresh);
    if (!online() && (failed || stale)) fc.footer = t('You’re offline. Forecasts will refresh when you’re back online.');
    else if (failed) fc.footer = failed === 1 ? t('Updated. 1 mountain couldn’t load.') : t('Updated. {0} mountains couldn’t load.', failed);
    else if (stale) fc.footer = t('Couldn’t refresh. Showing forecasts as of {0}.', clock(Math.min(...watched.map((r) => entry(r.id).fc.at))));
    else host.toast(t('Forecasts updated'), 6000);
    if (fc.footer) host.announce(fc.footer);
  }
  redraw();
}

function syncWatchlist() {
  loadCatalog().then((c) => {
    fc.catalog = c;
    fc.catalogError = false;
    const { list, changed } = syncList(fc.list, (id) => resortFor(c, id));
    if (!changed) return;
    fc.list = list;
    saveList(prefs, list);
    fc.data.clear();
    loadAll(false);
  }).catch(() => {});
}

function start() {
  if (fc.started) return;
  fc.started = true;
  syncWatchlist();
  fc.list.filter((r) => !fc.data.has(r.id)).forEach((r) => setEntry(r, { state: 'loading' }));
  loadAll(false);
}

export function onClose() {
  pin.leave();
  fc.started = false;
  fc.editRows = [];
  fc.added = [];
}

const clock = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });

// ---------- small pieces
const bars = (level) => `<span class="fc-bars" aria-hidden="true">${[1, 2, 3].map((n) => `<i class="${n <= level ? 'on' : ''}"></i>`).join('')}</span>`;
const confWord = (level, short) => t(short && level === 'Medium' ? 'Med' : level);
const tag = (text) => `<span class="tag">${t(text)}</span>`;

function credits(forecasts) {
  const sources = new Set(forecasts.map((f) => f?.source).filter(Boolean));
  const out = [];
  if (sources.has('nws')) out.push(`<a href="https://www.weather.gov/" target="_blank" rel="noopener">${t('Weather: US National Weather Service')}</a>`);
  if (sources.has('met')) out.push(`<a href="https://api.met.no/" target="_blank" rel="noopener">${t('Weather data from MET Norway')}</a> · ${t('gusts estimated')}`);
  return out.length ? `<p class="fc-credit">${out.join('<br>')}</p>` : '';
}

const back = (act, label) => `<button class="fc-back" data-act="${act}">‹ ${t(label)}</button>`;

const offlineBanner = () => (online() ? '' : `<div class="wx-note warn">${t('You’re offline. Showing saved forecasts.')}</div>`);

function windowText(w) {
  if (w.kind === 'exact') return fmtHourRange(w.start, w.end);
  if (w.kind === 'broad') return t(w.block.label);
  return w.kind === 'hidden' ? '' : t('Under 3 h of data');
}

const historyShort = (f) => f.scored.inputs.historyHours < SNOW_HISTORY_MIN_HOURS;

const ageLine = (forecast) => (forecast.serverStale
  ? t('Forecast is {0} h old: the weather service isn’t answering', Math.round(sourceAgeHours(forecast.weather, forecast.at) ?? ageHoursOf(forecast.at)))
  : ageText(ageHoursOf(forecast.at)));

// ---------- S1 calendar
function cellHtml(row, date) {
  const { resort, entry: e } = row;
  const label = nameOf(resort);
  const long = fmtLongDate(date);
  const open = `data-act="fc-day" data-r="${esc(resort.id)}" data-d="${date}"`;
  if (e.state === 'loading') return `<td><button class="fc-cell skeleton" ${open} aria-label="${esc(t('{0}, {1}: {2}.', label, long, t('Loading forecasts…')))}"><span class="sk"></span><span class="sk short"></span></button></td>`;
  const day = dayOf(row.forecast, date);
  const plain = (cls, top, line) => `<td><button class="fc-cell ${cls}" ${open} aria-label="${esc(t('{0}, {1}: {2}.', label, long, line))}"><b class="st">${top}</b><span class="win">${esc(line)}</span></button></td>`;
  if (!day) return plain('none', '–', t('No forecast'));
  if (day.status === 'closed') return plain('closed', '⊘', t('Closed'));
  if (day.status === 'insufficient') return plain('insuff', '–', t('Insufficient data'));
  const { shown, band, label: word } = bandOf(day.score);
  const w = windowSummary(day);
  const winText = windowText(w);
  const level = CONF_LEVEL[day.confidence.level];
  const aria = w.kind === 'hidden'
    ? t('{0}, {1}: ski score {2}, {3}. Confidence {4}.', label, long, shown, t(word), t(day.confidence.level))
    : t('{0}, {1}: ski score {2}, {3}. Best window {4}. Confidence {5}.', label, long, shown, t(word), winText, t(day.confidence.level));
  return `<td><button class="fc-cell b${band}" ${open} aria-label="${esc(aria)}"><span class="sc"><b>${shown}</b><span class="lb">${t(word)}</span></span><span class="win" aria-hidden="true">${esc(winText)}</span><span class="conf" aria-hidden="true">${bars(level)}${confWord(day.confidence.level, true)}</span></button></td>`;
}

function rowHtml(row, dates, topId) {
  const { resort, entry: e } = row;
  const flash = fc.flash?.id === resort.id ? ` flash` : '';
  const newTag = fc.flash?.id === resort.id && fc.flash.isNew ? `<span class="tag fc-new">${t('New')}</span>` : '';
  const age = row.forecast ? `<small class="fc-age${isStale(ageHoursOf(row.forecast.at)) || row.forecast.serverStale ? ' old' : ''}">${ageLine(row.forecast)}</small>` : '';
  const head = `<th scope="row" class="fc-rowhead${flash}" data-row="${esc(resort.id)}" tabindex="-1"><b translate="no">${esc(resort.name)}</b><small translate="no">${esc(resort.pin ? coords(resort) : resort.region)}</small>${pinTags(resort)}${age}${topId === resort.id ? tag('Top pick') : ''}${newTag}</th>`;
  if (e.state === 'nodata') return `<tr>${head}<td colspan="${dates.length}" class="fc-failed"><span>${esc(unavailableText(resort))}</span></td></tr>`;
  if (e.state === 'error') {
    const msg = online() ? t('Couldn’t load the forecast for {0}.', nameOf(resort)) : t('Not saved on this device while you’re offline.');
    return `<tr>${head}<td colspan="${dates.length}" class="fc-failed"><span>${esc(msg)}</span> <button class="btn sm alt" data-act="fc-retry" data-r="${esc(resort.id)}" aria-label="${esc(t('Try again: {0}', nameOf(resort)))}">${t('Try again')}</button></td></tr>`;
  }
  return `<tr>${head}${dates.map((d) => cellHtml(row, d)).join('')}</tr>`;
}

function emptyCalendar() {
  return `<div class="card fc-empty"><h3>${t('Where should you ski?')}</h3><p class="sub">${t('Add mountains to your list and compare their ski scores for the week.')}</p><button class="btn" data-act="fc-add">${t('Add a mountain')}</button></div>`;
}

export function sheetCalendar() {
  start();
  if (!fc.list.length && !fc.editRows.some((r) => r.removed)) return [t('Forecast'), emptyCalendar(), false];
  const all = rows();
  const forecasts = all.map((r) => r.forecast).filter(Boolean);
  const dates = columnDates(forecasts);
  const sortDate = dates.includes(fc.view.sortDate) ? fc.view.sortDate : null;
  const shown = sortRows(all, sortDate);
  const topId = sortDate ? topPickId(all, sortDate) : null;
  const failedAll = all.length > 0 && all.every((r) => r.entry.state === 'error');
  const todays = fc.list.filter((r) => r.tz).map((r) => localToday(r.tz)).sort();
  const dayLabel = (d) => (d === todays[0] ? t('Today') : d === nextDay(todays[0]) ? t('Tomorrow') : fmtWeekday(d));
  const head = dates.map((d) => `<th scope="col" aria-sort="${d === sortDate ? 'descending' : 'none'}"><button class="fc-datehead${d === sortDate ? ' on' : ''}" data-act="fc-sort" data-d="${d}"><span>${dayLabel(d)}</span><b>${fmtDayNumber(d)}</b><i aria-hidden="true">${d === sortDate ? '↓' : '↕'}</i></button></th>`).join('');
  const table = dates.length
    ? `<div class="fc-scroll"><table class="fc-grid"><caption class="sr">${t('Ski score for each mountain on your list, by date')}</caption><thead><tr><th scope="col" class="fc-corner"><span class="sr">${t('Mountain')}</span></th>${head}</tr></thead><tbody>${shown.map((r) => rowHtml(r, dates, topId)).join('')}</tbody></table></div>`
    : `<div class="fc-scroll"><table class="fc-grid"><tbody>${shown.map((r) => rowHtml(r, ['·'], null)).join('')}</tbody></table></div>`;
  const sortLine = sortDate
    ? `<p class="fc-sortline">${t('Sorted by {0}', fmtShortDate(sortDate))} <button class="btn sm alt" data-act="fc-unsort">${t('Show your order')}</button></p>`
    : `<p class="fc-sortline">${t('Your order · tap a date to sort by it')}</p>`;
  const ages = forecasts.map((f) => f.at);
  const updated = ages.length ? ageText(ageHoursOf(Math.min(...ages))) : '';
  const stale = forecasts.some((f) => isStale(ageHoursOf(f.at)));
  const refreshLabel = fc.updating ? t('Updating…') : online() ? t('Refresh') : t('Refresh when online');
  return [t('Forecast'), `
    ${offlineBanner()}
    ${failedAll && online() ? `<div class="card"><p class="sub">${t('Couldn’t load any forecasts. Your mountains are saved. Check your connection and try again.')}</p><button class="btn alt" data-act="fc-refresh">${t('Try again')}</button></div>` : ''}
    <div class="fc-actions" role="group" aria-label="${esc(t('Forecast actions'))}"><button class="btn sm alt" data-act="fc-add">${t('Add a mountain')}</button><button class="btn sm alt" data-act="fc-edit">${t('Edit list')}</button><button class="btn sm alt" data-act="fc-today">${t('Back to today')}</button></div>
    <p class="fc-legend">${t('Score out of 100')} · ${bars(2)} ${t('Bars show confidence')} · ${t('Tap a score for hourly detail')}</p>
    ${!forecasts.length || forecasts.some(historyShort) ? `<p class="fc-legend">${t('Snow history is limited for now, so confidence is Medium at best.')}</p>` : ''}
    ${sortLine}
    ${table}
    <div class="wx-foot fc-foot"><div class="grow"><b>${esc(updated)}</b>${stale ? `<br>${t('Some forecasts are older than usual.')}` : ''}<br>${t('All times are each mountain’s local time.')}${fc.footer ? `<br><span class="fc-line">${esc(fc.footer)}</span>` : ''}</div><button class="btn" data-act="fc-refresh">${esc(refreshLabel)}</button></div>
    ${credits(forecasts)}`, false];
}

// ---------- S2 day view
function chartSvg(day) {
  const ski = day.hours.filter((h) => h.ski);
  const W = 320, H = 150, top = 24, bottom = 112, pad = 6, slot = (W - pad * 2) / ski.length, bw = slot * 0.62;
  const inWin = (h) => day.window && h.hour >= day.window.start && h.hour < day.window.end;
  const bar = (h, i) => {
    const x = pad + i * slot + (slot - bw) / 2;
    if (h.score == null) return `<text x="${x + bw / 2}" y="${bottom - 4}" text-anchor="middle" class="fc-t">–</text>`;
    const ht = Math.max(2, (h.score / 100) * (bottom - top));
    const peak = day.peakHour && h.hour === day.peakHour.hour;
    return `<rect x="${x}" y="${bottom - ht}" width="${bw}" height="${ht}" rx="3" class="fc-bar${inWin(h) ? ' best' : ''}"/><text x="${x + bw / 2}" y="${bottom - ht - 4}" text-anchor="middle" class="fc-t">${roundHalfUp(h.score)}</text>${peak ? `<text x="${x + bw / 2}" y="${top - 8}" text-anchor="middle" class="fc-peak">▲</text>` : ''}`;
  };
  const labels = ski.map((h, i) => `<text x="${pad + i * slot + slot / 2}" y="${bottom + 14}" text-anchor="middle" class="fc-t small">${esc(fmtHour(h.hour))}</text>`).join('');
  const first = ski.findIndex(inWin), last = ski.length - 1 - [...ski].reverse().findIndex(inWin);
  const bracket = first >= 0 ? `<path d="M${pad + first * slot + 3} ${bottom + 22}v5h${(last - first + 1) * slot - 6}v-5" class="fc-bracket"/>` : '';
  const label = t('Hourly ski score from {0} to {1}.', fmtHour(ski[0].hour), fmtHour(ski[ski.length - 1].hour + 1));
  return `<svg class="fc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${ski.map(bar).join('')}${labels}${bracket}</svg>`;
}

function hourList(day) {
  return `<ol class="fc-hours" role="list">${day.hours.filter((h) => h.ski).map((h) => {
    if (h.score == null) return `<li><b>${esc(fmtHour(h.hour))}</b><span>${t('No data')}</span></li>`;
    const { shown, label } = bandOf(h.score);
    const tags = [day.window && h.hour >= day.window.start && h.hour < day.window.end ? tag('Best window') : '', day.peakHour?.hour === h.hour ? tag('Peak hour') : ''].join('');
    return `<li><b>${esc(fmtHour(h.hour))}</b><span>${shown} ${t(label)}</span><span class="sub">${esc(codeText(h.factor, 'Not in forecast'))}</span>${tags}</li>`;
  }).join('')}</ol>`;
}

function siteCard(resort, forecast, day) {
  const blocks = timeBlocks(day);
  if (!blocks.length) return '';
  const peak = day.peakHour ? blockOfHour(day.peakHour.hour) : blocks[0];
  const pick = blocks.find((b) => b.id === fc.tod) ?? blocks.find((b) => b.id === peak?.id) ?? blocks[0];
  const rep = day.hours.find((h) => h.ski && h.hour === pick.from + Math.floor((pick.to - pick.from) / 2)) ?? day.hours.find((h) => h.ski && h.score != null);
  const single = forecast.scored.siteMode === 'single';
  const singleKey = forecast.scored.siteReason === 'base_missing' ? 'summit' : 'base';
  const col = (title, siteKey, hourSite) => {
    const w = forecast.weather[siteKey]?.hourly;
    const i = w ? w.time.indexOf(rep.time) : -1;
    const v = (k) => (i >= 0 ? w[k][i] : null);
    const none = !hourSite || i < 0;
    const val = (x) => (none ? '–' : x);
    return `<div class="fc-site"><h4>${title}</h4>
      <dl><dt>${t('Temperature')}</dt><dd>${val(fmtTemp(v('temperature_2m')))}</dd>
      <dt>${t('Wind')}</dt><dd>${val(fmtSpeed(v('wind_speed_10m')))}</dd>
      <dt>${t('Gusts')}</dt><dd>${val(fmtSpeed(v('wind_gusts_10m')))}</dd>
      <dt>${t('Precipitation')}</dt><dd>${none ? t('Not in forecast') : esc(codeText(hourSite.precip, 'Not in forecast'))}</dd>
      <dt>${t('Visibility')}</dt><dd>${val(fmtVis(v('visibility')))}</dd>
      <dt>${t('Snow surface')}</dt><dd>${none ? t('Not in forecast') : esc(codeText(hourSite.surface, 'Not in forecast'))}</dd></dl></div>`;
  };
  const cols = single ? col(t('Mountain (one estimate)'), singleKey, rep.base ?? rep.upper) : col(t('Base'), 'base', rep.base) + col(t('Summit'), 'summit', rep.upper);
  const switcher = `<div class="seg solid fc-tod" role="group" aria-label="${esc(t('Time of day'))}">${blocks.map((b) => `<button data-act="fc-tod" data-v="${b.id}" aria-pressed="${b.id === pick.id}" class="${b.id === pick.id ? 'on' : ''}">${t(b.label)}</button>`).join('')}</div>`;
  return `<div class="card"><h3>${t('Base and summit')}</h3>${switcher}<p class="sub">${esc(fmtHour(rep.hour))}</p><div class="fc-sites${single ? ' one' : ''}">${cols}</div></div>`;
}

function dayBody(resort, forecast, day) {
  const f = forecast;
  if (!day) return `<div class="card"><p class="sub">${t('No forecast for this date.')}</p></div>`;
  if (day.status === 'closed') return `<div class="card"><h3>${t('Closed on this day')}</h3>${day.closureSource && CODE_TEXT[day.closureSource.code] ? `<p class="sub">${esc(codeText(day.closureSource))}</p>` : ''}</div>`;
  if (day.status === 'insufficient') return `<div class="card fc-insuff"><h3>${t('Insufficient data')}</h3><p>${esc(codeText(day.insufficientReason, 'No explanation is available for this day.'))}</p></div>`;
  const { shown, band, label } = bandOf(day.score);
  const w = windowSummary(day);
  const winText = windowText(w);
  const { from, to, assumed } = day.skiHours;
  const range = fmtHourRange(from, to);
  const cbox = (v, l) => `<div class="box cap"><b>${v}</b><span>${l}</span></div>`;
  const blocks = timeBlocks(day);
  const blockList = () => `<div class="card"><h3>${t('Time blocks')}</h3><p class="sub">${t('Hourly detail is less reliable this far ahead, so scores are shown in time blocks.')}</p><ul class="fc-blocks" role="list">${blocks.map((b) => { const s = bandOf(b.score); return `<li><b>${t(b.label)}</b><span>${esc(fmtHourRange(b.from, b.to))}</span><span>${s.shown} ${t(s.label)}</span>${day.broadWindow?.part === b.id ? tag('Best window') : ''}</li>`; }).join('')}</ul></div>`;
  const hourly = () => `<div class="card"><h3>${t('Hourly scores')}</h3>${chartSvg(day)}<p class="fc-legend"><span aria-hidden="true">▲</span> ${t('Peak hour')} · <span aria-hidden="true">▬</span> ${t('Best window')}</p>${hourList(day)}</div>`;
  const detail = day.detail === 'hourly' ? hourly() : day.detail === 'windows' ? blockList() : '';
  const hidden = w.kind === 'hidden';
  const boxes = [hidden ? '' : cbox(esc(winText), t('Best window')), day.detail === 'hourly' && day.peakHour ? cbox(esc(fmtHour(day.peakHour.hour)), t('Peak hour')) : '', cbox(esc(assumed ? t('Assumed {0}', range) : range), t('Ski hours'))].join('');
  const statusOld = forecast.status && !forecast.status.assumed && isStale(statusAgeHours(forecast.status, Date.now()));
  return `
    <div class="fc-hero b${band}"><div class="score"><b>${shown}</b><span>${t(label)}</span></div><div class="meta"><span>${t('Score out of 100')}</span><span>${t('Confidence: {0}', t(day.confidence.level))} ${bars(CONF_LEVEL[day.confidence.level])}</span></div></div>
    <p class="fc-why">${esc(codeText(day.explain))}</p>
    <p class="fc-note">${esc(codeText(day.confidence.reason))}</p>
    ${(day.notes ?? []).map((n) => `<p class="fc-notice">${esc(codeText(n))}</p>`).join('')}
    ${statusOld ? `<p class="fc-notice">${t('Opening hours and closures are from an older check, so they are treated as assumed.')}</p>` : ''}
    <div class="boxes b3 fc-facts">${boxes}</div>
    ${hidden ? '' : `<p class="fc-note">${t('Window timing confidence: {0}.', t(day.windowConfidence.level))} ${esc(codeText(day.windowConfidence.reason))}</p>`}
    ${detail}
    ${day.detail === 'hourly' || day.detail === 'windows' ? siteCard(resort, f, day) : ''}`;
}

export function sheetDay(arg) {
  const resort = fc.list.find((r) => r.id === arg?.id);
  if (!resort) return sheetCalendar();
  start();
  const e = current(resort);
  const forecast = e.fc;
  const dates = forecast ? forecast.scored.days.map((d) => d.date) : [];
  const i = dates.indexOf(arg.date);
  const step = (dir, d) => (d ? `<button class="btn sm alt" data-act="fc-step" data-dir="${dir}" data-r="${esc(resort.id)}" data-d="${d}" aria-label="${esc(t(dir === 'prev' ? 'Previous day, {0}' : 'Next day, {0}', fmtLongDate(d)))}">${dir === 'prev' ? `‹ ${esc(fmtWeekday(d))}` : `${esc(fmtWeekday(d))} ›`}</button>` : '<span></span>');
  const stepper = i >= 0 || forecast ? `<div class="fc-stepper" role="group" aria-label="${esc(t('Change day'))}">${step('prev', dates[i - 1])}${step('next', dates[i + 1])}</div>` : '';
  let body;
  if (e.state === 'nodata') body = `<div class="card"><p class="sub">${esc(unavailableText(resort))}</p></div>`;
  else if (e.state === 'loading' && !forecast) body = `<div class="card"><span class="sk big"></span><span class="sk"></span><p class="sub">${t('Loading forecasts…')}</p></div>`;
  else if (!forecast) body = `<div class="card"><p class="sub">${online() ? t('Couldn’t load this day. Check your connection and try again.') : t('This day isn’t saved on this device. It will load when you’re back online.')}</p><button class="btn alt" data-act="fc-retry" data-r="${esc(resort.id)}">${t('Try again')}</button></div>`;
  else body = dayBody(resort, forecast, dayOf(forecast, arg.date));
  const hours = forecast ? ageHoursOf(forecast.at) : 0;
  const foot = forecast ? `<div class="wx-foot fc-foot"><div class="grow"><b>${ageLine(forecast)}</b>${isStale(hours) || forecast.serverStale ? `<br>${t('Some forecasts are older than usual.')}` : ''}</div><button class="btn" data-act="fc-refresh">${esc(fc.updating ? t('Updating…') : online() ? t('Refresh') : t('Refresh when online'))}</button></div>${credits([forecast])}` : '';
  return [resort.name, `${back('fc-home', 'Forecast')}${offlineBanner()}
    <p class="fc-dateline"><b>${esc(fmtLongDate(arg.date))}</b><br><span class="sub">${esc(t('Times are local to the mountain ({0}).', resort.tz))}</span></p>
    ${missingNotes(resort).map((n) => `<p class="fc-note">${esc(n)}</p>`).join('')}${stepper}${body}${foot}`, false];
}

// ---------- S3 add a mountain
function resultsHtml() {
  if (fc.catalogError) return `<div class="card"><p class="sub">${t('Couldn’t load the list of mountains.')}</p><button class="btn alt" data-act="fc-catalog">${t('Try again')}</button></div>`;
  if (!fc.catalog) return `<p class="sub">${t('Loading…')}</p>`;
  if (!fc.q.trim()) return `<p class="sub">${t('Search by mountain name, town or nickname.')}</p>`;
  const found = searchResorts(fc.catalog, fc.q);
  if (!found.length) return `<p class="sub">${esc(t('No mountain called “{0}” found.', fc.q))}</p>`;
  return `<ul class="fc-results" role="list">${found.map((r) => {
    const label = [r.name, r.region, r.country].filter(Boolean).join(', ');
    const full = resortFor(fc.catalog, r.id);
    const notes = full ? [...missingNotes(full), ...(canForecast(full) ? [] : [unavailableText(full)])] : [];
    const alias = r.match && r.match.field !== 'name' ? `<small translate="no">${esc(t('Also known as “{0}”', r.match.text))}</small>` : '';
    const added = fc.added.includes(r.id), listed = onList(r.id) && !added;
    const control = listed
      ? `<span class="sub">${t('On your list')}</span><button class="btn sm alt" data-act="fc-show" data-r="${esc(r.id)}" aria-label="${esc(t('Show {0} on the calendar', label))}">${t('Show')}</button>`
      : added
        ? `<span class="sub">${t('Added')}</span><button class="btn sm alt" data-act="fc-unadd" data-r="${esc(r.id)}" aria-label="${esc(t('Remove {0}', label))}">${t('Remove')}</button>`
        : `<button class="btn sm" data-act="fc-doadd" data-r="${esc(r.id)}" aria-label="${esc(t('Add {0}', label))}">${t('Add')}</button>`;
    const failed = fc.saveFailed === r.id ? `<p class="fc-error" role="alert">${esc(t('Couldn’t save {0}. This device may be in private browsing or out of space.', r.name))} <button class="btn sm alt" data-act="fc-doadd" data-r="${esc(r.id)}">${esc(t('Try again: add {0}', r.name))}</button></p>` : '';
    return `<li class="fc-res"><div class="grow"><b translate="no">${esc(r.name)}</b><small translate="no">${esc(place(r))}</small>${alias}${notes.map((n) => `<small class="fc-miss">${esc(n)}</small>`).join('')}</div><div class="ctl">${control}</div>${failed}</li>`;
  }).join('')}</ul>`;
}

function ensureCatalog() {
  if (fc.catalog || fc.catalogLoading) return;
  fc.catalogLoading = true;
  loadCatalog().then((c) => { fc.catalog = c; fc.catalogError = false; }).catch(() => { fc.catalogError = true; }).finally(() => {
    fc.catalogLoading = false;
    updateResults();
    if (host.sheet() === 'fcedit') host.render();
    else if (host.sheet() === 'fcpin') pin.refresh();
  });
}

const catalogIfAvailable = async () => fc.catalog ?? loadCatalog().catch(() => null);

const pin = createPinScreen({
  fc,
  host: () => host,
  back,
  offlineBanner,
  ensureCatalog,
  catalogIfAvailable,
  focusSel: (sel) => focusSel(sel),
  commitPin: (resort, edit) => commitPin(resort, edit),
  useCatalog: (catalogId, pinId, fromPinScreen) => useCatalog(catalogId, pinId, fromPinScreen),
  removeRow: (id) => removeRow(id),
});

function updateResults() {
  const el = document.querySelector('#fc-results');
  if (el) el.innerHTML = resultsHtml();
}

export function sheetAdd() {
  ensureCatalog();
  const bar = fc.added.length ? `<div class="fc-stickybar"><button class="btn" data-act="fc-home" data-first="${esc(fc.added[0])}">${t('Show on calendar ({0})', fc.added.length)}</button></div>` : '';
  return [t('Add a mountain'), `${back('fc-home', 'Forecast')}
    <label class="lbl" for="fc-q">${t('Search mountains')}</label>
    <input class="field" id="fc-q" type="search" autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(fc.q)}" placeholder="${esc(t('Search mountains'))}" />
    <p class="fc-pinlink"><button class="btn sm alt" data-act="fc-pin-new">${t('Can’t find it? Add by map pin')}</button></p>
    <div id="fc-results" aria-live="polite">${resultsHtml()}</div>${bar}`, false];
}

function persist() {
  fc.listSaveFailed = !saveList(prefs, fc.list);
  return !fc.listSaveFailed;
}

function addResort(id) {
  const resort = fc.catalog ? resortFor(fc.catalog, id) : null;
  if (!resort || onList(resort.id)) return;
  const next = add(fc.list, resort);
  const before = fc.list;
  fc.list = next;
  if (!persist()) { fc.list = before; fc.saveFailed = id; host.announce(t('Couldn’t save {0}. This device may be in private browsing or out of space.', resort.name)); host.render(); return; }
  fc.saveFailed = null;
  if (!fc.added.includes(id)) fc.added.push(id);
  setEntry(resort, { state: 'loading' });
  loadOne(resort, false);
  host.announce(t('{0} added to your list.', resort.name));
  host.render();
  focusSel(`[data-act="fc-unadd"][data-r="${id}"]`);
}

function dropAdded(id) {
  const resort = fc.list.find((r) => r.id === id);
  fc.list = fc.list.filter((r) => r.id !== id);
  fc.added = fc.added.filter((x) => x !== id);
  persist();
  if (resort) host.announce(t('{0} removed from your list.', resort.name));
  host.render();
  focusSel(`[data-act="fc-doadd"][data-r="${id}"]`);
}

// ---------- S5 edit list
function syncEditRows() {
  if (fc.editRows.filter((r) => !r.removed).map((r) => r.resort.id).join() !== fc.list.map((r) => r.id).join()) {
    fc.editRows = fc.list.map((resort) => ({ resort, removed: false }));
  }
}

export function sheetEdit() {
  syncEditRows();
  if (fc.list.some((r) => r.pin)) ensureCatalog();
  const live = fc.editRows.filter((r) => !r.removed);
  const items = fc.editRows.map((r) => {
    const nm = nameOf(r.resort);
    if (r.removed) return `<li class="fc-edit-row undo"><span>${esc(t('{0} removed.', nm))}</span><button class="btn sm alt" data-act="fc-undo" data-r="${esc(r.resort.id)}" aria-label="${esc(t('Undo removing {0}', nm))}">${t('Undo')}</button></li>`;
    const k = live.indexOf(r);
    const mv = (dir, ok) => (ok ? `<button class="btn sm alt" data-act="fc-move" data-dir="${dir}" data-r="${esc(r.resort.id)}" aria-label="${esc(t(dir === 'up' ? 'Move up: {0}' : 'Move down: {0}', nm))}">${t(dir === 'up' ? 'Move up' : 'Move down')}</button>` : '<span class="spacer"></span>');
    const near = r.resort.pin && fc.catalog ? fc.catalog.nearby(r.resort.baseLat, r.resort.baseLon, { maxKm: MATCH_KM, limit: 1 })[0] : null;
    const pinPart = r.resort.pin ? `<p class="fc-pinline">${pinTags(r.resort)}</p>${near ? `<p class="fc-match">${pin.matchHtml(near, r.resort.id)}</p>` : ''}` : '';
    const editPin = r.resort.pin ? `<button class="btn sm alt wide" data-act="fc-pin-edit" data-r="${esc(r.resort.id)}" aria-label="${esc(t('Edit pin: {0}', nm))}">${t('Edit pin')}</button>` : '';
    return `<li class="fc-edit-row"><div class="grow"><b translate="no">${esc(r.resort.name)}</b><small translate="no">${esc(place(r.resort))}</small>${pinPart}</div><div class="ctl">${mv('up', k > 0)}${mv('down', k < live.length - 1)}<button class="btn sm danger" data-act="fc-remove" data-r="${esc(r.resort.id)}" aria-label="${esc(t('Remove {0}', nm))}">${t('Remove')}</button>${editPin}</div></li>`;
  }).join('');
  return [t('Edit list'), `${back('fc-home', 'Forecast')}
    ${fc.listSaveFailed ? `<div class="wx-note bad" role="alert">${t('Couldn’t save your changes. They’ll last until you close the app. This device may be in private browsing or out of space.')}</div>` : ''}
    ${live.length ? `<p class="sub">${t('Use the arrows to reorder. The calendar shows mountains in this order.')}</p>` : `<div class="card"><h3>${t('Your list is empty')}</h3><p class="sub">${t('Add a mountain to start comparing ski days.')}</p><button class="btn" data-act="fc-add">${t('Add a mountain')}</button></div>`}
    <ul class="fc-edit" role="list">${items}</ul>
    <button class="btn" data-act="fc-home">${t('Done')}</button>`, false];
}

// ---------- interaction
function focusSel(sel) {
  fc.focusSel = sel;
}

function removeRow(id) {
  syncEditRows();
  const name = fc.list.find((r) => r.id === id)?.name ?? '';
  const before = { rows: fc.editRows, list: fc.list };
  fc.editRows = fc.editRows.map((r) => (r.resort.id === id ? { ...r, removed: true } : r));
  fc.list = fc.editRows.filter((r) => !r.removed).map((r) => r.resort);
  if (!persist()) {
    fc.editRows = before.rows;
    fc.list = before.list;
    host.announce(t('Couldn’t save {0}. This device may be in private browsing or out of space.', name));
    return false;
  }
  focusSel(`[data-act="fc-undo"][data-r="${id}"]`);
  host.announce(t('{0} removed. Undo is available.', name));
  host.open('fcedit');
  return true;
}

function applyList(rowsNext) {
  fc.editRows = rowsNext;
  fc.list = rowsNext.filter((r) => !r.removed).map((r) => r.resort);
  persist();
  host.render();
}

function clearFlash() {
  fc.flash = null;
  document.querySelectorAll('.fc-rowhead.flash').forEach((el) => el.classList.toggle('flash', false));
  document.querySelectorAll('.fc-new').forEach((el) => { el.hidden = true; });
}

function openCalendar() {
  host.open('forecast');
}

function showNew(id) {
  fc.flash = { id, isNew: true };
  fc.added = [];
  openCalendar();
  focusSel(`[data-row="${id}"]`);
  setTimeout(clearFlash, FLASH_MS);
}

function commitPin(resort, edit) {
  const before = fc.list;
  fc.list = edit ? fc.list.map((r) => (r.id === resort.id ? resort : r)) : add(fc.list, resort);
  if (!persist()) { fc.list = before; return false; }
  fc.editRows = [];
  setEntry(resort, { state: 'loading', fc: undefined, failedRefresh: false });
  loadOne(resort, edit);
  if (edit) {
    host.announce(t('{0} updated.', resort.name));
    host.open('fcedit');
    focusSel(`[data-act="fc-pin-edit"][data-r="${resort.id}"]`);
  } else {
    host.announce(t('{0} added to your list as a pin.', resort.name));
    showNew(resort.id);
  }
  return true;
}

function useCatalog(catalogId, pinId, fromPinScreen) {
  const resort = fc.catalog ? resortFor(fc.catalog, catalogId) : null;
  if (!resort) return;
  const already = onList(resort.id);
  const at = fc.list.findIndex((r) => r.id === pinId);
  const rest = fc.list.filter((r) => r.id !== pinId);
  const before = fc.list;
  fc.list = already ? rest : insertAt(rest, resort, at < 0 ? rest.length : at);
  if (!persist()) { fc.list = before; host.announce(t('Couldn’t save {0}. This device may be in private browsing or out of space.', resort.name)); return; }
  fc.editRows = [];
  if (pinId) fc.data.delete(pinId);
  if (!already) { setEntry(resort, { state: 'loading' }); loadOne(resort, false); }
  host.announce(already ? t('{0} is already on your list.', resort.name) : t('{0} is now on your list instead of the pin.', resort.name));
  if (already) { fc.pinDraft = null; fc.flash = { id: resort.id, isNew: false }; fc.added = []; openCalendar(); focusSel(`[data-row="${resort.id}"]`); setTimeout(clearFlash, FLASH_MS); return; }
  if (fromPinScreen) { fc.pinDraft = null; showNew(resort.id); } else { host.render(); focusSel('[data-act="fc-home"]'); }
}

export function onClick(b) {
  const d = b.dataset;
  if (pin.onClick(d.act, d)) return;
  switch (d.act) {
    case 'fc-home': {
      const first = d.first;
      if (first) fc.flash = { id: first, isNew: true };
      fc.added = [];
      openCalendar();
      if (first) { focusSel(`[data-row="${first}"]`); setTimeout(clearFlash, FLASH_MS); }
      break;
    }
    case 'fc-add': fc.q = ''; host.open('fcadd'); focusSel('#fc-q'); break;
    case 'fc-edit': host.open('fcedit'); break;
    case 'fc-today': {
      const s = document.querySelector('.fc-scroll');
      if (s) { s.scrollLeft = 0; fc.scrollLeft = 0; s.querySelector('tbody .fc-cell, tbody .fc-failed button')?.focus({ preventScroll: true }); }
      break;
    }
    case 'fc-sort': {
      fc.view.sortDate = fc.view.sortDate === d.d ? null : d.d;
      prefs.set(VIEW_KEY, fc.view);
      focusSel(`[data-act="fc-sort"][data-d="${d.d}"]`);
      if (fc.view.sortDate) {
        const first = sortRows(rows(), d.d)[0];
        host.announce(t('Sorted by {0}, best first. {1} is first.', fmtShortDate(d.d), first?.resort.name ?? ''));
      }
      host.render();
      break;
    }
    case 'fc-unsort': {
      const was = fc.view.sortDate;
      fc.view.sortDate = null;
      prefs.set(VIEW_KEY, fc.view);
      host.announce(t('Back to your order.'));
      focusSel(`[data-act="fc-sort"][data-d="${was}"]`);
      host.render();
      break;
    }
    case 'fc-refresh': if (!fc.updating) loadAll(true); break;
    case 'fc-retry': { const r = fc.list.find((x) => x.id === d.r); if (r) { setEntry(r, { state: 'loading', fc: undefined }); host.render(); loadOne(r, true); } break; }
    case 'fc-day': {
      fc.bodyScroll = document.querySelector('#sheet-body')?.scrollTop ?? 0;
      fc.returnSel = `[data-act="fc-day"][data-r="${d.r}"][data-d="${d.d}"]`;
      fc.tod = null;
      host.open('fcday', { id: d.r, date: d.d });
      break;
    }
    case 'fc-step': fc.tod = null; focusSel(`[data-act="fc-step"][data-dir="${d.dir}"]`); host.open('fcday', { id: d.r, date: d.d }); break;
    case 'fc-tod': fc.tod = d.v; focusSel(`[data-act="fc-tod"][data-v="${d.v}"]`); host.render(); break;
    case 'fc-doadd': addResort(d.r); break;
    case 'fc-unadd': dropAdded(d.r); break;
    case 'fc-show': { fc.flash = { id: d.r, isNew: false }; openCalendar(); focusSel(`[data-row="${d.r}"]`); host.announce(t('{0} is already on your list.', fc.list.find((r) => r.id === d.r)?.name ?? '')); setTimeout(clearFlash, FLASH_MS); break; }
    case 'fc-catalog': fc.catalogError = false; updateResults(); ensureCatalog(); break;
    case 'fc-remove': {
      syncEditRows();
      const name = fc.list.find((r) => r.id === d.r)?.name ?? '';
      focusSel(`[data-act="fc-undo"][data-r="${d.r}"]`);
      host.announce(t('{0} removed. Undo is available.', name));
      applyList(fc.editRows.map((r) => (r.resort.id === d.r ? { ...r, removed: true } : r)));
      break;
    }
    case 'fc-undo': {
      const name = fc.editRows.find((r) => r.resort.id === d.r)?.resort.name ?? '';
      focusSel(`[data-act="fc-remove"][data-r="${d.r}"]`);
      host.announce(t('{0} is back on your list.', name));
      applyList(fc.editRows.map((r) => (r.resort.id === d.r ? { ...r, removed: false } : r)));
      break;
    }
    case 'fc-move': {
      const liveIds = fc.editRows.filter((r) => !r.removed).map((r) => r.resort.id);
      const k = liveIds.indexOf(d.r), otherId = liveIds[k + (d.dir === 'up' ? -1 : 1)];
      if (otherId == null) break;
      const a = fc.editRows.findIndex((r) => r.resort.id === d.r), c = fc.editRows.findIndex((r) => r.resort.id === otherId);
      const next = [...fc.editRows];
      [next[a], next[c]] = [next[c], next[a]];
      focusSel(`[data-act="fc-move"][data-dir="${d.dir}"][data-r="${d.r}"], [data-act="fc-move"][data-r="${d.r}"]`);
      host.announce(t('{0} moved to position {1} of {2}.', fc.editRows[a].resort.name, k + (d.dir === 'up' ? 0 : 2), liveIds.length));
      applyList(next);
      break;
    }
    default:
  }
}

export function onInput(el, type = 'input') {
  if (el.id !== 'fc-q') { pin.onInput(el, type); return; }
  if (type !== 'input') return;
  fc.q = el.value;
  clearTimeout(onInput.timer);
  updateResults();
  onInput.timer = setTimeout(() => host.announce(fc.catalog ? t('{0} mountains found.', searchResorts(fc.catalog, fc.q).length) : ''), 500);
}

export function afterRender(name) {
  if (name === 'fcpin') pin.startMap(); else pin.leave();
  const body = document.querySelector('#sheet-body');
  if (name === 'forecast') {
    const s = document.querySelector('.fc-scroll');
    if (s) {
      s.scrollLeft = fc.scrollLeft; s.scrollTop = fc.scrollTop;
      s.onscroll = () => { fc.scrollLeft = s.scrollLeft; fc.scrollTop = s.scrollTop; };
    }
    if (fc.returnSel && !fc.focusSel) { fc.focusSel = fc.returnSel; if (body) body.scrollTop = fc.bodyScroll; }
    fc.returnSel = null;
  }
  if (fc.focusSel) {
    const el = document.querySelector(fc.focusSel);
    if (el) { if (!el.hasAttribute('tabindex') && el.tagName === 'TH') el.tabIndex = -1; el.focus({ preventScroll: name === 'forecast' }); if (name === 'forecast' && fc.flash) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    fc.focusSel = null;
  }
}

export const sheets = { forecast: sheetCalendar, fcday: sheetDay, fcadd: sheetAdd, fcedit: sheetEdit, fcpin: pin.sheet };
export const state = fc;

import { t } from '../i18n.js';
import { esc } from './text.js';
import { MATCH_KM, TZ_MAX_KM, draftFrom, draftProblem, fetchElevation, makePin, newPinId, parseCoordinate, parseHeight, pointAt, zoneFor } from './pin.js';
import { mountMap } from './pinmap.js';

const WORLD_VIEW = { lat: 30, lon: 10, zoom: 1.5 };
const REGION_ZOOM = 9;
const PIN_ZOOM = 13;
const LOCATE_ZOOM = 12;
const FLY_MIN_ZOOM = 11;

const $ = (sel) => document.querySelector(sel);
const setText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
const show = (sel, on) => { const el = $(sel); if (el) el.hidden = !on; };

export function createPinScreen(ctx) {
  const { fc } = ctx;
  const H = () => ctx.host();
  const ui = { map: 'loading', coordsOpen: false, errors: {}, saving: false, saveFails: 0, mapFails: 0, locNote: false, keep: null };
  const seq = { base: 0, top: 0 };
  const busy = { base: false, top: false };
  let map = null;
  let mounting = 0;

  const draft = () => fc.pinDraft;
  const nameList = () => [...fc.list, ...fc.editRows.filter((r) => r.removed).map((r) => r.resort)];

  function freshDraft() {
    return { mode: 'new', id: null, name: fc.q.trim(), base: null, top: null };
  }

  const mapLabel = () => t('Map. Move the map to put the cross on the ski area. Arrow keys move the map; plus and minus zoom.');

  function startView() {
    const d = draft();
    if (d.base) return { lat: d.base.lat, lon: d.base.lon, zoom: PIN_ZOOM };
    if (fc.pinView) return fc.pinView;
    const near = fc.list.find((r) => Number.isFinite(r.baseLat ?? r.lat));
    return near ? { lat: near.baseLat ?? near.lat, lon: near.baseLon ?? near.lon, zoom: REGION_ZOOM } : WORLD_VIEW;
  }

  const heightText = (point, key) => (busy[key] ? t('Finding height…') : point.elev == null ? t('Height unknown') : `${point.elev.toLocaleString()} m`);
  const pointText = (label, point, key) => t(label, point.lat, point.lon, heightText(point, key));

  function match() {
    const d = draft();
    const near = d?.base && fc.catalog ? fc.catalog.nearby(d.base.lat, d.base.lon, { maxKm: MATCH_KM, limit: 1 })[0] ?? null : null;
    return near && near.id !== ui.keep ? near : null;
  }

  function refresh() {
    const d = draft();
    if (!d || !$('#fc-map')) return;
    const ready = ui.map === 'ready';
    show('#fc-map', ui.map !== 'error' && ui.map !== 'offline');
    show('#fc-maperr', ui.map === 'error' || ui.map === 'offline');
    show('#fc-maploading', ui.map === 'loading');
    setText('#fc-maperr-text', ui.map === 'offline' ? t('You’re offline. The map needs a connection, but you can enter the coordinates now.') : ui.mapFails ? t('Still couldn’t load the map. Try again later.') : t('The map couldn’t load. Enter the coordinates instead, or try again.'));
    show('#fc-pin-retry', ui.map === 'error' || ui.map === 'offline');
    show('#fc-cross', ready);
    for (const b of document.querySelectorAll('[data-act="fc-pin-set"]')) b.disabled = !ready;
    show('#fc-coord-box', ui.coordsOpen || ui.map === 'error' || ui.map === 'offline');
    $('#fc-coord-toggle')?.setAttribute('aria-expanded', String(ui.coordsOpen));
    setText('#fc-pin-base', d.base ? pointText('Base pin: {0}, {1} · {2}', d.base, 'base') : t('Base pin not set yet'));
    show('#fc-pin-top', !!d.top);
    if (d.top) setText('#fc-pin-top', pointText('Top pin: {0}, {1} · {2}', d.top, 'top'));
    show('#fc-pin-clear', !!d.top);
    show('#fc-hbase-wrap', !!d.base);
    show('#fc-htop-wrap', !!d.top);
    const hb = $('#fc-hbase'), ht = $('#fc-htop'), la = $('#fc-lat'), lo = $('#fc-lon'), tla = $('#fc-tlat'), tlo = $('#fc-tlon');
    if (hb && document.activeElement !== hb) hb.value = d.base?.elev ?? '';
    if (ht && document.activeElement !== ht) ht.value = d.top?.elev ?? '';
    if (la && document.activeElement !== la && d.base) la.value = d.base.lat;
    if (lo && document.activeElement !== lo && d.base) lo.value = d.base.lon;
    if (tla && document.activeElement !== tla && d.top) tla.value = d.top.lat;
    if (tlo && document.activeElement !== tlo && d.top) tlo.value = d.top.lon;
    show('#fc-terrain-one', !d.top);
    show('#fc-terrain-two', !!d.top);
    const near = match();
    const box = $('#fc-pin-match');
    const matchMarkup = near ? matchHtml(near, d.mode === 'edit' ? d.id : null) : '';
    if (box && box.dataset.html !== matchMarkup) { box.innerHTML = matchMarkup; box.dataset.html = matchMarkup; }
    const err = ui.errors;
    for (const [id, field] of [['#fc-name', 'name'], ['#fc-hbase', 'hbase'], ['#fc-htop', 'htop'], ['#fc-lat', 'coords'], ['#fc-lon', 'coords'], ['#fc-tlat', 'coords'], ['#fc-tlon', 'coords']]) $(id)?.setAttribute('aria-invalid', String(Boolean(err[field])));
    setText('#fc-name-err', err.name ?? '');
    setText('#fc-height-err', err.hbase ?? err.htop ?? '');
    setText('#fc-coord-err', err.coords ?? '');
    setText('#fc-pin-err', err.save ?? err.base ?? '');
    setText('#fc-loc-note', ui.locNote ? t('Location is off for SkiWithMe, so we can’t centre the map on you. Move the map yourself, or enter the coordinates.') : '');
    map?.setPins(d.base, d.top);
    const saveBtn = $('[data-act="fc-pin-save"]');
    if (saveBtn) { saveBtn.disabled = ui.saving; saveBtn.textContent = ui.saving ? t('Saving…') : t(d.mode === 'edit' ? 'Save changes' : 'Save mountain'); }
  }

  function matchHtml(near, pinId) {
    return `<span>${t('Is this {0}?', `<b translate="no">${esc(near.name)}</b>`)}</span> <button class="btn sm alt" data-act="fc-pin-usecat" data-r="${esc(near.id)}"${pinId ? ` data-p="${esc(pinId)}"` : ''} aria-label="${esc(t('Use {0} instead of the pin', near.name))}">${t('Use {0}', esc(near.name))}</button> <button class="btn sm alt" data-act="fc-pin-keep" data-r="${esc(near.id)}">${t('Keep as a pin')}</button>`;
  }

  async function lookUp(key) {
    const point = draft()[key];
    const mine = ++seq[key];
    busy[key] = true;
    refresh();
    const elev = await fetchElevation(point.lat, point.lon);
    if (seq[key] !== mine || draft()?.[key] !== point) return;
    busy[key] = false;
    point.elev = elev;
    refresh();
    H().announce(elev == null ? t('Couldn’t find the height. Enter it below.') : t(key === 'base' ? 'Base height {0} m.' : 'Top height {0} m.', elev));
  }

  function place(key, lat, lon) {
    const d = draft();
    d[key] = pointAt(lat, lon);
    ui.errors = {};
    refresh();
    lookUp(key);
  }

  function fieldsToDraft() {
    const d = draft();
    d.name = $('#fc-name')?.value ?? d.name;
  }

  async function save() {
    const d = draft();
    fieldsToDraft();
    if (busy.base || busy.top) {
      ui.errors = { save: t('Still finding the height… Try again in a moment.') };
      refresh();
      H().announce(ui.errors.save);
      return;
    }
    const problem = draftProblem(d, nameList());
    if (problem) {
      const noMap = ui.map !== 'ready';
      if (problem.field === 'base' && noMap) ui.coordsOpen = true;
      const text = {
        name: t('Give this mountain a name'),
        duplicate: t('You already have a mountain called {0}. Choose another name.', problem.name),
        nobase: noMap ? t('Enter the base coordinates first.') : t('Set the base pin on the map first.'),
        baseheight: t('Enter the base height in metres. We couldn’t look it up.'),
        topheight: t('Enter the top height in metres, or remove the top pin.'),
        toplow: t('The top pin must be higher than the base pin.'),
      }[problem.key];
      ui.errors = { [problem.field]: text };
      refresh();
      const target = { name: '#fc-name', hbase: '#fc-hbase', htop: '#fc-htop', base: noMap ? '#fc-lat' : '[data-act="fc-pin-set"]' }[problem.field];
      $(target)?.focus();
      return;
    }
    ui.saving = true;
    refresh();
    const catalog = await ctx.catalogIfAvailable();
    const zone = zoneFor(d.base.lat, d.base.lon, catalog ? catalog.nearby(d.base.lat, d.base.lon, { maxKm: TZ_MAX_KM, limit: 5 }) : []);
    const pin = makePin({ id: d.id ?? newPinId(fc.list.map((r) => r.id)), name: d.name, base: d.base, top: d.top, tz: zone.tz, tzGuessed: zone.guessed });
    ui.saving = false;
    if (!ctx.commitPin(pin, d.mode === 'edit')) {
      ui.saveFails++;
      ui.errors = { save: ui.saveFails > 1 ? t('Still couldn’t save {0}. Try again later. Your pin and name are still here.', pin.name) : t('Couldn’t save this mountain. Your pin and name are still here. This device may be in private browsing or out of space.') };
      H().announce(ui.errors.save);
      refresh();
      return;
    }
    fc.pinDraft = null;
    ui.errors = {};
    ui.saveFails = 0;
  }

  function locate() {
    if (!navigator.geolocation) { ui.locNote = true; refresh(); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      ui.locNote = false;
      const { latitude, longitude } = pos.coords;
      if (map) {
        map.flyTo(latitude, longitude, LOCATE_ZOOM);
        refresh();
        H().announce(t('Map moved to your location.'));
        return;
      }
      ui.coordsOpen = true;
      refresh();
      $('#fc-lat').value = pointAt(latitude, longitude).lat;
      $('#fc-lon').value = pointAt(latitude, longitude).lon;
      H().announce(t('Your location is in the coordinate fields. Check it, then choose “Set pins from coordinates”.'));
    }, () => { ui.locNote = true; refresh(); });
  }

  function applyCoordinates() {
    const lat = parseCoordinate($('#fc-lat')?.value, 85), lon = parseCoordinate($('#fc-lon')?.value, 180);
    if (lat == null || lon == null) {
      if ($('#fc-lat')?.value.trim() || $('#fc-lon')?.value.trim()) { ui.errors = { coords: t('Enter a latitude between -85 and 85 and a longitude between -180 and 180.') }; refresh(); }
      return;
    }
    const tl = $('#fc-tlat')?.value.trim() ?? '', to = $('#fc-tlon')?.value.trim() ?? '';
    const tlat = parseCoordinate(tl, 85), tlon = parseCoordinate(to, 180);
    if ((tl || to) && (tlat == null || tlon == null)) { ui.errors = { coords: t('Enter both top coordinates, or leave both empty.') }; refresh(); return; }
    const d = draft();
    const moved = (point, la, lo) => !point || point.lat !== la || point.lon !== lo;
    map?.flyTo(lat, lon, FLY_MIN_ZOOM);
    if (moved(d.base, lat, lon)) place('base', lat, lon);
    if (tlat != null && moved(d.top, tlat, tlon)) place('top', tlat, tlon);
  }

  function applyHeight(key, text) {
    const d = draft();
    if (!d[key]) return;
    seq[key]++;
    busy[key] = false;
    const h = parseHeight(text);
    d[key].elev = h;
    ui.errors = text.trim() && h == null ? { [key === 'base' ? 'hbase' : 'htop']: t('Enter a height in metres, like 1200.') } : {};
    refresh();
  }

  function startMap() {
    const el = $('#fc-map');
    if (!el) return;
    map?.destroy();
    map = null;
    const token = ++mounting;
    if (navigator.onLine === false) { ui.map = 'offline'; refresh(); return; }
    ui.map = 'loading';
    refresh();
    mountMap(el, startView(), mapLabel()).then((ctl) => {
      if (token !== mounting || !el.isConnected) { ctl.destroy(); return; }
      map = ctl;
      ui.map = 'ready';
      refresh();
    }).catch(() => {
      if (token !== mounting) return;
      ui.map = 'error';
      ui.coordsOpen = true;
      refresh();
      H().announce($('#fc-maperr-text')?.textContent ?? '');
    });
  }

  function leave() {
    mounting++;
    if (map) { fc.pinView = map.center(); map.destroy(); map = null; }
  }

  function open(arg) {
    ui.keep = null;
    if (arg?.mode === 'edit') {
      const resort = fc.list.find((r) => r.id === arg.id);
      if (resort) fc.pinDraft = draftFrom(resort);
    } else if (!fc.pinDraft || fc.pinDraft.mode !== 'new') fc.pinDraft = freshDraft();
    ui.errors = {};
    busy.base = false;
    busy.top = false;
    ui.mapFails = 0;
    ui.coordsOpen = false;
    ui.locNote = false;
    H().open('fcpin', arg);
  }

  function sheet() {
    if (!draft()) fc.pinDraft = freshDraft();
    const d = draft(), edit = d.mode === 'edit';
    ctx.ensureCatalog();
    const label = mapLabel();
    return [t(edit ? 'Edit pin' : 'Drop a pin'), `${ctx.back('fc-pin-back', edit ? 'Edit list' : 'Add a mountain')}${ctx.offlineBanner()}
      <p class="sub">${t('Move the map so the cross marks the base of the skiing, not the town or the summit. Then tap “Set base pin here”. You can add a top pin as well.')}</p>
      <div class="fc-mapwrap">
        <div id="fc-map" class="fc-map" role="group" aria-roledescription="map" aria-label="${esc(label)}"><span id="fc-cross" class="fc-cross" aria-hidden="true" hidden>+</span></div>
        <p id="fc-maploading" class="fc-maploading sub">${t('Loading map…')}</p>
        <div id="fc-maperr" class="card fc-maperr" hidden><p id="fc-maperr-text" class="sub"></p><button id="fc-pin-retry" class="btn alt" data-act="fc-pin-retry" hidden>${t('Try again')}</button></div>
      </div>
      <div class="fc-pinbtns" role="group" aria-label="${esc(t('Pins'))}">
        <button class="btn sm" data-act="fc-pin-set" data-v="base" disabled>${t('Set base pin here')}</button>
        <button class="btn sm alt" data-act="fc-pin-set" data-v="top" disabled>${t('Set top pin here')}</button>
        <button id="fc-pin-clear" class="btn sm alt" data-act="fc-pin-clear" hidden>${t('Remove top pin')}</button>
        <button class="btn sm alt" data-act="fc-pin-locate">${t('Use my location')}</button>
      </div>
      <p id="fc-loc-note" class="fc-note" role="status"></p>
      <p id="fc-pin-base" class="fc-readout"></p>
      <p id="fc-pin-top" class="fc-readout" hidden></p>
      <p id="fc-pin-match" class="fc-match"></p>
      <button id="fc-coord-toggle" class="btn sm alt" data-act="fc-pin-coords" aria-expanded="false" aria-controls="fc-coord-box">${t('Enter coordinates')}</button>
      <div id="fc-coord-box" hidden><fieldset class="fc-fields"><legend>${t('Base coordinates')}</legend>
        <label class="lbl" for="fc-lat">${t('Latitude')}</label><input class="field" id="fc-lat" inputmode="decimal" autocomplete="off" aria-describedby="fc-coord-err" />
        <label class="lbl" for="fc-lon">${t('Longitude')}</label><input class="field" id="fc-lon" inputmode="decimal" autocomplete="off" aria-describedby="fc-coord-err" />
        <p class="fc-note">${t('For example 44.936 and -72.485')}</p>
      </fieldset>
      <fieldset class="fc-fields"><legend>${t('Top coordinates (optional)')}</legend>
        <label class="lbl" for="fc-tlat">${t('Top latitude')}</label><input class="field" id="fc-tlat" inputmode="decimal" autocomplete="off" aria-describedby="fc-coord-err" />
        <label class="lbl" for="fc-tlon">${t('Top longitude')}</label><input class="field" id="fc-tlon" inputmode="decimal" autocomplete="off" aria-describedby="fc-coord-err" />
      </fieldset>
      <p id="fc-coord-err" class="fc-error" role="alert"></p>
      <button class="btn sm alt" data-act="fc-pin-coords-set">${t('Set pins from coordinates')}</button></div>
      <div id="fc-hbase-wrap" hidden><label class="lbl" for="fc-hbase">${t('Base height (metres)')}</label><input class="field" id="fc-hbase" inputmode="numeric" autocomplete="off" aria-describedby="fc-height-err" /></div>
      <div id="fc-htop-wrap" hidden><label class="lbl" for="fc-htop">${t('Top height (metres)')}</label><input class="field" id="fc-htop" inputmode="numeric" autocomplete="off" aria-describedby="fc-height-err" /></div>
      <p id="fc-height-err" class="fc-error" role="alert"></p>
      <label class="lbl" for="fc-name">${t('Name this mountain')}</label>
      <input class="field" id="fc-name" autocomplete="off" value="${esc(d.name)}" aria-describedby="fc-name-err" />
      <p id="fc-name-err" class="fc-error" role="alert"></p>
      <div class="card"><h3>${t('Pinned mountain · terrain unverified')}</h3>
        <p id="fc-terrain-one" class="sub">${t('One point only: we don’t know where the lifts, base and summit are, so you’ll see one estimate for the whole mountain, with lower confidence. Ski hours are assumed. You can move the pin later.')}</p>
        <p id="fc-terrain-two" class="sub" hidden>${t('Two points: you’ll see base and summit estimates at the heights of your pins. Lift and run positions are not checked, so use it as a guide. Ski hours are assumed. You can move the pins later.')}</p></div>
      <p id="fc-pin-err" class="fc-error" role="alert"></p>
      <button class="btn" data-act="fc-pin-save">${t(edit ? 'Save changes' : 'Save mountain')}</button>${edit ? `<button class="btn danger" data-act="fc-pin-remove">${t('Remove this mountain')}</button>` : ''}`, false];
  }

  function onClick(act, d) {
    switch (act) {
      case 'fc-pin-new': open({ mode: 'new' }); ctx.focusSel('#fc-name'); return true;
      case 'fc-pin-edit': open({ mode: 'edit', id: d.r }); return true;
      case 'fc-pin-back': {
        const edit = draft()?.mode === 'edit';
        if (edit) ctx.focusSel(`[data-act="fc-pin-edit"][data-r="${draft().id}"]`);
        H().open(edit ? 'fcedit' : 'fcadd');
        return true;
      }
      case 'fc-pin-remove': {
        const { id, name } = draft();
        if (ctx.removeRow(id)) fc.pinDraft = null;
        else { ui.errors = { save: t('Couldn’t save {0}. This device may be in private browsing or out of space.', name) }; refresh(); }
        return true;
      }
      case 'fc-pin-keep': ui.keep = d.r; refresh(); $('#fc-name')?.focus(); H().announce(t('Keeping this as a pin.')); return true;
      case 'fc-pin-coords-set': applyCoordinates(); return true;
      case 'fc-pin-set': {
        const c = map?.center();
        if (c) { place(d.v, c.lat, c.lon); H().announce(d.v === 'base' ? t('Base pin set.') : t('Top pin set.')); }
        return true;
      }
      case 'fc-pin-clear': draft().top = null; seq.top++; busy.top = false; ui.errors = {}; refresh(); $('[data-act="fc-pin-set"][data-v="top"]')?.focus(); H().announce(t('Top pin removed.')); return true;
      case 'fc-pin-locate': locate(); return true;
      case 'fc-pin-coords': ui.coordsOpen = !ui.coordsOpen; refresh(); return true;
      case 'fc-pin-retry': ui.mapFails++; startMap(); return true;
      case 'fc-pin-save': save(); return true;
      case 'fc-pin-usecat': ctx.useCatalog(d.r, d.p || null, H().sheet() === 'fcpin'); return true;
      default: return false;
    }
  }

  function onInput(el, type) {
    const d = draft();
    if (!d) return false;
    if (el.id === 'fc-name') { if (type === 'input') { d.name = el.value; if (ui.errors.name) { ui.errors = {}; refresh(); } } return true; }
    if (type !== 'change') return ['fc-hbase', 'fc-htop', 'fc-lat', 'fc-lon', 'fc-tlat', 'fc-tlon'].includes(el.id);
    if (el.id === 'fc-hbase') applyHeight('base', el.value);
    else if (el.id === 'fc-htop') applyHeight('top', el.value);
    else if (['fc-lat', 'fc-lon', 'fc-tlat', 'fc-tlon'].includes(el.id)) applyCoordinates();
    else return false;
    return true;
  }

  return { sheet, open, onClick, onInput, startMap, leave, refresh, matchHtml };
}

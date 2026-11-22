import { t } from '../i18n.js';
import { prefs } from '../store.js';
import { bandOf, columnDates, localToday } from './data.js';
import { esc, fmtWeekday, fmtDayNumber, fmtLongDate, fmtShortDate } from './text.js';
import { TRIP_KEY, MAX_RANGE_DAYS, cleanTrip, tripDates, toggleDate, clearRange, rangeError, rankTrip, notYet, entersRangeOn } from './trip.js';

export function createTripScreen(ctx) {
  const { fc } = ctx;
  const H = () => ctx.host();
  const $ = (sel) => document.querySelector(sel);
  const ui = { later: false, error: '', draft: null };
  let trip = null;

  const today = () => localToday(undefined);
  const state = () => (trip ??= cleanTrip(prefs.get(TRIP_KEY, {}), today()));
  const save = () => prefs.set(TRIP_KEY, trip);
  const arrival = (date, span) => fmtShortDate(entersRangeOn(date, span, today()));
  const shortDay = (date) => `${fmtWeekday(date)} ${fmtDayNumber(date)}`;

  function view() {
    const rows = ctx.rows();
    const forecasts = rows.map((r) => r.forecast).filter(Boolean);
    const columns = columnDates(forecasts);
    const picked = tripDates(state()).filter((d) => !columns.length || d >= columns[0]);
    return { rows, forecasts, columns, picked };
  }

  const summaryText = (picked, columns) => {
    if (!picked.length) return t('No days picked');
    const list = picked.map((d) => (columns.includes(d) ? shortDay(d) : fmtShortDate(d))).join(', ');
    return picked.length === 1 ? t('1 day picked: {0}', list) : t('{0} days picked: {1}', picked.length, list);
  };

  function dayButton(card, day, name) {
    const vis = shortDay(day.date);
    const open = `data-r="${esc(card.resort.id)}" data-d="${day.date}"`;
    if (day.kind === 'scored') {
      const { band, label } = bandOf(day.score);
      return `<button class="fc-cell fc-tripday b${band}" data-act="fc-trip-day" ${open} aria-label="${esc(t('{0}: ski score {1}, {2}. {3}.', vis, day.shown, t(label), name))}"><span class="win">${esc(vis)}</span><b>${day.shown} ${t(label)}</b></button>`;
    }
    if (day.kind === 'notyet') return `<button class="fc-cell fc-tripday none" data-act="fc-trip-notyet" ${open} aria-label="${esc(t('{0}: {1}. {2}.', fmtShortDate(day.date), t('Not yet'), name))}"><span class="win">${esc(fmtShortDate(day.date))}</span><b>${t('Not yet')}</b></button>`;
    const closed = day.kind === 'closed';
    const word = closed ? t('Closed') : t('Insufficient data');
    return `<button class="fc-cell fc-tripday ${closed ? 'closed' : 'insuff'}" data-act="fc-trip-day" ${open} aria-label="${esc(t('{0}: {1}. {2}.', vis, word, name))}"><span class="win">${esc(vis)}</span><b>${word}</b></button>`;
  }

  const fact = (label, value) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  const dayWord = (d) => `${d.shown} ${t(bandOf(d.score).label)}, ${fmtWeekday(d.date)}`;

  function factsHtml(card) {
    if (!card.total) return `<p class="fc-note">${t('None of these days are in forecast range yet.')}</p>${dayList(card)}`;
    const one = card.total === 1;
    const line = card.closed
      ? (one ? t('Coverage {0} of {1} day · {2} closed', card.covered, card.total, card.closed) : t('Coverage {0} of {1} days · {2} closed', card.covered, card.total, card.closed))
      : (one ? t('Coverage {0} of {1} day', card.covered, card.total) : t('Coverage {0} of {1} days', card.covered, card.total));
    const coverage = `<p class="fc-tripcov">${esc(line)}</p>`;
    if (card.allClosed) return `<p class="fc-note">${t('Closed on all your days.')}</p>${coverage}`;
    if (!card.covered) return coverage;
    return `<dl class="fc-tripfacts">${fact(t('Average'), `${card.average} ${t(bandOf(card.average).label)}`)}${fact(t('Strongest'), dayWord(card.strongest))}${fact(t('Weakest'), dayWord(card.weakest))}</dl>${coverage}`;
  }

  const dayList = (card) => `<ul class="fc-tripdays" role="list">${card.days.map((d) => `<li>${dayButton(card, d, ctx.nameOf(card.resort))}</li>`).join('')}</ul>`;

  function cardHtml(card, byId) {
    const name = ctx.nameOf(card.resort);
    const head = `<h4 tabindex="-1" data-row="${esc(card.resort.id)}"><span translate="no">${card.rank ? `${card.rank}. ` : ''}${esc(card.resort.name)}</span></h4>${ctx.pinTags(card.resort)}`;
    if (card.failed) {
      const loading = card.entry.state === 'loading';
      const nodata = card.entry.state === 'nodata';
      const body = loading ? `<p class="sub">${t('Loading forecasts…')}</p>`
        : nodata ? `<p class="sub">${esc(ctx.unavailableText(card.resort))}</p>`
          : `<p class="sub">${esc(t('Couldn’t load the forecast for {0}.', name))}</p><button class="btn sm alt" data-act="fc-retry" data-r="${esc(card.resort.id)}" aria-label="${esc(t('Try again: {0}', name))}">${t('Try again')}</button>`;
      return `<li class="fc-tripcard">${head}${body}</li>`;
    }
    const close = card.closeWith ? `<p class="fc-note">${esc(t('Too close to call: {0} and {1} are closer than the forecast can tell apart.', byId.get(card.closeWith).resort.name, card.resort.name))}</p>` : '';
    return `<li class="fc-tripcard">${head}${close}${factsHtml(card)}${card.total ? dayList(card) : ''}</li>`;
  }

  function outHtml() {
    const { rows, forecasts, columns, picked } = view();
    const parts = [`<p id="fc-trip-sum" class="fc-tripsum">${esc(summaryText(picked, columns))}</p>`];
    const late = notYet(picked, forecasts);
    if (late.dates.length) {
      const first = late.dates[0];
      parts.push(`<p class="fc-note">${esc(t('Forecasts for {0} arrive on {1}.', fmtShortDate(first), arrival(first, late.span)))}${late.dates.length === 2 ? ` ${esc(t('1 later day arrives after that.'))}` : ''}${late.dates.length > 2 ? ` ${esc(t('{0} later days arrive after that.', late.dates.length - 1))}` : ''}</p>`);
    }
    if (picked.length && late.dates.length === picked.length) parts.push(`<p class="fc-note">${t('None of these days are in forecast range yet.')}</p>`);
    parts.push('<p id="fc-trip-line" class="fc-note" role="status"></p>');
    if (!picked.length) parts.push(`<p class="sub">${t('Pick the days you plan to ski')}</p>`);
    if (rows.length < 2) {
      parts.push(`<div class="card"><p class="sub">${t('Add at least two mountains to compare them for your trip.')}</p><button class="btn" data-act="fc-add">${t('Add a mountain')}</button></div>`);
      return parts.join('');
    }
    if (!picked.length) return parts.join('');
    const ranked = rankTrip(rows.map((r) => ({ resort: r.resort, forecast: r.forecast, entry: r.entry })), picked);
    const byId = new Map(ranked.map((c) => [c.resort.id, c]));
    parts.push(`<h3>${t('Ranking')}</h3><p class="sub">${t('Closed days and days without a score don’t count. A mountain closed on all your days is listed last.')}</p><ol class="fc-tripranking" role="list">${ranked.map((c) => cardHtml(c, byId)).join('')}</ol>`);
    return parts.join('');
  }

  function refresh() {
    const out = $('#fc-trip-out');
    if (!out) return;
    const { columns, picked } = view();
    out.innerHTML = outHtml();
    document.querySelectorAll('[data-act="fc-trip-pick"]').forEach((b) => {
      const on = picked.includes(b.dataset.d);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
      const glyph = b.querySelector('[aria-hidden="true"]');
      if (glyph) glyph.textContent = on ? '✓ ' : '';
    });
    const err = $('#fc-to-err');
    if (err) err.textContent = ui.error;
    $('#fc-to')?.setAttribute('aria-invalid', String(!!ui.error));
    if (!columns.length) $('#fc-trip-chips')?.setAttribute('hidden', '');
  }

  function sheet() {
    ctx.start();
    const { columns, picked } = view();
    const s = state();
    const min = columns[0] ?? '';
    const chips = columns.map((d) => `<button class="btn sm alt fc-chip${picked.includes(d) ? ' on' : ''}" data-act="fc-trip-pick" data-d="${d}" aria-pressed="${picked.includes(d)}" aria-label="${esc(`${shortDay(d)}, ${fmtLongDate(d)}`)}"><span aria-hidden="true">${picked.includes(d) ? '✓ ' : ''}</span>${esc(shortDay(d))}</button>`).join('');
    return [t('Plan a trip'), `${ctx.back('fc-home', 'Forecast')}${ctx.offlineBanner()}
      <h3 id="fc-trip-days">${t('Which days will you ski?')}</h3>
      <div id="fc-trip-chips" class="fc-chips" role="group" aria-labelledby="fc-trip-days">${chips}</div>
      <p id="fc-trip-cap" class="fc-legend">${esc(t('Later dates show up to {0} days.', MAX_RANGE_DAYS))}</p>
      <button class="btn sm alt" data-act="fc-trip-later" aria-expanded="${ui.later}" aria-controls="fc-later">${t('Later dates')}</button>
      <div id="fc-later" class="fc-later"${ui.later ? '' : ' hidden'}>
        <label class="lbl" for="fc-from">${t('From')}</label><input class="field" type="date" id="fc-from" min="${min}" value="${esc(ui.draft?.from ?? s.from)}" />
        <label class="lbl" for="fc-to">${t('To')}</label><input class="field" type="date" id="fc-to" min="${min}" value="${esc(ui.draft?.to ?? s.to)}" aria-describedby="fc-to-err fc-trip-cap" aria-invalid="${!!ui.error}" />
        <p id="fc-to-err" class="fc-error" role="alert">${esc(ui.error)}</p>
        <button class="btn sm alt" data-act="fc-trip-clear">${t('Clear dates')}</button>
      </div>
      <div id="fc-trip-out">${outHtml()}</div>`, false];
  }

  function onClick(act, d) {
    switch (act) {
      case 'fc-trip': ui.error = ''; H().open('fctrip'); return true;
      case 'fc-trip-back': { const sel = fc.returnSel; fc.returnSel = null; ctx.focusSel(sel); H().open('fctrip'); return true; }
      case 'fc-trip-pick': {
        trip = toggleDate(state(), d.d);
        save();
        refresh();
        H().announce(t('Ranking updated.'));
        return true;
      }
      case 'fc-trip-later': {
        ui.later = !ui.later;
        $('#fc-later')?.toggleAttribute('hidden', !ui.later);
        document.querySelector('[data-act="fc-trip-later"]')?.setAttribute('aria-expanded', String(ui.later));
        return true;
      }
      case 'fc-trip-clear': {
        trip = clearRange(state());
        ui.error = '';
        ui.draft = null;
        save();
        $('#fc-from').value = '';
        $('#fc-to').value = '';
        refresh();
        H().announce(t('Ranking updated.'));
        return true;
      }
      case 'fc-trip-day':
        fc.bodyScroll = $('#sheet-body')?.scrollTop ?? 0;
        fc.returnSel = `[data-act="fc-trip-day"][data-r="${d.r}"][data-d="${d.d}"]`;
        fc.dayFrom = 'trip';
        fc.tod = null;
        H().open('fcday', { id: d.r, date: d.d });
        return true;
      case 'fc-trip-notyet': {
        const own = ctx.rows().find((r) => r.resort.id === d.r)?.forecast;
        const late = notYet([d.d], own ? [own] : []);
        const text = late.dates.length ? t('Forecasts for {0} arrive on {1}.', fmtShortDate(d.d), arrival(d.d, late.span)) : '';
        const line = $('#fc-trip-line');
        if (line) line.textContent = text;
        if (text) H().announce(text);
        return true;
      }
      default: return false;
    }
  }

  function onInput(el, type) {
    if (el.id !== 'fc-from' && el.id !== 'fc-to') return false;
    const from = $('#fc-from').value;
    const to = $('#fc-to').value;
    if (type !== 'change') { ui.draft = { from, to }; return true; }
    if (rangeError(from, to)) {
      ui.error = t('The end date must be on or after the start date.');
      refresh();
      H().announce(ui.error);
      return true;
    }
    ui.error = '';
    ui.draft = null;
    trip = { ...state(), from, to: from ? to : '' };
    trip = cleanTrip(trip, today());
    save();
    refresh();
    H().announce(t('Ranking updated.'));
    return true;
  }

  return { sheet, onClick, onInput, refresh };
}

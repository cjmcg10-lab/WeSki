/* PROTOTYPE — design artifact from /sdlc:generate-ux. Not production code.
   Implementation is produced by /sdlc:generate-code from ux-prd.md. */

/* FIXTURE DATA ONLY. Nothing here is a real forecast, a real score or a real closure.
   Every number was typed by hand or made by the small formula below so that every
   designed score status shows up. No network call is made anywhere in the prototype.
   The mountains are real place names; the people, accounts and weather are not real. */
(function () {
  'use strict';

  var HOURS = [9, 10, 11, 12, 13, 14, 15];               // ski hours 9 AM to 4 PM, one bar per hour
  var WEIGHTS = { snow: 45, vis: 25, wind: 20, comfort: 10 };

  /* The engine never writes prose. It returns a code plus parameters; the screen owns one
     whole-sentence template per code (this table stands in for the translation files).
     A parameter written as {h: 12} is an hour and is formatted by the screen. */
  var TEXT = {
    'conf.agree': 'Weather models agree and the forecast is fresh.',
    'conf.snow_amount': 'Models disagree on how much snow falls before {0}.',
    'conf.far': 'This far ahead, models disagree on timing and amounts.',
    'conf.rain_snow': 'Models disagree on whether precipitation falls as rain or snow at the base.',
    'conf.one_point': "The weather service can't separate the base and summit here.",
    'conf.stale': 'The forecast is {0} hours old because the weather service is delayed.',
    'timing.snow_arrival': 'Snow arrival time is uncertain.',
    'timing.wind_ease': 'The wind could ease an hour earlier or later.',
    'explain.fresh_wind_drop': 'Fresh snow overnight on a firm base, and the wind drops after {0}.',
    'explain.firm_flat': 'Firm, fast groomers early; flat light and gusts build in the afternoon.',
    'explain.leftover': 'Leftover fresh snow and light wind; best before the light goes flat.',
    'explain.packed': 'Packed snow and a steady breeze; a fair all-round day.',
    'explain.thaw': 'A thaw and refreeze leaves the surface firm, with gusts up high.',
    'outlook.broad': 'A broad outlook only: colder air and some new snow are possible, but the timing is not settled.',
    'insuff.summit_missing': 'The summit forecast is missing after {0}.',
    'insuff.not_loaded': 'The forecast has not loaded.',
    'insuff.too_few_hours': 'Not enough hourly data to score this day.',
    'closed.ops_report': 'Source: {0} operations report.',
    'closed.season': 'Season closed. Opens {0}.',
    'f.fresh_firm': 'Fresh snow on firm base', 'f.fresh_wind_easing': 'Fresh snow, wind easing', 'f.soft_clear': 'Soft snow, good visibility',
    'f.tracked': 'Snow getting tracked', 'f.flat_building': 'Flat light building', 'f.wind_up': 'Wind picking up', 'f.light_fading': 'Light fading',
    'f.firm': 'Firm groomers', 'f.firm_light_wind': 'Firm groomers, light wind', 'f.softening': 'Softening in the sun', 'f.flat': 'Flat light',
    'f.gusts_summit': 'Gusts on the summit', 'f.refreezing': 'Refreezing',
    'p.snow.good': 'Fresh snow on firm base', 'p.snow.fair': 'Packed powder, firm in places', 'p.snow.poor': 'Refrozen and scratchy',
    'p.vis.good': 'Clear below the summit', 'p.vis.fair': 'Flat light at times', 'p.vis.poor': 'Fog on the upper mountain',
    'p.wind.good': 'Wind drops after {0}', 'p.wind.fair': 'Breezy on the ridges', 'p.wind.poor': 'Strong gusts up high',
    'p.comfort.good': 'Cold but dry', 'p.comfort.fair': 'Cold with light snow', 'p.comfort.poor': 'Wet and raw',
    'precip.light_snow': 'Light snow', 'precip.none': 'No precipitation',
    'surf.fresh_firm': 'Fresh snow on firm base', 'surf.firm_groomed': 'Firm groomed', 'surf.fresh_packed': 'Fresh snow, wind packed', 'surf.scoured': 'Wind scoured'
  };
  function c(code) { return { code: code, args: Array.prototype.slice.call(arguments, 1) }; }

  // Day score rule from the spec: 60% average of all ski hours + 40% best three hours in a row.
  // Edge rules (decision H2, provisional until the engine owner, issue #2, confirms them):
  // - fewer than 3 ski hours with data, or more than half of the ski hours missing: Insufficient data;
  // - no 3 hours in a row with data: the best-window term uses the best run of 2 hours, else 1 ("short");
  // - the score rounds half up to a whole number.
  function scoreDay(hours) {
    var vals = hours.filter(function (v) { return v != null; });
    if (vals.length < 3 || hours.length - vals.length > hours.length / 2) return { status: 'insufficient', reason: c('insuff.too_few_hours') };
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var best = null, run = 3;
    for (; run >= 1 && best == null; run--) {
      for (var i = 0; i + run <= hours.length; i++) {
        var w = hours.slice(i, i + run);
        if (w.some(function (v) { return v == null; })) continue;
        var m = w.reduce(function (a, b) { return a + b; }, 0) / run;
        if (best == null || m > best) best = m;
      }
    }
    return { status: 'scored', score: Math.floor(0.6 * avg + 0.4 * best + 0.5 + 1e-9), short: run + 1 < 3 };
  }
  function scoreOf(hours) { var r = scoreDay(hours); return r.status === 'scored' ? r.score : null; }

  function clamp(v) { return Math.max(5, Math.min(99, Math.round(v))); }

  function partsFor(score) {
    var lvl = score >= 70 ? 'good' : score >= 55 ? 'fair' : 'poor';
    return [
      { key: 'snow', score: clamp(score + 9), cap: c('p.snow.' + lvl) },
      { key: 'vis', score: clamp(score - 6), cap: c('p.vis.' + lvl) },
      { key: 'wind', score: clamp(score - 14), cap: c('p.wind.' + lvl, { h: 10 }) },
      { key: 'comfort', score: clamp(score - 1), cap: c('p.comfort.' + lvl) }
    ];
  }

  var FACTORS_GOOD = ['f.fresh_firm', 'f.fresh_wind_easing', 'f.soft_clear', 'f.tracked', 'f.flat_building', 'f.wind_up', 'f.light_fading'].map(function (x) { return c(x); });
  var FACTORS_FAIR = ['f.firm', 'f.firm_light_wind', 'f.softening', 'f.softening', 'f.flat', 'f.gusts_summit', 'f.refreezing'].map(function (x) { return c(x); });

  var REASONS = {
    high: c('conf.agree'),
    medium: c('conf.snow_amount', { h: 9 }),
    low: c('conf.far')
  };

  // Conditions are stored in imperial units (°F, mph, miles); the prototype converts for °C · cm.
  // precip and snow are codes, like every other engine text.
  function wx(tb, ts, wb, ws, precip, vb, vs, sb, ss) {
    return {
      base: { t: tb, wind: wb, precip: precip, vis: vb, snow: sb },
      summit: { t: ts, wind: ws, precip: precip, vis: vs, snow: ss }
    };
  }
  function wxFor(score, cold) {
    var good = score >= 70;
    return wx(22 - cold, 12 - cold, good ? 8 : 14, good ? 18 : 30, good ? 'precip.light_snow' : 'precip.none',
      good ? 5 : 3, good ? 2 : 1, good ? 'surf.fresh_firm' : 'surf.firm_groomed', good ? 'surf.fresh_packed' : 'surf.scoured');
  }

  // Days 1–2: hourly detail.
  function H(hours, o) {
    o = o || {};
    var r = scoreDay(hours);
    if (r.status !== 'scored') return { status: 'insufficient', reason: r.reason };
    var s = r.score;
    return {
      status: 'scored', hours: hours, score: s, short: r.short, conf: o.conf || 'medium', reason: o.reason || REASONS[o.conf || 'medium'],
      timing: o.timing || (o.conf === 'high' ? 'medium' : 'low'),
      timingReason: o.timingReason || c('timing.snow_arrival'),
      explain: o.explain || (s >= 70 ? c('explain.fresh_wind_drop', { h: 10 }) : c('explain.firm_flat')),
      parts: partsFor(s), factors: o.factors || (s >= 70 ? FACTORS_GOOD : FACTORS_FAIR), wx: o.wx || wxFor(s, o.cold || 0),
      unc: o.unc || 3, ended: !!o.ended
    };
  }
  // Days 3–5: a daily score and time blocks; hourly only where the engine marks it defensible.
  function B(score, blocks, o) {
    o = o || {};
    return {
      status: 'scored', score: score, blocks: { morning: blocks[0], midday: blocks[1], afternoon: blocks[2] },
      hours: o.hours || null, conf: o.conf || 'medium', reason: o.reason || REASONS[o.conf || 'medium'],
      explain: o.explain || (score >= 70 ? c('explain.leftover') : score >= 55 ? c('explain.packed') : c('explain.thaw')),
      parts: partsFor(score), factors: FACTORS_FAIR, wx: o.wx || wxFor(score, o.cold || 0), unc: o.unc || 5
    };
  }
  // Days 6–9: a likely range.
  function R(lo, hi, o) {
    o = o || {};
    return {
      status: 'range', lo: lo, hi: hi, conf: o.conf || 'low', reason: o.reason || REASONS.low,
      outlook: o.outlook || c('outlook.broad'), unc: o.unc || 8
    };
  }
  function C() { return { status: 'closed', reason: 'closed.ops_report' }; }
  // Out of season (Southern Hemisphere in December): every day is Closed, with the month the season opens.
  function S(month) { return { status: 'closed', season: true, reason: c('closed.season', { mo: month }) }; }
  function I(reason) { return { status: 'insufficient', reason: reason }; }

  var PIN_REASON = c('conf.one_point');

  // Formula forecast for mountains added in the prototype (search results and new pins).
  function makeForecast(seed, pin) {
    var base = 48 + (seed * 7) % 30, wave = [0, 9, 4, -5, -12, 2, 8, 0, 6], shape = [2, 6, 8, 4, -2, -6, -10];
    var conf = pin ? 'low' : 'medium';
    return wave.map(function (w, i) {
      var s = clamp(base + w);
      if (i < 2) return H(shape.map(function (d) { return clamp(s + d - 2); }), { conf: conf, reason: pin ? PIN_REASON : undefined });
      if (i < 5) return B(s, [clamp(s + 4), s, clamp(s - 6)], { conf: pin ? 'low' : 'medium' });
      return R(clamp(s - 8), clamp(s + 8));
    });
  }

  var mountains = {
    'jay-peak': {
      id: 'jay-peak', kind: 'catalog', name: 'Jay Peak', region: 'Vermont', country: 'USA', tz: 'America/New_York',
      baseFt: 1950, summitFt: 3860, built: true, source: 'nws', hoursPublished: true,
      days: [
        H([70, 74, 76, 72, 66, 62, 58], { conf: 'high', timing: 'medium', timingReason: c('timing.wind_ease') }),
        H([82, 86, 80, 70, 66, 62, 60], { conf: 'medium', wx: wx(18, 9, 12, 22, 'precip.light_snow', 5, 2, 'surf.fresh_firm', 'surf.fresh_packed') }),
        B(68, [72, 66, 58], { hours: [72, 74, 70, 66, 62, 58, 56] }),
        B(58, [52, 60, 62]),
        B(47, [50, 46, 42], { conf: 'low', reason: c('conf.rain_snow') }),
        R(58, 74), R(72, 81), R(62, 78), R(70, 84)
      ]
    },
    'burke-mountain': {
      id: 'burke-mountain', kind: 'catalog', name: 'Burke Mountain', region: 'Vermont', country: 'USA', tz: 'America/New_York',
      baseFt: 1210, summitFt: 3267, built: true, source: 'nws', hoursPublished: true,
      days: [
        H([62, 66, 70, 72, 70, 64, 60], { conf: 'high' }),
        H([80, 88, 90, 84, 74, 68, 64], { conf: 'high', unc: 3 }),
        B(71, [74, 70, 64]),
        B(55, [50, 56, 58]),
        B(38, [40, 38, 34], { conf: 'low' }),
        R(55, 69), R(66, 80), R(60, 74), R(72, 88)
      ]
    },
    'cannon-mountain': {
      id: 'cannon-mountain', kind: 'catalog', name: 'Cannon Mountain', region: 'New Hampshire', country: 'USA', tz: 'America/New_York',
      baseFt: 1900, summitFt: 4080, built: true, source: 'nws', hoursPublished: true,
      days: [
        H([58, null, 64, 66, null, 56, null], { conf: 'medium' }),   // no 3 hours in a row with data: "under 3 hours of data"
        H([78, 84, 86, 82, 76, 70, 66], { conf: 'medium', unc: 3 }),
        B(66, [70, 66, 60]),
        C(),
        B(52, [48, 54, 56], { conf: 'low' }),
        R(50, 66), R(70, 82), R(64, 76), R(68, 80)
      ]
    },
    'niseko-hirafu': {
      id: 'niseko-hirafu', kind: 'catalog', name: 'Niseko Hirafu', region: 'Hokkaido', country: 'Japan', tz: 'Asia/Tokyo',
      baseFt: 850, summitFt: 3940, built: false, source: 'met', hoursPublished: true,
      days: [
        H([90, 92, 88, 84, 80, 78, 74], { conf: 'high', ended: true, cold: 6 }),
        H([86, 90, 92, 88, 82, 78, 76], { conf: 'high', cold: 6 }),
        B(84, [86, 84, 80], { conf: 'high', cold: 6 }),
        B(78, [80, 78, 74], { cold: 4 }),
        B(72, [70, 72, 74], { cold: 4 }),
        I(c('insuff.summit_missing', { h: 12 })),
        R(70, 86), R(74, 88), R(85, 96)
      ]
    },
    'pin-burklyn-hill': {
      id: 'pin-burklyn-hill', kind: 'pin', name: 'Burklyn Hill', region: 'Vermont', country: 'USA', tz: 'America/New_York',
      baseFt: 2340, summitFt: null, lat: 44.936, lon: -72.504, built: false, source: 'nws', hoursPublished: false,
      uncached: true,     // never loaded on this phone: shows "Offline" cells in the offline state
      days: [
        H([50, null, null, 58, null, null, 48], { conf: 'low', reason: PIN_REASON }),   // 4 of 7 hours missing: Insufficient data
        H([66, 72, 76, 74, 68, 62, 58], { conf: 'low', reason: PIN_REASON }),
        B(60, [64, 60, 54], { conf: 'low', reason: PIN_REASON }),
        B(48, [44, 50, 50], { conf: 'low', reason: PIN_REASON }),
        B(36, [38, 36, 32], { conf: 'low', reason: PIN_REASON }),
        R(44, 62), R(58, 74), R(52, 70), R(60, 80)
      ]
    },
    // Southern Hemisphere (PRD AC-54): out of season on December 4, so closed on every day of the default trip.
    'cardrona': {
      id: 'cardrona', kind: 'catalog', name: 'Cardrona', region: 'Otago', country: 'New Zealand', tz: 'Pacific/Auckland',
      baseFt: 5400, summitFt: 6100, built: false, source: 'met', hoursPublished: true, season: { opens: 6 },
      days: [S(6), S(6), S(6), S(6), S(6), S(6), S(6), S(6), S(6)]
    }
  };

  // Search fixtures: a tiny stand-in for the worldwide list. "built" = has a SkiWithMe map.
  var catalog = [
    { id: 'jay-peak', name: 'Jay Peak', region: 'Vermont', country: 'USA', tz: 'America/New_York', built: true, town: 'Jay', baseFt: 1950, summitFt: 3860, source: 'nws' },
    { id: 'jay-peak-stateside', name: 'Jay Peak', sector: 'Stateside', region: 'Vermont', country: 'USA', tz: 'America/New_York', built: false, town: 'Jay', baseFt: 1950, summitFt: 3200, source: 'nws' },
    { id: 'burke-mountain', name: 'Burke Mountain', region: 'Vermont', country: 'USA', tz: 'America/New_York', built: true, town: 'East Burke', baseFt: 1210, summitFt: 3267, source: 'nws' },
    { id: 'cannon-mountain', name: 'Cannon Mountain', region: 'New Hampshire', country: 'USA', tz: 'America/New_York', built: true, town: 'Franconia', baseFt: 1900, summitFt: 4080, source: 'nws' },
    { id: 'bretton-woods', name: 'Bretton Woods', region: 'New Hampshire', country: 'USA', tz: 'America/New_York', built: true, town: 'Carroll', baseFt: 1600, summitFt: 3100, source: 'nws' },
    { id: 'stowe', name: 'Stowe', region: 'Vermont', country: 'USA', tz: 'America/New_York', built: true, town: 'Stowe', baseFt: 1280, summitFt: 3625, source: 'nws' },
    { id: 'sugarbush', name: 'Sugarbush', region: 'Vermont', country: 'USA', tz: 'America/New_York', built: true, town: 'Warren', baseFt: 1483, summitFt: 4083, source: 'nws' },
    { id: 'killington', name: 'Killington', region: 'Vermont', country: 'USA', tz: 'America/New_York', built: true, town: 'Killington', baseFt: 1165, summitFt: 4241, source: 'nws' },
    { id: 'niseko-hirafu', name: 'Niseko Hirafu', region: 'Hokkaido', country: 'Japan', tz: 'Asia/Tokyo', built: false, alias: 'Grand Hirafu', town: 'Kutchan', baseFt: 850, summitFt: 3940, source: 'met' },
    { id: 'les-arcs', name: 'Les Arcs', region: 'Savoie', country: 'France', tz: 'Europe/Paris', built: true, alias: 'Paradiski', town: 'Bourg-Saint-Maurice', baseFt: 3940, summitFt: 10583, source: 'met' },
    { id: 'zermatt', name: 'Zermatt', region: 'Valais', country: 'Switzerland', tz: 'Europe/Zurich', built: true, alias: 'Matterhorn ski paradise', town: 'Zermatt', baseFt: 5315, summitFt: 12740, source: 'met' },
    { id: 'snow-valley-ca', name: 'Snow Valley', region: 'California', country: 'USA', tz: 'America/Los_Angeles', built: false, town: 'Running Springs', baseFt: 6800, summitFt: 7841, source: 'nws' },
    { id: 'snow-valley-on', name: 'Snow Valley', region: 'Ontario', country: 'Canada', tz: 'America/Toronto', built: false, town: 'Barrie', baseFt: 820, summitFt: 1100, source: 'met' },
    { id: 'owls-head', name: "Owl's Head", region: 'Quebec', country: 'Canada', tz: 'America/Toronto', built: false, town: 'Mansonville', limited: true, baseFt: 730, summitFt: null, source: 'met' },
    { id: 'cardrona', name: 'Cardrona', region: 'Otago', country: 'New Zealand', tz: 'Pacific/Auckland', built: false, town: 'Wanaka', baseFt: 5400, summitFt: 6100, source: 'met' }
  ];

  // Place-name fixtures for the pin screen.
  var places = [
    { name: 'Lyndonville', region: 'Vermont, USA', lat: 44.534, lon: -72.003 },
    { name: 'East Burke', region: 'Vermont, USA', lat: 44.588, lon: -71.944 },
    { name: 'Lake Willoughby', region: 'Vermont, USA', lat: 44.748, lon: -72.062 },
    { name: 'Jay', region: 'Vermont, USA', lat: 44.936, lon: -72.504 }
  ];

  window.FC_MOCK = {
    fixtureNote: 'Fixture data for design review. Not a live forecast.',
    locale: 'en-US',
    today: '2026-12-04',                 // fixture "today" (a Friday) so the calendar never changes
    now: '2026-12-04T11:40:00Z',         // fixture "now": 6:40 AM in the fixture phone time zone
    phoneTz: 'America/New_York',
    days: 9,                             // Part 0 D2: nine date columns until phase 7
    hours: HOURS,
    skiHours: [9, 16],
    weights: WEIGHTS,
    bands: [
      { n: 5, min: 85, max: 100, label: 'Epic' },
      { n: 4, min: 70, max: 84, label: 'Great' },
      { n: 3, min: 55, max: 69, label: 'Good' },
      { n: 2, min: 40, max: 54, label: 'Fair' },
      { n: 1, min: 0, max: 39, label: 'Poor' }
    ],
    staleHours: 3,
    tripUncertainty: 3,                  // stand-in for the engine "uncertainty" field (open question Q5)
    mapMountain: 'jay-peak',             // the resort that is "open" on the map stand-in
    failedId: 'burke-mountain',          // fails to load in the partial state
    staleId: 'cannon-mountain',          // shows a stale forecast in the partial state
    offlineNoDetail: { id: 'cannon-mountain', day: 2 },   // offline: this day's score is saved but its hourly detail was never opened
    nearYou: ['jay-peak', 'burke-mountain', 'stowe'],   // fixture "Near you" list (location is never asked for here)
    goneEntry: { id: 'gone-hogback', kind: 'catalog', name: 'Hogback Mountain', region: 'Vermont', country: 'USA', tz: 'America/New_York', baseFt: 1900, summitFt: 2400, lat: 42.862, lon: -72.795, built: false, source: 'nws', hoursPublished: false, gone: true, days: null },
    watchlist: ['jay-peak', 'burke-mountain', 'cannon-mountain', 'niseko-hirafu', 'pin-burklyn-hill', 'cardrona'],
    tripDays: [0, 1, 2, 3],
    mountains: mountains,
    catalog: catalog,
    places: places,
    pinStart: { lat: 44.936, lon: -72.504 },
    text: TEXT,
    scoreOf: scoreOf,
    scoreDay: scoreDay,
    makeForecast: makeForecast
  };
})();

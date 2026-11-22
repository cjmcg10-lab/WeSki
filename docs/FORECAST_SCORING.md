# Forecast scoring engine (version 1.4.0)

Issue #2, part of #1. Version 1.3.0 is issue #5 (snow history, confidence, detail levels); the server side is in `docs/FORECAST_HISTORY.md`. Rules settled in #15. The engine is a pure ES module in `src/forecast/score/`: no network, no DOM, no clock. It turns the summit and base weather objects from `loadWeather()` into hourly and daily ski scores. This page is the contract for phase 2 (the calendar and day view). Change the shape here first, bump `SCORING_VERSION`, then change the code.

## Files

| File | What it holds |
| --- | --- |
| `version.js` | `SCORING_VERSION` |
| `components.js` | The four component curves, the snow-surface state, surface and precipitation codes, `WEIGHTS` |
| `hour.js` | Per-site and per-hour scoring, base/summit handling |
| `explain.js` | Hour factors, day factors, the day explanation, confidence |
| `day.js` | Ski window, best window, day score, status, `roundHalfUp` |
| `codes.js` | Every code the engine can emit (`CODES`, `ALL_CODES`) |
| `index.js` | The entry point `scoreForecast` and the public exports |

## Calling it

```js
import { scoreForecast, roundHalfUp, SCORING_VERSION } from './forecast/score/index.js';

const out = scoreForecast(resort, weather, opts);
```

`resort` is only `{ id, lat, lon, baseLat, baseLon, top, base, tz }`. The engine reads `id`, `top` and `base` (metres). Nothing else about the resort is used, so a catalog entry or a map pin works the same way.

`weather` is what `loadWeather()` returns: `{ summit, base }`, each an Open-Meteo-shaped object. Only `hourly` is read. Fields used, with units: `time` (local `YYYY-MM-DDTHH:00`), `temperature_2m` (°C), `apparent_temperature` (°C), `snowfall` (cm per hour), `wind_speed_10m` and `wind_gusts_10m` (m/s), `visibility` (m, may be null), `weather_code` (WMO). The server gives no hourly rain amount, so rain intensity comes from the weather code.

`opts` (all optional):

| Option | Meaning |
| --- | --- |
| `hours` | `{ from, to }` published operating hours, local, `to` exclusive. Without it the assumed window below is used and flagged |
| `closures` | `{ 'YYYY-MM-DD': closureSource \| true }` confirmed closures. Only the caller can say a day is closed |
| `season` | `{ open, close, state }` from the resort status: `state` is `'open'`, `'closed_for_season'` or `'not_open'`; `open` and `close` are local dates or `null`. A date is out of season when `state` is `closed_for_season` or `not_open`, before `open`, or after `close`. It only adds a note, never a closure |
| `liftHolds` | `[{ lift, status: 'delayed' \| 'partial', date, from?, to? }]` holds the resort has confirmed, for the dates they apply to. They are shown beside the score and never change it |
| `grooming` | `[{ at: 'YYYY-MM-DDTHH:MM' }]` timestamped grooming reports in the forecast's local time. Each one is applied to the snow surface at its hour (see Snow surface). A report from the 24 hours before the first weather hour counts as that first hour; anything older is ignored |
| `today` | `'YYYY-MM-DD'`, the local date that counts as day 0. Default: the first date in the weather |
| `history` | `{ summit, base }`, each `{ hourly }` in the weather's shape (optionally with `observed: boolean[]`): the hours before the forecast starts, as `GET /api/history/<id>` returns them. The engine ignores any hour at or after the first forecast hour, uses the last 72 valid ones, and carries the snow surface through them before the first forecast hour. Without it the surface starts clean (limited history) |
| `ageHours` | Age in hours of the weather model's issue (when the source last updated). A loose signal only: NWS grids go 6 to 12 h between updates. 18 h or more caps confidence at Medium and 30 h or more makes it Low (`CR_STALE`). Default: `weather.ageHours` |
| `fetchAgeHours` | Hours since the caller fetched this forecast (the phone's saved copy getting old). 6 or more is Low (`CR_STALE`). Never mixed with `ageHours`. Default: null |
| `stale` | `true` when the backup was served because no source answered. Default: `weather.stale`. Confidence is Low (`CR_STALE`) |
| `resolutionKm` | Nominal grid spacing of the weather model. Default: `weather.resolutionKm` |
| `elevationMismatchM` | Largest gap in metres between the model grid's ground height and the resort's summit or base. Default: worked out from `weather.gridElevation` and `resort.top`/`resort.base`; null when the source does not say |

A caller that passes the `/api/weather` response as `weather` only needs to add `history`: the source fields above ride along in that response.

## Output

```
{
  version: '1.4.0',
  ageHours,                   // opts.ageHours or weather.ageHours, or null
  inputs: { ageHours, stale, resolutionKm, elevationMismatchM, historyHours, observedHours },
  resortId,
  siteMode: 'both' | 'single',
  siteReason: null | 'summit_missing' | 'base_missing' | 'small_vertical' | 'identical_wind',
  hours: { from: 9, to: 16, assumed: true },
  days: [Day]
}
```

Day (one per local date in the weather):

| Field | Meaning |
| --- | --- |
| `date` | Local `YYYY-MM-DD` |
| `status` | `'ok'`, `'closed'` or `'insufficient'`. `ok` is the `scored` status in ux-prd section 8 (`range`, `trend`, `failed` and `ended` belong to later phases and to the app, not this engine) |
| `score` | Unrounded 0 to 100, or `null` unless `ok` |
| `mean` | Mean of the ski-hour scores, or `null` |
| `detail` | `'hourly'`, `'windows'`, `'range'`, `'trend'` or `'none'`: the finest detail the screens may show for this day (see Detail levels). Present on every day |
| `window` | `{ start, end, mean }` best 3 consecutive ski hours (local hours, `end` exclusive), or `null` when there are none |
| `broadWindow` | `{ part: 'morning' \| 'midday' \| 'afternoon', start, end, mean }`, the best third of the ski hours, when `detail` is `windows`, else `null`. Present on `ok` days only |
| `peakHour` | `{ time, hour, score }` the single best ski hour, or `null` |
| `skiHours` | `{ from, to, assumed, expected, withData }` (`withData` is absent on a closed day) |
| `hours` | Every hour of the date, see Hour. Empty on a closed day |
| `factors` | Up to 3 `{ component, code, params, points }` that moved the day most, biggest first |
| `explain` | `{ code, params }` one-sentence explanation (slot `explain`), or `null` unless `ok` |
| `confidence` | `{ level: 'High' \| 'Medium' \| 'Low', reason: { code, params } }`, or `null` unless `ok` |
| `windowConfidence` | Same shape, for the timing of the best window |
| `insufficientReason` | `{ code, params }`, present only when `status` is `insufficient` |
| `closureSource` | The `{ code, params }` the caller passed, or `null`, present only when `closed` |
| `flags` | Strings: `snow_history_limited` (when the history before the forecast covers under 48 valid hours), `stale_source`, `assumed_hours`, `single_estimate`, `partial_sites`, `window_under_3h`, `lift_hold_confirmed`, `grooming_reported` |
| `liftHolds` | `[{ lift, status, from, to }]` the confirmed holds for this date (`from` and `to` are `null` when the resort gave no times), always an array |
| `notes` | `[{ code, params }]` facts shown beside the day: `EX_LIFT_HOLD_CONFIRMED` [number of holds] and `NT_OUT_OF_SEASON`. Always an array. Not part of `explain` and never changes `score` or `status` |
| `daysAhead` | Whole days from `today` |
| `uncertainty` | Always `null` in version 1. It stays null until there are several forecasts or ensemble members to compare, so no Close call shows |

Hour:

| Field | Meaning |
| --- | --- |
| `time`, `date`, `hour` | The local label from the weather, its date, and its hour number |
| `ski` | `true` when the hour is inside the ski window |
| `score` | Unrounded hour score, or `null` when the hour has no data |
| `components` | Combined `{ surface, visibility, wind, comfort }`, each 0 to 100 |
| `sites` | `'both'`, `'base'`, `'upper'` (only one site had data), `'single'` (one estimate), or `null` |
| `base`, `upper` | A site, or `null` when that site was not used |
| `factor` | `{ code, component, params, points }` the main factor of the hour |
| `hold`, `holdLoss` | Largest predicted-hold risk (0 to 1) across the sites used, and the score points it removed (mean over sites) |

Site: `{ score, hold, holdLoss, components, precip: { code, params }, surface: { code, params }, detail }`. `detail` is the inputs and surface state the explanations were drawn from (`fresh`, `crust`, `wet`, `rain`, `snow`, `fog`, `vis`, `feels`, `wind`, `gust`, `t`, `site`). It is for debugging and tests, and screens should not show it.

Values are never rounded in the output. Use `roundHalfUp(x)` for display only. Sorting, comparing and any Close call use the unrounded values.

## The four components

Each is 0 to 100 at a site and hour. Curves go through the listed points and ease smoothly between them (a smoothstep on each segment), so there are no hard cutoffs.

Hour score at a site = 0.45 surface + 0.25 visibility + 0.20 wind + 0.10 comfort.

**Snow surface (45).** A state `{ fresh, crust, wet }` is carried forward hour by hour over the hours the weather contains (local midnight onward). Score = 78 + 22 × (1 − e^(−fresh/6)) − 55 × crust − 60 × wet, limited to 0 to 100. The 78 is a firm groomed surface, so a clear grippy groomer day scores well with no new snow.

- Start: `fresh` 0, `crust` 0, `wet` 0.2 if the first hour is above 1 °C, else 0.
- Snowfall at or below −0.5 °C adds its centimetres to `fresh`. Warmer snow adds half and wets the surface by 0.2. Snowfall buries crust (crust × max(0, 1 − snow/3)).
- Rain adds 0.3 × intensity (1 to 3 from the weather code) to `wet` and takes 15% off `fresh`.
- Above 0 °C: `wet` grows by up to 0.3 an hour in the day (9:00 to 16:00) and 0.15 at night (daytime softening), scaled by temperature up to 6 °C; `crust` and `fresh` melt away.
- Below −1 °C: 30% of `wet` an hour refreezes into `crust` (rain, then refreeze).
- Every hour: `crust` × 0.985, `fresh` × 0.97 in the day and × 0.995 at night (tracked out), × 0.98 more when wind is above 10 m/s.

The wet and crust penalties are steep on purpose: steady moderate rain on snow lands below about 45 for the day, and a hard refreeze costs the surface up to 55 points. Thunder counts as rain only when it is above 0 °C with no snowfall; thundersnow is snow.

A grooming report (`opts.grooming`) is applied once, at the hour of its timestamp, before that hour's step: `crust` × 0.25 and `wet` × 0.7 (groomers break up a crust and firm a wet surface). The resort feed's report time is the time it updated the trail, so this is a deliberately small effect. A report mapped to the first hour of day 0 meets the starting surface (no crust, wet 0 or 0.2), so it changes little there and mostly sets the `grooming_reported` flag.

**History (1.3.0).** With `opts.history` the state is first stepped through the up to 72 valid hours before the first forecast hour, with the same rules, then continues into the forecast, so rain then refreeze, fresh snow over a firm base and overnight softening carry into the first hour. The state starts from the first history hour as it would from the first forecast hour. A site's history must cover the hours before the forecast starts; hours at or after the first forecast hour are ignored, so the overlap with today's earlier hours is harmless. Gaps are not filled: the state steps across the hours that exist. `inputs.historyHours` is the number of valid history hours used (the smaller of summit and base when both are scored) and `inputs.observedHours` is the largest count of those that a station measured, snowfall included (`observed[i]` is true only for such hours). With at least 48 valid hours the `snow_history_limited` flag and the `CR_SNOW_HISTORY_LIMITED` reason are dropped. Without history every day carries the flag and Medium at best.

**Visibility (25).** The lowest of: distance (100 m → 0, 500 → 25, 2,000 → 60, 6,000 → 90, 12,000 and more → 100); snowfall in cm an hour (0 → 100, 0.5 → 92, 1.5 → 65, 3 → 35, 5 → 10); rain intensity (none 100, light 65, moderate 45, heavy 30); fog weather code (20). A null visibility counts as 100 for the distance term only; the other terms still apply. **Limitation:** the weather shape has no cloud cover, so v1 cannot tell fog on the summit from harmless high cloud. Fog comes only from visibility and the fog weather codes.

**Wind (20).** Strength = the larger of the wind speed and 0.65 × the gust, in m/s. Points: 0 → 100, 4 → 98, 8 → 86, 12 → 60, 16 → 30, 20 → 10, 26 and more → 0. This is a predicted wind effect only. A confirmed lift hold from the resort is a different thing: it is reported in `liftHolds` and `notes` with `EX_LIFT_HOLD_CONFIRMED`, it does not move the wind component or the day score, and the wind codes (`F_STRONG_GUSTS`, `EX_SUMMIT_WIND`) are never emitted because of it.

**Predicted hold rule (v1, uncalibrated).** Wind strong enough to stop upper lifts must not leave the Good or Great bands. Per site and hour, risk = the larger of a smooth ramp on sustained wind from 14 m/s (0) to 18 m/s (1) and a smooth ramp on gusts from 20 m/s (0) to 25 m/s (1). The site score is then pulled toward a cap of 35 (the Poor band): `score − risk × max(0, score − 35)`. The component scores are not changed; `holdLoss` records the points removed, and the hour factor and day explanation count them as wind. This is only a prediction from the forecast. It does not say a lift is closed, and it is kept apart from the confirmed lift holds of #10. The values (14/18, 20/25, cap 35) were chosen without calibration and are to be tuned in phase 8. **Upper-lift hold (1.4.0).** When both sites are scored and the upper site has a hold risk, the hour score is also pulled toward a cap of 50 by the upper risk: `score − upperRisk × max(0, score − 50)`. The upper lifts are the way to the upper terrain, so a calm base cannot carry a day when they would stop. A full upper hold lands a day at 50 at best (Fair). The extra loss is added to `holdLoss`. With a single estimate the rule does not apply, because there is only one site and the cap of 35 already covers it. Calibration round 1 below is the evidence.

**Comfort (10).** Feels-like temperature (−35 °C → 0, −25 → 25, −18 → 58, −10 → 92, −4 to +3 → 100, 6 → 85, 9 → 60, 13 → 30), multiplied by a rain factor (1, 0.4, 0.25, 0.15 for none, light, moderate, heavy) and a snowfall factor (0 cm → 1, 1 → 0.92, 3 → 0.78).

## Hour, base and summit

- Hour score = the mean of the base and upper site scores when both are valid. Both parts are kept.
- A site is valid for an hour when it has temperature, wind and snowfall. Gust falls back to wind and feels-like to temperature. An hour with no valid site has no score.
- If only one site is valid for an hour, that site is used, `sites` is `'base'` or `'upper'`, and the day gets `partial_sites` and Low confidence.
- If the source cannot tell base and summit apart, the engine gives one estimate from the base data, `siteMode` is `'single'`, the day gets `single_estimate`, and confidence is Low (`CR_ONE_ESTIMATE`). That happens when: the summit has no valid hour (`summit_missing`); the base has no valid hour, in which case the summit is the one estimate (`base_missing`); the resort's `top − base` is under 100 m (`small_vertical`; when `top` or `base` is missing, as for a map pin, this rule is skipped and the two weather points are used as given); or wind and gusts are identical for every hour that both sites have, at least 6 of them (`identical_wind`). The engine never copies a value from one site to invent the other.

## Day

- Ski hours: the hours from `from` up to but not including `to`. Assumed window: 9:00 to 16:00 local (7 hours: 9, 10, 11, 12, 13, 14, 15), always labelled `assumed: true` and flagged `assumed_hours`. Pass `opts.hours` (from the resort status, whole local hours with `to` exclusive) to replace it; without published hours the assumed window stays and stays labelled.
- Day score = 0.60 × mean(ski hours with data) + 0.40 × best window mean. Example: mean 70, best window 85 gives 76.
- Best window = the highest mean of 3 consecutive ski hours that all have data. Isolated hours with gaps between never form one. **Tied windows: the earliest start wins** (means are compared with a tolerance of 1e-9 so float noise does not decide).
- No 3 consecutive hours with data: the window term is dropped, day = mean, `window` is `null`, the flag `window_under_3h` is set, and the day view says "Best window: under 3 hours of data" (#15).
- **Insufficient** when fewer than 3 ski hours have data, or more than half of the ski hours are missing. With the assumed 7 hours a day needs 4 hours with data. A window of under 3 hours (a short operating day) is always Insufficient.
- **Closed** only when the caller passes a confirmed closure for the date. The engine never infers a closure from weather or from the season. A day outside the season, or with the resort not yet open, stays scored and carries the note `NT_OUT_OF_SEASON`.
- Dates are the date part of the weather's local time strings. Nothing is converted through UTC, so a daylight-saving change cannot move an hour to another date. The spring day has 23 hours; the fall day has 25, with the 01:00 label twice (both are kept in `hours`; in the ski-window statistics the first valid hour with a given label is used). Surface state is carried across every hour in order.
- Peak hour: the best single ski hour, the earliest on a tie.

## Confidence

Rated separately for the day and for the timing of its best window. Every threshold is a first guess, uncalibrated, to be tuned in phase 8. There is still no second forecast to compare, so agreement between models is not a factor yet (phase 7).

| Condition (first that applies) | Day level | Day reason |
| --- | --- | --- |
| One site estimate | Low | `CR_ONE_ESTIMATE` |
| Some hours had only one site | Low | `CR_PARTIAL_SITES` |
| `stale`, or `fetchAgeHours` of 6 or more, or `ageHours` of 30 or more | Low | `CR_STALE` `[hours]` |
| 6 or more days ahead | Low | `CR_FAR_AHEAD` `[days]` |
| Model ground height 1,000 m or more off the resort | Low | `CR_ELEVATION_MISMATCH` `[metres]` |
| `ageHours` of 18 or more (under 30) | Medium | `CR_STALE` `[hours]` |
| 3 to 5 days ahead | Medium | `CR_FAR_AHEAD` `[days]` |
| Model ground height 500 m or more off the resort | Medium | `CR_ELEVATION_MISMATCH` `[metres]` |
| Coarse grid (`resolutionKm` 8 or more: MET Norway's global model outside the Nordics and the USA) | Medium | `CR_COARSE_GRID` `[km]` |
| Under 48 valid history hours | Medium | `CR_SNOW_HISTORY_LIMITED` |
| Under 24 history hours measured by a station, snowfall included (an hour whose station gave no precipitation total does not count) | Medium | `CR_NO_OBSERVATIONS` |
| Otherwise (0 to 2 days ahead, 48 or more history hours, 24 or more of them measured with snowfall, a fine grid, a model height within 500 m of the resort) | High | `CR_HISTORY_COVERED` |

High needs measured snowfall, not only forecast hours or a station's temperature and wind standing in for history, so outside the USA (no observation source) it is not reached until phase 7 adds a second source. An unknown model height (MET Norway does not report one) never lowers the level by itself.

Window timing: no window → Low, `WR_NO_WINDOW`; 3 or more days ahead → Low, `WR_TOO_FAR_AHEAD`; `stale`, `fetchAgeHours` of 6 or more or `ageHours` of 30 or more → Low, `WR_STALE` `[hours]`; `ageHours` of 18 or more → Medium, `WR_STALE` `[hours]`; assumed hours → Medium, `WR_HOURS_ASSUMED`; otherwise High, `WR_STABLE`, when the day is High and it is today or tomorrow, else Medium, `WR_STABLE`.

## Detail levels

`day.detail` says the finest detail the screens may show, counted in days from `today` (day 0). The engine still computes the hourly rows for every day it is given, so the screens, not the engine, hide what a day's level does not allow. The engine invents no hourly precision, ranges or percentages.

| `daysAhead` | `detail` | What the screen may show |
| --- | --- | --- |
| 0 to 1 | `hourly` | The full hourly view, the best 3-hour window and the peak hour. Day 1 ends at most 48 hours after the first hour of day 0, so hourly stops at 48 hours; day 2 reaches 72 hours and therefore uses `windows` |
| 2 to 5 | `windows` | The day score and `broadWindow` (morning, midday or afternoon), no hours |
| 6 to 9 | `range` | A range only. The engine has one deterministic forecast and cannot make a range, so until ensemble members exist (phase 7) show the day as an outlook with no hours, no window and no range |
| 10 to 14 | `trend` | A trend only (phase 7 or later); nothing numeric from this engine |
| 15 or more | `none` | Nothing |

The weather source gives 7 days of hours today, so `range` and later levels do not occur yet.

## Codes

The engine returns `{ code, params }` and never a sentence. A parameter is a raw number (an hour is the local hour 0 to 23, a count is a number); the UI formats it. Codes are opaque strings. English templates for the codes that already exist are in `design/forecast/ux-prd.md` section 8.

**Rule: a new code ships with its English text in `src/i18n/en.js` (new number) and its translation in all nine other language files, in the same pull request.** `tests/forecast-score.test.js` fails if the engine can emit a code that is not in `codes.js` or not listed on this page. Phase 2 adds the templates; no UI text is added in phase 1. Phase 10 (#10) adds `EX_LIFT_HOLD_CONFIRMED` and `NT_OUT_OF_SEASON`.

**Twin codes.** The design lists some meanings twice (an upper-case name and a dotted name). The engine emits the upper-case one wherever there is a twin, and the dotted names only where there is no upper-case equivalent. So these dotted codes are never emitted and can be dropped from the design: `conf.agree`, `conf.snow_amount`, `conf.far`, `conf.rain_snow`, `conf.one_point`, `conf.stale`, `timing.snow_arrival`, `timing.wind_ease`, `explain.fresh_wind_drop`, `explain.firm_flat`, `explain.leftover`, `explain.packed`, `explain.thaw`, `outlook.broad`, `insuff.summit_missing`, `insuff.not_loaded`, `insuff.too_few_hours`, `f.flat`, `f.firm`, `f.refreezing`, `f.softening`, `f.gusts_summit`. The hourly main-factor and score-part caption sets (`f.*`, `p.*`) from the prototype are replaced by the `F_*` factor codes below plus the component each factor belongs to (`component` in the output), which phase 2 maps to a part caption.

`explain` (day, one code; parameters in brackets):

- `EX_FRESH_SNOW_FIRM_BASE`
- `EX_FRESH_SNOW_WIND_EASES` [hour the wind eases]
- `EX_GROOMED_FIRM_FAST`
- `EX_SOFTENING_SUN` [hour softening starts]
- `EX_THAW_REFREEZE`
- `EX_FLAT_LIGHT_GUSTS_PM`
- `EX_RAIN_AT_BASE` (rain at the base while the upper site has snow and no rain)
- `EX_SUMMIT_WIND`
- `EX_COLD`
- `EX_MIXED`
- `EX_LOW_VISIBILITY` (new, needs ten translations in phase 2)
- `EX_WARM_WET` (new, needs ten translations in phase 2)
- `EX_WARM_SOFT` (new in 1.1: comfort driven by warmth)
- `EX_RAIN_WHOLE_MOUNTAIN` (new in 1.1: rain at every site used, or the only site)

`confReason` and `windowReason` and `insufficientReason`:

- `CR_ONE_ESTIMATE`, `CR_PARTIAL_SITES` (new), `CR_STALE` [hours], `CR_FAR_AHEAD` [days], `CR_SNOW_HISTORY_LIMITED` (new)
- New in 1.3.0 (need ten translations in the screens' pull request): `CR_HISTORY_COVERED` (High: a measured, complete recent history), `CR_NO_OBSERVATIONS` (history is model hours only), `CR_COARSE_GRID` [km], `CR_ELEVATION_MISMATCH` [metres]
- `WR_HOURS_ASSUMED`, `WR_STABLE`, `WR_TOO_FAR_AHEAD`, `WR_NO_WINDOW` (new), `WR_STALE` [hours] (new in 1.3.0)
- `IR_TOO_FEW_HOURS` [hours with data], `IR_SUMMIT_MISSING`, `IR_SERVICE_UNAVAILABLE`

`factor` (hour main factor, day factors, and what moved the score):

- `F_FRESH_SNOW`, `F_FIRM_SURFACE`, `F_ICY_REFROZEN`, `F_SOFT_SNOW`, `F_WET_SNOW`
- `F_GOOD_VISIBILITY`, `F_FLAT_LIGHT`, `F_SUMMIT_FOG`, `F_HEAVY_SNOWFALL`
- `F_STRONG_GUSTS`
- `F_COLD` (feels like −10 °C or colder), `F_RAIN`, `F_TOO_WARM` (new in 1.1, feels like +3 °C or warmer), `F_COMFORTABLE`
- `F_FOG` (new in 1.1: fog at the base; `F_SUMMIT_FOG` is used only for the upper site)

Which factor is chosen: each component's weighted distance from its reference (surface 78, the others 100) is `points`. The hour takes the component with the largest absolute `points` across its sites; under 1 point it is `F_GOOD_VISIBILITY` (visibility 95 or better) or `F_FIRM_SURFACE`. The day takes up to 3 components whose mean moves the day by 1.5 points or more.

`precip` (per site and hour; a whole label):

- `precip.none`, `precip.light_snow` (up to 0.5 cm an hour), `precip.snow` (0.5 to 1.5), `precip.heavy_snow` (1.5 and more)
- `precip.drizzle` and `precip.heavy_rain` are reserved: the server only sends weather codes 61, 63, 66, 68 and 95, so v1 never emits them (kept for sources that send drizzle or heavy-rain codes). Rain intensity 3 is likewise reserved.
- `precip.rain`, `precip.freezing_rain`, `precip.mixed` (sleet, or rain and snow together)

`surface` (per site and hour; a whole label; first match in this order):

- `surf.icy` (crust 0.4 or more, fresh under 3 cm)
- `surf.wet_snow` (wet 0.5 or more, or rain with wet 0.3 or more)
- `surf.deep_fresh` (fresh 15 cm or more)
- `surf.fresh_packed` (fresh 3 cm or more, wind 10 m/s or more) and `surf.fresh_firm` (fresh 3 cm or more)
- `surf.softening` (wet 0.2 or more)
- `surf.scoured` (wind 14 m/s or more and below −2 °C)
- `surf.firm_groomed` (otherwise)

`note` (day `notes`):

- `EX_LIFT_HOLD_CONFIRMED` [number of confirmed holds that date] (new, needs ten translations in phase 2)
- `NT_OUT_OF_SEASON` (new, needs ten translations in phase 2)

`closureSource`: supplied by the caller with the closure, passed through unchanged (for example `closed.ops_report` with the mountain name). The engine invents none, so none is listed.

Codes in ux-prd section 8 that the engine does not emit in v1: `F_LIGHT_WIND` (dropped: wind only ever subtracts), `IR_NO_SNOW_HISTORY` (not needed: missing history lowers confidence, it does not block a score), `CR_NEAR_TERM_AGREE`, `CR_MODELS_DISAGREE_PRECIP_TYPE`, `CR_MODELS_DISAGREE_TIMING` (later, phase 7, needs several forecasts), `CR_PIN_ONE_POINT`, `CR_ELEVATION_UNKNOWN` (later, phase 5, map pins), `WR_SNOW_ARRIVAL_UNCERTAIN`, `WR_WIND_SHIFT_UNCERTAIN`, `WR_CLEARING_UNCERTAIN` (later, phase 7).

`outlook` codes (days 6 to 9) are not produced in phase 1.

## Not in version 1

Several forecasts or ensemble members and with them `uncertainty`, model agreement in confidence and ranges for days 6 to 9 (phase 7), calibration of the numbers against a season of real days (round 1 below used past airport observations only), days 6 to 15 as ranges or trends (the weather source only gives 7 days of hours today).

## Tests

`tests/forecast-score.test.js` with fixtures in `tests/fixtures/forecast/`. `real-stowe-2026-11-22.json` is a real `/api/weather` response (hourly blocks only). The five `scenario-*.json` files are derived from it by editing values; each says so in `_label`.

`tests/forecast-history.test.js` covers the engine's history, confidence and detail levels (version 1.3.0); `tests/forecast-store.test.js` covers the server side (history store, observations, archive, stale fallback) with recorded NWS stations and observations (`nws-stations-stowe.json`, `nws-obs-kmvl.json`, real responses trimmed to the fields the app reads).

`tests/forecast-status.test.js` covers the resort-status side with recorded feeds `status-mtnpowder-*.json` (trimmed real responses): the normaliser, an assumed window, a confirmed closure, a short operating day, a confirmed lift hold kept apart from wind, and out of season without a closure. See `docs/FORECAST_SOURCES.md` for where the status comes from.

## Calibration round 1 (version 1.4.0)

Done for #9. It is a first pass on past weather. Real calibration needs a season of archived forecasts and skier feedback, which does not exist yet.

**Data.** Hourly airport observations from NOAA NCEI "global-hourly" (public domain, no key, User-Agent `weski-build`), turned into the engine's weather shape by `tools/forecast_backtest.mjs`: temperature, wind, gust and visibility are measured; snowfall is estimated from the intensity in the METAR present-weather code (light 0.4, moderate 1, heavy 2 cm an hour); feels-like is wind chill. Open-Meteo is not used. Recordings are in `tests/fixtures/forecast/backtest/` (Mammoth Lakes, a Stowe-area airport, Mount Washington summit with a valley airport). These are airports, not ski slopes: they show how the engine orders days, not how many points a slope earned.

**Memorable days, before (1.3.1) and after (1.4.0).**

| Day | What happened | Before | After |
| --- | --- | --- | --- |
| Mammoth 2023-02-24 | powder storm, heavy snow, visibility 400 m | 75.5 Great | 75.5 Great |
| Mammoth 2023-02-26 | bluebird after the storm | 95.1 Epic | 95.1 Epic |
| Stowe 2023-12-18 | rain on snow, 16 C, gusts to 22 m/s | 44.6 Fair | 44.6 Fair |
| Stowe 2023-12-22 | cold and calm four days later | 82.8 Great | 82.8 Great |
| Mount Washington 2023-02-03 | summit gale 45 m/s, valley calm | 56.5 Good | 50.0 Fair |
| Mount Washington 2023-01-31 | summit gale 34 m/s, valley calm | 71.3 Great | 65.6 Good |
| Mammoth 2023-03-14 | warm wet snow and rain | 51.7 Fair | 51.7 Fair |
| Mammoth 2023-03-18 | clear day after the warm spell refroze | 79.7 Great | 79.7 Great |

The ordering is right everywhere: bluebird over storm, calm cold over rain, clear after refreeze over warm and wet. The one clear fault was the summit gale. With the upper lifts almost certainly on hold, the day still scored Good or Great because the calm valley half pulled the mean up. That is the change in 1.4.0 (upper-lift hold above). Nothing else was changed: the other days had no evidence against them. Points still open, not changed for lack of evidence: very windy days with near-zero visibility scored 56 to 69, and comfort has only 10% weight.

**An 80 means the same day everywhere.** The same recorded weather (Mount Washington summit and valley) was given to four resort profiles. Alpine (3,300 / 1,800 m), Japanese (1,400 / 700 m) and Southern Hemisphere (2,054 / 1,720 m) profiles score identically on every day, because the engine uses only the weather, the two heights' difference and no latitude or hemisphere. The small low hill (70 m vertical) scores from the valley data alone by design (`small_vertical`), so a summit gale does not reach it: 78.1 against 50.0 on the gale day. That is intended, a 70 m hill has no separate summit. Dates and season are local, so a Southern Hemisphere July day is scored as winter weather like any other.

**Rerun.** `node tools/forecast_backtest.mjs` scores the recorded days; add `--fetch` to download them again. After a season, export each resort with `GET /api/forecast-archive/<id>` (needs the owner's `ARCHIVE_ADMIN_SECRET`, see `docs/PRIVACY_DATA.md`) and run `node tools/forecast_calibrate.mjs --fetch <origin> --ids a,b --since <date>` with `ARCHIVE_ADMIN_KEY` set. It reports score against skier ratings (rank correlation), resort order on the same day, best-window timing and lead-time error. Change a weight or threshold only when those numbers clearly support it, bump `SCORING_VERSION` and add a "Calibration round N" section here.

import { t, getLang } from '../i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function locale() {
  const l = getLang();
  const phone = typeof navigator === 'undefined' ? '' : navigator.language || '';
  return phone.slice(0, 2) === l ? phone : l;
}

export const CODE_TEXT = {
  EX_FRESH_SNOW_FIRM_BASE: 'Fresh snow on a firm base.',
  EX_FRESH_SNOW_WIND_EASES: 'Fresh snow, and the wind eases after {0}.',
  EX_GROOMED_FIRM_FAST: 'Firm, fast groomed snow and good visibility.',
  EX_SOFTENING_SUN: 'Firm early, softening in the sun from {0}.',
  EX_THAW_REFREEZE: 'A thaw and refreeze leaves the surface firm and icy.',
  EX_FLAT_LIGHT_GUSTS_PM: 'Flat light and stronger gusts build in the afternoon.',
  EX_RAIN_AT_BASE: 'Rain is likely at the base, with snow higher up.',
  EX_SUMMIT_WIND: 'Strong summit wind holds the score down.',
  EX_COLD: 'Very cold, with wind chill well below the air temperature.',
  EX_MIXED: 'Packed snow and a steady breeze make a fair all-round day.',
  EX_LOW_VISIBILITY: 'Low visibility holds the score down.',
  EX_WARM_WET: 'Warm and wet, so the snow will be soft and heavy.',
  EX_WARM_SOFT: 'Warm weather softens the snow.',
  EX_RAIN_WHOLE_MOUNTAIN: 'Rain is likely across the whole mountain.',
  EX_LIFT_HOLD_CONFIRMED: 'The resort has confirmed {0} lift hold(s) for this day.',
  NT_OUT_OF_SEASON: 'This day is outside the resort’s published season.',
  CR_ONE_ESTIMATE: 'The weather service can’t tell the base and summit apart here.',
  CR_PARTIAL_SITES: 'Part of the day has a forecast for only the base or the summit.',
  CR_STALE: 'The forecast is {0} hours old because the weather service is delayed.',
  CR_FAR_AHEAD: 'This day is {0} days away, so details can still change.',
  CR_SNOW_HISTORY_LIMITED: 'Snow history is limited: snow from before today isn’t counted yet, so confidence stays at Medium or lower.',
  WR_HOURS_ASSUMED: 'Ski hours here are assumed, not published.',
  WR_STABLE: 'Conditions are steady through the day.',
  WR_TOO_FAR_AHEAD: 'Timing isn’t predictable this far ahead.',
  WR_NO_WINDOW: 'Fewer than 3 hours in a row have a forecast.',
  IR_TOO_FEW_HOURS: 'Ski hours with a forecast: {0}.',
  IR_SUMMIT_MISSING: 'The summit forecast is missing for part of the day.',
  IR_SERVICE_UNAVAILABLE: 'The weather service has no forecast for this day.',
  F_FRESH_SNOW: 'Fresh snow',
  F_FIRM_SURFACE: 'Firm surface',
  F_ICY_REFROZEN: 'Refrozen, icy surface',
  F_SOFT_SNOW: 'Soft snow',
  F_WET_SNOW: 'Wet, heavy snow',
  F_GOOD_VISIBILITY: 'Good visibility',
  F_FLAT_LIGHT: 'Flat light',
  F_SUMMIT_FOG: 'Fog on the summit',
  F_HEAVY_SNOWFALL: 'Heavy snowfall',
  F_STRONG_GUSTS: 'Strong gusts',
  F_COLD: 'Very cold',
  F_RAIN: 'Rain',
  F_COMFORTABLE: 'Comfortable temperature',
  F_TOO_WARM: 'Too warm',
  F_FOG: 'Fog',
  'precip.none': 'No precipitation',
  'precip.light_snow': 'Light snow',
  'precip.snow': 'Snow',
  'precip.heavy_snow': 'Heavy snow',
  'precip.drizzle': 'Drizzle',
  'precip.rain': 'Rain',
  'precip.heavy_rain': 'Heavy rain',
  'precip.freezing_rain': 'Freezing rain',
  'precip.mixed': 'Mixed rain and snow',
  'surf.firm_groomed': 'Firm groomed',
  'surf.fresh_firm': 'Fresh snow on firm base',
  'surf.fresh_packed': 'Fresh snow, wind packed',
  'surf.deep_fresh': 'Deep fresh snow',
  'surf.scoured': 'Wind scoured',
  'surf.softening': 'Softening',
  'surf.wet_snow': 'Wet snow',
  'surf.icy': 'Icy',
};

const HOUR_PARAM = new Set(['EX_FRESH_SNOW_WIND_EASES', 'EX_SOFTENING_SUN']);

export function fmtHour(hour) {
  return new Date(2000, 0, 2, hour % 24).toLocaleTimeString(locale(), { hour: 'numeric' });
}

export const fmtHourRange = (from, to) => `${fmtHour(from)}–${fmtHour(to)}`;

export function codeText(item, fallback = 'No explanation is available for this day.') {
  const en = item && CODE_TEXT[item.code];
  if (!en) return t(fallback);
  const params = (item.params ?? []).map((p) => (HOUR_PARAM.has(item.code) ? fmtHour(p) : Math.round(p)));
  return t(en, ...params);
}

export function ageText(hours) {
  if (hours < 0.25) return t('Updated just now');
  if (hours < 1) return t('Updated {0} min ago', Math.round(hours * 60));
  if (hours < 24) return t('Updated {0} h ago', Math.round(hours));
  return t('Updated {0} d ago', Math.round(hours / 24));
}

export const fmtWeekday = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' });
export const fmtDayNumber = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric' });
export const fmtLongDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtShortDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });

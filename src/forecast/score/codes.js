export const CODES = {
  explain: [
    'EX_FRESH_SNOW_FIRM_BASE', 'EX_FRESH_SNOW_WIND_EASES', 'EX_GROOMED_FIRM_FAST', 'EX_SOFTENING_SUN', 'EX_THAW_REFREEZE',
    'EX_FLAT_LIGHT_GUSTS_PM', 'EX_RAIN_AT_BASE', 'EX_SUMMIT_WIND', 'EX_COLD', 'EX_MIXED', 'EX_LOW_VISIBILITY', 'EX_WARM_WET',
    'EX_WARM_SOFT', 'EX_RAIN_WHOLE_MOUNTAIN',
  ],
  note: ['EX_LIFT_HOLD_CONFIRMED', 'NT_OUT_OF_SEASON'],
  confReason: ['CR_ONE_ESTIMATE', 'CR_PARTIAL_SITES', 'CR_STALE', 'CR_FAR_AHEAD', 'CR_SNOW_HISTORY_LIMITED'],
  windowReason: ['WR_HOURS_ASSUMED', 'WR_STABLE', 'WR_TOO_FAR_AHEAD', 'WR_NO_WINDOW'],
  insufficientReason: ['IR_TOO_FEW_HOURS', 'IR_SUMMIT_MISSING', 'IR_SERVICE_UNAVAILABLE'],
  factor: [
    'F_FRESH_SNOW', 'F_FIRM_SURFACE', 'F_ICY_REFROZEN', 'F_SOFT_SNOW', 'F_WET_SNOW', 'F_GOOD_VISIBILITY', 'F_FLAT_LIGHT',
    'F_SUMMIT_FOG', 'F_HEAVY_SNOWFALL', 'F_STRONG_GUSTS', 'F_COLD', 'F_RAIN', 'F_COMFORTABLE', 'F_TOO_WARM', 'F_FOG',
  ],
  precip: [
    'precip.none', 'precip.light_snow', 'precip.snow', 'precip.heavy_snow', 'precip.drizzle', 'precip.rain',
    'precip.heavy_rain', 'precip.freezing_rain', 'precip.mixed',
  ],
  surface: [
    'surf.firm_groomed', 'surf.fresh_firm', 'surf.fresh_packed', 'surf.deep_fresh', 'surf.scoured', 'surf.softening',
    'surf.wet_snow', 'surf.icy',
  ],
  closureSource: [],
};

export const ALL_CODES = Object.values(CODES).flat();

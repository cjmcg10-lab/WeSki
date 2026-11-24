// What the start-screen globe shows for each mountain: a little peak whose height comes from the
// mountain's vertical drop (greatly exaggerated, so heights can be compared at a glance).
// Pure functions, so they can be tested without a browser.

/** Vertical drop (m) used when a mountain's summit or base height is not known. */
export const DEFAULT_DROP = 500;
/** Drops at or above this get the tallest peak. */
export const MAX_DROP = 2400;

/**
 * Peak height on the globe, 0.25 to 1 (1 = the tallest), from the vertical drop in metres.
 * A square root keeps a 300 m hill visible while a 2,000 m Alpine resort still stands about
 * two and a half times taller.
 */
export function peakHeight(drop) {
  const d = Number.isFinite(drop) && drop > 0 ? drop : DEFAULT_DROP;
  return Math.max(0.25, Math.min(1, Math.sqrt(d / MAX_DROP)));
}

/** A place's vertical drop in metres, or null when its summit or base height is missing. */
export function dropOf(p) {
  return Number.isFinite(p?.top) && Number.isFinite(p?.base) && p.top > p.base ? p.top - p.base : null;
}

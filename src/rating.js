// How a run's rating is shown. North America rates runs green circle / blue square / black
// diamond. Europe and Japan colour the piste itself: green, blue, red, black, and yellow for
// marked freeride routes. A resort says which with `scheme` ('us' when absent); its runs then
// carry `c`, the colour class, next to `d`, the four-step level directions work with.
const US = {
  id: 'us', colors: ['#1fa750', '#2b7de9', '#16181d', '#a3122f'], syms: ['●', '■', '◆', '◆◆'], css: ['d0', 'd1', 'd2', 'd3'],
  names: ['Green', 'Blue', 'Black', 'Double black'], limit: [0, 1, 2, 3],
  legend: ['Easier (green circle)', 'More difficult (blue square)', 'Most difficult (black diamond)', 'Extreme terrain'],
  lift: '#e03131', liftInk: '#b01d1d', liftWord: 'red',
};
const EU = {
  id: 'eu', colors: ['#1fa750', '#2b7de9', '#e0262d', '#16181d', '#d99a00'], syms: ['●', '●', '●', '●', '◆'], css: ['r0', 'r1', 'r2', 'r3', 'r4'],
  names: ['Green', 'Blue', 'Red', 'Black', 'Freeride'], limit: [1, 2, 3, 4],
  legend: ['Very easy (green piste)', 'Easy (blue piste)', 'Intermediate (red piste)', 'Difficult (black piste)', 'Freeride / ski route (yellow)'],
  // red is a piste colour here, so lifts are drawn in slate as on European piste maps
  lift: '#4f5b6b', liftInk: '#39424e', liftWord: 'grey',
};

export const scheme = (R) => (R && R.scheme && R.scheme !== 'us' ? EU : US);
/** Colour class of a run (or of anything with a level `d`, like a step of directions). */
export const cls = (R, t) => { const s = scheme(R); return s === EU ? (t.c ?? s.limit[t.d]) : t.d; };
export const runColor = (R, t) => scheme(R).colors[cls(R, t)];
export const runSym = (R, t) => scheme(R).syms[cls(R, t)];
export const runCss = (R, t) => scheme(R).css[cls(R, t)];
/** Name of level `d` as the "my hardest trail" limit: Green/Blue/Black/Double black, or Blue/Red/Black/Freeride. */
export const levelName = (R, d) => { const s = scheme(R); return s.names[s.limit[d]]; };
/** The colour classes this resort actually uses, for its legend. */
export const classesUsed = (R) => [...new Set([...R.trails, ...(R.areas || [])].map((t) => cls(R, t)))].sort();

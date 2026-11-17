// What a rider looks like. Stored in the profile's `avatar` string so it travels to the group
// unchanged: "<who>-<ride>~<code>", e.g. "girl-board~k1h2t3a3c0g1p0q2b0n1". The part before "~"
// is the old four-way avatar (still understood everywhere); the code adds the customisation.

export const SKIN = ['#f6d5b8', '#eec29c', '#d9a273', '#b57a4f', '#8a5634', '#5e3a22'];
export const HAIR_COLORS = ['#2b1d14', '#6b4226', '#a8461f', '#e0bd72', '#141414', '#b9b9b9'];
export const LENS = ['#4fc3ff', '#ff9a3c', '#d6dee8', '#57e389', '#ff6fb5', '#f5c542'];
// index 0 of these follows the jacket colour (lighter for hats, darker for pants)
export const HAT_COLORS = ['match', '#f2f5f8', '#1b2129', '#e03131', '#ff9f0a', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ff2d92'];
export const PANTS = ['match', '#1b2129', '#3a4656', '#f2f5f8', '#24406b', '#5b4636', '#3f5d3a', '#e03131', '#ff9f0a', '#bf5af2'];
export const GEAR = ['#15181f', '#f2f5f8', '#e03131', '#ff9f0a', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ff2d92', '#00c7be'];

export const HEADS = [['helmet', 'Helmet'], ['beanie', 'Beanie'], ['pompom', 'Pom-pom hat'], ['headband', 'Headband']];
export const HAIRS = [['none', 'None'], ['short', 'Short'], ['pony', 'Ponytail'], ['braids', 'Braids'], ['long', 'Long']];

// the four starting characters shown in the Group tab
export const CHARACTERS = [
  ['boy-ski', 'Skier 1'], ['girl-ski', 'Skier 2'], ['boy-board', 'Snowboarder 1'], ['girl-board', 'Snowboarder 2'],
];

const KEYS = ['k', 'h', 't', 'a', 'c', 'g', 'p', 'q', 'b', 'n'];
const NAMES = { k: 'skin', h: 'head', t: 'hat', a: 'hair', c: 'hairColor', g: 'lens', p: 'pants', q: 'gear', b: 'pack', n: 'gaiter' };
const SIZES = { k: SKIN.length, h: HEADS.length, t: HAT_COLORS.length, a: HAIRS.length, c: HAIR_COLORS.length, g: LENS.length, p: PANTS.length, q: GEAR.length, b: 2, n: 2 };

/** Default look for one of the four characters (and for anything older than customisation). */
export function defaults(who, ride) {
  const girl = who === 'girl';
  return { who, ride, skin: girl ? 0 : 1, head: 0, hat: 0, hair: girl ? 3 : 1, hairColor: girl ? 1 : 0, lens: girl ? 4 : 0, pants: 0, gear: 0, pack: girl ? 0 : 1, gaiter: 0 };
}

/** avatar string -> look object (unknown or damaged parts fall back to the defaults). */
export function parseLook(avatar) {
  const [base, code = ''] = String(avatar || 'boy-ski').split('~');
  const [w, r] = base.split('-');
  const who = w === 'girl' ? 'girl' : 'boy', ride = r === 'board' ? 'board' : 'ski';
  const L = defaults(who, ride);
  for (const m of code.matchAll(/([a-z])([0-9a-z])/g)) {
    const k = m[1], v = parseInt(m[2], 36);
    if (NAMES[k] && v < SIZES[k]) L[NAMES[k]] = v;
  }
  return L;
}

/** look object -> avatar string */
export function lookString(L) {
  return `${L.who}-${L.ride}~` + KEYS.map((k) => k + Math.min(SIZES[k] - 1, Math.max(0, L[NAMES[k]] | 0)).toString(36)).join('');
}

/** The colours a look resolves to for a given jacket colour (hex). */
export function lookColors(L, jacket) {
  return {
    skin: SKIN[L.skin], hair: HAIR_COLORS[L.hairColor], lens: LENS[L.lens], gear: GEAR[L.gear],
    hat: HAT_COLORS[L.hat] === 'match' ? null : HAT_COLORS[L.hat],
    pants: PANTS[L.pants] === 'match' ? null : PANTS[L.pants],
    jacket,
  };
}

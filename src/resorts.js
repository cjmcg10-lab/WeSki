// Resorts listed on the start-screen globe that do not have a built 3D map yet. Resorts with a
// map come from /data/index.json (written by tools/build_index.py) and are not listed here: remove an entry
// here once its mountain is built (the map's id can differ, e.g. Tremblant and Whistler), or it shows twice.
// main.js also leaves out any entry within 15 km of a built mountain, and tests/resorts-list.test.js checks it.
export const COMING_SOON = [
];

// Low-poly models: avatars, chairs, tram cabins, towers, stations, buildings, trees, markers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { parseLook, lookColors } from './look.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const vcMat = (smooth = false) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !smooth });

/**
 * A skier or snowboarder, ~1.8 units tall, travelling towards +Z.
 * avatar: an avatar string (see look.js): 'boy-ski' | 'girl-board' | ... optionally with "~<look code>".
 * The skis / board always point along the direction of travel; a snowboarder's body is
 * turned sideways on the board. `userData.rig` is the part that animateAvatar() moves;
 * `userData.arm` is the right arm (pivoting at the shoulder) used for waving.
 */
export function makeAvatar(avatar, color, pose = 'stand') {
  const sit = pose === 'sit';
  const L = parseLook(avatar), C = lookColors(L, color);
  const board = L.ride === 'board', girl = L.who === 'girl';
  const jacket = new THREE.Color(color);
  const pants = C.pants ? new THREE.Color(C.pants) : jacket.clone().multiplyScalar(0.35).add(new THREE.Color(0x1a2030));
  const hat = C.hat ? new THREE.Color(C.hat) : jacket.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const trim = jacket.clone().lerp(new THREE.Color(0xffffff), 0.75);
  const glove = 0x1e232b, boot = 0x2a2f38, skin = C.skin, hair = C.hair;
  const parts = [];
  // boots and legs: standing with knees bent, or sitting (thighs level, shins hanging down)
  for (const x of [-0.14, 0.14]) {
    if (sit) {
      parts.push(part(box(0.21, 0.22, 0.58), pants, x, 0.9, 0.22));
      parts.push(part(box(0.2, 0.42, 0.22), pants, x, 0.66, 0.46, 0.1));
      parts.push(part(box(0.22, 0.24, 0.34), boot, x, 0.42, 0.55));
    } else {
      parts.push(part(box(0.22, 0.24, 0.34), boot, x, 0.24, 0.03));
      parts.push(part(box(0.21, 0.36, 0.23), pants, x, 0.5, 0.0, 0.25));
      parts.push(part(box(0.2, 0.32, 0.22), pants, x, 0.8, -0.02, -0.15));
    }
  }
  // torso: jacket with a zip line and a contrasting hem; slimmer waist for the "girl" build.
  // Leaning forward when riding, upright when sitting.
  const tl = sit ? 0.05 : 0.22;
  parts.push(part(girl ? new THREE.CylinderGeometry(0.22, 0.3, 0.62, 8) : box(0.54, 0.62, 0.32), jacket, 0, 1.1, 0.06, tl));
  parts.push(part(box(girl ? 0.5 : 0.56, 0.08, girl ? 0.34 : 0.34), trim, 0, 0.82, sit ? 0.06 : 0.0, tl));
  parts.push(part(box(0.025, 0.5, 0.02), 0x15181f, 0, 1.12, girl ? 0.27 : 0.25, tl));
  // left arm with glove (the right arm is separate, below)
  if (sit) {                             // hand resting on the thigh
    parts.push(part(box(0.14, 0.5, 0.15), jacket, 0.33, 1.1, 0.14, -0.35));
    parts.push(part(box(0.15, 0.13, 0.16), glove, 0.31, 0.95, 0.32, -0.35));
  } else {
    parts.push(part(box(0.14, 0.5, 0.15), jacket, 0.37, 1.08, 0.15, -0.7));
    parts.push(part(box(0.15, 0.13, 0.16), glove, 0.37, 0.88, 0.36, -0.7));
  }
  const headFrom = parts.length;
  // neck: collar or neck warmer
  parts.push(part(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 8), L.gaiter ? hat : jacket, 0, 1.43, 0.12));
  // head
  parts.push(part(new THREE.IcosahedronGeometry(0.19, 1), skin, 0, 1.6, 0.14));
  // hair (under the hat)
  // Every style starts from a shell hugging the back of the head, so nothing floats.
  const cap = (down) => part(new THREE.SphereGeometry(0.206, 12, 8, Math.PI, Math.PI, 0, Math.PI * down), hair, 0, 1.6, 0.14);
  if (L.hair === 1) parts.push(cap(0.6));
  if (L.hair === 2) {                    // ponytail tied at the back of the head
    parts.push(cap(0.62));
    parts.push(part(new THREE.CylinderGeometry(0.065, 0.03, 0.36, 7), hair, 0, 1.43, -0.1, 0.32));
    parts.push(part(new THREE.IcosahedronGeometry(0.05, 0), C.hat || trim, 0, 1.6, -0.06));
  }
  if (L.hair === 3) {                    // two braids from behind the ears
    parts.push(cap(0.66));
    for (const x of [-0.13, 0.13]) parts.push(part(new THREE.CylinderGeometry(0.05, 0.035, 0.42, 6), hair, x, 1.38, -0.04, 0.28));
  }
  if (L.hair === 4) {                    // long: carries straight on from the head shell, down over the back
    const k = 0.7, ry = 1.6 + 0.206 * Math.cos(Math.PI * k), rr = 0.206 * Math.sin(Math.PI * k);
    parts.push(cap(k));
    // round the back of the neck, as wide as the shell's rim, down to the shoulders
    const nape = new THREE.CylinderGeometry(rr, rr + 0.02, 0.1, 12, 1, true, Math.PI / 2, Math.PI);
    nape.translate(0, ry - 0.05, 0.14);
    parts.push(part(nape, hair));
    // then a shallow curved sheet lying on the back (the jacket leans forward, so it hangs just behind it)
    const sheet = new THREE.CylinderGeometry(0.15, 0.2, 0.28, 12, 1, true, Math.PI / 2, Math.PI);
    sheet.scale(1, 1, 0.42); sheet.translate(0, -0.14, 0); sheet.rotateX(0.12); sheet.translate(0, ry + 0.01, -0.035);
    parts.push(part(sheet, hair));
    // the ends: short tapered locks
    for (const x of [-0.14, -0.07, 0, 0.07, 0.14])
      parts.push(part(new THREE.ConeGeometry(0.045, 0.1, 5), hair, x, ry - 0.3, -0.125 + Math.abs(x) * 0.15, Math.PI + 0.12));
  }
  // headwear
  if (L.head === 0) {                    // helmet with a little peak
    parts.push(part(new THREE.SphereGeometry(0.225, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56), hat, 0, 1.63, 0.13));
    parts.push(part(box(0.26, 0.03, 0.1), hat, 0, 1.73, 0.33, -0.2));
  } else if (L.head === 3) {             // headband: hair shows on top
    parts.push(part(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 1.63, 0.13));
    parts.push(part(new THREE.CylinderGeometry(0.205, 0.205, 0.09, 12, 1, true), hat, 0, 1.68, 0.13));
  } else {                               // beanie, with a turned-up cuff, maybe a pom-pom
    parts.push(part(new THREE.SphereGeometry(0.212, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.6), hat, 0, 1.63, 0.13, 0, 0, 0));
    parts.push(part(new THREE.CylinderGeometry(0.215, 0.215, 0.09, 12), trim.clone().lerp(hat, 0.5), 0, 1.64, 0.13));
    if (L.head === 2) parts.push(part(new THREE.IcosahedronGeometry(0.08, 1), trim, 0, 1.87, 0.12));
  }
  // goggles: dark frame, coloured lens, strap round the back
  parts.push(part(box(0.33, 0.13, 0.08), 0x15181f, 0, 1.63, 0.31));
  parts.push(part(box(0.29, 0.09, 0.03), C.lens, 0, 1.63, 0.355));
  parts.push(part(new THREE.CylinderGeometry(0.212, 0.212, 0.05, 12, 1, true), 0x15181f, 0, 1.63, 0.13));
  if (sit) for (let i = headFrom; i < parts.length; i++) parts[i].translate(0, 0.02, -0.05);   // head over the upright back
  if (L.pack && !sit) {
    parts.push(part(box(0.36, 0.42, 0.17), pants, 0, 1.12, -0.21, 0.22));
    parts.push(part(box(0.3, 0.1, 0.05), trim, 0, 1.0, -0.3, 0.22));
  }
  const gear = [];
  const gearCol = C.gear, top = new THREE.Color(gearCol).lerp(jacket, 0.35);
  if (sit) {
    // feet resting forward: skis or the board hanging under the boots, tips pointing ahead
    const fy = 0.28, fz = 0.67, tilt = 0.25;
    if (board) {
      gear.push(part(box(0.3, 0.05, 1.45), gearCol, 0.14, fy, fz, tilt));
      gear.push(part(box(0.28, 0.06, 0.18), 0x3a3f4a, 0.14, fy + 0.05, fz - 0.12, tilt));
    } else for (const x of [-0.15, 0.15]) {
      gear.push(part(box(0.11, 0.04, 1.6), gearCol, x, fy, fz, tilt));
      gear.push(part(box(0.09, 0.015, 1.3), top, x, fy + 0.025, fz, tilt));
    }
  } else if (board) {
    gear.push(part(box(0.3, 0.05, 1.55), gearCol, 0, 0.1, 0));       // long axis = direction of travel
    gear.push(part(box(0.31, 0.02, 1.2), top, 0, 0.13, 0));
    gear.push(part(box(0.28, 0.06, 0.18), 0x3a3f4a, 0, 0.16, -0.17));
    gear.push(part(box(0.28, 0.06, 0.18), 0x3a3f4a, 0, 0.16, 0.17));
  } else {
    for (const x of [-0.15, 0.15]) {
      gear.push(part(box(0.11, 0.04, 1.75), gearCol, x, 0.1, 0.1));
      gear.push(part(box(0.11, 0.04, 0.2), gearCol, x, 0.13, 0.98, 0.5));   // turned-up tips
      gear.push(part(box(0.09, 0.015, 1.4), top, x, 0.125, 0.1));
    }
    parts.push(part(box(0.03, 0.95, 0.03), 0x30343c, 0.44, 0.62, 0.02, 0.9));
  }
  if (sit && !board) parts.push(part(box(0.03, 0.95, 0.03), 0x30343c, 0.42, 0.75, 0.3, 0.5));
  const body = new THREE.Mesh(mergeGeometries(parts), vcMat());
  // right arm: a separate piece pivoting at the shoulder, so it can wave
  const armParts = [part(box(0.14, 0.5, 0.15), jacket, 0, -0.24, 0), part(box(0.15, 0.13, 0.16), glove, 0, -0.5, 0)];
  if (!board && !sit) armParts.push(part(box(0.03, 0.95, 0.03), 0x30343c, 0, -0.5, -0.33, 1.3));
  const arm = new THREE.Mesh(mergeGeometries(armParts), vcMat());
  const shoulder = new THREE.Group();
  shoulder.position.set(-0.37, 1.32, 0.06);
  shoulder.rotation.x = sit ? -0.35 : -0.7;
  shoulder.add(arm);
  body.add(shoulder);
  // Sideways stance: the rider stands across the board, which keeps pointing downhill.
  // Regular rides left foot forward (chest to the left of travel), goofy right foot forward.
  // (Sitting, everyone faces forward.)
  const stance = board && !sit ? (L.stance ? Math.PI / 2 : -Math.PI / 2) : 0;
  body.rotation.y = stance;
  const rig = new THREE.Group();
  rig.add(new THREE.Mesh(mergeGeometries(gear), vcMat()), body);
  const g = new THREE.Group();
  g.add(rig);
  g.userData = { rig, body, arm: shoulder, board, sit, stance, armRest: sit ? -0.35 : -0.7, phase: Math.random() * 6.28, amt: 0 };
  return g;
}

/**
 * Wave at the viewer. k: 0..1 through the wave (it turns to face the camera, raises the right
 * arm, waves three times and settles back). face: yaw, relative to the avatar's parent, that
 * points the chest at the camera. lean: extra sideways lean (riders leaning out of a lift).
 */
export function waveAvatar(g, k, face, lean = 0) {
  const u = g.userData;
  if (!u.arm) return;
  // in for the first 15%, out for the last 15%
  const e = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
  const s = e * e * (3 - 2 * e);
  // The whole rider turns, board or skis and all, so a snowboarder stays standing across the
  // board: their chest faces the viewer, the board ends up side-on. Someone sitting can only
  // twist so far in the seat.
  let d = face - u.stance - (u.baseYaw ?? 0);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (u.sit) d = Math.max(-0.6, Math.min(0.6, d));
  g.rotation.y = (u.baseYaw ?? 0) + d * s;
  g.rotation.z = -lean * s;
  const swing = Math.sin(k * Math.PI * 7) * 0.32 * s;
  u.arm.rotation.set((u.armRest ?? -0.7) * (1 - s), 0, -2.55 * s + swing);
}

/** Back to the normal riding pose after a wave. */
export function endWave(g) {
  const u = g.userData;
  if (!u.arm) return;
  g.rotation.y = u.baseYaw ?? 0; g.rotation.z = 0;
  u.arm.rotation.set(u.armRest ?? -0.7, 0, 0);
}

/**
 * Riding animation. While `moving`, a skier links carved turns (lean, steer, knee flex,
 * side-to-side track); a snowboarder rocks between heel and toe edge. Eases in and out.
 */
export function animateAvatar(g, t, dt, moving) {
  const u = g.userData;
  if (!u.rig) return;
  u.amt += ((moving ? 1 : 0) - u.amt) * Math.min(1, dt * 4);
  const a = u.amt;
  if (a < 0.002) { u.rig.rotation.set(0, 0, 0); u.rig.position.set(0, 0, 0); u.body.position.y = 0; return; }
  // Short, quick linked turns: a tight sway rather than big swings from side to side.
  const ph = t * (u.board ? 2.9 : 3.8) + u.phase, s = Math.sin(ph);
  u.rig.rotation.y = s * (u.board ? 0.24 : 0.18) * a;          // steer into the turn
  u.rig.rotation.z = -s * (u.board ? 0.13 : 0.19) * a;         // lean / edge angle
  u.rig.rotation.x = u.board ? Math.sin(ph) * 0.07 * a : 0;
  u.rig.position.x = Math.sin(ph - 0.7) * 0.2 * a;            // narrow S-shaped track
  u.body.position.y = -Math.abs(Math.cos(ph)) * 0.05 * a;     // flex through the turn
}

/**
 * How a rider's carrier fits on the map. hang: from the model's origin up to the cable (model units, before scaling);
 * s0: the scale the map draws that lift's own carriers at (chairs and cabins 1.6, trams 1.5, trains and surface lifts
 * 1), so up close a rider's carrier is exactly the size of the ones around it; smax: the most it grows when zoomed
 * out (it grows with distance so riders stay easy to find, like people on the snow).
 */
export const RIDE_FIT = {
  chair: { hang: 3.4, s0: 1.6, smax: 25 },
  cabin: { hang: 3.4, s0: 1.6, smax: 25 },
  tram: { hang: 6.275, s0: 1.5, smax: 6 },
  train: { hang: 0, s0: 1, smax: 2 },
  funicular: { hang: 0, s0: 1, smax: 2 },
  tow: { hang: 0, s0: 1, smax: 25 },
};
export const rideFit = (kind) => RIDE_FIT[kind?.startsWith('tow-') ? 'tow' : kind] || RIDE_FIT.tow;

// shared, never disposed: the plain carrier shapes (only the colour pieces differ from rider to rider)
const shared = new Map();
const keep = (key, make) => { let g = shared.get(key); if (!g) { g = make(); g.userData.shared = true; shared.set(key, g); } return g; };
const glassMat = () => new THREE.MeshLambertMaterial({ color: 0x9fc4e0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });

/**
 * Someone riding a lift, or several group members sharing one carrier: the same detailed chair, gondola cabin, tram
 * cabin, T-bar, platter or train the map draws for that lift, with the riders in it. The origin is at seat height
 * (chairs and cabins), on the cabin floor (trams), on the rails (trains) or on the snow (surface lifts), so it can be
 * scaled like an avatar.
 * kind: 'chair' | 'cabin' | 'tram' | 'train' | 'funicular' | 'tow-tbar' | 'tow-platter' | 'tow-rope'
 * riders: [{ avatar, color }] (one or more; the ones beyond the seats drawn ride along unseen)
 * o: { seats, bubble, down } for chairs. userData.avs: the riders' figures, in the order given (for waving).
 */
export function makeRide(kind, riders, o = {}) {
  if (!Array.isArray(riders)) riders = [{ avatar: riders, color: o }], o = {};   // old form: (kind, avatar, color)
  const g = new THREE.Group(), cols = riders.map((r) => r.color), avs = [];
  const add = (geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
  const fit = rideFit(kind);
  if (kind === 'cabin') {
    // a gondola cabin: the body in the rider's colour (panels in each rider's colour when shared), see-through glass,
    // riders on the two benches facing each other: the back one (facing forward) fills first
    add(gondolaGeometry(cols.length > 1 ? cols : cols[0], { open: true }), vcMat(), fit.hang);
    add(keep('cabinGlass', () => cabinGlass('cabin')), glassMat(), fit.hang);
    riders.slice(0, 8).forEach((r, i) => {
      const back = i < 4, row = back ? Math.min(4, riders.length) : Math.min(4, riders.length - 4), k = back ? i : i - 4;
      const x = (k - (row - 1) / 2) * 0.44;
      avs.push(seat(g, r.avatar, r.color, back ? x : -x, 0.07 - SEAT_Y, back ? -0.8 : 0.8, back ? 0 : Math.PI, true));
    });
  } else if (kind === 'tram') {
    // the tram cabin, riders standing inside in rows across it
    add(tramGeometry(cols.length > 1 ? cols : cols[0], { open: true }), vcMat(), fit.hang);
    add(keep('tramGlass', () => cabinGlass('tram')), glassMat(), fit.hang);
    riders.slice(0, 18).forEach((r, i) => avs.push(stand(g, r.avatar, r.color, ((i % 3) - 1) * 0.85, 0, 2.2 - Math.floor(i / 3) * 0.9)));
  } else if (kind === 'train' || kind === 'funicular') {
    // the same train or funicular car the map runs on that line, its sides panelled in the riders' colours
    add(trainGeometry(kind, { colors: cols, open: true }), vcMat());
    add(keep('rail' + kind, () => railGlass(kind)), glassMat());
    riders.slice(0, 18).forEach((r, i) => avs.push(stand(g, r.avatar, r.color, ((i % 3) - 1) * 0.75, 0.7, 4.5 - Math.floor(i / 3) * 1.6)));
  } else if (kind.startsWith('tow-')) {
    // standing on the snow, towed: the lift's own T-bar (its pads in the riders' colours) or platter behind the hips,
    // its stem leaning forward up to the cable; on a rope tow the hands hold the rope itself
    const style = kind.slice(4), two = style === 'tbar' && riders.length > 1;
    const xs = two ? [-0.32, 0.32] : [style === 'tbar' ? -0.32 : 0];
    riders.slice(0, xs.length).forEach((r, i) => {
      const av = makeAvatar(r.avatar, r.color);
      av.userData.rig = null; av.position.x = xs[i];
      g.add(av); avs.push(av);
    });
    if (style === 'rope') add(part(box(0.06, 0.06, 3.2), 0x8a6b3d, 0.35, 1.05, 0.6), vcMat());
    else {
      const geo = style === 'platter' ? platterGeometry(cols[0]) : tbarGeometry(two ? cols : [cols[0], 0x3b6ea8]);
      // pivot about the bar (T or disc) and lean the stem forward, as the map's own hangers do while pulling
      const bar = style === 'platter' ? 2.65 : 2.8;
      const m = add(geo.translate(0, bar, 0), vcMat());
      m.rotation.x = 0.38; m.position.set(0, 0.92, -0.16);
    }
  } else {
    // chairlift: the lift's own chair (its seat count and weather bubble), riders side by side in the middle seats,
    // the seat back behind each one padded in their colour
    const n = Math.max(1, o.seats || 2), w = 0.55 * Math.max(2, n) + 0.2, k = Math.min(n, riders.length), first = Math.floor((n - k) / 2);
    add(keep(`chair${n}${o.bubble ? 'b' : ''}`, () => chairGeometry(n, !!o.bubble)), vcMat(), fit.hang);
    const pads = [];
    riders.slice(0, k).forEach((r, i) => {
      const x = n === 1 ? 0 : -w / 2 + 0.1 + 0.55 * (first + i + 0.5);
      pads.push(part(box(0.46, 0.56, 0.04), r.color, x, -2.98 + fit.hang, -0.2, -0.12));
      avs.push(seat(g, r.avatar, r.color, x, 0.07 - SEAT_Y, 0.08, 0));
    });
    if (pads.length) add(mergeGeometries(pads), vcMat());
    if (o.bubble) {
      // lowered over the riders going up, raised behind them coming down (as on the map's chairs)
      const bub = add(keep(`bubble${n}`, () => bubbleGeometry(n)), new THREE.MeshLambertMaterial({ color: 0xe58a3a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), fit.hang);
      if (o.down) { const [, by, bz] = BUBBLE_PIVOT; bub.geometry = bub.geometry.clone(); bub.geometry.userData = {}; bub.geometry.translate(0, -by, -bz).rotateX(-1.9).translate(0, by, bz); }
    }
  }
  g.userData = { ride: kind, avs, av: avs[0], seated: kind === 'chair', s0: fit.s0, smax: fit.smax };
  return g;
}

/** Free a rider's carrier or a person (geometry and materials), but never the shared carrier shapes. */
export function disposeModel(obj) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    if (!m.geometry.userData.shared) m.geometry.dispose();
    m.material.dispose?.();
  });
}

function stand(g, avatar, color, x, y, z) {
  const av = makeAvatar(avatar, color);
  av.children[0].children[0].visible = false;               // skis and boards ride outside, in the racks
  av.userData.rig = null;
  av.position.set(x, y, z);
  g.add(av);
  return av;
}

// how high above the boot soles a sitting rider's seat is (the underside of the thighs)
const SEAT_Y = 0.79;
function seat(g, avatar, color, x, y, z, yaw, inside = false) {
  const av = makeAvatar(avatar, color, 'sit');
  if (inside) av.children[0].children[0].visible = false;   // skis and boards ride outside, in the racks
  av.userData.rig = null; av.userData.baseYaw = yaw;
  av.position.set(x, y, z); av.rotation.y = yaw;
  g.add(av);
  return av;
}

// ---------- lifts: carriers, towers, stations
// Every carrier hangs from the cable at y = 0 and travels towards +Z. Chairs and cabins come in two
// versions: a detailed one drawn near the camera and a few boxes for everything further away (the
// map switches between them per carrier, see SkiMap.animateLifts).

const STEEL = 0x3a3f4a, DARK = 0x30343c, LIGHT = 0xd8dde6, WHITE = 0xe9edf2, GLASS = 0x26384c, WALL = 0xcfc8bc, CONCRETE = 0x9a9ea5;
const cyl = (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const UP = new THREE.Vector3(0, 1, 0);

/** A square bar from point a to point b (thickness t). */
function beam(a, b, t, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = box(t, len, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return part(g, color);
}

/** A box w x h x d with its corners cut off (an octagonal prism): cabins look rounded with 8 sides.
 * top < 1 tapers it towards the top (a roof cap). */
function oct(w, h, d, color, x, y, z, top = 1) {
  const k = 2 * Math.cos(Math.PI / 8);
  const g = cyl(top, 1, h, 8).rotateY(Math.PI / 8).scale(w / k, 1, d / k);
  return part(g, color, x, y, z);
}

/** A low hipped roof w x d, h tall, its eaves at y (a square frustum). */
function hipRoof(w, d, h, color, x, y, z) {
  const g = cyl(0.3, 1, h, 4).rotateY(Math.PI / 4).scale(w / Math.SQRT2, 1, d / Math.SQRT2);
  return part(g, color, x, y + h / 2, z);
}

/**
 * Chairlift chair: grip and hanger, seat frame, padded seat and backrest, armrests, the safety bar
 * lowered with its footrest. Seat surface at y = -3.33 (makeRide seats riders on it). The weather
 * bubble is a separate see-through piece (bubbleGeometry).
 */
export function chairGeometry(seats, bubble = false) {
  const n = Math.max(2, seats || 2), w = 0.55 * n + 0.2, cushion = 0x33405a, bar = 0xc3c9d2;
  const p = [
    part(box(0.3, 0.34, 0.62), DARK, 0, 0.02, 0),                 // grip clamped on the cable
    part(box(0.16, 0.2, 0.95), STEEL, 0, 0.24, 0),                // grip carriage with its rollers
    part(box(0.11, 2.3, 0.11), STEEL, 0, -1.25, 0),               // hanger
    beam([0, -2.36, 0], [0, -2.64, -0.32], 0.11, STEEL),          // knee back to the frame
    part(box(w, 0.09, 0.09), STEEL, 0, -2.64, -0.32),             // top of the seat frame
    part(box(w - 0.08, 0.7, 0.09), cushion, 0, -2.98, -0.26, -0.12),
    part(box(w - 0.04, 0.12, 0.6), cushion, 0, -3.39, 0.08),
    part(box(w, 0.06, 0.62), STEEL, 0, -3.48, 0.08),
    part(box(w, 0.06, 0.06), bar, 0, -2.95, 0.62),                // safety bar, down
    part(box(w * 0.92, 0.07, 0.26), bar, 0, -3.78, 0.74),         // footrest
  ];
  for (const sx of [-w / 2, w / 2]) {
    p.push(beam([sx, -2.64, -0.32], [sx, -3.42, -0.2], 0.08, STEEL));
    p.push(part(box(0.07, 0.07, 0.5), STEEL, sx, -3.06, 0.0));
    p.push(beam([sx, -2.68, -0.3], [sx, -2.95, 0.62], 0.06, bar));
  }
  const pairs = Math.ceil(n / 2);
  for (let k = 0; k < pairs; k++) {
    const x = -w / 2 + ((k + 0.5) * w) / pairs;
    p.push(beam([x, -2.95, 0.62], [x, -3.76, 0.7], 0.05, bar));
  }
  if (bubble) p.push(part(box(w + 0.1, 0.06, 0.5), 0xd9762b, 0, -1.98, -0.1));   // the bubble's hinge rail
  return mergeGeometries(p);
}

/** The few boxes a chair is drawn with from further away (same size and colours as the detailed one). */
export function chairFarGeometry(seats, bubble = false) {
  const w = 0.55 * Math.max(2, seats || 2) + 0.2;
  return mergeGeometries([
    part(box(0.12, 2.6, 0.12), STEEL, 0, -1.3, 0),
    part(box(w, 0.14, 0.7), 0x25282f, 0, -3.4, 0.1),
    part(box(w, 0.8, 0.12), 0x25282f, 0, -2.95, -0.22),
    part(box(w, 0.08, 0.3), LIGHT, 0, -3.75, 0.7),
    ...(bubble ? [part(box(w + 0.15, 1.0, 0.9), 0xd9762b, 0, -2.4, 0.35)] : []),
  ]);
}

/** Pivot of a chair's bubble (it swings about the x axis through here). */
export const BUBBLE_PIVOT = [0, -2.95, 0.05];

/**
 * A chair's weather bubble, lowered: a curved see-through shell over the seat from above the
 * backrest down to the footrest, with side panels. Drawn with its own tinted, see-through
 * material. Rotate it by about -1.9 rad round BUBBLE_PIVOT to raise it behind the chair.
 */
export function bubbleGeometry(seats) {
  const w = 0.55 * Math.max(2, seats || 2) + 0.35, R = 1.02, [, cy, cz] = BUBBLE_PIVOT;
  const a0 = (100 * Math.PI) / 180, a1 = (-38 * Math.PI) / 180, N = 6, pos = [];
  const at = (k, x) => { const a = a0 + ((a1 - a0) * k) / N; return [x, cy + R * Math.sin(a), cz + R * Math.cos(a)]; };
  for (let k = 0; k < N; k++) {
    const p0 = at(k, -w / 2), p1 = at(k, w / 2), p2 = at(k + 1, w / 2), p3 = at(k + 1, -w / 2);
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    for (const x of [-w / 2, w / 2]) pos.push(x, cy, cz, ...at(k, x), ...at(k + 1, x));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Gondola cabin: rounded body, glass all round with white pillars, roof cap, grip carriage, ski racks.
 * color: one colour, or a list (riders sharing a cabin: the body's eight panels take their colours in turn).
 * o.open: leave out the dark window band (a rider's cabin draws see-through glass there instead, cabinGlass) and
 * put in the two benches. */
export function gondolaGeometry(color = 0xd32f2f, o = {}) {
  const cols = Array.isArray(color) ? color : [color];
  const body = oct(2.0, 0.85, 2.3, cols[0], 0, -3.28, 0);                    // lower body
  if (cols.length > 1) panels(body, cols);
  const p = [
    part(box(0.34, 0.36, 1.0), DARK, 0, 0.05, 0),               // grip carriage
    part(box(0.5, 0.12, 0.55), STEEL, 0, 0.3, 0),
    part(box(0.13, 1.25, 0.13), STEEL, 0, -0.7, 0),             // hanger
    part(box(0.9, 0.12, 0.45), STEEL, 0, -1.35, 0),
    oct(2.0, 0.3, 2.3, WHITE, 0, -1.56, 0, 0.8),                // roof
    ...(o.open ? [] : [oct(1.92, 1.05, 2.22, GLASS, 0, -2.24, 0)]),   // windows
    oct(2.02, 0.12, 2.32, WHITE, 0, -2.8, 0),                   // white belt line
    body,
    oct(1.7, 0.18, 1.98, 0x2a2f38, 0, -3.78, 0),                // floor
    part(box(0.04, 1.85, 0.05), 0x1d2530, 0, -2.75, 1.16),      // door seam
  ];
  const px = 0.3536 * 2.0, pz = 0.3536 * 2.3;                   // the middle of each cut corner
  for (const x of [-px, px]) for (const z of [-pz, pz]) p.push(part(box(0.1, 1.05, 0.1), WHITE, x, -2.24, z));
  for (const x of [-1.06, 1.06]) p.push(part(box(0.1, 0.55, 1.3), 0x1d2530, x, -3.1, 0));   // ski racks
  if (o.open) for (const z of [-0.8, 0.8]) p.push(part(box(1.6, 0.1, 0.42), STEEL, 0, -3.38, z));   // benches facing each other
  return mergeGeometries(p);
}

/** Recolour an octagonal body (from oct) panel by panel: the eight sides take the colours in turn, and so do the
 * matching slices of its top and bottom. A cabin shared by several riders shows each of them. */
function panels(g, cols) {
  const pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(i + k); z += pos.getZ(i + k); }
    const f = ((Math.round(Math.atan2(x, z) / (Math.PI / 4)) % 8) + 8) % 8;
    c.set(cols[f % cols.length]);
    for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
  }
}

/** The see-through window band of a rider's gondola or tram cabin (no colours: drawn with its own glass material). */
export function cabinGlass(kind) {
  const k = 2 * Math.cos(Math.PI / 8);
  if (kind === 'tram') return cyl(1, 1, 1.35, 8).rotateY(Math.PI / 8).scale(3.1 / k, 1, 6.5 / k).translate(0, -4.2, 0);
  return cyl(1, 1, 1.05, 8).rotateY(Math.PI / 8).scale(1.92 / k, 1, 2.22 / k).translate(0, -2.24, 0);
}

export function gondolaFarGeometry(color = 0xd32f2f) {
  return mergeGeometries([
    part(box(0.14, 1.5, 0.14), STEEL, 0, -0.75, 0),
    part(box(2.0, 1.15, 2.3), GLASS, 0, -2.1, 0),
    part(box(2.0, 1.0, 2.3), color, 0, -3.2, 0),
  ]);
}

/** Aerial tram cabin: running carriage with wheels on the track ropes, two-legged hanger, a big rounded
 * cabin with a band of windows. Long axis along Z. color: one colour, or a list (riders sharing the cabin: a row
 * of panels in their colours along each side). o.open: no dark window band (see cabinGlass). */
export function tramGeometry(color, o = {}) {
  const cols = Array.isArray(color) ? color : [color];
  const frame = 0x444a55, p = [
    part(box(1.0, 0.7, 5.2), frame, 0, -0.1, 0),
    beam([0, -0.4, -1.8], [0, -3.0, -0.9], 0.35, frame),
    beam([0, -0.4, 1.8], [0, -3.0, 0.9], 0.35, frame),
    part(box(1.4, 0.3, 2.4), frame, 0, -3.05, 0),
    oct(3.2, 0.35, 6.6, WHITE, 0, -3.35, 0, 0.86),
    ...(o.open ? [] : [oct(3.1, 1.35, 6.5, GLASS, 0, -4.2, 0)]),
    oct(3.22, 0.14, 6.62, WHITE, 0, -4.93, 0),
    oct(3.2, 1.3, 6.6, cols.length > 1 ? 0x4a5260 : cols[0], 0, -5.65, 0),   // shared: a dark body under the riders' panels
    oct(2.8, 0.35, 6.0, 0x2a2f38, 0, -6.45, 0),
  ];
  for (const z of [-2.0, -0.65, 0.65, 2.0]) for (const x of [-0.56, 0.56]) p.push(part(cyl(0.36, 0.36, 0.16, 7), 0x2a2f38, x, 0.18, z, 0, 0, Math.PI / 2));
  for (const z of [-2.15, -1.05, 0, 1.05, 2.15]) p.push(part(box(3.16, 1.35, 0.08), WHITE, 0, -4.2, z));   // window pillars
  if (cols.length > 1) p.push(...sidePanels(cols, 3.22, 5.0, 1.0, -5.65));
  return mergeGeometries(p);
}

/** A row of coloured panels along both long sides of a car (width w, panels over `len`, `h` tall, centred at y). */
function sidePanels(cols, w, len, h, y, z0 = 0) {
  const p = [], n = cols.length, step = len / n;
  for (let i = 0; i < n; i++) {
    const z = z0 - len / 2 + step * (i + 0.5);
    for (const x of [-w / 2, w / 2]) p.push(part(box(0.06, h, Math.max(0.1, step - 0.12)), cols[i], x, y, z));
  }
  return p;
}

/** T-bar: spring box under the cable, the stem, the T with its two pads. */
export function tbarGeometry(pads = [0x3b6ea8, 0x3b6ea8]) {
  return mergeGeometries([
    part(cyl(0.15, 0.15, 0.8, 6), 0x2f3540, 0, -0.45, 0),
    part(box(0.06, 1.95, 0.06), STEEL, 0, -1.83, 0),
    part(box(1.0, 0.09, 0.09), LIGHT, 0, -2.8, 0),
    part(box(0.3, 0.1, 0.15), pads[0], -0.32, -2.87, 0),
    part(box(0.3, 0.1, 0.15), pads[1] ?? pads[0], 0.32, -2.87, 0),
  ]);
}

/** Platter (button) lift hanger: spring box, a single pole with a disc. */
export function platterGeometry(disc = 0x3b6ea8) {
  return mergeGeometries([
    part(cyl(0.13, 0.13, 0.7, 6), 0x2f3540, 0, -0.4, 0),
    part(box(0.06, 1.85, 0.06), STEEL, 0, -1.7, 0),
    part(cyl(0.22, 0.22, 0.07, 10), disc, 0, -2.65, 0, Math.PI / 2),
  ]);
}

/** Rope tow: a short handle hanging from the rope. */
export function ropeHandleGeometry() {
  return mergeGeometries([
    part(box(0.05, 0.9, 0.05), 0x8a6b3d, 0, -0.45, 0),
    part(box(0.45, 0.07, 0.07), LIGHT, 0, -0.9, 0),
  ]);
}

/** One rib of a magic-carpet belt: a light stripe across the dark belt, moving with it. */
export function padGeometry() {
  return part(box(0.95, 0.03, 0.14), 0xaeb6bf, 0, -0.58, 0);
}

/** A magic carpet's belt, along world points a -> b -> ... on the snow: dark belt, light side rails. */
export function beltGeometry(pts) {
  const p = [], m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = a.distanceTo(b);
    if (len < 0.05) continue;
    m.lookAt(a, b, UP); q.setFromRotationMatrix(m);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    for (const [w, h, x, y, c] of [[1.15, 0.22, 0, 0.1, 0x2c3038], [0.12, 0.38, 0.66, 0.2, 0xb8bec6], [0.12, 0.38, -0.66, 0.2, 0xb8bec6]]) {
      const g = box(w, h, len + 0.1).translate(x, y, 0).applyQuaternion(q).translate(mid.x, mid.y, mid.z);
      p.push(part(g, c));
    }
  }
  return p.length ? mergeGeometries(p) : null;
}

/** A mountain train (two cars) or a funicular car; origin on the rails at its middle, facing +z.
 * o.colors: riders sharing it (a row of panels in their colours along each side); o.open: no dark windows, the
 * see-through ones are drawn separately (railGlass), so riders inside show. */
export function trainGeometry(kind, o = {}) {
  const car = (z, len, body, roofKit) => {
    const p = [
      part(box(2.2, 0.5, len - 1), 0x2a2f38, 0, 0.45, z),
      part(box(2.7, 1.3, len), body, 0, 1.35, z),
      ...(o.open ? [] : [part(box(2.62, 0.95, len - 0.6), GLASS, 0, 2.45, z)]),
      part(box(2.8, 0.3, len + 0.2), WHITE, 0, 3.05, z),
      part(box(2.72, 0.12, len + 0.02), WHITE, 0, 1.98, z),
    ];
    for (let k = -len / 2 + 1.6; k < len / 2 - 1; k += 2.2) p.push(part(box(2.66, 0.95, 0.14), body, 0, 2.45, z + k));
    if (roofKit) p.push(part(box(1.2, 0.35, 2.4), STEEL, 0, 3.35, z), part(box(0.08, 0.9, 1.6), DARK, 0, 3.9, z, 0.5));
    if (o.colors?.length) p.push(...sidePanels(o.colors, 2.76, len - 2, 0.9, 1.35, z));
    return p;
  };
  return mergeGeometries(kind === 'funicular' ? car(0, 16, 0x1f6fb5, false) : [...car(-8.3, 16, 0xb5341f, true), ...car(8.3, 16, 0xb5341f, false)]);
}

/** The window band of a train or funicular, without colours (drawn with see-through glass). */
export function railGlass(kind) {
  const cars = kind === 'funicular' ? [0] : [-8.3, 8.3];
  return mergeGeometries(cars.map((z) => box(2.62, 0.95, 15.4).translate(0, 2.45, z).toNonIndexed()));
}

/** Lift towers come in two instanced pieces: a pole one metre tall (scaled to each tower's height) and a
 * head at cable height, so every tower of a kind is one draw call. kind: chair | gondola | tram | surface. */
export function towerPoleGeometry(kind) {
  const g = kind === 'tram' ? cyl(0.9, 2.4, 1, 4, true).rotateY(Math.PI / 4)
    : kind === 'gondola' ? cyl(0.3, 0.55, 1, 8, true)
    : kind === 'surface' ? cyl(0.13, 0.22, 1, 6, true)
    : cyl(0.24, 0.44, 1, 8, true);
  return part(g.translate(0, 0.5, 0), kind === 'tram' ? 0x7a808a : 0x6d7480);
}

/** How far below the cable a tower's pole stops (the head covers the rest). */
export const TOWER_HEAD = { chair: 0.95, gondola: 1.0, tram: 2.3, surface: 0.45 };

/** A tower's head, origin at cable height: crossarm, sheave trains under each cable, a work platform. */
export function towerHeadGeometry(kind, r) {
  const arm = 2 * r + 0.8, c = 0x565c68;
  if (kind === 'tram') {
    return mergeGeometries([
      part(box(2 * r + 3, 1.4, 3), 0x6a707a, 0, -1.6, 0),
      part(box(2.2, 0.6, 2.2), 0x6a707a, 0, -2.4, 0),
      part(box(0.9, 0.7, 5), DARK, -r, -0.6, 0), part(box(0.9, 0.7, 5), DARK, r, -0.6, 0),
    ]);
  }
  if (kind === 'surface') {
    return mergeGeometries([
      part(box(2 * r + 0.6, 0.18, 0.22), c, 0, -0.4, 0),
      part(box(0.18, 0.2, 0.9), DARK, -r, -0.15, 0), part(box(0.18, 0.2, 0.9), DARK, r, -0.15, 0),
    ]);
  }
  const sh = kind === 'gondola' ? 3.4 : 2.4;
  const p = [
    part(box(arm, 0.32, 0.42), c, 0, -0.75, 0),
    part(box(0.7, 0.45, 0.7), c, 0, -0.95, 0),
    part(box(arm * 0.85, 0.05, 0.8), 0x8a9099, 0, -0.93, 0.62),          // work platform
  ];
  for (const x of [-r, r]) p.push(part(box(0.3, 0.3, sh), DARK, x, -0.2, 0), part(box(0.12, 0.4, 0.12), c, x, -0.5, 0));
  return mergeGeometries(p);
}

/**
 * Lift terminal, origin on the ground under the end of the cable, +Z along the lift line (from the
 * bottom towards the top). o.end: 0 bottom, 1 top. o.detach: a detachable lift, whose long housing
 * covers the stretch where the carriers slow down. o.drive: this end holds the motor room.
 * Chairlift: mast and bullwheel under a hood, loading platform, operator hut. Gondola: a hall the
 * cabins pass through. Tram: a dock the cabins pull into. Surface lift: a post and wheel (and a hut).
 */
export function stationGeometry(kind, color, wheelY = 7.5, r = 2.4, o = {}) {
  const out = o.end ? 1 : -1, p = [];
  const hut = (x, z, w = 2.4, d = 2.6, h = 2.5) => p.push(
    part(box(w, h, d), WALL, x, h / 2, z),
    part(box(w + 0.06, 0.8, d + 0.06), GLASS, x, h - 0.75, z),
    hipRoof(w + 0.6, d + 0.6, 0.9, color, x, h, z),
  );
  const wheel = (y, rad) => p.push(
    part(cyl(rad, rad, 0.3, 16, true), DARK, 0, y, 0),
    part(box(2 * rad, 0.12, 0.22), DARK, 0, y, 0),
    part(box(0.22, 0.12, 2 * rad), DARK, 0, y, 0),
  );
  if (kind === 'tram') {
    p.push(
      part(box(1, 13, 16), WALL, -8.5, 6.5, 0), part(box(1, 13, 16), WALL, 8.5, 6.5, 0),
      part(box(1.06, 2.2, 13), GLASS, -8.5, 9.4, 0), part(box(1.06, 2.2, 13), GLASS, 8.5, 9.4, 0),
      part(box(18, 13, 1), WALL, 0, 6.5, out * 8),
      part(box(19.5, 1.2, 18.5), 0x4a505c, 0, 13.6, out * 0.6),
      part(box(17, 0.6, 16), 0x8a8f98, 0, 0.3, 0),
      part(box(18.2, 0.5, 0.7), color, 0, 12.7, -out * 8),      // a coloured beam over the opening
    );
    if (o.drive) { p.push(part(box(10, 4, 7), WALL, 0, 16.2, out * 4), part(box(10.06, 1, 7.06), GLASS, 0, 16.8, out * 4)); p.push(hipRoof(11, 8, 1.4, color, 0, 18.2, out * 4)); }
    return mergeGeometries(p);
  }
  if (kind === 'surface') {
    p.push(part(box(0.45, wheelY + 0.5, 0.45), 0x6d7480, 0, (wheelY + 0.5) / 2, out * (r + 0.4)));
    p.push(part(box(0.3, 0.3, r + 0.6), 0x6d7480, 0, wheelY + 0.3, out * (r + 0.4) / 2));
    wheel(wheelY, r);
    if (o.drive) hut(r + 2.4, -out * 1.5, 2.0, 2.2, 2.3);
    return mergeGeometries(p);
  }
  const dock = o.detach ? 14 : 0;
  const zOut = out * (r + 2), zIn = -out * (dock + 3), len = Math.abs(zOut - zIn), zc = (zOut + zIn) / 2;
  if (kind === 'gondola') {
    // a hall the cabins pass through: side walls with a band of windows, closed at the far end
    const W = 2 * r + 5.5, H = wheelY + 2.8;
    for (const x of [-W / 2, W / 2]) p.push(part(box(0.5, H, len), WALL, x, H / 2, zc), part(box(0.56, 2.2, len - 2), GLASS, x, H - 3.4, zc));
    p.push(part(box(W, H, 0.5), WALL, 0, H / 2, zOut), part(box(W, 0.5, len), CONCRETE, 0, 0.25, zc));
    p.push(part(box(W + 0.8, 0.5, 0.6), color, 0, H - 0.6, zIn));
    p.push(hipRoof(W + 1.8, len + 1.8, 2.2, color, 0, H, zc));
    wheel(wheelY, r);
    if (o.drive) hut(W / 2 + 2, zc, 3.2, Math.min(len - 2, 8), 3.4);
    return mergeGeometries(p);
  }
  // chairlift
  p.push(part(box(0.9, wheelY + 1.6, 0.9), 0x6d7480, 0, (wheelY + 1.6) / 2, 0));
  wheel(wheelY, r);
  if (o.detach) {
    // the long terminal housing over the slow track, on legs outside the chairs' path
    const W = 2 * r + 4;
    p.push(part(box(W, 1.6, len), color, 0, wheelY + 1.4, zc), part(box(W + 0.1, 0.25, len + 0.1), WHITE, 0, wheelY + 0.55, zc));
    p.push(hipRoof(W + 0.4, len + 0.4, 1.1, color, 0, wheelY + 2.2, zc));
    for (const z of [zIn + out * 1.5, zc]) for (const x of [-(r + 2.5), r + 2.5]) p.push(part(box(0.5, wheelY + 0.8, 0.5), 0x6d7480, x, (wheelY + 0.8) / 2, z));
  } else {
    p.push(part(box(2 * r + 1.4, 1.0, 2 * r + 1.4), color, 0, wheelY + 1.0, 0));
    p.push(hipRoof(2 * r + 1.8, 2 * r + 1.8, 0.8, color, 0, wheelY + 1.5, 0));
  }
  p.push(part(box(2 * r + 6, 0.35, 8), CONCRETE, 0, 0.17, -out * (dock * 0.5 + 4)));      // loading / unloading area
  hut(r + 3.8, -out * 3);
  if (o.drive) p.push(part(box(2 * r + 1, 3.2, 3.6), WALL, 0, 1.6, out * (r + 2.6)), hipRoof(2 * r + 1.6, 4.2, 1, color, 0, 3.2, out * (r + 2.6)));
  return mergeGeometries(p);
}

/** Tunnel mouth: a dark arch the track disappears into (origin on the track, opening towards +z). */
export function portalGeometry() {
  return mergeGeometries([
    part(box(0.8, 5, 1.2), 0x6d6a66, -2.6, 2.5, 0),
    part(box(0.8, 5, 1.2), 0x6d6a66, 2.6, 2.5, 0),
    part(box(6, 0.9, 1.2), 0x6d6a66, 0, 5.2, 0),
    part(box(4.4, 4.8, 0.3), 0x14171c, 0, 2.4, -0.4),
  ]);
}

/** Ring drawn under an avatar (stale friends get a grey one). */
export function makeRing(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 20), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

/** Small conifer, base at y=0. */
export function treeGeometry() {
  // one 6-sided cone, smooth shaded, no bottom (it sits in the snow and is never seen): 6 triangles a tree,
  // half the two-tier fir and only 2 more than the old faceted cone, so 9,000 trees stay cheap on phones
  return new THREE.ConeGeometry(1, 4.2, 6, 1, true).translate(0, 2.1, 0);
}

/** Map pin (dropped pin) and flag (meeting point), base at y=0, ~3 units tall. */
export function makePin(color) {
  const g = new THREE.Group();
  const m = lambert(color);
  const stem = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2, 6), m);
  stem.rotation.x = Math.PI; stem.position.y = 1;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), m);
  head.position.y = 2.5;
  g.add(stem, head);
  return g;
}

export function makeFlag(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5), lambert(0x30343c));
  pole.position.y = 1.7;
  const flag = new THREE.Mesh(box(1.5, 0.9, 0.06), lambert(color));
  flag.position.set(0.8, 2.9, 0);
  g.add(pole, flag);
  return g;
}

/**
 * A building from its footprint. ring: [[x,z],...] counter-clockwise seen from above (world X/Z), base: ground y,
 * h: wall height. shape: 'flat', 'hipped' (slopes on every side) or 'gabled' (a ridge along the building's long
 * side, triangular gable ends in the wall colour). `roof` is the roof's colour as seen (snow on it already mixed in
 * by the caller). Pitched roofs overhang the walls (eaves). o.storey: storey height for the rows of windows, which
 * the building material draws from the `win` attribute (along-wall metres, height above the ground, storey height,
 * wall height; zeros on roofs). o.chimney: a stone chimney on a pitched roof. Appends to out.pos / out.col / out.win
 * for one merged mesh.
 */
export function addBuilding(out, ring, base, h, wall, roof, shape = 'hipped', o = {}) {
  const n = ring.length, flat = shape === 'flat';
  let cx = 0, cz = 0, area = 0;
  for (const [x, z] of ring) { cx += x; cz += z; }
  cx /= n; cz /= n;
  for (let i = 0; i < n; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n]; area += x0 * z1 - x1 * z0; }
  const sgn = area >= 0 ? 1 : -1;
  area = Math.abs(area) / 2;
  const top = base + h, peak = top + (flat ? 0.4 : Math.min(4.5, 1.5 + h * 0.22));
  // eaves: the roof starts a little outside the walls (mitred at the corners) and a little lower than their top
  const e = flat ? 0 : Math.min(0.8, Math.sqrt(area) * 0.06), eaveY = flat ? top : top - 0.15;
  const eave = e ? ring.map(([x, z], i) => {
    const [xp, zp] = ring[(i + n - 1) % n], [xn, zn] = ring[(i + 1) % n];
    const l1 = Math.hypot(x - xp, z - zp) || 1, l2 = Math.hypot(xn - x, zn - z) || 1;
    const n1x = (sgn * (z - zp)) / l1, n1z = (-sgn * (x - xp)) / l1, n2x = (sgn * (zn - z)) / l2, n2z = (-sgn * (xn - x)) / l2;
    const k = e / Math.max(0.4, 1 + n1x * n2x + n1z * n2z);
    return [x + (n1x + n2x) * k, z + (n1z + n2z) * k];
  }) : ring;
  let inset, ridge = null;
  if (shape === 'gabled') {
    // the ridge runs along the longest wall, through the middle; every corner rises to the point of the ridge level with it
    let ax = 1, az = 0, best = -1;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0);
      if (L > best) { best = L; ax = (x1 - x0) / L; az = (z1 - z0) / L; }
    }
    ridge = [ax, az];
    inset = eave.map(([x, z]) => { const t = (x - cx) * ax + (z - cz) * az; return [cx + ax * t, cz + az * t]; });
  } else inset = eave.map(([x, z]) => [cx + (x - cx) * 0.45, cz + (z - cz) * 0.45]);
  const Z = [0, 0, 0, 0];
  const push = (a, b, c, col, wa = Z, wb = Z, wc = Z) => {
    out.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) out.col.push(col.r, col.g, col.b);
    if (out.win) out.win.push(...wa, ...wb, ...wc);
  };
  // windows only on walls of a real building (not a shed or a kiosk)
  const st = o.storey || 3, wh = h >= 2.6 && area >= 25 ? h : 0;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0);
    const W = (uu, vv) => [uu, vv, st, wh];
    // wall quad (two winding orders are both emitted via DoubleSide material, so order is not critical)
    push([x0, base - 2, z0], [x1, base - 2, z1], [x1, top, z1], wall, W(u, -2), W(u + L, -2), W(u + L, h));
    push([x0, base - 2, z0], [x1, top, z1], [x0, top, z0], wall, W(u, -2), W(u + L, h), W(u, h));
    u += L;
  }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = eave[i], [x1, z1] = eave[(i + 1) % n];
    const [u0, w0] = inset[i], [u1, w1] = inset[(i + 1) % n];
    // roof slope; on a gabled roof the end walls (both corners rise to one ridge point) are wall, not roof
    const gableEnd = shape === 'gabled' && Math.hypot(u1 - u0, w1 - w0) < 0.05 * Math.hypot(x1 - x0, z1 - z0);
    push([x0, eaveY, z0], [x1, eaveY, z1], [u1, peak, w1], gableEnd ? wall : roof);
    if (!gableEnd) push([x0, eaveY, z0], [u1, peak, w1], [u0, peak, w0], roof);
  }
  if (o.chimney && !flat) {
    // on the ridge (gabled) or the flat top of the hipped roof, a third of the way towards the first corner
    const [x0, z0] = ring[0];
    let px = cx + (x0 - cx) * 0.3, pz = cz + (z0 - cz) * 0.3;
    if (ridge) { const t = ((x0 - cx) * ridge[0] + (z0 - cz) * ridge[1]) * 0.3; px = cx + ridge[0] * t; pz = cz + ridge[1] * t; }
    const s = 0.38, y0 = peak - 0.9, y1 = peak + 1.1, stone = o.chimneyCol || new THREE.Color(0x7a746c), cap = new THREE.Color(0x3a3530);
    const c = [[px - s, pz - s], [px + s, pz - s], [px + s, pz + s], [px - s, pz + s]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
      push([ax, y0, az], [bx, y0, bz], [bx, y1, bz], stone);
      push([ax, y0, az], [bx, y1, bz], [ax, y1, az], stone);
    }
    push([c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], cap);
    push([c[0][0], y1, c[0][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]], cap);
  }
  if (shape === 'gabled') return;
  const tris = THREE.ShapeUtils.triangulateShape(inset.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, c] of tris) push([inset[a][0], peak, inset[a][1]], [inset[b][0], peak, inset[b][1]], [inset[c][0], peak, inset[c][1]], roof);
}

/**
 * The material buildings are drawn with: flat-shaded vertex colours, plus rows of windows painted on the walls
 * from the `win` attribute (no extra triangles). Far away, where a window would be smaller than about a pixel,
 * they fade into the wall instead of shimmering. `uniforms.glow` (0 by day, 1 at night) lights them warm.
 */
export function buildingMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const glow = { value: 0 };
  mat.userData.glow = glow;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 win;\nvarying vec4 vWin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = win;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vWin;\nuniform float uGlow;\nfloat winMask;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        winMask = 0.0;
        if (vWin.w > 0.0 && vWin.y > 0.6 && vWin.y < vWin.w - 0.5) {
          vec2 cell = vec2(vWin.x / 2.6, vWin.y / vWin.z);
          vec2 f = fract(cell);
          float m = step(0.22, f.x) * step(f.x, 0.78) * step(0.34, f.y) * step(f.y, 0.8);
          // fade out where the pattern gets smaller than about two pixels
          float px = max(fwidth(cell.x), fwidth(cell.y));
          winMask = mix(m, 0.2, smoothstep(0.25, 0.6, px));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.3), winMask);
        }`)
      .replace('#include <opaque_fragment>', 'outgoingLight += vec3(1.0, 0.72, 0.36) * winMask * uGlow * 0.9;\n#include <opaque_fragment>');
  };
  return mat;
}

export { lambert, vcMat };

/** How lit the windows are (0 to 1) at a local sun time in hours: dark by day, warming up from 16:00 to full by
 * 17:30, fading out again between 6:30 and 8:30. */
export function windowGlow(hours) {
  const h = ((hours % 24) + 24) % 24, s = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  if (h >= 12) return s((h - 16) / 1.5);
  return 1 - s((h - 6.5) / 2);
}

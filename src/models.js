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
 * Someone riding a lift: their own chair with them sitting on it (or, on a gondola or tram,
 * a cabin in their colour). The origin is at seat height so it can be scaled like an avatar.
 * kind: 'chair' | 'cabin'
 */
export function makeRide(kind, avatar, color) {
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4e0, transparent: true, opacity: 0.28, depthWrite: false });
  if (kind === 'cabin') {
    // a gondola cabin in their colour with glass all round; they sit on the bench inside
    const c = new THREE.Color(color), geo = mergeGeometries([
      part(box(0.14, 1.5, 0.14), 0x3a3f4a, 0, 3.0, 0),
      part(box(2.0, 0.2, 2.3), 0xe9edf2, 0, 2.1, 0),
      ...[[-0.97, -1.12], [0.97, -1.12], [-0.97, 1.12], [0.97, 1.12]].map(([x, z]) => part(box(0.08, 1.0, 0.08), 0xe9edf2, x, 1.5, z)),
      part(box(2.0, 0.95, 2.3), c, 0, 0.55, 0),
      part(box(1.6, 0.2, 1.9), 0x2a2f38, 0, 0, 0),
      part(box(0.55, 0.12, 1.9), 0x3a3f4a, -0.62, 0.62, 0),       // bench along one side
    ]);
    g.add(new THREE.Mesh(geo, vcMat()), new THREE.Mesh(box(1.96, 0.98, 2.26).translate(0, 1.5, 0), glass));
    g.userData = { ride: kind, av: seat(g, avatar, color, -0.72, 0.68 - SEAT_Y, 0, Math.PI / 2, true) };
    return g;
  }
  if (kind === 'train' || kind === 'funicular') {
    // a single rail car in the rider's colour, windows all round, a seat by the window
    const c = new THREE.Color(color), geo = mergeGeometries([
      part(box(1.9, 0.35, 4.6), 0x2a2f38, 0, 0.25, 0),
      part(box(2.1, 1.0, 4.8), c, 0, 0.95, 0),
      ...[-2.35, -0.8, 0.8, 2.35].flatMap((z) => [part(box(0.08, 0.8, 0.12), c, -1.02, 1.85, z), part(box(0.08, 0.8, 0.12), c, 1.02, 1.85, z)]),
      part(box(2.2, 0.22, 5.0), 0xe9edf2, 0, 2.3, 0),
      part(box(0.9, 0.12, 0.6), 0x3a3f4a, 0.45, 0.95, 0),          // seat
    ]);
    g.add(new THREE.Mesh(geo, vcMat()), new THREE.Mesh(box(2.06, 0.8, 4.76).translate(0, 1.85, 0), glass));
    g.userData = { ride: kind, av: seat(g, avatar, color, 0.45, 1.01 - SEAT_Y, -0.1, 0, true) };
    return g;
  }
  if (kind.startsWith('tow-')) {
    // standing on the snow, towed: a T-bar or platter pole runs from behind the hips up to the
    // cable; on a rope tow the hands hold the rope itself
    const av = makeAvatar(avatar, color);
    av.userData.rig = null;
    g.add(av);
    const style = kind.slice(4);
    if (style === 'rope') g.add(new THREE.Mesh(part(box(0.06, 0.06, 3.2), 0x8a6b3d, 0.35, 1.05, 0.6), vcMat()));
    else g.add(new THREE.Mesh(mergeGeometries([
      part(box(0.07, 3.2, 0.07), 0x3a3f4a, 0, 2.3, -0.75, -0.45),
      part(style === 'platter' ? new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10) : box(0.9, 0.1, 0.1), 0xd8dde6, 0, 0.9, -0.1, style === 'platter' ? Math.PI / 2 : 0),
    ]), vcMat()));
    g.userData = { ride: kind, av };
    return g;
  }
  // chairlift: sitting on the seat, back against the backrest, skis or board hanging in front
  const chair = new THREE.Mesh(chairGeometry(2), vcMat());
  chair.position.y = 3.4;                       // seat surface at y = 0.07, hanger rising above
  g.add(chair);
  g.userData = { ride: kind, av: seat(g, avatar, color, 0, 0.07 - SEAT_Y, 0.08, 0), seated: true };
  return g;
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

/** T-bar / platter hanger on a surface lift: hangs from the cable at y=0. */
export function tbarGeometry() {
  return mergeGeometries([
    part(box(0.08, 2.6, 0.08), 0x3a3f4a, 0, -1.3, 0),
    part(box(0.9, 0.1, 0.1), 0xd8dde6, 0, -2.6, 0),
  ]);
}

/** Platter (button) lift hanger: a single pole with a disc. */
export function platterGeometry() {
  return mergeGeometries([
    part(box(0.07, 2.6, 0.07), 0x3a3f4a, 0, -1.3, 0),
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), 0xd8dde6, 0, -2.6, 0, Math.PI / 2),
  ]);
}

/** Rope tow: a short handle hanging from the rope. */
export function ropeHandleGeometry() {
  return mergeGeometries([
    part(box(0.05, 0.9, 0.05), 0x8a6b3d, 0, -0.45, 0),
    part(box(0.45, 0.07, 0.07), 0xd8dde6, 0, -0.9, 0),
  ]);
}

/** A mountain train (two cars) or a funicular car; origin on the rails at its middle, facing +z. */
export function trainGeometry(kind) {
  const car = (z, len, body) => [
    part(box(2.2, 0.5, len - 1), 0x2a2f38, 0, 0.45, z),
    part(box(2.7, 1.3, len), body, 0, 1.35, z),
    part(box(2.6, 0.9, len - 0.6), 0x1d2530, 0, 2.4, z),
    part(box(2.8, 0.3, len + 0.2), 0xe9edf2, 0, 3.0, z),
  ];
  return mergeGeometries(kind === 'funicular' ? car(0, 16, 0x1f6fb5) : [...car(-8.3, 16, 0xb5341f), ...car(8.3, 16, 0xb5341f)]);
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

/** One section of a magic-carpet belt, lying on the ground. */
export function padGeometry() {
  return part(box(0.9, 0.08, 1.6), 0x4a515c, 0, 0.05, 0);
}

/** Ring drawn under an avatar (stale friends get a grey one). */
export function makeRing(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 20), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

/** Chairlift chair hanging from the cable at y=0, facing +Z. */
export function chairGeometry(seats, bubble = false) {
  const w = 0.55 * Math.max(2, seats || 2) + 0.2;
  // a weather bubble: tinted cover over the seat, pulled down in front (open at the back)
  const cover = bubble ? [
    part(box(w + 0.15, 0.1, 1.1), 0xd9762b, 0, -2.05, 0.25),
    part(box(w + 0.15, 1.05, 0.08), 0xd9762b, 0, -2.6, 0.82),
  ] : [];
  return mergeGeometries([
    ...cover,
    part(box(0.12, 2.6, 0.12), 0x3a3f4a, 0, -1.3, 0),
    part(box(w, 0.1, 0.12), 0x3a3f4a, 0, -2.6, 0),
    part(box(w, 0.14, 0.7), 0x25282f, 0, -3.4, 0.2),
    part(box(w, 0.9, 0.12), 0x25282f, 0, -2.95, -0.15),
    part(box(0.1, 0.9, 0.1), 0x3a3f4a, -w / 2, -3.0, -0.1),
    part(box(0.1, 0.9, 0.1), 0x3a3f4a, w / 2, -3.0, -0.1),
    part(box(w, 0.08, 0.08), 0xd8dde6, 0, -3.05, 0.6),
  ]);
}

/** Gondola cabin hanging from the cable at y=0, facing +Z. */
export function gondolaGeometry() {
  return mergeGeometries([
    part(box(0.14, 1.5, 0.14), 0x3a3f4a, 0, -0.75, 0),
    part(box(0.9, 0.16, 0.5), 0x3a3f4a, 0, -1.5, 0),
    part(box(2.0, 0.2, 2.3), 0xe9edf2, 0, -1.65, 0),
    part(box(1.9, 1.0, 2.2), 0x1d2530, 0, -2.25, 0),
    part(box(2.0, 0.95, 2.3), 0xd32f2f, 0, -3.2, 0),
    part(box(1.6, 0.2, 1.9), 0x2a2f38, 0, -3.75, 0),
  ]);
}

/** Aerial tram cabin hanging from the cable at y=0, long axis along Z. */
export function tramGeometry(color) {
  const dark = 0x1d2530;
  return mergeGeometries([
    part(box(0.5, 3.2, 0.5), 0x444a55, 0, -1.6, 0),
    part(box(1.2, 0.5, 3.2), 0x444a55, 0, -0.1, 0),
    part(box(3.2, 0.3, 6.6), 0xe9edf2, 0, -3.3, 0),
    part(box(3.0, 1.3, 6.4), dark, 0, -4.1, 0),
    part(box(3.2, 1.5, 6.6), color, 0, -5.5, 0),
    part(box(2.6, 0.35, 5.4), 0x2a2f38, 0, -6.4, 0),
  ]);
}

export function towerGeometry(h, arm) {
  return mergeGeometries([
    // a round pole, open at both ends: its foot is in the snow and its top inside the crossarm (16 + 12 triangles)
    part(new THREE.CylinderGeometry(0.28, 0.5, h, 8, 1, true), 0x6d7480, 0, h / 2, 0),
    part(box(arm, 0.35, 0.5), 0x565c68, 0, h, 0),
  ]);
}

/** Lift terminal: hut + bullwheel. */
/**
 * Lift terminal, origin on the ground under the end of the cable, +Z along the lift line.
 * Chairlift: a mast carrying the horizontal bullwheel the haul cable turns around (at `wheelY`),
 * under a roof, with an operator hut beside it. Tram: an open dock the cabins pull into.
 */
export function stationGeometry(kind, color, wheelY = 7.5, r = 2.4) {
  if (kind === 'tram') {
    return mergeGeometries([
      part(box(1, 13, 16), 0xcfc8bc, -8.5, 6.5, 0),
      part(box(1, 13, 16), 0xcfc8bc, 8.5, 6.5, 0),
      part(box(18.5, 1.2, 17), 0x4a505c, 0, 14.6, 0),
      part(box(17, 0.6, 16), 0x8a8f98, 0, 0.3, 0),
      part(box(1.2, 14, 1.2), 0x565c68, 0, 7, 0),
    ]);
  }
  return mergeGeometries([
    part(box(0.9, wheelY + 1.6, 0.9), 0x6d7480, 0, (wheelY + 1.6) / 2, 0),
    part(new THREE.CylinderGeometry(r, r, 0.35, 14), 0x30343c, 0, wheelY, 0),
    part(box(r * 2 + 3, 0.5, r * 2 + 5), color, 0, wheelY + 1.8, 0),
    part(box(2.4, 2.6, 2.6), 0xcfc8bc, r + 3.2, 1.3, 0),
    part(box(2.8, 0.3, 3), 0x343a44, r + 3.2, 2.75, 0),
  ]);
}

/** Small conifer, base at y=0. */
export function treeGeometry() {
  // two stacked 6-sided cones, smooth shaded, no bottoms (they sit in the snow or inside the tier below and are
  // not seen from above): 12 triangles a tree. Same overall size as before: 4.2 tall, radius 1 at the foot.
  return mergeGeometries([
    new THREE.ConeGeometry(1, 2.9, 6, 1, true).translate(0, 1.45, 0),
    new THREE.ConeGeometry(0.72, 2.7, 6, 1, true).rotateY(Math.PI / 6).translate(0, 1.5 + 1.35, 0),
  ]);
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
 * Extruded building with a low hipped roof. ring: [[x,z],...] counter-clockwise seen from above
 * (in world X/Z), base: ground y, h: wall height. Appends to arrays for one merged mesh.
 */
/**
 * A building from its footprint. shape: 'flat', 'hipped' (slopes on every side) or 'gabled' (a ridge along the
 * building's long side, triangular gable ends in the wall colour). `roof` is the roof's colour as seen (snow on it
 * already mixed in by the caller).
 */
export function addBuilding(out, ring, base, h, wall, roof, shape = 'hipped') {
  const n = ring.length, flat = shape === 'flat';
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x; cz += z; }
  cx /= n; cz /= n;
  const top = base + h, peak = top + (flat ? 0.4 : Math.min(4.5, 1.5 + h * 0.22));
  let inset;
  if (shape === 'gabled') {
    // the ridge runs along the longest wall, through the middle; every corner rises to the point of the ridge level with it
    let ax = 1, az = 0, best = -1;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0);
      if (L > best) { best = L; ax = (x1 - x0) / L; az = (z1 - z0) / L; }
    }
    inset = ring.map(([x, z]) => { const t = (x - cx) * ax + (z - cz) * az; return [cx + ax * t, cz + az * t]; });
  } else inset = ring.map(([x, z]) => [cx + (x - cx) * 0.45, cz + (z - cz) * 0.45]);
  const push = (a, b, c, col) => {
    out.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) out.col.push(col.r, col.g, col.b);
  };
  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
    const [u0, w0] = inset[i], [u1, w1] = inset[(i + 1) % n];
    // wall quad (two winding orders are both emitted via DoubleSide material, so order is not critical)
    push([x0, base - 2, z0], [x1, base - 2, z1], [x1, top, z1], wall);
    push([x0, base - 2, z0], [x1, top, z1], [x0, top, z0], wall);
    // roof slope; on a gabled roof the end walls (both corners rise to one ridge point) are wall, not roof
    const gableEnd = shape === 'gabled' && Math.hypot(u1 - u0, w1 - w0) < 0.05 * Math.hypot(x1 - x0, z1 - z0);
    push([x0, top, z0], [x1, top, z1], [u1, peak, w1], gableEnd ? wall : roof);
    if (!gableEnd) push([x0, top, z0], [u1, peak, w1], [u0, peak, w0], roof);
  }
  if (shape === 'gabled') return;
  const tris = THREE.ShapeUtils.triangulateShape(inset.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, c] of tris) push([inset[a][0], peak, inset[a][1]], [inset[b][0], peak, inset[b][1]], [inset[c][0], peak, inset[c][1]], roof);
}

export { lambert, vcMat };

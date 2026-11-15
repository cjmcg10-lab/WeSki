// Low-poly models: avatars, chairs, tram cabins, towers, stations, buildings, trees, markers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/**
 * A skier or snowboarder, ~1.8 units tall, travelling towards +Z.
 * avatar: 'boy-ski' | 'girl-ski' | 'boy-board' | 'girl-board'
 * The skis / board always point along the direction of travel; a snowboarder's body is
 * turned sideways on the board. `userData.rig` is the part that animateAvatar() moves.
 */
export function makeAvatar(avatar, color) {
  const [who, ride] = avatar.split('-');
  const girl = who === 'girl', board = ride === 'board';
  const jacket = new THREE.Color(color);
  const pants = jacket.clone().multiplyScalar(0.35).add(new THREE.Color(0x1a2030));
  const skin = 0xf2c49b, helmet = jacket.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const parts = [];
  // legs (knees bent), torso leaning forward, arms
  parts.push(part(box(0.2, 0.62, 0.22), pants, -0.14, 0.45, 0, 0.18));
  parts.push(part(box(0.2, 0.62, 0.22), pants, 0.14, 0.45, 0, 0.18));
  parts.push(part(girl ? new THREE.CylinderGeometry(0.2, 0.34, 0.66, 6) : box(0.52, 0.64, 0.3), jacket, 0, 1.06, 0.06, 0.22));
  parts.push(part(box(0.13, 0.5, 0.14), jacket, -0.36, 1.06, 0.14, -0.7));
  parts.push(part(box(0.13, 0.5, 0.14), jacket, 0.36, 1.06, 0.14, -0.7));
  // head, helmet, goggles
  parts.push(part(new THREE.IcosahedronGeometry(0.19, 0), skin, 0, 1.56, 0.14));
  parts.push(part(new THREE.SphereGeometry(0.215, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet, 0, 1.6, 0.13));
  parts.push(part(box(0.3, 0.09, 0.08), 0x20242c, 0, 1.6, 0.31));
  if (girl) {
    // braids so the silhouette reads differently from the boy
    parts.push(part(box(0.1, 0.42, 0.1), 0x8a4b22, -0.13, 1.3, -0.1, -0.25));
    parts.push(part(box(0.1, 0.42, 0.1), 0x8a4b22, 0.13, 1.3, -0.1, -0.25));
  } else {
    parts.push(part(box(0.34, 0.36, 0.16), pants, 0, 1.1, -0.2, 0.22)); // backpack
  }
  const gear = [];
  if (board) {
    gear.push(part(box(0.3, 0.05, 1.55), 0x15181f, 0, 0.1, 0));       // long axis = direction of travel
    gear.push(part(box(0.32, 0.03, 1.25), helmet, 0, 0.135, 0));
  } else {
    gear.push(part(box(0.11, 0.04, 1.75), 0x15181f, -0.15, 0.1, 0.1));
    gear.push(part(box(0.11, 0.04, 1.75), 0x15181f, 0.15, 0.1, 0.1));
    parts.push(part(box(0.03, 0.95, 0.03), 0x30343c, -0.44, 0.62, 0.02, 0.9));
    parts.push(part(box(0.03, 0.95, 0.03), 0x30343c, 0.44, 0.62, 0.02, 0.9));
  }
  const body = new THREE.Mesh(mergeGeometries(parts), vcMat());
  // Sideways stance: the rider stands across the board, which keeps pointing downhill.
  if (board) body.rotation.y = Math.PI / 2;
  const rig = new THREE.Group();
  rig.add(new THREE.Mesh(mergeGeometries(gear), vcMat()), body);
  const g = new THREE.Group();
  g.add(rig);
  g.userData = { rig, body, board, phase: Math.random() * 6.28, amt: 0 };
  return g;
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

/** Ring drawn under an avatar (stale friends get a grey one). */
export function makeRing(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 20), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

/** Chairlift chair hanging from the cable at y=0, facing +Z. */
export function chairGeometry(seats) {
  const w = 0.55 * Math.max(2, seats || 2) + 0.2;
  return mergeGeometries([
    part(box(0.12, 2.6, 0.12), 0x3a3f4a, 0, -1.3, 0),
    part(box(w, 0.1, 0.12), 0x3a3f4a, 0, -2.6, 0),
    part(box(w, 0.14, 0.7), 0x25282f, 0, -3.4, 0.2),
    part(box(w, 0.9, 0.12), 0x25282f, 0, -2.95, -0.15),
    part(box(0.1, 0.9, 0.1), 0x3a3f4a, -w / 2, -3.0, -0.1),
    part(box(0.1, 0.9, 0.1), 0x3a3f4a, w / 2, -3.0, -0.1),
    part(box(w, 0.08, 0.08), 0xd8dde6, 0, -3.05, 0.6),
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
    part(new THREE.CylinderGeometry(0.28, 0.5, h, 5), 0x6d7480, 0, h / 2, 0),
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
  return new THREE.ConeGeometry(1, 4.2, 4).translate(0, 2.1, 0); // one 4-sided cone: cheap on phones
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
export function addBuilding(out, ring, base, h, wall, roof, flat = false) {
  const n = ring.length;
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x; cz += z; }
  cx /= n; cz /= n;
  const top = base + h, peak = top + (flat ? 0.4 : Math.min(4.5, 1.5 + h * 0.22));
  const inset = ring.map(([x, z]) => [cx + (x - cx) * 0.45, cz + (z - cz) * 0.45]);
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
    // roof slope
    push([x0, top, z0], [x1, top, z1], [u1, peak, w1], roof);
    push([x0, top, z0], [u1, peak, w1], [u0, peak, w0], roof);
  }
  const tris = THREE.ShapeUtils.triangulateShape(inset.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, c] of tris) push([inset[a][0], peak, inset[a][1]], [inset[b][0], peak, inset[b][1]], [inset[c][0], peak, inset[c][1]], roof);
}

export { lambert, vcMat };

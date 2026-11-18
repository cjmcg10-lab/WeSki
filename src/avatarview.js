// 3D previews of riders for the Group tab and the Customize page: one small WebGL renderer,
// shared, draws either a slowly turning live preview or still pictures (cached) for lists.
import * as THREE from 'three';
import { makeAvatar, animateAvatar, waveAvatar, endWave } from './models.js';

let R = null;
let held = null;   // the angle the rider was last turned to by hand (kept while the page re-draws)
function setup() {
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(2.5, 4, 3.5);
  scene.add(sun);
  // a small round of snow to stand on
  const snow = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.14, 32), new THREE.MeshLambertMaterial({ color: 0xeaf2fa }));
  snow.position.y = -0.02;
  scene.add(snow);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  R = { renderer, scene, camera, holder: new THREE.Group(), thumbs: new Map(), live: null };
  scene.add(R.holder);
  return R;
}

function show(avatar, color) {
  const r = setup();
  r.holder.clear();
  const av = makeAvatar(avatar, color);
  r.holder.add(av);
  return av;
}

function frame(w, h, close) {
  const r = setup();
  r.renderer.setSize(w, h, false);
  r.camera.aspect = w / h;
  r.camera.position.set(0, close ? 1.35 : 1.5, close ? 4.3 : 5.4);
  r.camera.lookAt(0, close ? 0.95 : 0.9, 0);
  r.camera.updateProjectionMatrix();
}

/** A still picture of a rider (data URL), turned three-quarters to the viewer. Cached. */
export function avatarThumb(avatar, color, size = 120) {
  const key = `${avatar}|${color}|${size}`;
  const r = setup();
  if (r.thumbs.has(key)) return r.thumbs.get(key);
  const live = r.live;
  const av = show(avatar, color);
  av.rotation.y = 0.55;
  frame(size, size, true);
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL('image/png');
  r.thumbs.set(key, url);
  if (live) { r.holder.clear(); r.holder.add(live.av); }   // put the live preview back
  return url;
}

/**
 * A live, slowly turning preview inside `el` (a sized box). Returns a stop function. Only one
 * live preview runs at a time. Drag sideways to turn the rider round; a tap makes them wave.
 */
export function mountPreview(el, avatar, color) {
  const r = setup();
  if (r.live) r.live.stop();
  const canvas = r.renderer.domElement;
  el.innerHTML = '';
  el.appendChild(canvas);
  canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block';
  const av = show(avatar, color);
  let alive = true, last = performance.now(), t = 0, wave = null;
  const live = { av, stop: () => { alive = false; if (r.live === live) r.live = null; } };
  r.live = live;
  // drag to turn the rider; once turned by hand it stays where it is put
  let yaw = held ?? 0, manual = held != null, drag = null;
  canvas.style.touchAction = 'pan-y';
  canvas.onpointerdown = (e) => { drag = { x: e.clientX, y0: yaw, moved: false, id: e.pointerId }; canvas.setPointerCapture?.(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) { manual = true; wave = null; endWave(av); yaw = drag.y0 + dx * 0.012; held = yaw; }
  };
  canvas.onpointerup = canvas.onpointercancel = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && e.type === 'pointerup') wave = 0;
    drag = null;
  };
  const loop = () => {
    if (!alive || !el.isConnected) { live.stop(); return; }
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now; t += dt;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    frame(w, h, false);
    if (!manual) yaw = Math.sin(t * 0.5) * 0.7;              // turn gently from side to side until turned by hand
    av.userData.baseYaw = yaw;
    if (wave != null) {
      wave += dt / 2.8;
      if (wave >= 1) { wave = null; endWave(av); } else waveAvatar(av, wave, 0);
    } else av.rotation.y = av.userData.baseYaw;
    animateAvatar(av, t, dt, false);
    r.renderer.render(r.scene, r.camera);
  };
  loop();
  return live.stop;
}

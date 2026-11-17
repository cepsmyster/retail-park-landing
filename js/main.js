// Retail Park: sun through brick. The pointer is the sun and the scroll is the day.
import * as THREE from 'three';
import { initPage } from './page.js';
import { initAudio, updateAudio } from './audio.js';
import { sunAt, sunVector, clockText } from './sun.js';
import { screenUniforms, buildScreen, buildRoom, eastOpening, ROOM, depthMaterial } from './screen.js';
import { buildSky, AO_BOX } from './site.js';
import { createPost } from './post.js';

const q = new URLSearchParams(location.search);
const FROZEN_T = q.has('t') ? parseFloat(q.get('t')) || 0 : null;
const FROZEN = FROZEN_T !== null || q.has('s') || q.has('view');
const HQ = q.get('hq') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T0 = performance.now();
const rp = (window.__rp = { ready: false });

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
renderer.setClearColor(0x120d0a, 1);
renderer.autoClear = true;
const gl = renderer.getContext();
try { const e = gl.getExtension('WEBGL_debug_renderer_info'); rp.gpu = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { rp.gpu = ''; }

// ---- shared uniforms ----------------------------------------------------------------------------------
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
const SM = 4096;
const shadowRT = new THREE.WebGLRenderTarget(SM, SM, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
shadowRT.depthTexture = new THREE.DepthTexture(SM, SM, THREE.UnsignedIntType);
shadowRT.depthTexture.compareFunction = THREE.LessEqualCompare;
shadowRT.depthTexture.minFilter = THREE.LinearFilter; shadowRT.depthTexture.magFilter = THREE.LinearFilter;
const U = {
  uSunDir: { value: new THREE.Vector3(0.9, 0.1, 0.3) }, uSunCol: { value: new THREE.Color(1, 0.6, 0.3) },
  uSkyZen: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uGndCol: { value: new THREE.Color() },
  uLampPos: { value: new THREE.Vector3(181, 6, -39.6) }, uLampCol: { value: new THREE.Color(0, 0, 0) }, uGroup: { value: new THREE.Vector3() },
  uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0.0003 }, uExposure: { value: 1 }, uTime: { value: 0 }, uPixAng: { value: 0.001 },
  uSunRad: { value: 0.0056 }, uWash: { value: 0 }, uLabel: { value: 0 },
  uShadowMap: { value: shadowRT.depthTexture }, uShadowRaw: { value: shadowRT.texture }, uShadowMat: { value: new THREE.Matrix4() }, uShadowPar: { value: new THREE.Vector4(1 / SM, 0.05, 1200, 0) },
  uAO: { value: white }, uNightMap: { value: black }, uAOBox: { value: new THREE.Vector4(AO_BOX.x0, AO_BOX.y0, 1 / AO_BOX.w, 1 / AO_BOX.h) },
};
screenUniforms(U);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 12000);
const sky = buildSky(U); scene.add(sky);
const screen = buildScreen(U); scene.add(screen);
let room = null, site = null;

// ---- the day ---------------------------------------------------------------------------------------------
const CLOCK = [7.02, 8.17, 9.67, 12.1, 15.33, 16.9, 18.3, 19.5];          // local time at each section, hours
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (f) => lerp(f, f * f * (3 - 2 * f), 0.72);
const easedP = (p) => { const i = Math.min(6, Math.floor(p)); return i + ease(clamp(p - i, 0, 1)); };

const ATM = [   // elevation, zenith, horizon, exposure, fog density
  [-18, [0.0030, 0.0055, 0.015], [0.006, 0.009, 0.022], 5.0, 0.00016],
  [-9, [0.008, 0.016, 0.050], [0.032, 0.030, 0.052], 4.2, 0.00018],
  [-4, [0.045, 0.075, 0.170], [0.42, 0.21, 0.13], 2.6, 0.00022],
  [0, [0.095, 0.160, 0.340], [0.80, 0.44, 0.24], 1.20, 0.00028],
  [6, [0.115, 0.235, 0.520], [0.78, 0.60, 0.45], 0.74, 0.00032],
  [20, [0.105, 0.250, 0.640], [0.60, 0.66, 0.74], 0.72, 0.00030],
  [50, [0.090, 0.240, 0.680], [0.52, 0.63, 0.78], 0.64, 0.00026],
];
function atmosphere(el) {
  let i = 0; while (i < ATM.length - 2 && el > ATM[i + 1][0]) i++;
  const a = ATM[i], b = ATM[i + 1], t = clamp((el - a[0]) / (b[0] - a[0]), 0, 1);
  const mix3 = (x, y) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  const zen = mix3(a[1], b[1]), hor = mix3(a[2], b[2]);
  // direct sun: Rayleigh and haze over the air mass (Kasten and Young)
  const e = Math.max(el, 0.05);
  const am = 1 / (Math.sin(e * Math.PI / 180) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
  const k = 3.3 * sstep(-1.6, 1.2, el);
  const sun = [k * Math.exp(-0.052 * am), k * Math.exp(-0.092 * am), k * Math.exp(-0.165 * am)];
  return { zen, hor, sun, exposure: lerp(a[3], b[3], t), fog: lerp(a[4], b[4], t) };
}

// ---- cameras: one composed view per section, in plan coordinates (x east, y north, z up) -------------------
const op = eastOpening(50.4, 8);
const KEYS = [
  { p: 0.00, pos: [184.35, 52.2, 5.20], tgt: [176.5, 46.3, 5.80], fov: 41, posP: [184.6, 60.6, 5.1], tgtP: [176.5, 46.4, 5.95], fovP: 62, sh: [180, 48, 40] },
  { p: 0.36, pos: [op.x - 0.95, op.y, op.z], tgt: [op.x + 6, op.y, op.z], fov: 46, fovP: 62 },
  { p: 0.48, pos: [op.x, op.y, op.z], tgt: [op.x + 7, op.y, op.z], fov: 46, fovP: 62 },
  { p: 0.58, pos: [op.x + 1.3, op.y, op.z], tgt: [op.x + 8, op.y - 0.6, op.z - 0.2], fov: 46, fovP: 62 },
  { p: 0.72, pos: [op.x + 6.5, op.y - 3.5, op.z + 1.2], tgt: [op.x + 8.5, op.y - 12, op.z - 0.6], fov: 42, fovP: 60 },
  { p: 0.86, pos: [199.0, 36.0, 5.0], tgt: [188.0, 42.5, 5.3], fov: 36, fovP: 58 },
  { p: 1.00, pos: [203.5, 27.5, 2.7], tgt: [180.8, 46.5, 5.7], fov: 33, posP: [203.0, 14.0, 2.6], tgtP: [183.5, 41.5, 6.6], fovP: 52, sh: [182, 45, 44] },
  { p: 2.00, pos: [122, -168, 112], tgt: [122, 74, 0], fov: 36, posP: [318, 8, 150], tgtP: [112, 66, 0], fovP: 50, sh: [122, 62, 178] },
  { p: 2.55, pos: [78, 14, 24], tgt: [82, 58, 3], fov: 46, fovP: 62 },
  { p: 3.00, pos: [53.2, 52.0, 1.75], tgt: [84, 60.5, 3.0], fov: 54, fovP: 74, sh: [72, 56, 48] },
  { p: 3.26, pos: [60, 44.5, 7.6], tgt: [92, 42, 2.5], fov: 50, fovP: 70 },
  { p: 3.55, pos: [100, 27, 12], tgt: [126, 40, 2], fov: 46, fovP: 64 },
  { p: 4.00, pos: [168, 30.2, 6.8], tgt: [124, 46, 1.5], fov: 42, fovP: 62, sh: [132, 44, 66] },
  { p: 4.50, pos: [176, 86, 30], tgt: [120, 118, 4], fov: 42, fovP: 60 },
  { p: 4.84, pos: [149.5, 113.4, 5.9], tgt: [118, 124.5, 5.0], fov: 46, fovP: 64 },
  { p: 5.00, pos: [129.5, 120.9, 5.8], tgt: [93, 131.2, 4.6], fov: 44, fovP: 64, sh: [96, 126, 62] },
  { p: 5.16, pos: [147.0, 114.4, 6.0], tgt: [112, 126.5, 5.0], fov: 46, fovP: 64 },
  { p: 5.40, pos: [176, 92, 36], tgt: [146, 66, 2], fov: 38, fovP: 56 },
  { p: 6.00, pos: [262, -40, 66], tgt: [138, 54, 0], fov: 34, posP: [262, -52, 92], tgtP: [150, 50, 0], fovP: 50, sh: [140, 60, 170] },
  { p: 7.00, pos: [204.2, 37.8, 3.2], tgt: [184.6, 46.0, 4.6], fov: 52, posP: [204.4, 37.8, 3.4], tgtP: [184.6, 45.0, 6.0], fovP: 72, sh: [180, 45, 60] },
];
const toV = (a) => new THREE.Vector3(a[0], a[2], -a[1]);
function prepKeys(portrait) {
  let prevYaw = null;
  return KEYS.map((k) => {
    const pos = toV(portrait && k.posP ? k.posP : k.pos), tgt = toV(portrait && k.tgtP ? k.tgtP : k.tgt);
    const d = tgt.clone().sub(pos).normalize();
    let yaw = Math.atan2(d.x, -d.z); const pitch = Math.asin(d.y);
    if (prevYaw !== null) { while (yaw - prevYaw > Math.PI) yaw -= 2 * Math.PI; while (yaw - prevYaw < -Math.PI) yaw += 2 * Math.PI; }
    prevYaw = yaw;
    return { p: k.p, v: [pos.x, pos.y, pos.z, yaw, pitch, portrait && k.fovP ? k.fovP : k.fov] };
  });
}
let keysL = prepKeys(false), keysP = prepKeys(true);
function sampleKeys(keys, p, out) {
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const h = k2.p - k1.p, t = clamp((p - k1.p) / h, 0, 1), t2 = t * t, t3 = t2 * t;
  for (let c = 0; c < 6; c++) {
    const m1 = k1 === k0 ? (k2.v[c] - k1.v[c]) / h : (k2.v[c] - k0.v[c]) / (k2.p - k0.p);
    const m2 = k3 === k2 ? (k2.v[c] - k1.v[c]) / h : (k3.v[c] - k1.v[c]) / (k3.p - k1.p);
    out[c] = (2 * t3 - 3 * t2 + 1) * k1.v[c] + (t3 - 2 * t2 + t) * h * m1 + (-2 * t3 + 3 * t2) * k2.v[c] + (t3 - t2) * h * m2;
  }
  return out;
}
const DBG = q.has('cam') ? q.get('cam').split(',').map(Number) : null;
const SH = KEYS.filter((k) => k.sh).map((k) => ({ p: k.p, sh: k.sh }));
function shadowFocus(p) {
  let i = 0; while (i < SH.length - 2 && p > SH[i + 1].p) i++;
  const a = SH[i], b = SH[i + 1], t = clamp((p - a.p) / (b.p - a.p), 0, 1);
  return [lerp(a.sh[0], b.sh[0], t), lerp(a.sh[1], b.sh[1], t), lerp(a.sh[2], b.sh[2], t)];
}

// ---- input: the pointer is the sun -------------------------------------------------------------------------
const ptr = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, last: -1e9, touchX: null, touchY: null, used: false };
function setPtr(nx, ny, now) { ptr.tx = clamp(nx, -1, 1); ptr.ty = clamp(ny, -1, 1); ptr.last = now; ptr.used = true; }
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  setPtr((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1, performance.now());
});
window.addEventListener('touchstart', (e) => { const t = e.touches[0]; ptr.touchX = t.clientX; ptr.touchY = t.clientY; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0]; if (ptr.touchX === null) return;
  const dx = t.clientX - ptr.touchX, dy = t.clientY - ptr.touchY; ptr.touchX = t.clientX; ptr.touchY = t.clientY;
  if (Math.abs(dx) > Math.abs(dy) * 0.6) setPtr(ptr.tx + dx / innerWidth * 2.6, ptr.ty, performance.now());
}, { passive: true });

const post = createPost(renderer);
// ---- size ----------------------------------------------------------------------------------------------------
let scale = 1, baseDpr = 1, slow = 0;
function resize() {
  baseDpr = HQ ? (window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(baseDpr * scale);
  renderer.setSize(innerWidth, innerHeight, false);
  post.resize(canvas.width, canvas.height);
  camera.aspect = innerWidth / innerHeight;
}
window.addEventListener('resize', resize); resize();

// ---- shadow pass ------------------------------------------------------------------------------------------------
const shadowCam = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 1201);
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _f = new THREE.Vector3();
let drawables = [], shadowInit = false;
function collect() { drawables = []; scene.traverse((o) => { if (o.isMesh || o.isPoints) drawables.push(o); }); for (const o of drawables) if (o.userData.shadowOnly) o.visible = false; }
function renderShadow(p, sunDir, el) {
  if (el < -1.2 && shadowInit) { U.uShadowPar.value.w = 0; return; }
  shadowInit = true;
  const f = shadowFocus(p), R = f[2];
  _f.set(f[0], 2, -f[1]);
  shadowCam.left = -R; shadowCam.right = R; shadowCam.top = R; shadowCam.bottom = -R;
  shadowCam.position.copy(_f).addScaledVector(sunDir, 600); shadowCam.up.set(0, 1, 0); shadowCam.lookAt(_f);
  shadowCam.updateProjectionMatrix(); shadowCam.updateMatrixWorld(true);
  // keep the map still on the ground: snap to whole texels in light space
  const texel = 2 * R / SM;
  _v.copy(_f).applyMatrix4(shadowCam.matrixWorldInverse);
  const ox = _v.x - Math.round(_v.x / texel) * texel, oy = _v.y - Math.round(_v.y / texel) * texel;
  shadowCam.position.addScaledVector(_v.set(1, 0, 0).transformDirection(shadowCam.matrixWorld), ox).addScaledVector(_v.set(0, 1, 0).transformDirection(shadowCam.matrixWorld), oy);
  shadowCam.updateMatrixWorld(true);
  U.uShadowMat.value.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
  U.uShadowPar.value.set(1 / SM, texel, 1200, el < -1.2 ? 0 : 1);
  const saved = [];
  for (const o of drawables) {
    saved.push(o.visible, o.material);
    if (o.userData.noShadow || !o.userData.depthMat) o.visible = false; else { o.visible = true; o.material = o.userData.depthMat; }
  }
  U.uShadowMap.value = null; U.uShadowRaw.value = null;
  renderer.setRenderTarget(shadowRT); renderer.setClearColor(0xffffff, 1); renderer.clear();
  renderer.render(scene, shadowCam);
  renderer.setRenderTarget(null); renderer.setClearColor(0x120d0a, 1);
  U.uShadowMap.value = shadowRT.depthTexture; U.uShadowRaw.value = shadowRT.texture;
  for (let i = 0; i < drawables.length; i++) { drawables[i].visible = saved[i * 2]; drawables[i].material = saved[i * 2 + 1]; }
}

// ---- page, sound --------------------------------------------------------------------------------------------------
const page = initPage();
initAudio(document.getElementById('sound'));
const clocks = Array.from(document.querySelectorAll('[data-clock]'));
const root = document.documentElement;
let lastClock = '', lastTheme = '';

// ---- frame -----------------------------------------------------------------------------------------------------------
const sunDir = new THREE.Vector3(), cam6 = [0, 0, 0, 0, 0, 0], cam6b = [0, 0, 0, 0, 0, 0], _look = new THREE.Vector3();
let pS = null, prevNow = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prevNow) / 1000); prevNow = now;
  const time = FROZEN_T !== null ? FROZEN_T : (REDUCED ? 0 : (now - T0) / 1000);
  let p = page.progress();
  if (REDUCED) p = Math.round(p);
  if (pS === null || FROZEN || REDUCED) pS = p; else pS += (p - pS) * (1 - Math.exp(-dt / 0.085));
  const pe = easedP(pS);

  // pointer with weight; it drifts when left alone
  const idle = !ptr.used || (now - ptr.last) > 2600;
  const driftX = 0.55 * Math.sin(time * 0.23 + 0.6) + 0.2 * Math.sin(time * 0.071), driftY = 0.45 * Math.sin(time * 0.17 + 2.1);
  let gx = idle ? driftX : ptr.tx, gy = idle ? driftY : ptr.ty;
  if (REDUCED) { gx = 0; gy = 0; }
  if (FROZEN_T !== null || REDUCED) { ptr.x = gx; ptr.y = gy; ptr.vx = ptr.vy = 0; }
  else {   // critically damped spring: slow ease, never a snap
    const w = idle ? 1.1 : 2.3;
    ptr.vx += (w * w * (gx - ptr.x) - 2 * w * ptr.vx) * dt; ptr.vy += (w * w * (gy - ptr.y) - 2 * w * ptr.vy) * dt;
    ptr.x += ptr.vx * dt; ptr.y += ptr.vy * dt;
    if (idle) { ptr.tx = ptr.x; ptr.ty = ptr.y; }
  }

  // the hour
  const i = Math.min(6, Math.floor(pe)), hours = q.has('clock') ? parseFloat(q.get('clock')) : lerp(CLOCK[i], CLOCK[i + 1], pe - i);
  const s = sunAt(hours);
  const day = sstep(-1.5, 1.0, s.el);
  const az = s.az + ptr.x * 9.0 * day, el = s.el > 0.3 ? Math.max(1.3, s.el - ptr.y * (3.2 + 0.05 * s.el) * day) : s.el;
  sunVector(az, el, sunDir);
  const A = atmosphere(el);
  U.uSunDir.value.copy(sunDir); U.uSunCol.value.setRGB(A.sun[0], A.sun[1], A.sun[2]);
  U.uSkyZen.value.setRGB(A.zen[0], A.zen[1], A.zen[2]); U.uSkyHor.value.setRGB(A.hor[0], A.hor[1], A.hor[2]);
  const sy = Math.max(sunDir.y, 0);
  U.uGndCol.value.setRGB(0.50 * (A.sun[0] * sy * 0.32 + A.hor[0] * 0.20 + A.zen[0] * 0.2), 0.34 * (A.sun[1] * sy * 0.32 + A.hor[1] * 0.2 + A.zen[1] * 0.2), 0.22 * (A.sun[2] * sy * 0.32 + A.hor[2] * 0.2 + A.zen[2] * 0.2));
  U.uFogCol.value.setRGB(lerp(A.hor[0], A.zen[0], 0.25), lerp(A.hor[1], A.zen[1], 0.25), lerp(A.hor[2], A.zen[2], 0.25));
  U.uFogDen.value = A.fog; U.uExposure.value = A.exposure; U.uTime.value = time;
  sky.userData.stars.value = sstep(-5, -14, el);
  // night comes on in turn: shopfronts, then the strings, then the screen and its lamp
  const g1 = sstep(17.22, 17.52, hours), g2 = sstep(17.56, 17.84, hours), g3 = sstep(17.86, 18.16, hours);
  U.uGroup.value.set(g1, g2, g3); U.uWash.value = g3 * 0.9;
  const flick = 1 + 0.02 * Math.sin(time * 9.0) * Math.sin(time * 2.3);
  U.uLampCol.value.setRGB(46 * g3 * flick, 27.5 * g3 * flick, 12.5 * g3 * flick);
  { const f7 = sstep(6.15, 6.9, pS); U.uLampPos.value.set(lerp(180.9 + 2.5 * ptr.x, 182.5, f7), 6.05 - 1.25 * ptr.y, -lerp(39.9 - 0.9 * ptr.x, 44.5 + 5.0 * ptr.x, f7)); }
  U.uLabel.value = sstep(1.5, 1.9, pS) * (1 - sstep(2.2, 2.6, pS)) * 0.92;

  // camera
  const asp = innerWidth / innerHeight, pw = sstep(1.15, 0.8, asp);
  sampleKeys(keysL, pe, cam6);
  if (pw > 0) { sampleKeys(keysP, pe, cam6b); for (let c = 0; c < 6; c++) cam6[c] = lerp(cam6[c], cam6b[c], pw); }
  if (DBG) { const d = toV([DBG[3], DBG[4], DBG[5]]).sub(toV(DBG)).normalize(); const v = toV(DBG); cam6[0] = v.x; cam6[1] = v.y; cam6[2] = v.z; cam6[3] = Math.atan2(d.x, -d.z); cam6[4] = Math.asin(d.y); cam6[5] = DBG[6] || 40; }
  camera.position.set(cam6[0], cam6[1], cam6[2]);
  // the air moves a little: a slow breath on the camera, not a shake
  if (!REDUCED) { camera.position.x += 0.012 * Math.sin(time * 0.31) * (pe < 0.3 ? 1 : 3); camera.position.y += 0.008 * Math.sin(time * 0.23 + 1.0) * (pe < 0.3 ? 1 : 3); }
  const cp = Math.cos(cam6[4]);
  _look.set(camera.position.x + Math.sin(cam6[3]) * cp, camera.position.y + Math.sin(cam6[4]), camera.position.z - Math.cos(cam6[3]) * cp);
  camera.up.set(0, 1, 0); camera.lookAt(_look);
  camera.fov = cam6[5]; camera.near = pe < 0.8 ? 0.03 : lerp(0.03, 1.0, sstep(0.8, 1.8, pe)); camera.far = 12000;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const bh = renderer.domElement.height, tanH = Math.tan(camera.fov * Math.PI / 360);
  U.uPixAng.value = 2 * tanH / bh;
  if (room) {
    const b = 1 - sstep(0.30, 0.50, pe); room.userData.beam.value = b; room.userData.box.visible = room.userData.dust.visible = b > 0.001;
    room.userData.dustPx.value = bh / (2 * tanH);
  }
  if (site && site.userData.glowPx) site.userData.glowPx.value = bh / (2 * tanH);

  if (site && site.userData.dirty) { site.userData.dirty = false; collect(); }
  renderShadow(pe, sunDir, el);
  renderer.setRenderTarget(post.target); renderer.setClearColor(0x000000, 1); renderer.clear();
  renderer.render(scene, camera);
  post.render(camera);

  // the copy takes the light of the hour
  const warm = clamp(1 - el / 30, 0, 1) * day, night = 1 - day;
  const ink = [lerp(lerp(248, 255, warm), 250, night), lerp(lerp(246, 236, warm), 232, night), lerp(lerp(240, 212, warm), 205, night)].map(Math.round);
  const veilA = [0.46, 0.44, 0.50, 0.50, 0.46, 0.44, 0.50, 0.55];
  const va = lerp(veilA[i], veilA[i + 1], pe - i);
  const theme = `${ink.join(',')}|${va.toFixed(2)}`;
  if (theme !== lastTheme) {
    lastTheme = theme;
    root.style.setProperty('--ink', `rgb(${ink.join(',')})`); root.style.setProperty('--ink-2', `rgba(${ink.join(',')},0.74)`);
    root.style.setProperty('--veil', `rgba(${Math.round(lerp(24, 8, night))},${Math.round(lerp(14, 7, night))},${Math.round(lerp(9, 8, night))},${va.toFixed(2)})`);
    root.style.setProperty('--accent', night > 0.5 ? '#a9c6e8' : '#9cbde2');
  }
  const ct = clockText(hours);
  if (ct !== lastClock) { lastClock = ct; for (const c of clocks) c.textContent = ct; }
  updateAudio({ day: clamp(pe / 5.4, 0, 1), night: sstep(17.2, 18.2, hours), time });

  // weaker machines: lower the internal resolution when frames run long (never with ?hq=1, never when frozen)
  if (!HQ && !FROZEN) {
    if (dt > 0.024) slow++; else slow = Math.max(0, slow - 0.5);
    if (slow > 40 && scale > 0.55) { scale = Math.max(0.55, scale - 0.1); slow = 0; resize(); }
  }
  frames++;
  if (frames === 2) rp.heroAt = Math.round(performance.now() - T0);
  if (frames === 3 && !site && !rp.loading) loadSite();
  if (site && !rp.ready && frames > rp.siteFrame + 2) { rp.ready = true; rp.readyAt = Math.round(performance.now() - T0); }
}
rp.info = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, scale, w: canvas.width, h: canvas.height });

async function loadSite() {
  rp.loading = true;
  try {
    const mod = await import('./site.js');
    const built = await mod.buildSite(U, renderer, KEYS.filter((k) => k.p > 0.9).map((k) => k.pos));
    // compile the site's shaders off the main thread where the browser allows it, so the hero does not hitch
    try {
      if (renderer.compileAsync) {   // same output state as the real frames, or the programs would be built twice
        renderer.setRenderTarget(post.target); const pr = renderer.compileAsync(built, camera, scene); renderer.setRenderTarget(null); await pr;
      }
    } catch (e) { /* compile on first use instead */ }
    site = built; scene.add(site); collect(); rp.siteFrame = frames;
  } catch (e) { console.error('site failed to load', e); rp.siteFrame = frames; site = new THREE.Group(); }
}

// ---- start: the hero is made in code and needs only one small texture -------------------------------------------------
new THREE.TextureLoader().load('tex/letters_sdf.png', (tex) => {
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  room = buildRoom(U, tex, { capPx: 386.81, W: 4096, H: 768, range: 40 });
  scene.add(room); collect();
  requestAnimationFrame(frame);
});
void ROOM; void depthMaterial;

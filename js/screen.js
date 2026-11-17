// The brick screen of the corner building (Option 1) and the room behind it. All made in code.
// Plan coordinates (metres, +x east, +y north) come from blender/SPEC.md: the ground-floor wall line of the
// lattice building, the screen 0.60 m outside it, z 3.85 .. 8.66, 26 courses.
import * as THREE from 'three';
import { COMMON, COMMON_A, VERT_DEPTH, FRAG_DEPTH } from './glsl.js';

const xw = (y) => 0.3236 * y + 151.05;
const GF_Q = [[184.52, 67.85], [xw(67.85), 67.85], [xw(36.05), 36.05], [184.52, 36.05]]; // NE, NW, SW, SE (counter-clockwise)
const R_OUT = [1.5, 1.4, 1.8, 2.4];      // outer-face corner radii
export const SCR = {
  z0: 3.85, courses: 26, pitch: 0.185, depth: 0.14, open: 0.18, openH: 0.179,
  offOuter: 0.60, moduleTarget: 0.46, ceil: 7.75,
};
SCR.z1 = SCR.z0 + SCR.courses * SCR.pitch;
export const ROOM = { xWall: 176.5, yS: 35.62, yN: 60.0, floor: 3.85, ceil: SCR.ceil, txtY: 46.4, txtZ: 5.92, cap: 0.95, letH: 0.055 };

// ---- outline at the mid surface of the blocks ---------------------------------------------------------
function buildLoop() {
  const off = SCR.offOuter - SCR.depth / 2;
  const n = 4, E = [];
  for (let i = 0; i < n; i++) {
    const a = GF_Q[i], b = GF_Q[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const T = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], N = [T[1], -T[0]];
    E.push({ T, N, p: [a[0] + N[0] * off, a[1] + N[1] * off] });
  }
  const V = [];
  for (let i = 0; i < n; i++) {           // vertex i = meeting of run i-1 and run i
    const e0 = E[(i + n - 1) % n], e1 = E[i];
    const det = e0.T[0] * (-e1.T[1]) - (-e1.T[0]) * e0.T[1];
    const dx = e1.p[0] - e0.p[0], dy = e1.p[1] - e0.p[1];
    const t = (dx * (-e1.T[1]) - (-e1.T[0]) * dy) / det;
    V.push([e0.p[0] + e0.T[0] * t, e0.p[1] + e0.T[1] * t]);
  }
  const corner = [];
  for (let i = 0; i < n; i++) {
    const e0 = E[(i + n - 1) % n], e1 = E[i];
    const r = R_OUT[i] - SCR.depth / 2;
    const cosPhi = e0.T[0] * e1.T[0] + e0.T[1] * e1.T[1];
    const phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
    const tl = r * Math.tan(phi / 2);
    const C = [V[i][0] - e0.T[0] * tl - e0.N[0] * r, V[i][1] - e0.T[1] * tl - e0.N[1] * r];
    corner.push({ r, phi, tl, C, a0: Math.atan2(e0.N[1], e0.N[0]) });
  }
  const runs = []; let s = 0;
  for (let i = 0; i < n; i++) {
    const c0 = corner[i], c1 = corner[(i + 1) % n], e = E[i];
    const a = V[i], b = V[(i + 1) % n];
    const full = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const start = [a[0] + e.T[0] * c0.tl, a[1] + e.T[1] * c0.tl];
    const L = full - c0.tl - c1.tl;
    runs.push({ start, T: e.T, N: e.N, L, s0: s, r: c1.r, sc: s + L, C: c1.C, a0: c1.a0, phi: c1.phi });
    s += L + c1.r * c1.phi;
  }
  return { runs, total: s };
}
export const LOOP = buildLoop();
SCR.count = Math.round(LOOP.total / SCR.moduleTarget);
SCR.module = LOOP.total / SCR.count;

export function loopPoint(s) {
  s = ((s % LOOP.total) + LOOP.total) % LOOP.total;
  for (const r of LOOP.runs) {
    if (s <= r.s0 + r.L) { const e = s - r.s0; return { x: r.start[0] + r.T[0] * e, y: r.start[1] + r.T[1] * e, tx: r.T[0], ty: r.T[1], nx: r.N[0], ny: r.N[1] }; }
    if (s <= r.sc + r.r * r.phi) { const a = r.a0 + (s - r.sc) / r.r; const nx = Math.cos(a), ny = Math.sin(a); return { x: r.C[0] + nx * r.r, y: r.C[1] + ny * r.r, tx: -ny, ty: nx, nx, ny }; }
  }
  return loopPoint(0);
}
// centre of the opening nearest to a plan y on the east face, in a given course
export function eastOpening(planY, course) {
  const r = LOOP.runs[3];
  const off = (course % 2) ? SCR.module / 2 : 0;
  const sWant = r.s0 + (planY - r.start[1]);
  const k = Math.round((sWant - off - SCR.open / 2) / SCR.module);
  const s = k * SCR.module + off + SCR.open / 2;
  const p = loopPoint(s);
  return { x: p.x, y: p.y, z: SCR.z0 + course * SCR.pitch + SCR.openH / 2, nx: p.nx, ny: p.ny };
}

export function screenUniforms(U) {
  U.uScrE = { value: LOOP.runs.map((r) => new THREE.Vector4(r.start[0], r.start[1], r.T[0], r.T[1])) };
  U.uScrF = { value: LOOP.runs.map((r) => new THREE.Vector4(r.L, r.s0, r.r, r.sc)) };
  U.uScrC = { value: LOOP.runs.map((r) => new THREE.Vector4(r.C[0], r.C[1], r.a0, r.phi)) };
  U.uScrP = { value: new THREE.Vector4(SCR.module, SCR.pitch, SCR.open, SCR.openH) };
  U.uScrZ = { value: new THREE.Vector4(SCR.z0, SCR.z1, SCR.depth, SCR.ceil) };
  U.uRoom = { value: new THREE.Vector4(ROOM.xWall, 186.0, ROOM.yS, ROOM.yN) };
  const rS = LOOP.runs[2], rE = LOOP.runs[3];
  U.uLampS = { value: new THREE.Vector2(rS.s0 + (ROOM.xWall + 0.1 - rS.start[0]), rE.s0 + (ROOM.yN - 0.1 - rE.start[1])) };
}

// ---- the blocks ------------------------------------------------------------------------------------------
const BRICK_VERT = /* glsl */`
attribute vec4 aRnd;
varying vec3 vW, vN, vL, vNl, vT, vOut; varying vec4 vRnd;
void main(){
  vec4 p = instanceMatrix * vec4(position, 1.0);
  vL = position; vNl = normal; vRnd = aRnd;
  vT = normalize(mat3(instanceMatrix) * vec3(1.0, 0.0, 0.0));
  vOut = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
  vN = normalize(mat3(instanceMatrix) * normal);
  vW = p.xyz;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;
const BRICK_FRAG = COMMON + /* glsl */`
uniform vec3 uHalf;
varying vec3 vW, vN, vL, vNl, vT, vOut; varying vec4 vRnd;
float revealVis(vec3 Lw, float e){
  float lT = dot(Lw, vT), lU = Lw.y, lN = dot(Lw, vOut);
  float ndl = vNl.x*lT + vNl.y*lU + vNl.z*lN;
  if (ndl <= 0.0) return 0.0;
  if (abs(vNl.z) > 0.5) return ndl;
  float sg = lN >= 0.0 ? 1.0 : -1.0; float aN = max(abs(lN), 1e-3);
  float q = uHalf.z - sg*vL.z;
  float du = q*lT/aN, dv = q*lU/aN; float a = uScrP.z;
  if (abs(vNl.x) > 0.5) {
    float y = vL.y + dv;
    return ndl * (1.0 - smoothstep(a - e, a + e, abs(du))) * smoothstep(-uHalf.y - e, -uHalf.y + e, y) * (1.0 - smoothstep(uHalf.y - e, uHalf.y + e, y));
  }
  float x = vL.x + du;
  return ndl * smoothstep(-0.5*a - e, -0.5*a + e, x) * (1.0 - smoothstep(0.5*a - e, 0.5*a + e, x)) * (1.0 - smoothstep(uScrP.y - e, uScrP.y + e, abs(dv)));
}
void main(){
  vec3 n = normalize(vN);
  float dist = length(cameraPosition - vW); float fp = dist*uPixAng;
  // terracotta: three clays, block to block, with grog, pits and a drag texture from the extruder
  vec3 base = mix(vec3(0.43, 0.118, 0.066), vec3(0.355, 0.088, 0.050), smoothstep(0.35, 0.65, vRnd.x));
  base = mix(base, vec3(0.50, 0.160, 0.092), smoothstep(0.72, 0.95, vRnd.y));
  base *= 0.82 + 0.36*vRnd.z;
  base = mix(base, base*vec3(0.80, 0.84, 1.02), smoothstep(0.80, 1.0, vRnd.w)*0.55);
  base = mix(base, base*vec3(1.10, 1.04, 0.86), smoothstep(0.0, 0.18, 0.18 - vRnd.w)*0.9);
  vec3 gp = vL + vRnd.wzy*31.0;
  float fadeHi = 1.0 - smoothstep(0.0025, 0.009, fp), fadeMid = 1.0 - smoothstep(0.012, 0.05, fp);
  float cloud = vnoise3(gp*vec3(9.0, 14.0, 9.0));
  float drag = vnoise3(gp*vec3(14.0, 190.0, 14.0));
  float grit = vnoise3(gp*230.0), grit2 = vnoise3(gp*520.0 + 7.0);
  base *= 0.84 + 0.32*cloud;
  float mid = vnoise3(gp*64.0); base *= 1.0 + fadeMid*0.22*(mid - 0.5);
  base *= 1.0 + fadeMid*0.10*(drag - 0.5);
  base *= 1.0 + fadeHi*(0.16*(grit - 0.5) + 0.10*(grit2 - 0.5));
  base = mix(base, base*0.62, fadeHi*smoothstep(0.80, 0.92, grit2)*0.8);
  base = mix(base, vec3(0.66, 0.33, 0.20), fadeHi*smoothstep(0.84, 0.95, grit)*0.45);
  // arrises: the edges of a fired block are a little rounded and darker
  vec3 dE = uHalf - abs(vL);
  float edge = abs(vNl.x) > 0.5 ? min(dE.y, dE.z) : (abs(vNl.y) > 0.5 ? min(dE.x, dE.z) : min(dE.x, dE.y));
  float ew = max(0.0035, fp*1.2);
  float arris = 1.0 - smoothstep(0.0, ew, edge);
  base *= 1.0 - 0.38*arris;
  // mortar bed: 6 mm at the top of the block, where a block of the next course sits on it
  float bed = smoothstep(uHalf.y - 0.0065 - fp*0.6, uHalf.y - 0.0065 + fp*0.6, vL.y);
  float seat = abs(vNl.z) > 0.5 ? smoothstep(0.5*uScrP.z - fp, 0.5*uScrP.z + fp, abs(vL.x)) : (abs(vNl.x) > 0.5 ? 1.0 : 0.0);
  float mort = bed*seat;
  vec3 mcol = vec3(0.46, 0.40, 0.33)*(0.8 + 0.4*vnoise3(gp*120.0));
  base = mix(base, mcol, mort*0.9);

  bool outer = vNl.z > 0.5, inner = vNl.z < -0.5;
  float tOut = clamp((vL.z + uHalf.z)/(2.0*uHalf.z), 0.0, 1.0);   // 0 at the room side, 1 at the street side
  float e = max(0.003, fp);
  // sun
  float vis = revealVis(uSunDir, e);
  float sh = vis > 0.0 ? sunShadow(vW, n) : 0.0;
  vec3 lit = uSunCol*vis*sh;
  // sky and room
  float aoOut = outer ? 1.0 : (inner ? 0.0 : tOut*tOut*0.75);
  float aoIn = inner ? 1.0 : (outer ? 0.0 : (1.0 - tOut)*(1.0 - tOut)*0.8);
  aoOut *= 1.0 - 0.25*arris;
  vec3 amb = hemi(n)*aoOut;
  float wide; float sIn = scrSun(vW - vOut*0.5, uSunDir, 0.3, uScrZ.w, wide);
  vec3 roomL = hemi(vec3(0.0, 0.3, 0.0))*0.42 + uSkyHor*0.20 + uSunCol*wide*vec3(0.90, 0.52, 0.32)*0.40;
  amb += roomL*aoIn;
  // sun bounced between blocks: the lit reveals glow into the shaded ones
  amb += uSunCol*vec3(0.55, 0.20, 0.11)*0.16*max(dot(uSunDir, vOut), 0.0)*(outer ? 0.0 : tOut);
  // night: the room, the lamp and the wash of the strip at the foot of the screen
  vec3 night = uGroup.z*vec3(1.0, 0.60, 0.30)*0.55*aoIn;
  if (uLampCol.r > 0.0) { vec3 Lv = uLampPos - vW; float D = length(Lv); night += uLampCol*0.12*revealVis(Lv/D, e)/(1.0 + 0.05*D*D); }
  float up = vW.y - uScrZ.x;
  night += uWash*vec3(1.0, 0.55, 0.26)*(outer ? 1.0 : tOut*0.7)*(exp(-up/1.1)*1.6 + 0.10)*(0.6 + 0.4*max(-n.y, 0.0));
  // pools of the lamp posts and shopfronts on the street side
  vec2 pl = vec2(vW.x, -vW.z);
  vec3 nm = texture(uNightMap, (pl - uAOBox.xy)*uAOBox.zw).rgb;
  night += (nm.r*uGroup.x*vec3(1.0, 0.72, 0.42) + nm.b*uGroup.x*vec3(1.0, 0.80, 0.55))*0.35*aoOut;
  vec3 col = base*(lit + amb + night);
  col = applyFog(col, vW);
  gl_FragColor = vec4(finish(col), 1.0);
}`;

export function buildScreen(U) {
  const group = new THREE.Group();
  const half = new THREE.Vector3((SCR.module - SCR.open) / 2, SCR.pitch / 2, SCR.depth / 2);
  const geo = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2);
  const count = SCR.count * SCR.courses;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uHalf: { value: half } }, vertexShader: BRICK_VERT, fragmentShader: BRICK_FRAG });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rnd = new Float32Array(count * 4);
  const m = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3();
  let seed = 7; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let i = 0;
  for (let c = 0; c < SCR.courses; c++) {
    const off = (c % 2) ? SCR.module / 2 : 0;
    for (let k = 0; k < SCR.count; k++) {
      const s = k * SCR.module + off + (SCR.open + SCR.module) / 2;
      const p = loopPoint(s);
      X.set(p.tx, 0, -p.ty); Z.set(p.nx, 0, -p.ny);
      m.makeBasis(X, Y, Z); m.setPosition(p.x, SCR.z0 + (c + 0.5) * SCR.pitch, -p.y);
      mesh.setMatrixAt(i, m);
      rnd[i * 4] = rand(); rnd[i * 4 + 1] = rand(); rnd[i * 4 + 2] = rand(); rnd[i * 4 + 3] = rand();
      i++;
    }
  }
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  group.add(mesh);

  // solid stand-in for the shadow map, at the room face of the blocks
  const pts = [], idx = [], N = 480;
  for (let j = 0; j <= N; j++) {
    const p = loopPoint(LOOP.total * j / N); const o = SCR.depth / 2;
    pts.push(p.x - p.nx * o, SCR.z0 - 0.3, -(p.y - p.ny * o), p.x - p.nx * o, SCR.z1 + 0.34, -(p.y - p.ny * o));
    if (j < N) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); pg.setIndex(idx);
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pts.length / 3 * 2), 2));
  const proxy = new THREE.Mesh(pg, new THREE.MeshBasicMaterial());
  proxy.userData.shadowOnly = true; proxy.userData.depthMat = depthMaterial(0, THREE.DoubleSide);
  group.add(proxy);
  return group;
}

const depthCache = {};
export function depthMaterial(kind, side = THREE.FrontSide) {
  const key = kind + '_' + side;
  if (!depthCache[key]) depthCache[key] = new THREE.ShaderMaterial({ vertexShader: VERT_DEPTH, fragmentShader: FRAG_DEPTH, defines: { KIND: kind }, side });
  return depthCache[key];
}

// ---- the room: pale wall with raised letters, terracotta floor, white ceiling, dust ------------------------
const ROOM_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;

const ROOM_LIGHT = /* glsl */`
// light inside the room for a point with normal n. Returns direct sun (already times n.l), ambient and night light.
void roomLight(vec3 wp, vec3 n, float fp, float extraShadow, out vec3 direct, out vec3 amb){
  float wide; float T = scrSun(wp, uSunDir, fp*0.7, uScrZ.w, wide);
  direct = uSunCol*max(dot(n, uSunDir), 0.0)*T*extraShadow;
  vec2 pl = vec2(wp.x, -wp.z);
  float dScreen = clamp((186.0 - pl.x)/9.5, 0.0, 1.0);           // nearer the screen, more sky
  amb = (hemi(vec3(n.x*0.6, n.y*0.5 + 0.15, n.z*0.6))*0.45 + uSkyHor*0.52 + uSkyZen*0.14)*(0.46 + 0.40*(1.0 - dScreen)*max(n.x*0.5 + 0.5, 0.0));
  // first bounce off the terracotta floor and the brick, warm
  float hgt = clamp((wp.y - uScrZ.x)/(uScrZ.w - uScrZ.x), 0.0, 1.0);
  amb += uSunCol*wide*vec3(1.0, 0.66, 0.44)*(0.13 + 0.15*(1.0 - hgt)*(0.5 - 0.5*n.y) + 0.06*max(n.y, 0.0));
  // night
  amb += uGroup.z*vec3(1.0, 0.64, 0.34)*0.42*(0.55 + 0.45*hgt);
  if (uLampCol.r > 0.0) { vec3 Lv = uLampPos - wp; float D = length(Lv); amb += uLampCol*max(dot(n, Lv/D), 0.0)/(1.0 + 0.6*D*D)*0.5; }
}`;

const WALL_FRAG = COMMON + ROOM_LIGHT + /* glsl */`
uniform sampler2D uSdf; uniform vec4 uTxt;   // centre a, centre b, width, height (metres)
uniform float uSdfK, uLetH;
varying vec3 vW; varying vec3 vN;
float sdfAt(vec2 ab){
  vec2 uv = (ab - uTxt.xy)/uTxt.zw + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return uSdfK*0.5;
  return (0.5 - textureLod(uSdf, uv, 0.0).r)*uSdfK;
}
float letterShadow(vec2 ab, float c, float aa){
  vec3 l = vec3(-uSunDir.z, uSunDir.y, uSunDir.x);
  if (l.z < 0.01) return 0.0;
  vec2 lat = l.xy*((uLetH - c)/l.z); float ll = length(lat);
  float d0 = sdfAt(ab);
  if (d0 > ll + aa) return 1.0;
  float m = 1e3;
  for (int i = 0; i < 14; i++) { float t = (float(i) + 0.7)/14.0; m = min(m, sdfAt(ab + lat*t) + 0.0015*(1.0 - t)); }
  return smoothstep(-aa, aa, m);
}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW); float fp = dist*uPixAng;
  vec2 ab0 = vec2(-vW.z, vW.y);
  vec3 v = vec3(-V.z, V.y, max(V.x, 0.02));
  vec2 top = ab0 + v.xy*(uLetH/v.z);
  float dTop = sdfAt(top);
  float aa = max(fp*0.75/max(v.z, 0.25), 0.0004);
  float covTop = 1.0 - smoothstep(-aa, aa, dTop);
  // march the eye ray through the thickness of the letters
  vec2 dir = ab0 - top; float len = length(dir); float tHit = -1.0;
  if (dTop > -aa && len > 1e-5) {
    float tt = 0.0;
    for (int i = 0; i < 28; i++) { float d = sdfAt(top + dir*tt); if (d < 0.0005) { tHit = tt; break; } tt += max(d, 0.0015)/len; if (tt >= 1.0) break; }
  }
  // plaster: lime wash, trowel marks, a little grain
  vec2 pp = ab0;
  float trowel = fbm(pp*vec2(0.9, 1.7)) - 0.5, grain = vnoise(pp*85.0) - 0.5, fine = vnoise(pp*310.0) - 0.5;
  float fadeHi = 1.0 - smoothstep(0.002, 0.008, fp);
  float tr2 = fbm(pp*vec2(2.6, 5.2) + 4.0) - 0.5;
  vec3 plaster = vec3(0.80, 0.765, 0.705)*(1.0 + 0.10*trowel + 0.06*tr2 + fadeHi*(0.045*grain + 0.04*fine));
  plaster *= 0.985 + 0.03*smoothstep(0.35, 0.6, fbm(pp*0.35 + 9.0));
  vec3 letCol = vec3(0.200, 0.060, 0.036)*(0.92 + 0.16*vnoise(top*140.0)*fadeHi);

  vec3 dW, aW;                      // behind: wall or letter side
  vec3 colRest;
  if (tHit >= 0.0) {
    vec2 q = top + dir*tHit; float c = uLetH*(1.0 - tHit);
    float ex = max(aa, 0.0012);
    vec2 g = vec2(sdfAt(q + vec2(ex, 0.0)) - sdfAt(q - vec2(ex, 0.0)), sdfAt(q + vec2(0.0, ex)) - sdfAt(q - vec2(0.0, ex)));
    g = normalize(g + 1e-6);
    vec3 nS = normalize(vec3(0.15, g.y, -g.x));
    vec3 wp = vec3(uRoom.x + c, q.y, -q.x);
    roomLight(wp + nS*0.004, nS, fp, letterShadow(q + g*0.003, c, aa), dW, aW);
    colRest = letCol*0.85*(dW + aW*(0.45 + 0.55*c/uLetH));
  } else {
    float sh = letterShadow(ab0, 0.0, aa);
    roomLight(vW + vec3(0.002, 0.0, 0.0), vec3(1.0, 0.0, 0.0), fp, sh, dW, aW);
    float contact = 0.72 + 0.28*smoothstep(0.0, 0.035, sdfAt(ab0));
    float gap = smoothstep(uScrZ.x + 0.048, uScrZ.x + 0.050 + fp, vW.y) * (1.0 - smoothstep(uScrZ.w - 0.03, uScrZ.w - 0.026, vW.y)*0.6);
    colRest = plaster*(dW + aW*contact)*(0.35 + 0.65*gap);
  }
  vec3 dT, aT; vec3 wpT = vec3(uRoom.x + uLetH, top.y, -top.x);
  roomLight(wpT, vec3(1.0, 0.0, 0.0), fp, 1.0, dT, aT);
  float rim = 1.0 - 0.25*smoothstep(-0.006, 0.0, dTop);
  vec3 colTop = letCol*(dT + aT)*rim;
  { float ex2 = 0.002; vec2 g2 = normalize(vec2(sdfAt(top + vec2(ex2, 0.0)) - sdfAt(top - vec2(ex2, 0.0)), sdfAt(top + vec2(0.0, ex2)) - sdfAt(top - vec2(0.0, ex2))) + 1e-6);
    vec3 l2 = vec3(-uSunDir.z, uSunDir.y, uSunDir.x);
    float band = smoothstep(-0.0045 - aa, -0.0030, dTop)*(1.0 - smoothstep(-0.0012, 0.0, dTop));
    colTop += dT*vec3(0.55, 0.30, 0.20)*band*max(dot(g2, normalize(l2.xy + 1e-5)), 0.0)*1.6; }
  // a low sheen on the painted steel of the letters
  vec3 H = normalize(V + uSunDir); float wideU; float Ts = scrSun(wpT, uSunDir, fp, uScrZ.w, wideU);
  colTop += uSunCol*Ts*pow(max(H.x, 0.0), 60.0)*0.05;
  vec3 col = mix(colRest, colTop, covTop);
  col = applyFog(col, vW);
  gl_FragColor = vec4(finish(col), 1.0);
}`;

const SURF_FRAG = COMMON + ROOM_LIGHT + /* glsl */`
uniform float uKind;     // 0 floor, 1 ceiling, 2 end wall
varying vec3 vW; varying vec3 vN;
void main(){
  vec2 pl = vec2(vW.x, -vW.z);
  vec2 C = uScrC[2].xy; float r = uScrF[2].z;
  if (pl.x > C.x && pl.y < C.y && length(pl - C) > r - 0.05) discard;
  for (int i = 0; i < 4; i++) { vec2 T = uScrE[i].zw; if (dot(pl - uScrE[i].xy, vec2(T.y, -T.x)) > -0.05) discard; }
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW); float fp = dist*uPixAng;
  float fadeHi = 1.0 - smoothstep(0.002, 0.008, fp), fadeMid = 1.0 - smoothstep(0.02, 0.07, fp);
  vec3 alb; float spec = 0.0; vec3 emis = vec3(0.0);
  if (uKind < 0.5) {
    // terracotta tiles, 400 mm, 5 mm joints, laid square to the wall
    vec2 tq = pl/0.40; vec2 id = floor(tq); vec2 f = fract(tq);
    vec2 jd = min(f, 1.0 - f)*0.40;                 // metres to the nearest joint centre, each way
    vec2 px = max(fwidth(pl), vec2(1e-5));
    vec2 wj = max(vec2(0.0030), px*0.75);            // half width drawn: never thinner than a pixel
    vec2 lj = (1.0 - smoothstep(wj*0.6, wj*1.4, jd))*min(vec2(0.0030)/wj, vec2(1.0));
    float joint = max(lj.x, lj.y);
    float h = hash21(id), h2 = hash21(id + 31.7);
    alb = mix(vec3(0.48, 0.175, 0.095), vec3(0.56, 0.235, 0.135), h)*(0.90 + 0.2*h2);
    alb *= 1.0 + fadeMid*0.16*(fbm(pl*3.1 + id*7.3) - 0.5) + fadeHi*0.09*(vnoise(pl*190.0) - 0.5);
    alb = mix(alb, vec3(0.30, 0.25, 0.21), joint*0.9);
    spec = 0.06*(1.0 - joint)*(0.7 + 0.6*h2);
  } else if (uKind < 1.5) {
    alb = vec3(0.84, 0.83, 0.81)*(1.0 + 0.03*(fbm(pl*1.3) - 0.5));
    // shadow gaps every 3.6 m, a perimeter gap, and recessed downlights on a 1.8 m grid
    float gq = abs(fract(pl.y/3.6) - 0.5)*3.6; alb *= 0.40 + 0.60*smoothstep(0.010, 0.014 + fp, gq);
    float pg = min(pl.x - uRoom.x, uRoom.w - pl.y); alb *= 0.35 + 0.65*smoothstep(0.035, 0.045 + fp, pg);
    vec2 dq = (fract(vec2(pl.x - uRoom.x - 0.9, pl.y)/1.8 + 0.5) - 0.5)*1.8; float dr = length(dq);
    float can = 1.0 - smoothstep(0.045, 0.050 + fp, dr);
    alb = mix(alb, vec3(0.05), can*0.92);
    alb = mix(alb, vec3(0.70, 0.70, 0.69), (1.0 - smoothstep(0.004, 0.006 + fp, abs(dr - 0.056)))*0.8);
    emis = vec3(1.0, 0.74, 0.46)*can*(1.0 - smoothstep(0.0, 0.04, dr))*uGroup.z*6.0;
  } else {
    alb = vec3(0.79, 0.755, 0.70)*(1.0 + 0.08*(fbm(vec2(pl.x, vW.y)*vec2(1.0, 1.8)) - 0.5));
  }
  vec3 dW, aW; roomLight(vW + n*0.002, n, fp, 1.0, dW, aW);
  // contact shade where floor and ceiling meet the walls
  float edge = min(pl.x - uRoom.x, uRoom.w - pl.y);
  float occ = uKind < 1.5 ? 0.80 + 0.20*smoothstep(0.0, 0.5, edge) : 1.0;
  vec3 col = alb*(dW + aW*occ) + emis;
  if (spec > 0.0) {
    vec3 R = reflect(-V, n); float fr = spec + 0.55*pow(1.0 - max(dot(n, V), 0.0), 5.0);
    float wd; float Tr = scrSun(vW + n*0.002, R, 0.05 + 0.02*dist, uScrZ.w, wd);
    col += fr*skyColor(R)*Tr*0.55;
    if (R.x < -0.001) {
      float tw = (uRoom.x - vW.x)/R.x; vec3 hp = vW + R*tw;
      if (hp.y > uScrZ.x && hp.y < uScrZ.w && -hp.z < uRoom.w) {
        float w2; float Tw = scrSun(hp + vec3(0.002, 0.0, 0.0), uSunDir, 0.02 + 0.035*tw, uScrZ.w, w2);
        vec3 wallL = vec3(0.80, 0.765, 0.705)*(uSunCol*max(uSunDir.x, 0.0)*Tw + (uSkyHor*0.5 + uSunCol*w2*0.14));
        col += fr*wallL*0.9;
      }
    }
  }
  col = applyFog(col, vW);
  gl_FragColor = vec4(finish(col), 1.0);
}`;

const BEAM_FRAG = COMMON + /* glsl */`
varying vec3 vW; varying vec3 vN;
uniform float uBeam;
void main(){
  vec3 ro = cameraPosition; vec3 rd = vW - ro; float L = length(rd); rd /= L;
  L = min(L, 30.0);
  float j = hash21(floor(gl_FragCoord.xy) + 3.0);
  const int NS = 30; float acc = 0.0;
  for (int i = 0; i < NS; i++) {
    float t = (float(i) + j)/float(NS)*L; vec3 p = ro + rd*t;
    vec2 pl = vec2(p.x, -p.z);
    if (pl.x < uRoom.x || pl.y > uRoom.w || p.y < uScrZ.x || p.y > uScrZ.w || !insideScreen(pl)) continue;
    float wd; float T = scrSun(p, uSunDir, 0.085 + t*0.004, uScrZ.w, wd);
    float dens = 0.6 + 0.8*vnoise3(p*0.7 + vec3(uTime*0.03, -uTime*0.012, uTime*0.02));
    acc += T*dens;
  }
  acc *= L/float(NS);
  float cosT = dot(rd, uSunDir); float g = 0.55;
  float phase = (1.0 - g*g)/pow(1.0 + g*g - 2.0*g*cosT, 1.5)*0.25;
  vec3 col = uSunCol*acc*(0.010 + 0.030*phase)*uBeam*uExposure;
  gl_FragColor = vec4(col/(1.0 + max(col.r, max(col.g, col.b)))*0.8, 1.0);
}`;

const DUST_VERT = COMMON_A + /* glsl */`
attribute vec4 aSeed;
varying float vB; varying float vA;
uniform float uPx;
void main(){
  vec3 p = position;
  float t = uTime;
  p.x += 0.35*sin(t*0.05*(0.5 + aSeed.x) + aSeed.y*6.28) + 0.03*sin(t*0.9*aSeed.z + aSeed.w*9.0);
  p.y += 0.25*sin(t*0.04*(0.5 + aSeed.y) + aSeed.z*6.28) + 0.04*sin(t*0.7*aSeed.w);
  p.z += 0.35*sin(t*0.045*(0.5 + aSeed.z) + aSeed.x*6.28);
  float wd; vB = scrSun(p, uSunDir, 0.01, uScrZ.w, wd);
  vec4 mv = viewMatrix*vec4(p, 1.0);
  gl_Position = projectionMatrix*mv;
  float sz = (0.004 + 0.007*aSeed.w)/max(-mv.z, 0.2);
  gl_PointSize = clamp(sz*uPx, 1.0, 40.0);
  vA = clamp(sz*uPx, 0.0, 1.0);
  if (vB < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const DUST_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunCol; uniform float uExposure, uBeam;
varying float vB; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5; float d = length(q)*2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d));
  vec3 c = uSunCol*vB*a*vA*1.4*uBeam*uExposure;
  gl_FragColor = vec4(c/(1.0 + c)*0.8, 1.0);
}`;

export function buildRoom(U, sdfTex, sdfInfo) {
  const g = new THREE.Group();
  const xW = ROOM.xWall, yS = ROOM.yS, yN = ROOM.yN, zF = ROOM.floor, zC = ROOM.ceil, xE = 186.0;
  const quad = (pts, kind, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat || new THREE.ShaderMaterial({ uniforms: { ...U, uKind: { value: kind } }, vertexShader: ROOM_VERT, fragmentShader: SURF_FRAG }));
    m.userData.noShadow = true; m.frustumCulled = false; g.add(m); return m;
  };
  // three.js axes: (x, height, -planY)
  quad([[xW, zF, -yS], [xE, zF, -yS], [xE, zF, -yN], [xW, zF, -yN]], 0);
  quad([[xW, zC, -yS], [xW, zC, -yN], [xE, zC, -yN], [xE, zC, -yS]], 1);
  quad([[xW, zF, -yN], [xE, zF, -yN], [xE, zC, -yN], [xW, zC, -yN]], 2);
  const mpp = ROOM.cap / sdfInfo.capPx;
  const wallMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uSdf: { value: sdfTex }, uTxt: { value: new THREE.Vector4(ROOM.txtY, ROOM.txtZ, sdfInfo.W * mpp, sdfInfo.H * mpp) },
      uSdfK: { value: 2 * sdfInfo.range * mpp }, uLetH: { value: ROOM.letH } },
    vertexShader: ROOM_VERT, fragmentShader: WALL_FRAG });
  quad([[xW, zF, -yS], [xW, zF, -yN], [xW, zC, -yN], [xW, zC, -yS]], 3, wallMat);

  // air: beams and motes
  const beamU = { ...U, uBeam: { value: 1 } };
  const box = new THREE.Mesh(new THREE.BoxGeometry(xE - xW, zC - zF, yN - yS),
    new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: ROOM_VERT, fragmentShader: BEAM_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  box.position.set((xW + xE) / 2, (zF + zC) / 2, -(yS + yN) / 2); box.renderOrder = 50; box.userData.noShadow = true; box.frustumCulled = false;
  g.add(box);
  const n = 3600, pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  let s = 11; const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    pos[i * 3] = xW + 0.3 + rand() * (184.6 - xW - 0.3); pos[i * 3 + 1] = zF + 0.1 + rand() * (zC - zF - 0.2); pos[i * 3 + 2] = -(yS + 2.5 + rand() * (yN - yS - 3));
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rand();
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const dustU = { ...U, uPx: { value: 2000 }, uBeam: beamU.uBeam };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: dustU, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  dust.frustumCulled = false; dust.renderOrder = 51; dust.userData.noShadow = true;
  g.add(dust);
  g.userData = { beam: beamU.uBeam, dustPx: dustU.uPx, box, dust };
  return g;
}

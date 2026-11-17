// The whole site: geometry exported from the Blender model (architecture and ground only), dressed in code:
// materials, trees, palms, cars, figures, lettering on the ground, lamps, sky and dunes.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../lib/addons/loaders/DRACOLoader.js';
import { COMMON, COMMON_A, VERT_SITE } from './glsl.js';
import { depthMaterial } from './screen.js';

export const AO_BOX = { x0: -20, y0: -15, w: 285, h: 165 };

const FRAG_SITE = COMMON + /* glsl */`
uniform vec3 uColor, uEmit; uniform float uRough, uTex, uEmitGrp, uOpacity;
uniform sampler2D uMap;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vC; varying vec2 vUv2;
float grp(float g){ return g < 0.5 ? uGroup.x : (g < 1.5 ? uGroup.y : (g < 2.5 ? uGroup.z : 1.0)); }
void main(){
  vec3 n = normalize(vN);
  #if KIND != 10
  if (!gl_FrontFacing) n = -n;
  #endif
  vec2 pl = vec2(vW.x, -vW.z);
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW); float fp = dist*uPixAng;
  float fadeHi = 1.0 - smoothstep(0.004, 0.02, fp), fadeMid = 1.0 - smoothstep(0.04, 0.2, fp), fadeLo = 1.0 - smoothstep(0.3, 1.5, fp);
  vec3 alb = uColor*vC; float alpha = uOpacity; float spec = 0.0;
  bool inside = vW.y > uScrZ.x - 0.02 && vW.y < uScrZ.y + 0.3 && insideScreen(pl);
  #ifdef CUT
    if (inside && pl.x > uRoom.x - 0.3 && pl.y < uRoom.w + 0.25 && vW.y < uScrZ.w + 0.02) discard;
    if (!insideScreenM(pl, 0.40) && vW.y > uScrZ.x + 0.08 && vW.y < uScrZ.y - 0.06) discard;
  #endif
  #if KIND == 9
    { float st = fract(vUv2.x*72.0 + 0.35*abs(vUv2.y - 0.5)*8.0), aw9 = max(fwidth(vUv2.x*72.0), 1e-4);
      float leaf = smoothstep(0.40 - aw9, 0.40 + aw9, st)*(1.0 - smoothstep(1.0 - aw9, 1.0, st));
      float rib = 1.0 - smoothstep(0.035, 0.06, abs(vUv2.y - 0.5));
      alpha = max(leaf, rib);
      alpha = mix(alpha, 0.62, smoothstep(0.004, 0.02, fp));
      if (alpha < 0.02) discard; }
    alb *= 0.70 + 0.6*vUv2.x;
  #endif
  #if KIND == 8
    float a8 = texture(uMap, vUv2).r*uLabel; if (a8 < 0.004) discard; alpha = a8;
  #endif
  #if KIND == 1
    if (uTex < 0.5) { alb *= 0.93 + fadeMid*0.14*(fbm(pl*0.9 + vW.y) ) ; }
    else if (uTex < 1.5) {            // asphalt
      alb *= 5.0; alb *= 0.80 + fadeLo*0.30*fbm(pl*0.35) + fadeHi*0.5*(vnoise(pl*55.0) - 0.5) + fadeMid*0.2*(vnoise(pl*7.0) - 0.5);
      spec = 0.03;
    } else if (uTex < 2.5) {          // pavers 300 x 150, stretcher bond
      vec2 q = pl/vec2(0.30, 0.15); q.x += 0.5*floor(q.y); vec2 f = fract(q); vec2 jd = min(f, 1.0 - f)*vec2(0.30, 0.15);
      float j = (1.0 - smoothstep(0.003, 0.006 + fp, min(jd.x, jd.y)))*(1.0 - smoothstep(0.02, 0.08, fp));
      alb *= (0.86 + 0.28*hash21(floor(q)))*(1.0 - 0.45*j); alb *= 0.94 + fadeHi*0.12*vnoise(pl*120.0);
    } else if (uTex < 3.5) {          // sand
      float r = fbm(pl*0.06); alb *= 0.82 + 0.36*r; alb *= 1.0 + fadeMid*0.10*(vnoise(pl*vec2(2.2, 9.0) + r*8.0) - 0.5) + fadeHi*0.10*(vnoise(pl*90.0) - 0.5);
    } else if (uTex < 4.5) {          // soil, grass
      alb *= 0.75 + 0.5*fbm(pl*0.8) + fadeHi*0.25*(vnoise(pl*60.0) - 0.5);
    } else if (uTex > 6.5) {          // planted beds: dry earth with low green cover
      float cv = smoothstep(0.42, 0.60, fbm(pl*0.55 + 3.0) + 0.25*(vnoise(pl*3.0) - 0.5));
      alb = mix(vec3(0.20, 0.135, 0.085), vec3(0.075, 0.125, 0.045), cv);
      alb *= 0.75 + 0.5*fbm(pl*2.3) + fadeHi*0.3*(vnoise(pl*45.0) - 0.5);
    } else if (uTex < 5.5) {          // running track: red rubber crumb, lane lines
      alb *= 0.92 + fadeHi*0.2*(vnoise(pl*140.0) - 0.5) + fadeLo*0.10*(fbm(pl*0.5) - 0.5);
    } else if (uTex < 6.5) {          // stone and terracotta cladding panels 1.2 x 0.6
      vec2 q = vec2(dot(pl, vec2(-n.y*0.0 + abs(n.x) > 0.7 ? 0.0 : 1.0, abs(n.x) > 0.7 ? 1.0 : 0.0)), vW.y)/vec2(1.2, 0.6);
      vec2 f = fract(q); vec2 jd = min(f, 1.0 - f)*vec2(1.2, 0.6);
      float j = (1.0 - smoothstep(0.004, 0.008 + fp, min(jd.x, jd.y)))*(1.0 - smoothstep(0.03, 0.12, fp));
      alb *= (0.93 + 0.14*hash21(floor(q) + 3.0))*(1.0 - 0.5*j); alb *= 0.96 + fadeHi*0.08*vnoise(q*90.0);
    }
  #endif
  #if KIND == 4
    float shell = vUv2.x;
    float cl = vnoise3(vW*1.3), lf = vnoise3(vW*11.0), lf2 = vnoise3(vW*29.0);
    float cellN = vnoise3(vW*6.5)*0.25 + lf*0.40 + lf2*0.35;
    float holes = 1.0 - smoothstep(0.012, 0.045, fp);
    float thr = 0.44*step(0.75, shell);
    float aw = max(fwidth(cellN), 1e-4);
    alpha = mix(1.0, clamp((cellN - thr)/aw + 0.5, 0.0, 1.0), holes);
    if (alpha < 0.02) discard;
    alb *= mix(0.86, 1.0, shell + (1.0 - step(0.001, shell)));
    alb *= 0.72 + 0.45*cl; alb *= 0.84 + fadeMid*0.34*(lf - 0.3) + fadeHi*0.30*(lf2 - 0.4);
    alb = mix(alb, alb*vec3(1.5, 1.35, 0.6), fadeHi*smoothstep(0.62, 0.8, lf2)*0.5);
    float bl = smoothstep(0.50, 0.56, vnoise3(vW*0.9 + 5.0)*0.55 + lf*0.45 + 0.10*n.y)*step(0.001, uRough - 1.5);
    alb = mix(alb, uEmit*(0.7 + 0.6*lf2), bl);
    n = normalize(n + 0.5*(vec3(vnoise3(vW*6.0), vnoise3(vW*6.0 + 9.0), vnoise3(vW*6.0 + 21.0)) - 0.5));
  #endif
  #if KIND == 10
    { float a10 = texture(uMap, vUv2).r; float aw = max(fwidth(a10), 1e-3);
      alpha = clamp((a10 - 0.42)/aw + 0.5, 0.0, 1.0); if (alpha < 0.03) discard;
      float cl = vnoise3(vW*1.1), lf = vnoise3(vW*7.0);
      alb *= (0.70 + 0.55*cl)*(0.85 + 0.30*lf)*(0.75 + 0.5*a10);
      float bl = smoothstep(0.50, 0.58, vnoise3(vW*0.8 + 5.0)*0.6 + lf*0.4 + 0.12*n.y)*step(0.001, uRough - 1.5);
      alb = mix(alb, uEmit*(0.7 + 0.6*lf), bl); }
  #endif
  #if KIND == 11
    { vec4 t11 = texture(uMap, vUv2); float aw = max(fwidth(t11.a), 1e-3);
      alpha = clamp((t11.a - 0.40)/aw + 0.5, 0.0, 1.0); if (alpha < 0.03) discard;
      alb = t11.rgb*uColor*vC*(0.82 + 0.36*vnoise3(vW*0.8)); }
  #endif
  #if KIND == 13
    { vec4 t13 = texture(uMap, vUv2); alb = t13.rgb*uColor*vC; }
  #endif
  #if KIND == 12
    { vec4 t12 = texture(uMap, vUv2); alb = t12.rgb*uColor*vC; }
  #endif
  #if KIND == 5
    float r5 = fbm(pl*0.012); alb *= 0.80 + 0.40*r5;
    { // relief the sun can find: long wind-shaped ridges, lit from the side
      vec2 e5 = vec2(2.0, 0.0);
      float hx = (fbm((pl + e5.xy)*0.020) + 0.4*sin(dot(pl + e5.xy, vec2(0.050, 0.023)) + 4.0*fbm((pl + e5.xy)*0.008))) - (fbm((pl - e5.xy)*0.020) + 0.4*sin(dot(pl - e5.xy, vec2(0.050, 0.023)) + 4.0*fbm((pl - e5.xy)*0.008)));
      float hy = (fbm((pl + e5.yx)*0.020) + 0.4*sin(dot(pl + e5.yx, vec2(0.050, 0.023)) + 4.0*fbm((pl + e5.yx)*0.008))) - (fbm((pl - e5.yx)*0.020) + 0.4*sin(dot(pl - e5.yx, vec2(0.050, 0.023)) + 4.0*fbm((pl - e5.yx)*0.008)));
      n = normalize(n + vec3(-hx, 0.0, hy)*2.2*(1.0 - smoothstep(600.0, 1800.0, dist))); }
    float rip = sin(dot(pl, vec2(0.83, 0.55))*3.2 + 6.0*fbm(pl*0.11)); alb *= 1.0 + fadeMid*0.045*rip;
    alb *= 1.0 + fadeHi*0.08*(vnoise(pl*70.0) - 0.5);
    float scrub = smoothstep(0.71, 0.78, vnoise(pl*0.45))*smoothstep(0.5, 0.7, vnoise(pl*0.031 + 4.0)); alb = mix(alb, vec3(0.10, 0.11, 0.05), scrub*0.75*fadeLo);
  #endif

  float sh; float wide = 0.0;
  if (inside) sh = scrSun(vW, uSunDir, fp*0.7, uScrZ.y, wide);
  #if KIND == 11
  else sh = 0.42 + 0.58*sunShadow(vW + uSunDir*6.5, uSunDir);
  #elif KIND == 4 || KIND == 10
  else sh = sunShadow(vW + uSunDir*1.4, uSunDir);
  #else
  else sh = sunShadow(vW, n);
  #endif
  float ndl = dot(n, uSunDir);
  vec3 lit;
  #if KIND == 11
    // a leaf lit from behind passes the sun through, yellower
    lit = uSunCol*sh*(ndl > 0.0 ? vec3(0.22 + 0.78*ndl) : (0.16 + 0.62*(-ndl))*vec3(1.0, 0.98, 0.50));
  #elif KIND == 4 || KIND == 10
    lit = uSunCol*(clamp((ndl + 0.45)/1.45, 0.0, 1.0)*sh + 0.16*sh*pow(max(dot(-V, uSunDir), 0.0), 3.0));
  #elif KIND == 6
    lit = uSunCol*sh*(ndl > 0.0 ? ndl : 0.62*(-ndl) + 0.16);
  #elif KIND == 9
    lit = uSunCol*sh*(abs(ndl)*0.7 + 0.25);
  #else
    lit = uSunCol*max(ndl, 0.0)*sh;
  #endif
  float gl = groundLevel(pl); float hgt = vW.y - gl; float ao = 1.0;
  if (!inside) {
    float a = bakedAO(pl);
    float wgt = n.y > 0.5 ? 1.0 - smoothstep(0.35, 0.9, abs(hgt)) : (1.0 - smoothstep(0.0, 2.6, hgt))*0.55*step(-0.4, hgt);
    ao = mix(1.0, a, wgt);
  }
  vec3 amb = hemi(n)*ao;
  if (inside) amb = amb*0.35 + uSunCol*wide*vec3(0.85, 0.48, 0.30)*0.10 + uGroup.z*vec3(1.0, 0.62, 0.32)*0.30;
  // a little sun bounced up from the ground onto walls
  amb += uSunCol*uGndCol*0.0 + uSunCol*vec3(0.30, 0.22, 0.16)*0.10*max(-n.y*0.5 + 0.5, 0.0)*max(uSunDir.y, 0.0)*(inside ? 0.0 : 1.0);
  vec3 nm = texture(uNightMap, (pl - uAOBox.xy)*uAOBox.zw).rgb;
  float hf = exp(-max(hgt, 0.0)/3.2)*(0.30 + 0.70*max(n.y, 0.0));
  vec3 night = (nm.r*uGroup.x*vec3(1.0, 0.78, 0.56)*1.2 + nm.g*uGroup.y*vec3(1.0, 0.66, 0.34)*1.3 + nm.b*uGroup.x*vec3(1.0, 0.80, 0.55)*1.1)*hf;
  if (uLampCol.r > 0.0) {
    vec3 Lv = uLampPos - vW; float D = length(Lv); float nl = max(dot(n, Lv/D), 0.0);
    #if KIND == 4 || KIND == 10 || KIND == 11
      nl = nl*0.03 + 0.012;
    #endif
    night += uLampCol*nl*scrLamp(vW, fp*0.7)/(1.0 + 0.022*D*D)*(1.0 - smoothstep(26.0, 62.0, D));
  }
  vec3 col = alb*(lit + amb + night);
  #if KIND == 2
    vec3 R = reflect(-V, n); float fr = 0.05 + 0.95*pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 refl = skyColor(R)*(R.y > 0.0 ? 1.0 : 0.35);
    float nightIn = max(uGroup.x, 0.0);
    col = mix(vec3(0.03, 0.035, 0.04)*(lit*0.3 + amb), refl, fr*0.85) ;
    alpha = mix(0.50 + 0.45*fr, 0.16 + 0.5*fr, nightIn);
  #elif KIND == 13
    { vec3 R = reflect(-V, n); float nv = max(dot(n, V), 0.0); float gl = 1.0 - clamp(uRough, 0.0, 1.0); float metal = clamp(uTex, 0.0, 1.0);
      float F = 0.04 + 0.96*pow(1.0 - nv, 5.0);
      vec3 env = R.y > 0.0 ? skyColor(R) : mix(uGndCol*2.4 + uSunCol*0.10*max(uSunDir.y, 0.0)*vec3(0.5, 0.4, 0.3), skyColor(vec3(R.x, 0.02, R.z)), exp(R.y*9.0));
      vec3 H = normalize(V + uSunDir);
      col = col*(1.0 - 0.75*metal) + env*(F*gl*gl + metal*alb*0.85)*ao
          + uSunCol*sh*step(0.0, ndl)*pow(max(dot(n, H), 0.0), mix(24.0, 900.0, gl*gl))*(0.15 + 2.2*gl*gl)*mix(vec3(1.0), alb, metal);
      col += night*0.0; }
  #else
    if (spec > 0.0 || uRough < 0.5) {
      vec3 H = normalize(V + uSunDir); float gloss = mix(120.0, 12.0, clamp(uRough*2.0, 0.0, 1.0));
      float s0 = max(spec, (0.5 - uRough)*0.5);
      col += uSunCol*sh*pow(max(dot(n, H), 0.0), gloss)*s0*step(0.0, ndl);
      float fr = pow(1.0 - max(dot(n, V), 0.0), 5.0);
      col += skyColor(reflect(-V, n))*fr*s0*1.2*ao;
    }
  #endif
  col += uEmit*grp(uEmitGrp)*step(uRough, 1.5)*(uEmitGrp < 0.5 ? 0.40 : 1.0);
  col = applyFog(col, vW);
  gl_FragColor = vec4(finish(col), alpha);
}`;

const SKY_FRAG = COMMON + /* glsl */`
varying vec3 vW; uniform float uStars;
void main(){
  vec3 d = normalize(vW - cameraPosition);
  vec3 col = skyColor(d);
  float sd = dot(d, uSunDir);
  float disc = smoothstep(0.999972, 0.999990, sd);
  col += uSunCol*(disc*60.0 + 1.6*pow(max(sd, 0.0), 1800.0) + 0.5*pow(max(sd, 0.0), 300.0))*smoothstep(-0.012, 0.01, d.y);
  if (uStars > 0.0 && d.y > 0.0) {
    vec3 q = d*420.0; vec3 c = floor(q); float h = hash31(c);
    vec3 f = fract(q) - 0.5; float st = step(0.9965, h)*(1.0 - smoothstep(0.05, 0.22, length(f)));
    col += vec3(0.9, 0.95, 1.0)*st*uStars*(0.3 + 0.7*hash31(c + 3.0))*smoothstep(0.02, 0.3, d.y);
  }
  gl_FragColor = vec4(finish(col), 1.0);
}`;
const SKY_VERT = /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; gl_Position.z = gl_Position.w*0.99999; }`;

export function buildSky(U) {
  const u = { ...U, uStars: { value: 0 } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
  m.renderOrder = -10; m.frustumCulled = false; m.userData.noShadow = true; m.userData.stars = u.uStars;
  return m;
}

const GLOW_VERT = /* glsl */`
attribute float aGrp; attribute float aSize; uniform float uPx; uniform vec3 uGroup; varying float vI;
void main(){ vec4 mv = viewMatrix*vec4(position, 1.0); gl_Position = projectionMatrix*mv;
  float g = aGrp < 0.5 ? uGroup.x : uGroup.y; vI = g;
  gl_PointSize = clamp(aSize*uPx/max(-mv.z, 0.5), 1.5, 220.0); if (g < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;
const GLOW_FRAG = /* glsl */`
precision highp float; varying float vI; uniform float uExposure;
void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q)*2.0; float a = exp(-d*d*7.0)*0.9 + 0.35*exp(-d*d*1.6)*(1.0 - smoothstep(0.7, 1.0, d));
  vec3 c = vec3(1.0, 0.62, 0.30)*a*vI*min(uExposure, 3.0)*1.3; gl_FragColor = vec4(c/(1.0 + c)*0.9, 1.0); }`;

// ---------------------------------------------------------------------------------------------------------
const mats = new Map();
function siteMaterial(U, name, def, cut) {
  const key = name + (cut ? '|cut' : '');
  if (mats.has(key)) return mats.get(key);
  const c = def ? def.c : [0.5, 0.5, 0.5];
  const p = { kind: 1, tex: 0, color: new THREE.Color(c[0], c[1], c[2]), rough: def ? def.r : 0.8, emit: new THREE.Color(0, 0, 0), grp: 3, side: THREE.FrontSide, transparent: false, opacity: 1, depthKind: 0, cast: true };
  const has = (s) => name.indexOf(s) >= 0;
  if (has('Asphalt')) { p.tex = 1; }
  else if (has('Paver') || has('ShopFloor')) p.tex = 2;
  else if (has('Sand')) { p.tex = 3; p.color.multiplyScalar(0.92); }
  else if (has('Soil') || has('Mulch')) p.tex = 7;
  else if (has('Grass')) { p.tex = 4; p.color.setRGB(0.07, 0.15, 0.035); }
  else if (has('TrackRed') || has('CTX_Track')) { p.tex = 5; p.color.setRGB(0.42, 0.055, 0.035); }
  else if (has('Terracotta') || has('Limestone')) p.tex = 6;
  if (has('Terracotta') && !has('Joint')) p.color.multiplyScalar(1.15);
  if (has('Hedge') || has('Leaf') || name.startsWith('LIBM_')) { p.kind = 4; p.depthKind = 0; p.color.multiplyScalar(2.2); }
  if (has('SailWhite') || has('FabricCream')) { p.kind = 6; p.side = THREE.DoubleSide; p.color.setRGB(0.86, 0.84, 0.79); }
  if (name === 'RP_Glass') { p.kind = 2; p.transparent = true; p.cast = false; p.side = THREE.DoubleSide; }
  if (has('GlassBlack')) { p.rough = 0.08; }
  if (has('RoofDark')) p.color.setRGB(0.045, 0.043, 0.04);
  if (has('DarkMetal') || has('CladGrey')) p.color.multiplyScalar(2.2);
  if (def && def.es > 0) {
    const k = name.includes('Bulb') ? 9 : name.includes('LEDStrip') ? 5 : name.includes('LEDScreen') ? 0.35 : name.includes('Uplight') ? 4 : name.includes('Lamp') || name.includes('CTX_') ? 6 : name.includes('SignLetter') ? 3.0 : 1.5;
    p.emit.setRGB(def.e[0] * k, def.e[1] * k, def.e[2] * k);
    p.grp = name.includes('Bulb') ? 1 : (name.includes('BL_LEDStrip') || name.includes('BL_WallWash')) ? 2 : 0;
    if (name.includes('LEDScreen')) p.emit.setRGB(0.25, 0.22, 0.2);
    p.cast = !name.includes('Bulb');
  }
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: p.color }, uEmit: { value: p.emit }, uRough: { value: p.rough }, uTex: { value: p.tex }, uEmitGrp: { value: p.grp }, uOpacity: { value: p.opacity }, uMap: { value: null } },
    vertexShader: VERT_SITE, fragmentShader: FRAG_SITE, defines: Object.assign({ KIND: p.kind }, cut ? { CUT: 1 } : {}), side: p.side, transparent: p.transparent, depthWrite: !p.transparent, alphaToCoverage: p.kind === 4 });
  m.userData = { cast: p.cast, depthKind: p.depthKind, side: p.side };
  mats.set(key, m); return m;
}
export function customMaterial(U, o) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(...(o.color || [1, 1, 1])) }, uEmit: { value: new THREE.Color(...(o.emit || [0, 0, 0])) }, uRough: { value: o.rough ?? 0.8 }, uTex: { value: o.tex || 0 }, uEmitGrp: { value: o.grp ?? 3 }, uOpacity: { value: 1 }, uMap: { value: o.map || null } },
    vertexShader: VERT_SITE, fragmentShader: FRAG_SITE, defines: Object.assign({ KIND: o.kind ?? 1 }, o.vcol ? { USE_COLORATTR: 1 } : {}), side: o.side || THREE.FrontSide, transparent: !!o.transparent, depthWrite: !o.transparent, alphaToCoverage: (o.kind === 4 || o.kind === 9 || o.kind === 10 || o.kind === 11) });
  return m;
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function mergeGeos(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + n) * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function paint(g, r, gg, b) { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }

// a broadleaf crown: lumps on a sphere, unit size (width 1, height 0..1), shaded darker inside and below
function crownGeo(seed, flat) {
  const r = rng(seed), parts = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, rad = 0.30 * Math.sqrt(r()), h = 0.56 + 0.30 * r() - rad * 0.25;
    const s = (0.17 + 0.13 * r()) * (i === 0 ? 1.5 : 1);
    const g = new THREE.IcosahedronGeometry(s, 2);
    const p = g.attributes.position, nn = g.attributes.normal;
    for (let k = 0; k < p.count; k++) { const l = Math.hypot(p.getX(k), p.getY(k), p.getZ(k)); nn.setXYZ(k, p.getX(k) / l, p.getY(k) / l, p.getZ(k) / l); }
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const d = 1 + 0.16 * Math.sin(x * 37 + i) * Math.sin(y * 31 + i * 2) * Math.sin(z * 29);
      p.setXYZ(k, x * d + Math.cos(a) * rad, y * d * flat + h, z * d + Math.sin(a) * rad);
    }
    parts.push(g);
  }
  const core = parts.map((g0) => { const g = g0.clone(); const p = g.attributes.position, u = g.attributes.uv;
    for (let k = 0; k < p.count; k++) { p.setXYZ(k, p.getX(k) * 0.80, (p.getY(k) - 0.68) * 0.80 + 0.68, p.getZ(k) * 0.80); u.setXY(k, 0, 0); }
    return paint(g, 0.62, 0.62, 0.62); });
  const pos = [], nor = [], uvs = [], col = [], idx = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), O = new THREE.Vector3(), C = new THREE.Vector3(), T = new THREE.Vector3();
  parts.forEach((g, gi) => {
    g.computeBoundingSphere(); const c0 = g.boundingSphere.center, rad = g.boundingSphere.radius;
    const nC = 24;
    for (let j = 0; j < nC; j++) {
      const z = 1 - 2 * (j + 0.5) / nC, rr = Math.sqrt(1 - z * z), th = j * 2.39996 + gi;
      O.set(Math.cos(th) * rr, z * 0.9 + 0.1, Math.sin(th) * rr).normalize();
      C.copy(c0).addScaledVector(O, rad * (0.80 + 0.22 * r()));
      if (C.y < 0.40) continue;
      T.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      A.crossVectors(O, T).normalize(); B.crossVectors(O, A).normalize();
      A.addScaledVector(O, (r() - 0.5) * 0.9).normalize(); B.addScaledVector(O, (r() - 0.5) * 0.9).normalize();
      const sz = 0.085 + 0.06 * r();
      const base = pos.length / 3; const v = (0.42 + 0.58 * Math.min(1, Math.max(0, (C.y - 0.42) / 0.42))) * (0.78 + 0.44 * r());
      const nx = C.x * 0.55 + O.x, ny = (C.y - 0.62) * 0.55 + O.y + 0.25, nz = C.z * 0.55 + O.z, nl = Math.hypot(nx, ny, nz);
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(C.x + (A.x * su + B.x * sv) * sz, C.y + (A.y * su + B.y * sv) * sz, C.z + (A.z * su + B.z * sv) * sz);
        nor.push(nx / nl, ny / nl, nz / nl); uvs.push(su * 0.5 + 0.5, sv * 0.5 + 0.5); col.push(v, v, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const cards = new THREE.BufferGeometry();
  cards.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cards.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  cards.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); cards.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cards.setIndex(idx);
  return { core: mergeGeos(core), cards };
}
function leafTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const r = rng(77);
  for (let i = 0; i < 46; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * 0.40 * N, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, rot = r() * 6.283;
    const L = (0.10 + 0.07 * r()) * N, W = L * (0.30 + 0.12 * r());
    const sh = Math.round(150 + 105 * r());
    g.fillStyle = `rgb(${sh},${sh},${sh})`;
    g.beginPath(); g.ellipse(x, y, L, W, rot, 0, 6.2832); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}
function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.022, 0.034, 0.62, 7, 1); g.translate(0, 0.31, 0);
  const b1 = new THREE.CylinderGeometry(0.012, 0.02, 0.3, 5, 1); b1.translate(0, 0.15, 0); b1.rotateZ(0.6); b1.translate(0, 0.42, 0);
  const b2 = b1.clone(); b2.rotateY(2.3); const b3 = b1.clone(); b3.rotateY(4.3);
  return mergeGeos([g, b1, b2, b3].map((x) => paint(x, 1, 1, 1)));
}
function palmGeos() {
  const r = rng(5);
  const tr = new THREE.CylinderGeometry(0.016, 0.024, 0.8, 9, 8); tr.translate(0, 0.4, 0);
  const tp = tr.attributes.position; for (let k = 0; k < tp.count; k++) { const y = tp.getY(k); const rr = 1 + 0.12 * Math.sin(y * 150); tp.setX(k, tp.getX(k) * rr + 0.03 * y * y); tp.setZ(k, tp.getZ(k) * rr); }
  tr.computeVertexNormals();
  const fronds = [];
  const nF = 38;
  for (let i = 0; i < nF; i++) {
    const rank = i / nF, a = i * 2.39996 + r() * 0.4, len = 0.30 + 0.10 * r() + 0.06 * rank, seg = 12, w = 0.052;
    const hx = Math.cos(a), hz = Math.sin(a);
    const pos = [], uv = [], idx = [];
    let ang = 1.20 - 1.55 * rank + 0.1 * r(), ph = 0, py = 0.80;
    for (let s2 = 0; s2 <= seg; s2++) {
      const t = s2 / seg;
      const ww = w * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.06)));
      const px = hx * ph + 0.019, pz = hz * ph;
      const sx = -hz * ww, sz = hx * ww, lift = 0.35 * ww;
      pos.push(px + sx, py + lift, pz + sz, px - sx, py + lift, pz - sz);
      uv.push(t * len / 0.36, 0, t * len / 0.36, 1);
      if (s2 < seg) { const b0 = s2 * 2; idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }
      const st = len / seg; ph += Math.cos(ang) * st; py += Math.sin(ang) * st; ang -= (0.10 + 0.16 * rank) * (0.6 + 1.6 * t);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    fronds.push(g);
  }
  const crown = new THREE.SphereGeometry(0.035, 8, 6); crown.translate(0.03 * 0.64, 0.8, 0);
  return { trunk: mergeGeos([paint(tr, 1, 1, 1), paint(crown, 1, 1, 1)]), fronds: mergeGeos(fronds.map((g) => paint(g, 1, 1, 1))) };
}
function prism(x0, x1, y0, x2, x3, y1, hw0, hw1) {   // side profile from (x0..x1 at y0) to (x2..x3 at y1), half widths hw0 -> hw1
  const v = [[x0, y0, -hw0], [x1, y0, -hw0], [x1, y0, hw0], [x0, y0, hw0], [x2, y1, -hw1], [x3, y1, -hw1], [x3, y1, hw1], [x2, y1, hw1]];
  const f = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const pos = []; for (const q of f) for (const k of [0, 2, 1, 0, 3, 2]) pos.push(...v[q[k]]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return g;
}
function carGeos() {
  // a plain saloon: one side profile, extruded across the width with soft edges; no make, no badge
  const prof = [[-2.20, 0.30], [2.14, 0.30], [2.24, 0.52], [2.12, 0.76], [1.15, 0.86], [0.55, 1.36], [-0.90, 1.40], [-1.75, 0.95], [-2.20, 0.88], [-2.27, 0.56]];
  const sh = new THREE.Shape(prof.map((p) => new THREE.Vector2(p[0], p[1])));
  const b1 = new THREE.ExtrudeGeometry(sh, { depth: 1.56, bevelEnabled: true, bevelThickness: 0.10, bevelSize: 0.07, bevelOffset: -0.07, bevelSegments: 3, curveSegments: 4 });
  b1.translate(0, 0, -0.78);
  const body = mergeGeos([paint(b1.toNonIndexed ? b1 : b1, 1, 1, 1)]);
  const gl2 = new THREE.Shape([[1.133, 0.915], [0.613, 1.335], [-1.022, 1.358], [-1.702, 0.998]].map((p) => new THREE.Vector2(p[0], p[1])));
  const cabin = new THREE.ExtrudeGeometry(gl2, { depth: 1.80, bevelEnabled: false });
  cabin.translate(0, 0, -0.90);
  const wheels = [];
  for (const [x, z] of [[-1.4, 0.82], [1.38, 0.82], [-1.4, -0.82], [1.38, -0.82]]) { const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14); w.rotateX(Math.PI / 2); w.translate(x, 0.33, z); wheels.push(w); }
  return { body, dark: mergeGeos([cabin, ...wheels].map((g) => paint(g, 1, 1, 1))) };
}
function figureGeo() {
  const prof = [[0.0, 0], [0.10, 0.0], [0.13, 0.45], [0.16, 0.9], [0.19, 1.25], [0.17, 1.42], [0.06, 1.5], [0.0, 1.5]].map((p) => new THREE.Vector2(p[0], p[1]));
  const b = new THREE.LatheGeometry(prof, 10); b.scale(1, 1, 0.62);
  const h = new THREE.SphereGeometry(0.105, 10, 8); h.translate(0, 1.62, 0);
  return mergeGeos([b, h].map((g) => paint(g, 1, 1, 1)));
}

function instanced(geo, mat, n, depthKind) {
  const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.instanceMatrix.needsUpdate = true;
  m.userData.depthMat = depthMaterial(depthKind || 0, THREE.DoubleSide);
  return m;
}

export async function buildSite(U, renderer, avoid = []) {
  const group = new THREE.Group();
  const [life, matDefs, gltf, aoTex] = await Promise.all([
    fetch('models/life.json').then((r) => r.json()),
    fetch('models/materials.json').then((r) => r.json()),
    new Promise((res, rej) => { const d = new DRACOLoader(); d.setDecoderPath('lib/draco/'); const l = new GLTFLoader(); l.setDRACOLoader(d); l.load('models/site.glb', res, undefined, rej); }),
    new THREE.TextureLoader().loadAsync('tex/ao.jpg'),
  ]);
  aoTex.colorSpace = THREE.NoColorSpace; aoTex.anisotropy = 8; aoTex.generateMipmaps = true; aoTex.minFilter = THREE.LinearMipmapLinearFilter;
  U.uAO.value = aoTex;

  // ---- exported geometry
  const bulbs = [];
  const meshes = []; gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    let nm = o.name, par = o.parent; while (par && par !== gltf.scene && !/^(site|strip|court|box|life|ctx)_/.test(nm)) { nm = par.name; par = par.parent; }
    const objName = /^(site|strip|court|box|life|ctx)_/.test(o.name) ? o.name : (o.parent && o.parent.name) || o.name;
    if (/^ctx_/.test(objName) || /^life_scatter/.test(objName) || /cafe_sign/.test(objName)) continue;
    const mname = o.material && o.material.name || 'x';
    const cut = /^box_lattice_lat_/.test(objName);
    const mat = siteMaterial(U, mname, matDefs[mname], cut);
    const mesh = new THREE.Mesh(o.geometry, mat);
    mesh.applyMatrix4(o.matrixWorld); mesh.name = objName; mesh.frustumCulled = false;
    if (!o.geometry.attributes.uv) o.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 2), 2));
    if (!mat.userData.cast || /markings|site_terrain|wire/.test(objName)) mesh.userData.noShadow = true;
    else mesh.userData.depthMat = depthMaterial(0, THREE.DoubleSide);
    if (/markings/.test(objName)) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; }
    if (mat.transparent) mesh.renderOrder = 20;
    if (mname === 'RP_BulbWarm') {       // find the bulbs for their halos
      const p = o.geometry.attributes.position, cells = new Map(), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); const k = Math.round(v.x / 0.3) + ',' + Math.round(v.y / 0.3) + ',' + Math.round(v.z / 0.3); const c = cells.get(k) || [0, 0, 0, 0]; c[0] += v.x; c[1] += v.y; c[2] += v.z; c[3]++; cells.set(k, c); }
      for (const c of cells.values()) bulbs.push([c[0] / c[3], c[1] / c[3], c[2] / c[3], 1, 0.22]);
    }
    group.add(mesh);
  }

  // ---- trees
  const standins = [];
  const crowns = [crownGeo(3, 0.85), crownGeo(8, 0.75), crownGeo(21, 0.95)];
  const trunk = trunkGeo();
  const leafTex = leafTexture();
  const leafMat = (col, bloom) => customMaterial(U, { kind: 4, color: col, vcol: true, emit: bloom || [0, 0, 0], rough: bloom ? 2.0 : 0.9 });
  const cardMat = (col, bloom) => customMaterial(U, { kind: 10, color: col, vcol: true, emit: bloom || [0, 0, 0], rough: bloom ? 2.0 : 0.9, map: leafTex, side: THREE.DoubleSide });
  const kinds = { shade: { col: [0.085, 0.135, 0.040], list: [] }, flame: { col: [0.075, 0.125, 0.035], bloom: [0.72, 0.085, 0.03], list: [] }, olive: { col: [0.105, 0.135, 0.075], list: [] } };
  const palms = [];
  for (const t of life.trees) {
    const k = /palm/.test(t.n) ? 'palm' : /flame/.test(t.n) ? 'flame' : /olive/.test(t.n) ? 'olive' : 'shade';
    const w = Math.min(t.mx[0] - t.mn[0], t.mx[1] - t.mn[1]), h = t.mx[2] - t.mn[2];
    const rec = { x: (t.mn[0] + t.mx[0]) / 2, y: (t.mn[1] + t.mx[1]) / 2, z: t.mn[2], w, h, rz: t.rz };
    if (k === 'palm') palms.push(rec); else kinds[k].list.push(rec);
  }
  const trunkMat = customMaterial(U, { kind: 1, color: [0.11, 0.075, 0.05], vcol: true });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  const rr = rng(99);
  for (const k of Object.keys(kinds)) {
    const K = kinds[k]; if (!K.list.length) continue;
    for (let v = 0; v < 3; v++) {
      const sub = K.list.filter((_, i) => i % 3 === v); if (!sub.length) continue;
      const cm = instanced(crowns[v].core, leafMat(K.col, K.bloom), sub.length, 4);
      const km = instanced(crowns[v].cards, cardMat(K.col.map((x) => x * (k === 'olive' ? 0.95 : 1.25)), K.bloom), sub.length, 4);
      const tm = instanced(trunk, trunkMat, sub.length, 0);
      sub.forEach((t, i) => {
        Q.setFromAxisAngle(UP, t.rz); P.set(t.x, t.z, -t.y); S.set(t.w * 1.05, t.h, t.w * 1.05);
        M.compose(P, Q, S); cm.setMatrixAt(i, M); tm.setMatrixAt(i, M); km.setMatrixAt(i, M);
        const j = 0.8 + 0.4 * rr(); C.setRGB(j, j * (0.92 + 0.16 * rr()), j * (0.85 + 0.3 * rr())); cm.setColorAt(i, C); km.setColorAt(i, C); tm.setColorAt(i, C.setRGB(1, 1, 1));
      });
      cm.instanceColor.needsUpdate = true; tm.instanceColor.needsUpdate = true; km.instanceColor.needsUpdate = true;
      group.add(cm, tm, km); standins.push(cm, tm, km);
    }
  }
  if (palms.length) {
    const pg = palmGeos();
    const pt = instanced(pg.trunk, customMaterial(U, { kind: 1, color: [0.20, 0.15, 0.10], vcol: true }), palms.length, 0);
    const pf = instanced(pg.fronds, customMaterial(U, { kind: 9, color: [0.10, 0.16, 0.05], vcol: true, side: THREE.DoubleSide }), palms.length, 9);
    palms.forEach((t, i) => { Q.setFromAxisAngle(UP, t.rz); P.set(t.x, t.z, -t.y); const s = t.h; S.set(s, s, s); M.compose(P, Q, S); pt.setMatrixAt(i, M); pf.setMatrixAt(i, M); pt.setColorAt(i, C.setRGB(1, 1, 1)); pf.setColorAt(i, C); });
    group.add(pt, pf); standins.push(pt, pf);
  }

  // ---- the planted trees and palms of the model itself (leaf cards with their own textures); the code-made
  //      crowns above stay as light shadow casters, and as the fallback if this file is missing
  try {
    const [tg, tinst] = await Promise.all([
      new Promise((res, rej) => { const d = new DRACOLoader(); d.setDecoderPath('lib/draco/'); const l = new GLTFLoader(); l.setDRACOLoader(d); l.load('models/trees.glb', res, undefined, rej); }),
      fetch('models/trees.json').then((r) => r.json()),
    ]);
    const CX = new THREE.Matrix4().makeRotationX(-Math.PI / 2), CXi = CX.clone().invert(), MB = new THREE.Matrix4(), MT = new THREE.Matrix4();
    const byMesh = new Map();
    for (const it of tinst) { const k = 'TREE_' + it.mesh; if (!byMesh.has(k)) byMesh.set(k, []); byMesh.get(k).push(it.m); }
    const clean = (n) => n.replace(/[^A-Za-z0-9]/g, '');
    tg.scene.updateMatrixWorld(true);
    let made = 0;
    for (const node of tg.scene.children) {
      const key = [...byMesh.keys()].find((k) => clean(k) === clean(node.name)); if (!key) continue;
      const list = byMesh.get(key), prims = []; node.traverse((o) => { if (o.isMesh) prims.push(o); });
      for (const pr of prims) {
        const src = pr.material, tex = src.map || null;
        const leaf = !!tex && (src.transparent || src.alphaTest > 0 || /leaf|leaves|01|02|03|04|05/i.test(src.name)) && !/_00$|bark|trunk/i.test(src.name);
        if (tex) { tex.anisotropy = 8; }
        const c = src.color ? [src.color.r, src.color.g, src.color.b] : [1, 1, 1];
        const mat = customMaterial(U, { kind: tex ? (leaf ? 11 : 12) : 1, color: tex ? (leaf ? [c[0] * 2.3, c[1] * 2.3, c[2] * 2.0] : [c[0] * 1.3, c[1] * 1.3, c[2] * 1.3]) : c, map: tex, side: THREE.DoubleSide, rough: 0.9 });
        const im = new THREE.InstancedMesh(pr.geometry, mat, list.length); im.frustumCulled = false;
        list.forEach((m, i) => { MB.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]); MT.copy(CX).multiply(MB).multiply(CXi).multiply(pr.matrixWorld); im.setMatrixAt(i, MT); });
        im.instanceMatrix.needsUpdate = true; im.userData.noShadow = true; group.add(im); made++;
      }
    }
    if (made) for (const m of standins) m.userData.shadowOnly = true;
  } catch (e) { console.warn('library trees not loaded, keeping the code-made crowns', e); }

  // ---- plain cars, at rest
  const cars = life.cars.filter((c) => { const x = (c.mn[0] + c.mx[0]) / 2, y = (c.mn[1] + c.mx[1]) / 2; return x > 2 && x < 243 && y > 9 && y < 110 && c.c === 'RP_life_cars'; });
  const cg = carGeos();
  const cb = instanced(cg.body, customMaterial(U, { kind: 1, color: [1, 1, 1], rough: 0.25, vcol: true }), cars.length, 0);
  const cd = instanced(cg.dark, customMaterial(U, { kind: 1, color: [0.035, 0.04, 0.045], rough: 0.2, vcol: true }), cars.length, 0);
  const paints = [[0.62, 0.61, 0.58], [0.30, 0.31, 0.32], [0.09, 0.095, 0.10], [0.035, 0.035, 0.04], [0.50, 0.48, 0.44], [0.16, 0.17, 0.19]];
  cars.forEach((c, i) => {
    const long = (c.mx[1] - c.mn[1]) > (c.mx[0] - c.mn[0]);
    Q.setFromAxisAngle(UP, c.rz); P.set((c.mn[0] + c.mx[0]) / 2, c.mn[2], -(c.mn[1] + c.mx[1]) / 2); S.set(1, 1, 1); void long;
    M.compose(P, Q, S); cb.setMatrixAt(i, M); cd.setMatrixAt(i, M);
    const pc = paints[Math.floor(rr() * paints.length)]; cb.setColorAt(i, C.setRGB(pc[0], pc[1], pc[2])); cd.setColorAt(i, C.setRGB(1, 1, 1));
  });
  group.add(cb, cd);

  // ---- the car models from the project: the parked cars of the site model, and the five supplied models in the bays
  //      nearest the cameras. The plain saloons above stay as light shadow casters, and as the fallback.
  try {
    const loadGlb = (url) => new Promise((res, rej) => { const d = new DRACOLoader(); d.setDecoderPath('lib/draco/'); const l = new GLTFLoader(); l.setDRACOLoader(d); l.load(url, res, undefined, rej); });
    const [lib, show, poses0] = await Promise.all([loadGlb('models/cars_lib.glb'), loadGlb('models/cars_show.glb').catch(() => null), fetch('models/cars.json').then((r) => r.json())]);
    const poses = poses0.filter((c) => c.p[0] > 2 && c.p[0] < 243 && c.p[1] > 9 && c.p[1] < 110);
    const clean = (n) => n.replace(/[^A-Za-z0-9]/g, '');
    const white1 = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white1.colorSpace = THREE.SRGBColorSpace; white1.needsUpdate = true;
    const models = new Map();
    for (const g of [lib, show]) if (g) { g.scene.updateMatrixWorld(true); for (const node of g.scene.children) models.set(clean(node.name), node); }
    // which bays get the supplied models: nearest to where the cameras stand
    const showNames = ['CARshowhero', 'CARshowrevuelto', 'CARshowrevueltosv', 'CARshowchiron', 'CARshowsupra'].filter((n) => models.has(n));
    const spots = [[204, 41], [162, 22], [200, 30], [150, 22], [206, 52]];
    const taken = new Map();
    showNames.forEach((n, k) => { let best = -1, bd = 1e9; poses.forEach((c, i) => { if (taken.has(i)) return; const d = Math.hypot(c.p[0] - spots[k][0], c.p[1] - spots[k][1]); if (d < bd) { bd = d; best = i; } }); if (best >= 0) taken.set(best, n); });
    const byModel = new Map();
    poses.forEach((c, i) => { const k = taken.get(i) || clean('CAR_' + c.mesh); if (!models.has(k)) return; if (!byModel.has(k)) byModel.set(k, []); byModel.get(k).push(c); });
    const cpal = [[0.55, 0.55, 0.53], [0.30, 0.31, 0.33], [0.06, 0.065, 0.07], [0.02, 0.02, 0.022], [0.42, 0.40, 0.36], [0.12, 0.14, 0.18], [0.36, 0.05, 0.04], [0.62, 0.61, 0.58]];
    const rc = rng(41); let madeCars = 0;
    for (const [k, list] of byModel) {
      const node = models.get(k), prims = []; node.traverse((o) => { if (o.isMesh) prims.push(o); });
      const isShow = /^CARshow/.test(k);
      const tint = list.map(() => cpal[Math.floor(rc() * cpal.length)]);
      for (const pr of prims) {
        const src = pr.material, nm = src.name || '';
        const glass = (src.transmission || 0) > 0.2 || /glass|window|windshield|windscreen/i.test(nm) || (src.transparent && src.opacity < 0.75);
        const paint = /carpaint/i.test(nm);
        const c = src.color ? [src.color.r, src.color.g, src.color.b] : [0.5, 0.5, 0.5];
        const mat = customMaterial(U, { kind: 13, color: glass ? [0.012, 0.014, 0.016] : c, map: glass ? white1 : (src.map || white1),
          rough: glass ? 0.03 : (paint ? Math.min(src.roughness ?? 0.3, 0.16) : (src.roughness ?? 0.6)), tex: glass ? 0 : (paint ? Math.min(src.metalness ?? 0, 0.35) : (src.metalness ?? 0)), side: THREE.DoubleSide });
        const im = new THREE.InstancedMesh(pr.geometry, mat, list.length); im.frustumCulled = false;
        list.forEach((cpose, i) => {
          Q.setFromAxisAngle(UP, cpose.h); P.set(cpose.p[0], cpose.p[2], -cpose.p[1]); S.set(1, 1, 1);
          M.compose(P, Q, S).multiply(pr.matrixWorld); im.setMatrixAt(i, M);
          const t = (paint && !isShow) ? tint[i] : [1, 1, 1]; im.setColorAt(i, C.setRGB(t[0], t[1], t[2]));
        });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.noShadow = true; group.add(im); madeCars++;
      }
    }
    if (madeCars) { cb.userData.shadowOnly = true; cd.userData.shadowOnly = true; }
  } catch (e) { console.warn('car models not loaded, keeping the plain cars', e); }

  // ---- a few figures, small and plain
  const ppl = life.people.filter((p) => { const x = (p.mn[0] + p.mx[0]) / 2, y = (p.mn[1] + p.mx[1]) / 2; if (x > 44 && x < 100 && y > 38 && y < 72) return false; return avoid.every((a) => Math.hypot(a[0] - x, a[1] - y) > 34); });
  const fg = instanced(figureGeo(), customMaterial(U, { kind: 1, color: [1, 1, 1], vcol: true }), ppl.length, 0);
  const cloth = [[0.55, 0.52, 0.47], [0.20, 0.22, 0.26], [0.42, 0.30, 0.22], [0.62, 0.60, 0.56], [0.30, 0.33, 0.30]];
  ppl.forEach((p, i) => { Q.setFromAxisAngle(UP, p.rz + rr() * 6.28); P.set((p.mn[0] + p.mx[0]) / 2, p.mn[2], -(p.mn[1] + p.mx[1]) / 2); const s = 0.96 + 0.1 * rr(); S.set(s, s, s); M.compose(P, Q, S); fg.setMatrixAt(i, M); const c = cloth[Math.floor(rr() * cloth.length)]; fg.setColorAt(i, C.setRGB(c[0], c[1], c[2])); });
  group.add(fg);

  // ---- dunes beyond the plot
  {
    const g = new THREE.PlaneGeometry(5200, 5200, 220, 220); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const dune = (x, y) => {
      const a = Math.sin(x * 0.011 + 1.7 * Math.sin(y * 0.006)) * Math.cos(y * 0.009 + 1.3 * Math.sin(x * 0.004));
      const b = Math.sin((x + y) * 0.021 + 2.0) * Math.sin((x - y) * 0.017);
      const ridge = 1 - Math.abs(Math.sin(x * 0.0061 + y * 0.0043 + 0.8 * Math.sin(y * 0.003)));
      return 9 * a + 3.5 * b + 16 * ridge * ridge;
    };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 122, y = -p.getZ(i) + 60;
      const dx = Math.max(-40 - x, 0, x - 290), dy = Math.max(-40 - y, 0, y - 150);
      const d = Math.hypot(dx, dy);
      const north = Math.max(0, Math.min(1, (y - 140) / 120));
      const m = Math.min(1, d / 160) ** 1.5;
      const near = Math.max(0, Math.min(1, (y - 136) / 30)) * Math.max(0, Math.min(1, (x + 60) / 40)) * Math.max(0, Math.min(1, (320 - x) / 40));
      p.setXYZ(i, x, -0.9 - 2.2 * (1 - Math.min(1, d / 30)) + dune(x, y) * Math.max(m * (0.35 + 0.65 * north), near * 0.55 * Math.min(1, (y - 136) / 60 + 0.2)) + (y > 135 ? 3.6 * Math.min(1, (y - 135) / 12) * (1 - Math.min(1, d / 400)) : 0), -y);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, customMaterial(U, { kind: 5, color: [0.60, 0.36, 0.17] }));
    m.frustumCulled = false; m.userData.noShadow = true; m.name = 'dunes'; group.add(m);
  }

  // ---- lamp and bulb halos, pools of light on the ground
  const lamps = life.emit.filter((e) => /^life_lamp/.test(e.n)).map((e) => [(e.mn[0] + e.mx[0]) / 2, (e.mn[1] + e.mx[1]) / 2, e.mx[2] - 0.2]);
  {
    const pts = bulbs.concat(lamps.map((l) => [l[0], l[2], -l[1], 0, 1.1]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p[0], p[1], p[2]]), 3));
    g.setAttribute('aGrp', new THREE.Float32BufferAttribute(pts.map((p) => p[3]), 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(pts.map((p) => p[4]), 1));
    const gu = { uPx: { value: 2000 }, uGroup: U.uGroup, uExposure: U.uExposure };
    const pm = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: gu, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    pm.frustumCulled = false; pm.renderOrder = 40; pm.userData.noShadow = true; group.add(pm); group.userData.glowPx = gu.uPx;
  }
  {
    const W = 1024, H = Math.round(W * AO_BOX.h / AO_BOX.w), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    const X = (x) => (x - AO_BOX.x0) / AO_BOX.w * W, Y = (y) => (1 - (y - AO_BOX.y0) / AO_BOX.h) * H, sc = W / AO_BOX.w;
    const band = (x0, y0, x1, y1, col, blur) => { g.filter = `blur(${blur * sc}px)`; g.fillStyle = col; g.fillRect(X(x0), Y(y1), (x1 - x0) * sc, (y1 - y0) * sc); };
    band(46, 84, 185, 89, '#a00', 2.5); band(46, 71.5, 185, 76, '#a00', 2.2);                 // the strip, both faces
    band(92, 37, 133, 73.5, '#600', 2.5); band(160, 33, 187.5, 70.5, '#700', 2.5);            // the two buildings
    band(31, 39, 48, 73, '#700', 2.5); band(50, 26.5, 173, 38, '#600', 2.0);                  // entrance, trucks
    band(50, 49, 88, 68, '#0b0', 3.0); band(120, 37, 148, 58, '#0c0', 3.5);                   // strings
    g.filter = 'none';
    for (const l of lamps) { const gr = g.createRadialGradient(X(l[0]), Y(l[1]), 0, X(l[0]), Y(l[1]), 12 * sc); gr.addColorStop(0, '#0000c8'); gr.addColorStop(0.35, '#000058'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(X(l[0]) - 12 * sc, Y(l[1]) - 12 * sc, 24 * sc, 24 * sc); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; U.uNightMap.value = t;
  }

  // ---- names on the ground, like the lettering of a drawing
  const labels = [
    ['ENTRANCE', 38.5, 38.6, 1.5], ['MARKET COURT', 72, 47.8, 1.9], ['CENTRAL SQUARE', 137, 54.2, 2.1], ['FOOD TRUCKS', 109, 38.75, 1.5],
    ['BRICK SCREEN', 171, 27.3, 1.8], ['RETAIL STRIP', 112, 94.0, 3.0], ['RUNNING TRACK', 128, 107.3, 2.4], ['PARK', 64, 116.5, 3.0],
    ['PARKING', 216, 44, 2.6],
  ];
  const lg = new THREE.Group();
  const makeLabel = (txt, x, y, cap) => {
    const c = document.createElement('canvas'); const fs = 150; const g = c.getContext('2d');
    const font = `600 ${fs}px Archivo, "Helvetica Neue", Arial, sans-serif`;
    g.font = font; try { g.letterSpacing = (fs * 0.14) + 'px'; g.fontStretch = 'condensed'; } catch (e) {}
    const w = Math.ceil(g.measureText(txt).width + fs * 0.4); c.width = w; c.height = Math.ceil(fs * 1.2);
    const g2 = c.getContext('2d'); g2.fillStyle = '#000'; g2.fillRect(0, 0, c.width, c.height); g2.fillStyle = '#fff'; g2.font = font; try { g2.letterSpacing = (fs * 0.14) + 'px'; g2.fontStretch = 'condensed'; } catch (e) {}
    g2.textBaseline = 'middle'; g2.fillText(txt, fs * 0.2, c.height * 0.54);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    const hM = cap / 0.70 * 1.2, wM = hM * c.width / c.height;
    const geo = new THREE.PlaneGeometry(wM, hM); geo.rotateX(-Math.PI / 2);
    const lvl = y > 136 ? 4.4 : (y >= 84 ? 3.9 : (x >= 191 && y < 70 ? -1.5 : 0));
    const m = new THREE.Mesh(geo, customMaterial(U, { kind: 8, color: [1.0, 0.98, 0.93], map: t, transparent: true }));
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -4; m.material.polygonOffsetUnits = -4;
    m.position.set(x, lvl + 0.06 + (txt === 'RETAIL STRIP' ? 0.0 : 0), -y); m.renderOrder = 15; m.userData.noShadow = true; m.frustumCulled = false;
    lg.add(m);
  };
  const drawLabels = () => { while (lg.children.length) lg.remove(lg.children[0]); for (const l of labels) makeLabel(...l); group.userData.dirty = true; };
  drawLabels();
  if (document.fonts && document.fonts.load) document.fonts.load('500 150px Archivo', 'RETAIL').then(drawLabels).catch(() => {});
  group.add(lg);
  group.userData.lamps = lamps;
  return group;
}

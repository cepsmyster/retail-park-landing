// Shared GLSL. Scene axes: +X east, +Y up, -Z north. "Plan" coordinates are (x, -z) in metres, as in the setting-out plan.

export const COMMON_A = /* glsl */`
precision highp float;
precision highp sampler2DShadow;
uniform vec3 uSunDir, uSunCol, uSkyZen, uSkyHor, uGndCol;
uniform vec3 uLampPos, uLampCol, uGroup, uFogCol;
uniform float uFogDen, uExposure, uTime, uPixAng, uSunRad, uWash, uLabel;
uniform sampler2DShadow uShadowMap;
uniform sampler2D uShadowRaw, uAO, uNightMap;
uniform mat4 uShadowMat;
uniform vec4 uShadowPar;   // x: texel in uv, y: texel in metres, z: depth range in metres, w: 1 when the map is valid
uniform vec4 uAOBox;       // x0, y0, 1/w, 1/h in plan metres
uniform vec4 uScrE[4];     // straight run i: xy start (plan), zw unit tangent (counter-clockwise loop)
uniform vec4 uScrF[4];     // x straight length, y arc length at its start, z radius of the corner at its end, w arc length at that corner's start
uniform vec4 uScrC[4];     // corner at the end of run i: xy centre, z start angle, w sweep
uniform vec4 uScrP;        // x module along the wall, y course pitch, z opening width, w opening height
uniform vec4 uScrZ;        // x bottom, y top, z block depth, w top as seen from the room (ceiling)
uniform vec4 uRoom;        // xmin, xmax, ymin, ymax of the hero room in plan metres
uniform vec2 uLampS;       // arc-length range of the screen that the lamp's room looks out through

const float PI = 3.14159265;
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash31(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// ---- the brick screen as an exact periodic aperture --------------------------------------------------
float boxI(float x, float p, float a){ float k = floor(x/p); return k*a + min(x - k*p, a); }
// coverage of openings [0,a] repeating every p, seen through a box kernel of half width w
float cov1(float x, float p, float a, float w){ x = mod(x, p); w = max(w, 1e-4); return clamp((boxI(x+w,p,a) - boxI(x-w,p,a)) / (2.0*w), 0.0, 1.0); }

// s: arc length round the screen, z: height. su, sv: parallax across half the block depth. wu, wv: blur half widths.
float scrPattern(float s, float z, float su, float sv, float wu, float wv, float top){
  float P = uScrP.x, H = uScrP.y;
  float ae = uScrP.z - 2.0*su, he = uScrP.w - 2.0*sv;
  if (ae <= 0.0 || he <= 0.0) return 0.0;
  float zz = z - uScrZ.x;
  float ce = cov1(zz - sv, 2.0*H, he, wv);
  float co = cov1(zz - H - sv, 2.0*H, he, wv);
  float ue = cov1(s - su, P, ae, wu);
  float uo = cov1(s - 0.5*P - su, P, ae, wu);
  float lim = smoothstep(-wv, wv, zz) * smoothstep(-wv, wv, top - z);
  return (ce*ue + co*uo) * lim;
}

// Ray from a point inside the screen outline, going out. o, d in plan coordinates, d unit.
bool scrExit(vec2 o, vec2 d, out float s, out float t, out vec2 n){
  t = 1e9; int hit = -1;
  for (int i = 0; i < 4; i++) {
    vec2 T = uScrE[i].zw; vec2 N = vec2(T.y, -T.x);
    float dn = dot(d, N);
    if (dn > 1e-5) { float ti = dot(uScrE[i].xy - o, N) / dn; if (ti < t) { t = ti; hit = i; } }
  }
  if (hit < 0 || t < 0.0) return false;
  vec2 T = uScrE[hit].zw; n = vec2(T.y, -T.x);
  vec2 h = o + d*t; float e = dot(h - uScrE[hit].xy, T);
  float L = uScrF[hit].x;
  if (e >= 0.0 && e <= L) { s = uScrF[hit].y + e; return true; }
  int c = e > L ? hit : (hit + 3) - 4*((hit + 3)/4);
  vec2 C = uScrC[c].xy; float r = uScrF[c].z;
  vec2 oc = o - C; float b = dot(oc, d); float cc = dot(oc, oc) - r*r; float disc = b*b - cc;
  if (disc < 0.0) return false;
  t = -b + sqrt(disc); h = o + d*t; n = (h - C)/r;
  float ang = atan(n.y, n.x) - uScrC[c].z; ang = mod(ang + PI, 2.0*PI) - PI;
  s = uScrF[c].w + clamp(ang, 0.0, uScrC[c].w) * r;
  return true;
}

bool insideScreenM(vec2 p, float m){
  for (int i = 0; i < 4; i++) { vec2 T = uScrE[i].zw; if (dot(p - uScrE[i].xy, vec2(T.y, -T.x)) > -m) return false; }
  return true;
}
bool insideScreen(vec2 p){ return insideScreenM(p, 0.02); }

// Sunlight reaching a point behind the screen. Returns the transmitted fraction; wide is the same, heavily blurred (for bounce).
float scrSun(vec3 wp, vec3 L, float wmin, float top, out float wide){
  wide = 0.0;
  vec2 o = vec2(wp.x, -wp.z); vec2 d = vec2(L.x, -L.z); float dl = length(d);
  if (dl < 1e-4) return 0.0;
  float s, t; vec2 n;
  if (!scrExit(o, d/dl, s, t, n)) return 0.0;
  float D = t/dl; float z = wp.y + L.y*D;
  vec2 tn = vec2(-n.y, n.x);
  float dN = max(dot(d, n), 1e-3), dT = dot(d, tn);
  float hd = 0.5*uScrZ.z;
  float su = hd*abs(dT)/dN, sv = hd*abs(L.y)/dN;
  float w = max(D*uSunRad, wmin);
  float k = (1.0/(dN*dN) - 1.0) / max(dT*dT + L.y*L.y, 1e-6);
  float wu = w*sqrt(1.0 + dT*dT*k), wv = w*sqrt(1.0 + L.y*L.y*k);
  wide = scrPattern(s, z, su, sv, 0.5, 0.5, top);
  return scrPattern(s, z, su, sv, wu, wv, top);
}

// Lamp behind the screen, lighting a point outside. Returns transmission (1 for points inside the outline).
float scrLamp(vec3 wp, float wmin){
  vec2 o = vec2(uLampPos.x, -uLampPos.z); vec2 pp = vec2(wp.x, -wp.z); vec2 d = pp - o; float dl = length(d);
  if (dl < 1e-3) return 1.0;
  float s, t; vec2 n;
  if (!scrExit(o, d/dl, s, t, n)) return 0.0;
  if (t >= dl) return 1.0;
  if (s < uLampS.x || s > uLampS.y) return 0.0;
  float f = t/dl; vec3 L3 = wp - uLampPos; float D = length(L3); vec3 dir = L3/D;
  float z = uLampPos.y + L3.y*f;
  vec2 dh = vec2(dir.x, -dir.z); vec2 tn = vec2(-n.y, n.x);
  float dN = max(dot(dh, n), 1e-3), dT = dot(dh, tn);
  float hd = 0.5*uScrZ.z;
  float su = hd*abs(dT)/dN, sv = hd*abs(dir.y)/dN;
  float w = max(0.05*(1.0 - f), wmin*f);
  float k = (1.0/(dN*dN) - 1.0) / max(dT*dT + dir.y*dir.y, 1e-6);
  return scrPattern(s, z, su, sv, w*sqrt(1.0 + dT*dT*k), w*sqrt(1.0 + dir.y*dir.y*k), uScrZ.y);
}

`;

export const COMMON_B = /* glsl */`
// ---- shadow map with a blocker search: sharp at contact, wider with distance ----------------------------
vec2 vogel(int i, float n, float phi){ float r = sqrt((float(i) + 0.5)/n); float th = float(i)*2.39996323 + phi; return r*vec2(cos(th), sin(th)); }
float sunShadow(vec3 wp, vec3 n){
  vec3 p = wp + n*uShadowPar.y*1.6 + uSunDir*uShadowPar.y*0.9;
  vec3 c = (uShadowMat*vec4(p, 1.0)).xyz*0.5 + 0.5;
  float ok = uShadowPar.w*step(0.002, c.x)*step(c.x, 0.998)*step(0.002, c.y)*step(c.y, 0.998)*step(c.z, 1.0);
  c = clamp(c, 0.0, 1.0);
  float phi = ign(gl_FragCoord.xy)*6.2831853;
  float bs = 0.0, bn = 0.0; float sr = uShadowPar.x*10.0;
  for (int i = 0; i < 8; i++) { float d = textureLod(uShadowRaw, c.xy + vogel(i, 8.0, phi)*sr, 0.0).r; float k = step(d, c.z - 1e-6); bs += d*k; bn += k; }
  float pen = (c.z - bs/max(bn, 1.0))*uShadowPar.z*uSunRad*1.6;
  float r = clamp(pen/uShadowPar.y, 1.1, 12.0)*uShadowPar.x;
  float s = 0.0;
  for (int i = 0; i < 16; i++) s += textureLod(uShadowMap, vec3(c.xy + vogel(i, 16.0, phi)*r, c.z), 0.0);
  return mix(1.0, s/16.0, ok*step(0.5, bn));
}

float groundLevel(vec2 pl){ return pl.y >= 84.0 ? 3.9 : ((pl.x >= 191.0 && pl.y < 70.0) ? -1.5 : 0.0); }
float box2(vec2 p, vec2 a, vec2 b, float e){ vec2 q = smoothstep(a - e, a + e, p) * (1.0 - smoothstep(b - e, b + e, p)); return q.x*q.y; }
float bakedAO(vec2 pl){
  float m = max(max(box2(pl, vec2(27.0, 10.0), vec2(187.0, 83.0), 1.5), box2(pl, vec2(190.5, 11.0), vec2(233.0, 67.0), 1.0)), box2(pl, vec2(2.0, 86.5), vec2(243.0, 133.0), 1.5));
  float ao = texture(uAO, (pl - uAOBox.xy)*uAOBox.zw).r;
  return mix(1.0, 0.22 + 0.78*ao, m);
}

vec3 skyColor(vec3 d){
  float h = clamp(d.y, -1.0, 1.0);
  float t = pow(1.0 - max(h, 0.0), 3.2);
  vec3 col = mix(uSkyZen, uSkyHor, t);
  float sd = max(dot(d, uSunDir), 0.0);
  float lum = dot(uSunCol, vec3(0.3333));
  col += uSunCol*(0.10*pow(sd, 6.0) + 0.5*pow(sd, 48.0))*(0.35 + 0.65*t) * step(0.0001, lum);
  col = mix(col, uFogCol, smoothstep(0.0, -0.08, h));
  return col;
}

vec3 hemi(vec3 n){ float k = n.y*0.5 + 0.5; return mix(uGndCol, uSkyZen*0.55 + uSkyHor*0.55, k); }

vec3 applyFog(vec3 col, vec3 wp){ float d = length(wp - cameraPosition); float f = 1.0 - exp(-d*uFogDen); return mix(col, uFogCol, f); }

// Written per sample into the multisampled buffer in a reversible compressed form, so that edges between very
// bright and dark surfaces resolve cleanly; js/post.js expands it again before bloom and the film curve.
vec3 finish(vec3 col){
  col = max(col, 0.0)*uExposure;
  return col/(1.0 + max(col.r, max(col.g, col.b)));
}
`;

export const COMMON = COMMON_A + COMMON_B;

export const VERT_SITE = /* glsl */`
#ifdef USE_COLORATTR
attribute vec3 color;
#endif
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vC; varying vec2 vUv2;
void main(){
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vL = position; vUv2 = uv;
  #ifdef USE_INSTANCING_COLOR
    vC = instanceColor;
  #else
    vC = vec3(1.0);
  #endif
  #ifdef USE_COLORATTR
    vC *= color;
  #endif
  vec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const VERT_DEPTH = /* glsl */`
varying vec3 vW; varying vec2 vUv2;
void main(){
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vUv2 = uv;
  vec4 w = modelMatrix * p; vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const FRAG_DEPTH = /* glsl */`
precision highp float;
varying vec3 vW; varying vec2 vUv2;
float hash31(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  #if KIND == 4
    if (vnoise3(vW*2.3) < 0.30) discard;
  #endif
  #if KIND == 9
    if (abs(vUv2.y - 0.5) > 0.06 && fract(vUv2.x*72.0) < 0.40) discard;
  #endif
  gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}`;

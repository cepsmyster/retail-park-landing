// The lens: the scene is drawn into a multisampled half-float buffer, then bloom, a filmic curve, a slight vignette
// and grain are applied once, at full resolution. Nothing here depends on the clock, so a frame is repeatable.
import * as THREE from 'three';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOWN = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
vec3 fetch(vec2 uv){
  vec3 t = texture2D(tSrc, uv).rgb;
  if (uFirst > 0.5) { float m = max(t.r, max(t.g, t.b)); t = t/max(1.0 - m, 0.02); float l = dot(t, vec3(0.2126, 0.7152, 0.0722)); t *= smoothstep(0.80, 2.4, l) + 0.012; t = min(t, vec3(30.0)); }
  return t;
}
void main(){
  vec3 s = fetch(vUv)*4.0;
  s += fetch(vUv + uTexel*vec2(-1.0, -1.0)); s += fetch(vUv + uTexel*vec2(1.0, -1.0));
  s += fetch(vUv + uTexel*vec2(-1.0, 1.0)); s += fetch(vUv + uTexel*vec2(1.0, 1.0));
  gl_FragColor = vec4(s/8.0, 1.0);
}`;
const UP = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uGain;
void main(){
  vec3 s = texture2D(tSrc, vUv + uTexel*vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uTexel*vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0, 1.0)).rgb;
  s = s*2.0 + texture2D(tSrc, vUv + uTexel*vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(2.0, 0.0)).rgb
            + texture2D(tSrc, vUv + uTexel*vec2(0.0, -2.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.0, 2.0)).rgb;
  gl_FragColor = vec4(s/12.0*uGain, 1.0);
}`;
// Ambient occlusion from the depth buffer (scalable ambient obscurance): contact shade where surfaces meet.
const AO = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tDepth; uniform mat4 uInvProj; uniform vec2 uRes; uniform float uProjScale, uRadius;
vec3 viewPos(vec2 uv){ float d = textureLod(tDepth, uv, 0.0).r; vec4 p = uInvProj*vec4(uv*2.0 - 1.0, d*2.0 - 1.0, 1.0); return p.xyz/p.w; }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  float d0 = textureLod(tDepth, vUv, 0.0).r;
  vec3 P = viewPos(vUv); vec2 px = 1.0/uRes;
  vec3 dxa = viewPos(vUv + vec2(px.x, 0.0)) - P, dxb = P - viewPos(vUv - vec2(px.x, 0.0));
  vec3 dya = viewPos(vUv + vec2(0.0, px.y)) - P, dyb = P - viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(dxa.z) < abs(dxb.z) ? dxa : dxb; vec3 dy = abs(dya.z) < abs(dyb.z) ? dya : dyb;
  vec3 n = normalize(cross(dx, dy));
  float dist = max(-P.z, 0.05); float R = uRadius*(1.0 + dist*0.03);
  float rPx = clamp(R*uProjScale/dist, 3.0, 200.0);
  float phi = ign(gl_FragCoord.xy)*6.2831853; float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    float r = sqrt((float(i) + 0.5)/12.0)*rPx; float th = float(i)*2.39996323 + phi;
    vec3 v = viewPos(vUv + vec2(cos(th), sin(th))*r*px) - P; float vv = dot(v, v);
    sum += max(dot(v, n) - 0.006*dist - 0.012, 0.0)/(vv + 0.02*R*R)*step(vv, R*R*1.6);
  }
  float ao = clamp(1.0 - 2.7*R*sum/12.0, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(90.0, 240.0, dist));
  gl_FragColor = vec4(d0 >= 0.999999 ? 1.0 : ao);
}`;
const AOBLUR = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tAO, tDepth; uniform vec2 uDir; uniform vec2 uNF;
float lin(float d){ return 2.0*uNF.x*uNF.y/(uNF.y + uNF.x - (d*2.0 - 1.0)*(uNF.y - uNF.x)); }
void main(){
  float zc = lin(textureLod(tDepth, vUv, 0.0).r); float s = 0.0, w = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir*float(i); float z = lin(textureLod(tDepth, uv, 0.0).r);
    float wt = (1.0 - abs(float(i))/4.5)*step(abs(z - zc), 0.03*zc + 0.04);
    s += textureLod(tAO, uv, 0.0).r*wt; w += wt;
  }
  gl_FragColor = vec4(s/max(w, 1e-4));
}`;
const FINAL = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tScene, tBloom, tAO; uniform float uBloom, uAspect, uAO;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb; float m = max(c.r, max(c.g, c.b)); c = c/max(1.0 - m, 0.02);
  float occ = texture2D(tAO, vUv).r; c *= mix(1.0, occ*occ*0.55 + occ*0.45, uAO);
  c += texture2D(tBloom, vUv).rgb*uBloom;
  // a lens darkens a little toward the corners
  vec2 q = (vUv - 0.5)*vec2(min(uAspect, 1.8)/1.8, 1.0); c *= 1.0 - 0.34*smoothstep(0.25, 0.95, dot(q, q)*2.0);
  // filmic curve (ACES fit) and a small lift of saturation in the mid tones
  vec3 a = clamp((c*(2.51*c + 0.03))/(c*(2.43*c + 0.59) + 0.14), 0.0, 1.0);
  float l = dot(a, vec3(0.2126, 0.7152, 0.0722));
  a = mix(vec3(l), a, 1.08);
  a = mix(12.92*a, 1.055*pow(max(a, 1e-5), vec3(1.0/2.4)) - 0.055, step(0.0031308, a));
  // grain, fixed to the pixel
  float g = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.3) - 1.0;
  a += g*(1.6/255.0)*(1.0 - 0.5*l);
  if (uAO > 1.5) a = vec3(occ);
  gl_FragColor = vec4(a, 1.0);
}`;

export function createPost(renderer) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  const mk = (frag, uniforms, blend) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: blend || THREE.NoBlending, transparent: !!blend });
  const down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
  const up = mk(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uGain: { value: 1 } }, THREE.AdditiveBlending);
  const fin = mk(FINAL, { tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, uBloom: { value: 0.20 }, uAspect: { value: 1.7 }, uAO: { value: 0 } });
  const aoMat = mk(AO, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uProjScale: { value: 1000 }, uRadius: { value: 0.95 } });
  const aoBlur = mk(AOBLUR, { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uNF: { value: new THREE.Vector2(1, 1000) } });
  const AO_ON = new URLSearchParams(location.search).get('ao') !== '0';
  const AO_DBG = new URLSearchParams(location.search).get('ao') === 'show';
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
  let target = null, levels = [], aoA = null, aoB = null;
  const N = 6;
  function resize(w, h) {
    if (target && target.width === w && target.height === h) return;
    if (target) { target.dispose(); if (target.depthTexture) target.depthTexture.dispose(); } for (const l of levels) l.dispose();
    if (aoA) { aoA.dispose(); aoB.dispose(); }
    const dt = new THREE.DepthTexture(w, h); dt.minFilter = THREE.NearestFilter; dt.magFilter = THREE.NearestFilter;
    target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, depthTexture: dt, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    aoA = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    aoB = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    aoMat.uniforms.uRes.value.set(w, h);
    levels = [];
    for (let i = 1; i <= N; i++) levels.push(new THREE.WebGLRenderTarget(Math.max(2, w >> i), Math.max(2, h >> i), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    fin.uniforms.uAspect.value = w / h;
  }
  function render(camera) {
    const prevAuto = renderer.autoClear; renderer.autoClear = false;
    if (AO_ON && camera) {
      aoMat.uniforms.tDepth.value = target.depthTexture; aoMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      aoMat.uniforms.uProjScale.value = target.height/(2*Math.tan(camera.fov*Math.PI/360));
      quad.material = aoMat; renderer.setRenderTarget(aoA); renderer.render(sc, cam);
      aoBlur.uniforms.tDepth.value = target.depthTexture; aoBlur.uniforms.uNF.value.set(camera.near, camera.far);
      quad.material = aoBlur; aoBlur.uniforms.tAO.value = aoA.texture; aoBlur.uniforms.uDir.value.set(1/target.width, 0); renderer.setRenderTarget(aoB); renderer.render(sc, cam);
      aoBlur.uniforms.tAO.value = aoB.texture; aoBlur.uniforms.uDir.value.set(0, 1/target.height); renderer.setRenderTarget(aoA); renderer.render(sc, cam);
      fin.uniforms.tAO.value = aoA.texture; fin.uniforms.uAO.value = AO_DBG ? 2.0 : 0.85;
    } else { fin.uniforms.tAO.value = white; fin.uniforms.uAO.value = 0; }
    let src = target;
    for (let i = 0; i < N; i++) {
      quad.material = down; down.uniforms.tSrc.value = src.texture; down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      renderer.setRenderTarget(levels[i]); renderer.render(sc, cam); src = levels[i];
    }
    for (let i = N - 1; i > 0; i--) {
      quad.material = up; up.uniforms.tSrc.value = levels[i].texture; up.uniforms.uTexel.value.set(1 / levels[i].width, 1 / levels[i].height); up.uniforms.uGain.value = 1.0;
      renderer.setRenderTarget(levels[i - 1]); renderer.render(sc, cam);
    }
    quad.material = fin; fin.uniforms.tScene.value = target.texture; fin.uniforms.tBloom.value = levels[0].texture;
    renderer.setRenderTarget(null); renderer.render(sc, cam);
    renderer.autoClear = prevAuto;
  }
  return { resize, render, get target() { return target; } };
}

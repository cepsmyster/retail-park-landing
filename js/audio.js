// Retail Park: sound, all made in code. Nothing is created and nothing sounds
// until the first click on the control.
//   initAudio(button)
//   updateAudio({ day, night, time })   day 0..1 across the daylight scroll, night 0..1

let btn = null;
let ctx = null;
let g = null;            // graph nodes
let on = false;
let lastApply = 0;
const st = { day: 0, night: 0, time: 0 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function initAudio(button) {
  btn = button || document.getElementById('sound');
  if (!btn) return;
  label();
  btn.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
  });
}

export function updateAudio(s) {
  if (s) {
    if (typeof s.day === 'number') st.day = clamp(s.day, 0, 1);
    if (typeof s.night === 'number') st.night = clamp(s.night, 0, 1);
    if (typeof s.time === 'number') st.time = s.time;
  }
  if (!ctx || !on) return;
  const now = performance.now();
  if (now - lastApply < 80) return;
  lastApply = now;
  apply(0.6);
}

// -------------------------------------------------------------------- control

function toggle() {
  if (!ctx) {
    try { build(); } catch (e) { return; }
  }
  on = !on;
  const t = ctx.currentTime;
  g.master.gain.cancelScheduledValues(t);
  g.master.gain.setValueAtTime(g.master.gain.value, t);
  if (on) {
    ctx.resume();
    apply(0.05);
    g.master.gain.linearRampToValueAtTime(0.55, t + 1.8);
  } else {
    g.master.gain.linearRampToValueAtTime(0, t + 0.5);
    setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 700);
  }
  label();
}

function label() {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Mute sound' : 'Enable sound');
  const l = btn.querySelector('[data-label]');
  const a = btn.querySelector('[data-alt]');
  if (l) {
    l.textContent = on ? 'Sound on' : 'Enable sound';
    if (a) a.textContent = on ? 'Mute' : '';
  } else {
    btn.textContent = on ? 'Sound on' : 'Enable sound';
  }
}

// -------------------------------------------------------------------- graph

function noiseBuffer(seconds, colour) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (colour === 'brown') {
        br = (br + 0.02 * w) / 1.02;
        d[i] = br * 3.5;
      } else {                                   // pink (Paul Kellet)
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    // cross-fade the ends so the loop has no seam
    const f = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = d[i] * k + d[n - f + i] * (1 - k);
    }
  }
  return buf;
}

function loop(buf, rate, offset) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true; s.loopEnd = buf.duration - 0.25;
  s.playbackRate.value = rate || 1;
  s.start(0, offset || 0);
  return s;
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  g = {};

  g.master = ctx.createGain(); g.master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
  g.master.connect(comp); comp.connect(ctx.destination);

  const pink = noiseBuffer(6, 'pink');
  const brown = noiseBuffer(7, 'brown');

  // ---- wind: a low body and a thin air band, moved by slow gusts
  g.windLP = ctx.createBiquadFilter(); g.windLP.type = 'lowpass'; g.windLP.frequency.value = 420; g.windLP.Q.value = 0.6;
  const windHP = ctx.createBiquadFilter(); windHP.type = 'highpass'; windHP.frequency.value = 70;
  g.wind = ctx.createGain(); g.wind.gain.value = 0;
  loop(brown, 1, 0).connect(windHP); windHP.connect(g.windLP); g.windLP.connect(g.wind); g.wind.connect(g.master);

  g.airBP = ctx.createBiquadFilter(); g.airBP.type = 'bandpass'; g.airBP.frequency.value = 900; g.airBP.Q.value = 1.6;
  g.air = ctx.createGain(); g.air.gain.value = 0;
  const airPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  loop(pink, 0.83, 2.1).connect(g.airBP); g.airBP.connect(g.air);
  if (airPan) { g.airPan = airPan; g.air.connect(airPan); airPan.connect(g.master); } else g.air.connect(g.master);

  // ---- far voices: a few band-passed murmurs with syllable-rate movement
  g.voices = ctx.createGain(); g.voices.gain.value = 0;
  const vLP = ctx.createBiquadFilter(); vLP.type = 'lowpass'; vLP.frequency.value = 1900; vLP.Q.value = 0.4;
  vLP.connect(g.voices); g.voices.connect(g.master);
  g.talkers = [];
  const formants = [[430, 1250], [540, 1500], [360, 1050], [610, 1700]];
  formants.forEach(([f1, f2], i) => {
    const src = loop(pink, 0.9 + i * 0.07, i * 1.3);
    const a = ctx.createBiquadFilter(); a.type = 'bandpass'; a.frequency.value = f1; a.Q.value = 5.5;
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f2; b.Q.value = 7;
    const bg = ctx.createGain(); bg.gain.value = 0.35;
    const syl = ctx.createGain(); syl.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 2.6 + i * 0.67;
    const depth = ctx.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(syl.gain); lfo.start();
    const out = ctx.createGain(); out.gain.value = 0;
    src.connect(a); src.connect(b); a.connect(syl); b.connect(bg); bg.connect(syl); syl.connect(out);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = [-0.6, 0.45, -0.15, 0.7][i];
      out.connect(p); p.connect(vLP);
    } else out.connect(vLP);
    g.talkers.push({ out, a, b, f1, f2, ph: i * 1.9 });
  });

  // ---- evening hum: a low warm drone and a faint insect shimmer
  g.hum = ctx.createGain(); g.hum.gain.value = 0;
  const humLP = ctx.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = 260; humLP.Q.value = 0.5;
  [[55, 'sine', 0.5], [55.37, 'sine', 0.45], [110.2, 'triangle', 0.16], [164.8, 'sine', 0.09]].forEach(([f, type, lvl]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = lvl;
    o.connect(og); og.connect(humLP); o.start();
  });
  humLP.connect(g.hum); g.hum.connect(g.master);

  g.shimmer = ctx.createGain(); g.shimmer.gain.value = 0;
  const shBP = ctx.createBiquadFilter(); shBP.type = 'bandpass'; shBP.frequency.value = 5200; shBP.Q.value = 9;
  const shAM = ctx.createGain(); shAM.gain.value = 0.5;
  const shLfo = ctx.createOscillator(); shLfo.type = 'sine'; shLfo.frequency.value = 21;
  const shDepth = ctx.createGain(); shDepth.gain.value = 0.5;
  shLfo.connect(shDepth); shDepth.connect(shAM.gain); shLfo.start();
  loop(pink, 1.21, 3.3).connect(shBP); shBP.connect(shAM); shAM.connect(g.shimmer); g.shimmer.connect(g.master);
}

// -------------------------------------------------------------------- the mix follows the hour

function apply(tc) {
  const t = ctx.currentTime;
  const { day, night } = st;

  // gusts: slow, never periodic to the ear
  const gust = clamp(0.55 + 0.25 * Math.sin(t * 0.11) + 0.2 * Math.sin(t * 0.27 + 1.7) + 0.1 * Math.sin(t * 0.71 + 0.4), 0.1, 1.1);
  const calm = 1 - 0.35 * Math.sin(Math.PI * clamp(day, 0, 1));      // a little stiller around noon
  const windLvl = (0.26 * calm + 0.05 * night) * gust;
  g.wind.gain.setTargetAtTime(windLvl, t, tc);
  g.windLP.frequency.setTargetAtTime(260 + 620 * gust, t, tc);
  g.air.gain.setTargetAtTime(0.035 * calm * gust * gust, t, tc);
  g.airBP.frequency.setTargetAtTime(700 + 500 * gust, t, tc);
  if (g.airPan) g.airPan.pan.setTargetAtTime(0.5 * Math.sin(t * 0.05), t, tc);

  // voices: few in the morning, more through the afternoon and the evening
  const crowd = (0.12 + 0.88 * smoothstep(0.3, 0.8, day)) * (1 - 0.2 * night);
  g.voices.gain.setTargetAtTime(0.085 * crowd, t, tc);
  g.talkers.forEach((k, i) => {
    const presence = clamp(0.5 + 0.5 * Math.sin(t * (0.19 + i * 0.053) + k.ph) + 0.25 * Math.sin(t * 0.83 + k.ph * 2.1), 0, 1);
    k.out.gain.setTargetAtTime(presence, t, 0.35);
    const drift = 1 + 0.12 * Math.sin(t * (0.9 + i * 0.21) + k.ph);
    k.a.frequency.setTargetAtTime(k.f1 * drift, t, 0.2);
    k.b.frequency.setTargetAtTime(k.f2 * (2 - drift), t, 0.2);
  });

  // evening: the hum and the shimmer come in with the night
  g.hum.gain.setTargetAtTime(0.16 * night, t, tc);
  g.shimmer.gain.setTargetAtTime(0.012 * smoothstep(0.2, 1, night) * (0.65 + 0.35 * Math.sin(t * 0.07 + 0.9)), t, tc);
}
